import * as vscode from 'vscode';
import * as path from 'path';
import { LocalHistoryManager } from '../services/LocalHistoryManager';
import { StorageService } from '../services/StorageService';
import { Logger } from '../utils/logger';
import { validateSnapshotId } from '../utils/validation';

/**
 * Команда для восстановления файла к версии из снапшота.
 * 
 * @param historyManager Менеджер истории для работы со снапшотами
 * @param storageService Сервис хранилища для чтения содержимого снапшотов
 * @param snapshotId ID снапшота для восстановления
 */
export async function restoreCommand(
    historyManager: LocalHistoryManager,
    storageService: StorageService,
    snapshotId?: string
): Promise<void> {
    const logger = Logger.getInstance();
    
    // Проверяем наличие snapshotId
    if (!snapshotId) {
        logger.warn('Restore command called without snapshotId');
        vscode.window.showErrorMessage('Snapshot ID is required for restore command');
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

    logger.info(`Restore command started for snapshot: ${snapshotId}`);

    try {
        // 1. Получаем снапшот через LocalHistoryManager
        const snapshot = await historyManager.getSnapshot(snapshotId);
        if (!snapshot) {
            logger.error(`Snapshot not found: ${snapshotId}`);
            vscode.window.showErrorMessage(`Snapshot not found: ${snapshotId}`);
            return;
        }
        
        logger.debug(`Restoring file: ${snapshot.filePath} from snapshot: ${snapshotId}`);

        // 2. Парсим URI файла
        const fileUri = vscode.Uri.parse(snapshot.fileUri);
        
        // 3. Диалог подтверждения восстановления (ПЕРВЫЙ, согласно ТЗ UC-05)
        const confirmChoice = await vscode.window.showWarningMessage(
            `Restore file "${path.basename(snapshot.filePath)}" to this version? This will replace the current file content.`,
            { modal: true },
            'Restore',
            'Cancel'
        );

        if (confirmChoice !== 'Restore') {
            return; // Пользователь отменил операцию
        }

        // 4. Проверяем dirty state файла (если файл открыт)
        const openDocument = vscode.workspace.textDocuments.find(
            doc => doc.uri.toString() === snapshot.fileUri && !doc.isClosed
        );

        if (openDocument && openDocument.isDirty) {
            // Файл открыт с несохраненными изменениями
            const choice = await vscode.window.showWarningMessage(
                `File "${path.basename(snapshot.filePath)}" has unsaved changes. Save them before restoring?`,
                { modal: true },
                'Save & Restore',
                'Discard & Restore',
                'Cancel'
            );

            if (choice === 'Cancel') {
                return; // Пользователь отменил операцию
            }

            if (choice === 'Save & Restore') {
                // Сохраняем файл перед восстановлением
                await openDocument.save();
                
                // Создаем снапшот для сохраненной версии
                const savedContent = openDocument.getText();
                await createBackupSnapshot(historyManager, fileUri, savedContent);
            } else if (choice === 'Discard & Restore') {
                // Отбрасываем несохраненные изменения
                // Просто продолжаем восстановление - VS Code автоматически обновит редактор
                // при записи нового содержимого на диск
            }
        }

        // 5. Создаем снапшот текущей версии перед восстановлением (если файл существует)
        try {
            // Проверяем существование файла через VS Code API
            try {
                await vscode.workspace.fs.stat(fileUri);
                // Файл существует, читаем текущее содержимое
                const fileData = await vscode.workspace.fs.readFile(fileUri);
                const currentContent = Buffer.from(fileData).toString('utf8');
                
                // Создаем снапшот для текущей версии (source='manual')
                await createBackupSnapshot(historyManager, fileUri, currentContent);
            } catch (statError) {
                // Файл не существует (FileNotFound) - это нормально, продолжаем восстановление
                if (statError instanceof vscode.FileSystemError && statError.code === 'FileNotFound') {
                    // Файл был удален, создадим его заново
                } else {
                    logger.warn(`Failed to read current file content before restore: ${statError instanceof Error ? statError.message : String(statError)}`);
                    // Продолжаем восстановление, даже если не удалось создать снапшот
                }
            }
        } catch (error) {
            logger.warn('Failed to create snapshot for current version before restore', error);
            // Продолжаем восстановление
        }

        // 6. Читаем содержимое снапшота из StorageService
        // UC-05 А3: Недоступное содержимое - показываем уведомление и логируем
        let snapshotContent: string;
        try {
            snapshotContent = await storageService.getSnapshotContent(snapshot.contentPath, snapshot.id, snapshot.metadata);
            
            // Проверяем, что содержимое не пустое (если это не маркер удаления)
            if (!snapshotContent && !snapshot.metadata.deleted) {
                throw new Error('Snapshot content is empty');
            }
        } catch (error) {
            logger.error(`Failed to load snapshot content for restore: ${snapshotId}`, error);
            vscode.window.showErrorMessage(
                `Failed to restore: snapshot content is missing or corrupted. ${error instanceof Error ? error.message : String(error)}`
            );
            return;
        }

        // 7. Записываем содержимое в файл на диск
        // UC-05 А4: Ошибка записи файла - показываем уведомление с деталями
        try {
            // Явно создаем директорию, если её нет (для случая, когда файл был удален)
            const fileDirUri = vscode.Uri.file(path.dirname(fileUri.fsPath));
            try {
                await vscode.workspace.fs.stat(fileDirUri);
            } catch {
                // Директория не существует, создаем её
                await vscode.workspace.fs.createDirectory(fileDirUri);
            }

            // Записываем содержимое через VS Code API
            const contentBuffer = Buffer.from(snapshotContent, 'utf8');
            await vscode.workspace.fs.writeFile(fileUri, contentBuffer);
        } catch (error) {
            logger.error(`Failed to write file during restore: ${fileUri.fsPath}`, error);
            
            // Формируем сообщение об ошибке
            const errorMessage = `Failed to restore file: ${error instanceof Error ? error.message : String(error)}`;
            
            vscode.window.showErrorMessage(errorMessage);
            return;
        }

        // 8. Обновляем открытый редактор
        // VS Code автоматически обновит открытые редакторы при изменении файла на диске
        // Просто перезагружаем документ, чтобы обновить все открытые вкладки
        try {
            const restoredDocument = await vscode.workspace.openTextDocument(fileUri);
            await vscode.window.showTextDocument(restoredDocument, { preview: false });
        } catch (error) {
            logger.warn('Failed to open restored file in editor', error);
            // Файл восстановлен на диск, но не удалось открыть в редакторе
        }

        // 9. Создаем новый снапшот для восстановленной версии (чтобы сохранить историю восстановления)
        // Примечание: LocalHistoryManager выполняет дедупликацию по contentHash,
        // но в случае восстановления содержимое обычно отличается от последнего снапшота
        await createBackupSnapshot(historyManager, fileUri, snapshotContent, snapshot.id);

        // 10. Уведомление пользователя об успешном восстановлении
        const timestamp = new Date(snapshot.timestamp).toLocaleString();
        logger.info(`File restored successfully: ${snapshot.filePath} to version from ${timestamp}`);
        vscode.window.showInformationMessage(`File restored to version from ${timestamp}`);

    } catch (error) {
        // Обработка неожиданных ошибок
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error in restoreCommand', error);
        vscode.window.showErrorMessage(`Failed to restore file: ${errorMessage}`);
    }
}

/**
 * Вспомогательная функция для создания резервной копии снапшота.
 * Используется для создания снапшотов перед восстановлением и для восстановленной версии.
 * 
 * @param historyManager Менеджер истории для работы со снапшотами
 * @param fileUri URI файла
 * @param content Содержимое файла для снапшота
 * @param restoredFrom Опциональный ID снапшота, из которого был восстановлен файл
 */
async function createBackupSnapshot(
    historyManager: LocalHistoryManager,
    fileUri: vscode.Uri,
    content: string,
    restoredFrom?: string
): Promise<void> {
    try {
        const snapshot = await historyManager.createSnapshot(fileUri, content, 'manual');
        
        // Если указан restoredFrom, обновляем метаданные снапшота
        if (restoredFrom) {
            await historyManager.updateSnapshot(snapshot.id, {
                metadata: {
                    ...snapshot.metadata,
                    restoredFrom
                }
            });
        }
    } catch (error) {
        const logger = Logger.getInstance();
        logger.warn('Failed to create backup snapshot', error);
        // Продолжаем восстановление, даже если не удалось создать снапшот
    }
}
