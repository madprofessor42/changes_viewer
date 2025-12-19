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
exports.clearSnapshotsCommand = clearSnapshotsCommand;
const vscode = __importStar(require("vscode"));
const logger_1 = require("../utils/logger");
/**
 * Команда для ручной очистки старых снапшотов.
 * Выполняет очистку по TTL и размеру хранилища с использованием настроек по умолчанию.
 *
 * @param cleanupService Сервис очистки для выполнения операций удаления
 * @param configService Сервис конфигурации для получения настроек по умолчанию
 */
async function clearSnapshotsCommand(cleanupService, configService) {
    const logger = logger_1.Logger.getInstance();
    logger.info('Clear snapshots command started');
    try {
        // Получаем настройки по умолчанию из ConfigurationService
        const ttlDays = configService.getTTLDays();
        const maxStorageSize = configService.getMaxStorageSize();
        logger.debug(`Cleanup settings: TTL=${ttlDays} days, maxSize=${maxStorageSize} bytes`);
        // Показываем уведомление о начале очистки
        vscode.window.showInformationMessage('Starting cleanup of old snapshots...');
        // Выполняем очистку по TTL
        let ttlDeletedCount = 0;
        try {
            ttlDeletedCount = await cleanupService.cleanupByTTL(ttlDays);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('Error in TTL cleanup', error);
            vscode.window.showWarningMessage(`Failed to cleanup by TTL: ${errorMessage}`);
        }
        // Выполняем очистку по размеру хранилища
        let sizeDeletedCount = 0;
        try {
            sizeDeletedCount = await cleanupService.cleanupBySize(maxStorageSize);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('Error in size cleanup', error);
            vscode.window.showWarningMessage(`Failed to cleanup by size: ${errorMessage}`);
        }
        // Подсчитываем общее количество удаленных снапшотов
        const totalDeletedCount = ttlDeletedCount + sizeDeletedCount;
        // Отображаем результат пользователю
        if (totalDeletedCount > 0) {
            const message = totalDeletedCount === 1
                ? `Cleanup completed: 1 snapshot deleted`
                : `Cleanup completed: ${totalDeletedCount} snapshots deleted`;
            logger.info(`Clear snapshots completed: ${totalDeletedCount} snapshots deleted (TTL: ${ttlDeletedCount}, Size: ${sizeDeletedCount})`);
            vscode.window.showInformationMessage(message);
        }
        else {
            logger.info('Clear snapshots completed: no snapshots to delete');
            vscode.window.showInformationMessage('Cleanup completed: no snapshots to delete');
        }
    }
    catch (error) {
        // Обработка неожиданных ошибок
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error in clearSnapshotsCommand', error);
        vscode.window.showErrorMessage(`Failed to clear snapshots: ${errorMessage}`);
    }
}
//# sourceMappingURL=clearSnapshotsCommand.js.map