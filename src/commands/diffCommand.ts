import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { LocalHistoryManager } from '../services/LocalHistoryManager';
import { StorageService } from '../services/StorageService';
import { formatRelativeTime } from '../utils/time';
import { Logger } from '../utils/logger';
import { validateSnapshotId } from '../utils/validation';

/**
 * Команда для сравнения версии снапшота с текущей версией файла в Diff-редакторе VS Code.
 * 
 * @param historyManager Менеджер истории для работы со снапшотами
 * @param storageService Сервис хранилища для чтения содержимого снапшотов
 * @param snapshotId ID снапшота для сравнения
 */
export async function diffCommand(
    historyManager: LocalHistoryManager,
    storageService: StorageService,
    snapshotId?: string
): Promise<void> {
    const logger = Logger.getInstance();
    
    // Проверяем наличие snapshotId
    if (!snapshotId) {
        logger.warn('Diff command called without snapshotId');
        vscode.window.showErrorMessage('Snapshot ID is required for diff command');
        return;
    }

    // Валидация формата snapshotId (UUID v4)
    try {
        validateSnapshotId(snapshotId);
    } catch (error) {
        logger.error(`Invalid snapshot ID format: ${snapshotId}`, error);
        vscode.window.showErrorMessage(
            `Invalid snapshot ID format: ${error instanceof Error ? error.message : String(error)}`
        );
        return;
    }

    logger.info(`Diff command started for snapshot: ${snapshotId}`);

    try {
        // 1. Получаем снапшот через LocalHistoryManager
        const snapshot = await historyManager.getSnapshot(snapshotId);
        if (!snapshot) {
            logger.error(`Snapshot not found: ${snapshotId}`);
            vscode.window.showErrorMessage(`Snapshot not found: ${snapshotId}`);
            return;
        }
        
        logger.debug(`Comparing snapshot ${snapshotId} with current version of file: ${snapshot.filePath}`);

        // 2. Парсим URI файла
        const fileUri = vscode.Uri.parse(snapshot.fileUri);

        // 3. Читаем содержимое снапшота из StorageService
        // UC-07 А2: Недоступное содержимое - показываем уведомление и логируем
        let snapshotContent: string;
        try {
            snapshotContent = await storageService.getSnapshotContent(snapshot.contentPath, snapshot.id, snapshot.metadata);
            
            // Проверяем, что содержимое доступно (если это не маркер удаления)
            if (!snapshotContent && !snapshot.metadata.deleted) {
                throw new Error('Snapshot content is empty or corrupted');
            }
        } catch (error) {
            logger.error(`Failed to load snapshot content for diff: ${snapshotId}`, error);
            vscode.window.showErrorMessage(
                `Failed to load snapshot content: ${error instanceof Error ? error.message : String(error)}`
            );
            return;
        }

        // 4. Получаем текущее содержимое файла
        let currentContent: string;
        let currentUri: vscode.Uri = fileUri;

        // Проверяем, открыт ли файл в редакторе
        const openDocument = vscode.workspace.textDocuments.find(
            doc => doc.uri.toString() === snapshot.fileUri && !doc.isClosed
        );

        if (openDocument) {
            // Файл открыт в редакторе - получаем содержимое из редактора (включая dirty state)
            currentContent = openDocument.getText();
            currentUri = openDocument.uri;
        } else {
            // Файл не открыт - читаем с диска
            try {
                const fileData = await vscode.workspace.fs.readFile(fileUri);
                currentContent = Buffer.from(fileData).toString('utf8');
            } catch (error) {
                // Файл не существует на диске - используем пустое содержимое
                if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
                    currentContent = '';
                } else {
                    vscode.window.showErrorMessage(
                        `Failed to read current file: ${error instanceof Error ? error.message : String(error)}`
                    );
                    return;
                }
            }
        }

        // 5. Проверяем идентичность версий (сравниваем по contentHash или содержимому)
        // Если снапшот является маркером удаления, пропускаем проверку идентичности
        const isDeletedSnapshot = snapshot.metadata.deleted === true;
        
        if (!isDeletedSnapshot) {
            // Вычисляем хеш текущего содержимого для сравнения
            const { computeHash } = await import('../utils/hash');
            const currentContentHash = await computeHash(currentContent);
            
            if (snapshot.contentHash === currentContentHash) {
                // Версии идентичны
                vscode.window.showInformationMessage('Selected version is identical to current file');
                return;
            }
        }

        // 6. Создаем временный файл для снапшота
        const tempDir = os.tmpdir();
        const tempFileName = `changes-viewer-snapshot-${snapshot.id}.txt`;
        const tempFilePath = path.join(tempDir, tempFileName);
        const tempFileUri = vscode.Uri.file(tempFilePath);

        try {
            // Записываем содержимое снапшота во временный файл
            await fs.writeFile(tempFilePath, snapshotContent, 'utf8');

            // 7. Формируем метки для diff-редактора
            const snapshotTimestamp = new Date(snapshot.timestamp).toLocaleString();
            const snapshotLabel = `Snapshot from ${snapshotTimestamp}`;
            const currentLabel = 'Current';

            // 8. Определяем URI для левой и правой панели
            // Слева - снапшот, справа - текущий файл
            const leftUri = tempFileUri;
            const rightUri = currentUri;

            // 9. Обрабатываем специальные случаи
            if (isDeletedSnapshot) {
                // Снапшот-маркер удаления: слева пустой файл, справа текущий файл
                // Создаем пустой временный файл для левой панели
                await fs.writeFile(tempFilePath, '', 'utf8');
            } else if (currentContent === '' && !openDocument) {
                // Текущий файл не существует: слева снапшот, справа пустой файл
                // Для правой панели создаем временный пустой файл
                const emptyTempFileName = `changes-viewer-empty-${snapshot.id}.txt`;
                const emptyTempFilePath = path.join(tempDir, emptyTempFileName);
                await fs.writeFile(emptyTempFilePath, '', 'utf8');
                const emptyTempFileUri = vscode.Uri.file(emptyTempFilePath);
                
                // Открываем diff с пустым файлом справа
                await vscode.commands.executeCommand(
                    'vscode.diff',
                    leftUri,
                    emptyTempFileUri,
                    `${snapshotLabel} ↔ ${currentLabel}`
                );

                // Удаляем временный пустой файл после небольшой задержки
                // (даем время VS Code открыть diff-редактор)
                setTimeout(async () => {
                    try {
                        await fs.unlink(emptyTempFilePath);
                    } catch {
                        // Игнорируем ошибки удаления
                    }
                }, 1000);

                // Удаляем временный файл снапшота после задержки
                setTimeout(async () => {
                    try {
                        await fs.unlink(tempFilePath);
                    } catch {
                        // Игнорируем ошибки удаления
                    }
                }, 1000);

                return;
            }

            // 10. Открываем Diff-редактор
            await vscode.commands.executeCommand(
                'vscode.diff',
                leftUri,
                rightUri,
                `${snapshotLabel} ↔ ${currentLabel}`
            );

            // 11. Удаляем временный файл снапшота после небольшой задержки
            // (даем время VS Code открыть diff-редактор и прочитать файл)
            setTimeout(async () => {
                try {
                    await fs.unlink(tempFilePath);
                } catch {
                    // Игнорируем ошибки удаления (файл может быть уже удален или заблокирован)
                }
            }, 2000);

        } catch (error) {
            // Ошибка при создании временного файла
            vscode.window.showErrorMessage(
                `Failed to create temporary file for diff: ${error instanceof Error ? error.message : String(error)}`
            );
            return;
        }

        logger.info(`Diff editor opened for snapshot: ${snapshotId}`);

    } catch (error) {
        // Обработка неожиданных ошибок
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error in diffCommand', error);
        vscode.window.showErrorMessage(`Failed to compare versions: ${errorMessage}`);
    }
}
