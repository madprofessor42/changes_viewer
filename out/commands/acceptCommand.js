"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.acceptCommand = acceptCommand;
const vscode = __importStar(require("vscode"));
const logger_1 = require("../utils/logger");
const validation_1 = require("../utils/validation");
/**
 * Команда для принятия/отмены принятия изменения (скрытие снапшота из Timeline).
 *
 * @param historyManager Менеджер истории для работы со снапшотами
 * @param timelineProvider Провайдер Timeline для уведомления об изменениях
 * @param snapshotId ID снапшота или массив ID для массового принятия
 */
async function acceptCommand(historyManager, timelineProvider, snapshotId) {
    const logger = logger_1.Logger.getInstance();
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
    const invalidIds = [];
    for (const id of snapshotIds) {
        try {
            (0, validation_1.validateSnapshotId)(id);
        }
        catch (error) {
            invalidIds.push(id);
            logger.error(`Invalid snapshot ID format: ${id}`, error);
        }
    }
    if (invalidIds.length > 0) {
        vscode.window.showErrorMessage(`Invalid snapshot ID format(s): ${invalidIds.join(', ')}. Expected UUID v4 format.`);
        return;
    }
    logger.info(`Accept command started for ${snapshotIds.length} snapshot(s): ${snapshotIds.join(', ')}`);
    try {
        const processedSnapshots = [];
        const errors = [];
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
                }
                catch (updateError) {
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
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                errors.push(`Failed to process snapshot ${id}: ${errorMessage}`);
                logger.error(`Error processing snapshot ${id}`, error);
            }
        }
        // 5. Уведомляем Timeline Provider об изменениях для каждого затронутого файла
        if (timelineProvider) {
            // Собираем уникальные URI файлов для уведомления
            const uniqueFileUris = new Set();
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
                vscode.window.showWarningMessage(`Some snapshots processed successfully, but some failed:\n${errorSummary}`);
            }
            else {
                // Полный провал - показываем общее сообщение об ошибке
                vscode.window.showErrorMessage(`Failed to accept changes: ${errorSummary}`);
            }
        }
        else {
            // Все успешно обработано
            const acceptedCount = processedSnapshots.filter(s => s.accepted).length;
            const unacceptedCount = processedSnapshots.filter(s => !s.accepted).length;
            if (processedSnapshots.length === 1) {
                // Одиночное принятие/отмена
                const snapshot = processedSnapshots[0];
                if (snapshot.accepted) {
                    logger.info(`Change accepted: ${snapshot.snapshotId}`);
                    vscode.window.showInformationMessage('Change accepted');
                }
                else {
                    logger.info(`Change unaccepted: ${snapshot.snapshotId}`);
                    vscode.window.showInformationMessage('Change unaccepted');
                }
            }
            else {
                // Массовое принятие/отмена
                const parts = [];
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
    }
    catch (error) {
        // Обработка неожиданных ошибок
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error in acceptCommand', error);
        vscode.window.showErrorMessage(`Failed to accept changes: ${errorMessage}`);
    }
}
//# sourceMappingURL=acceptCommand.js.map