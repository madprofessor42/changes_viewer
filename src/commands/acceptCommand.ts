import * as vscode from 'vscode';
import { LocalHistoryManager } from '../services/LocalHistoryManager';
import { LocalHistoryTimelineProvider } from '../providers/LocalHistoryTimelineProvider';
import { Logger } from '../utils/logger';
import { validateSnapshotId } from '../utils/validation';

/**
 * Команда для принятия/отмены принятия изменения (скрытие снапшота из Timeline).
 * 
 * @param historyManager Менеджер истории для работы со снапшотами
 * @param timelineProvider Провайдер Timeline для уведомления об изменениях
 * @param snapshotId ID снапшота или массив ID для массового принятия
 */
export async function acceptCommand(
    historyManager: LocalHistoryManager,
    timelineProvider: LocalHistoryTimelineProvider | undefined,
    snapshotId?: string | string[]
): Promise<void> {
    const logger = Logger.getInstance();
    
    // Проверяем наличие snapshotId
    if (!snapshotId) {
        logger.warn('Accept command called without snapshotId');
        vscode.window.showErrorMessage('Snapshot ID is required for accept command');
        return;
    }

    // Нормализуем snapshotId в массив для единообразной обработки
    const snapshotIds = Array.isArray(snapshotId) ? snapshotId : [snapshotId];

    if (snapshotIds.length === 0) {
        logger.warn('Accept command called with empty snapshotIds array');
        vscode.window.showErrorMessage('At least one snapshot ID is required');
        return;
    }

    // Валидация формата всех snapshotId (UUID v4)
    const invalidIds: string[] = [];
    for (const id of snapshotIds) {
        try {
            validateSnapshotId(id);
        } catch (error) {
            invalidIds.push(id);
            logger.error(`Invalid snapshot ID format: ${id}`, error);
        }
    }

    if (invalidIds.length > 0) {
        vscode.window.showErrorMessage(
            `Invalid snapshot ID format(s): ${invalidIds.join(', ')}. Expected UUID v4 format.`
        );
        return;
    }

    logger.info(`Accept command started for ${snapshotIds.length} snapshot(s): ${snapshotIds.join(', ')}`);

    try {
        const processedSnapshots: { snapshotId: string; fileUri: vscode.Uri; accepted: boolean }[] = [];
        const errors: string[] = [];

        // Обрабатываем каждый снапшот
        for (const id of snapshotIds) {
            try {
                // 1. Получаем снапшот через LocalHistoryManager
                const snapshot = await historyManager.getSnapshot(id);
                if (!snapshot) {
                    errors.push(`Snapshot not found: ${id}`);
                    continue;
                }

                // 2. Определяем новое состояние (toggle: если принят - отменяем, если не принят - принимаем)
                const newAccepted = !snapshot.accepted;
                const newAcceptedTimestamp = newAccepted ? Date.now() : undefined;

                // 3. Обновляем метаданные снапшота
                // UC-06 А2: Ошибка сохранения метаданных - показываем уведомление и логируем
                try {
                    await historyManager.updateSnapshot(id, {
                        accepted: newAccepted,
                        acceptedTimestamp: newAcceptedTimestamp
                    });
                } catch (updateError) {
                    const errorMessage = updateError instanceof Error ? updateError.message : String(updateError);
                    errors.push(`Failed to accept change for snapshot ${id}: ${errorMessage}`);
                    logger.error(`Error updating snapshot ${id}`, updateError);
                    // Продолжаем обработку остальных снапшотов
                    continue;
                }

                // 4. Сохраняем информацию для уведомления Timeline Provider
                const fileUri = vscode.Uri.parse(snapshot.fileUri);
                processedSnapshots.push({
                    snapshotId: id,
                    fileUri: fileUri,
                    accepted: newAccepted
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                errors.push(`Failed to process snapshot ${id}: ${errorMessage}`);
                logger.error(`Error processing snapshot ${id}`, error);
            }
        }

        // 5. Уведомляем Timeline Provider об изменениях для каждого затронутого файла
        if (timelineProvider) {
            // Собираем уникальные URI файлов для уведомления
            const uniqueFileUris = new Set<string>();
            for (const processed of processedSnapshots) {
                uniqueFileUris.add(processed.fileUri.toString());
            }

            // Уведомляем для каждого уникального файла
            for (const fileUriString of uniqueFileUris) {
                const fileUri = vscode.Uri.parse(fileUriString);
                timelineProvider.notifyTimelineChange(fileUri);
            }
        }

        // 6. Отображаем уведомление пользователю
        if (errors.length > 0) {
            // Если были ошибки, показываем их
            const errorSummary = errors.length === 1 
                ? errors[0] 
                : `${errors.length} errors occurred:\n${errors.slice(0, 3).join('\n')}${errors.length > 3 ? '\n...' : ''}`;
            
            if (processedSnapshots.length > 0) {
                // Частичный успех
                vscode.window.showWarningMessage(
                    `Some snapshots processed successfully, but some failed:\n${errorSummary}`
                );
            } else {
                // Полный провал - показываем общее сообщение об ошибке
                vscode.window.showErrorMessage(
                    `Failed to process snapshots: ${errorSummary}`
                );
            }
        } else {
            // Все успешно обработано
            const acceptedCount = processedSnapshots.filter(s => s.accepted).length;
            const unacceptedCount = processedSnapshots.filter(s => !s.accepted).length;

            if (processedSnapshots.length === 1) {
                // Одиночное принятие/отмена
                const snapshot = processedSnapshots[0];
                if (snapshot.accepted) {
                    logger.info(`Change accepted: ${snapshot.snapshotId}`);
                    vscode.window.showInformationMessage('Change accepted');
                } else {
                    logger.info(`Change unaccepted: ${snapshot.snapshotId}`);
                    vscode.window.showInformationMessage('Change unaccepted');
                }
            } else {
                // Массовое принятие/отмена
                const parts: string[] = [];
                if (acceptedCount > 0) {
                    parts.push(`${acceptedCount} accepted`);
                }
                if (unacceptedCount > 0) {
                    parts.push(`${unacceptedCount} unaccepted`);
                }
                logger.info(`Changes processed: ${parts.join(', ')}`);
                vscode.window.showInformationMessage(`Changes processed: ${parts.join(', ')}`);
            }
        }
    } catch (error) {
        // Обработка неожиданных ошибок
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error in acceptCommand', error);
        vscode.window.showErrorMessage(`Failed to accept changes: ${errorMessage}`);
    }
}
