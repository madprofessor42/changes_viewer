import * as vscode from 'vscode';
import { LocalHistoryManager } from '../services/LocalHistoryManager';
import { formatRelativeTime } from '../utils/time';
import { Logger } from '../utils/logger';
import { validateSnapshotId } from '../utils/validation';

/**
 * Форматирует размер файла в читаемый формат (байты, KB, MB).
 * 
 * @param size Размер в байтах
 * @returns Отформатированная строка
 */
function formatFileSize(size: number): string {
    if (size < 1024) {
        return `${size} bytes`;
    } else if (size < 1024 * 1024) {
        return `${(size / 1024).toFixed(2)} KB`;
    } else {
        return `${(size / 1024 / 1024).toFixed(2)} MB`;
    }
}

/**
 * Форматирует источник создания снапшота в читаемый формат.
 * 
 * @param source Источник создания
 * @returns Отформатированная строка
 */
function formatSource(source: string): string {
    switch (source) {
        case 'typing':
            return 'Typing';
        case 'save':
            return 'Save';
        case 'filesystem':
            return 'External change';
        case 'manual':
            return 'Manual';
        default:
            return source;
    }
}

/**
 * Форматирует дату и время в читаемый формат.
 * 
 * @param timestamp Unix timestamp в миллисекундах
 * @returns Отформатированная строка
 */
function formatDateTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleString();
}

/**
 * Команда для отображения детальной информации о снапшоте.
 * 
 * @param historyManager Менеджер истории для работы со снапшотами
 * @param snapshotId ID снапшота для отображения
 */
export async function showDetailsCommand(
    historyManager: LocalHistoryManager,
    snapshotId?: string
): Promise<void> {
    const logger = Logger.getInstance();
    
    // Проверяем наличие snapshotId
    if (!snapshotId) {
        logger.warn('Show details command called without snapshotId');
        vscode.window.showErrorMessage('Snapshot ID is required for show details command');
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

    logger.debug(`Show details command started for snapshot: ${snapshotId}`);

    try {
        // 1. Получаем снапшот через LocalHistoryManager
        // UC-08 А1: Недоступные метаданные - показываем уведомление и логируем
        let snapshot;
        try {
            snapshot = await historyManager.getSnapshot(snapshotId);
        } catch (error) {
            logger.error(`Failed to load snapshot metadata: ${snapshotId}`, error);
            vscode.window.showErrorMessage(
                `Failed to load snapshot details: ${error instanceof Error ? error.message : String(error)}`
            );
            return;
        }
        
        if (!snapshot) {
            logger.error(`Snapshot not found: ${snapshotId}`);
            vscode.window.showErrorMessage(`Snapshot not found: ${snapshotId}`);
            return;
        }

        // 2. Форматируем основную информацию
        const dateTime = formatDateTime(snapshot.timestamp);
        const relativeTime = formatRelativeTime(snapshot.timestamp);
        const source = formatSource(snapshot.source);
        const fileSize = formatFileSize(snapshot.metadata.size);
        const lineCount = snapshot.metadata.lineCount;
        const filePath = snapshot.filePath;

        // 3. Форматируем информацию об изменении (если доступна)
        let changeInfo = '';
        if (snapshot.diffInfo) {
            const { addedLines, removedLines, modifiedLines, previousSnapshotId } = snapshot.diffInfo;
            const changeParts: string[] = [];
            
            if (addedLines > 0) {
                changeParts.push(`+${addedLines} added`);
            }
            if (removedLines > 0) {
                changeParts.push(`-${removedLines} removed`);
            }
            if (modifiedLines > 0) {
                changeParts.push(`~${modifiedLines} modified`);
            }
            
            if (changeParts.length > 0) {
                changeInfo = `Changes: ${changeParts.join(', ')}`;
                if (previousSnapshotId) {
                    changeInfo += `\nPrevious snapshot: ${previousSnapshotId.substring(0, 8)}...`;
                }
            }
        }

        // 4. Форматируем техническую информацию
        const acceptedStatus = snapshot.accepted ? 'Accepted' : 'Not accepted';
        const acceptedTime = snapshot.acceptedTimestamp 
            ? ` (${formatDateTime(snapshot.acceptedTimestamp)})`
            : '';
        const contentHash = snapshot.contentHash.substring(0, 16) + '...';
        const snapshotIdShort = snapshot.id.substring(0, 8) + '...';

        // 5. Формируем полный текст детальной информации
        const details: string[] = [];
        
        // Основная информация
        details.push('=== Snapshot Details ===');
        details.push(`Date & Time: ${dateTime} (${relativeTime})`);
        details.push(`Source: ${source}`);
        details.push(`File: ${filePath}`);
        details.push(`Size: ${fileSize}`);
        details.push(`Lines: ${lineCount}`);
        
        // Информация об изменении
        if (changeInfo) {
            details.push('');
            details.push('=== Change Information ===');
            details.push(changeInfo);
        }
        
        // Техническая информация
        details.push('');
        details.push('=== Technical Information ===');
        details.push(`Snapshot ID: ${snapshotIdShort}`);
        details.push(`Content Hash: ${contentHash}`);
        details.push(`Content Path: ${snapshot.contentPath}`);
        details.push(`Status: ${acceptedStatus}${acceptedTime}`);
        
        const detailsText = details.join('\n');

        // 6. Отображаем информацию через showInformationMessage с кнопкой "Copy Details"
        const copyButton = 'Copy Details';
        const result = await vscode.window.showInformationMessage(
            `Snapshot Details\n\n${detailsText}`,
            { modal: true },
            copyButton
        );

        // 7. Обрабатываем кнопку "Copy Details"
        if (result === copyButton) {
            // Проверяем доступность clipboard API
            if (vscode.env && vscode.env.clipboard && vscode.env.clipboard.writeText) {
                await vscode.env.clipboard.writeText(detailsText);
                vscode.window.showInformationMessage('Snapshot details copied to clipboard');
            } else {
                // Fallback: если clipboard недоступен, просто показываем информацию
                vscode.window.showInformationMessage('Clipboard API is not available');
            }
        }

        logger.debug(`Snapshot details displayed for: ${snapshotId}`);

    } catch (error) {
        // Обработка ошибок загрузки метаданных
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error in showDetailsCommand', error);
        vscode.window.showErrorMessage(`Failed to load snapshot details: ${errorMessage}`);
    }
}
