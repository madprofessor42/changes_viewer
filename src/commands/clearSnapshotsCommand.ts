import * as vscode from 'vscode';
import { CleanupService } from '../services/CleanupService';
import { ConfigurationService } from '../services/ConfigurationService';
import { Logger } from '../utils/logger';

/**
 * Команда для ручной очистки старых снапшотов.
 * Выполняет очистку по TTL и размеру хранилища с использованием настроек по умолчанию.
 * 
 * @param cleanupService Сервис очистки для выполнения операций удаления
 * @param configService Сервис конфигурации для получения настроек по умолчанию
 */
export async function clearSnapshotsCommand(
    cleanupService: CleanupService,
    configService: ConfigurationService
): Promise<void> {
    const logger = Logger.getInstance();
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
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('Error in TTL cleanup', error);
            vscode.window.showWarningMessage(`Failed to cleanup by TTL: ${errorMessage}`);
        }

        // Выполняем очистку по размеру хранилища
        let sizeDeletedCount = 0;
        try {
            sizeDeletedCount = await cleanupService.cleanupBySize(maxStorageSize);
        } catch (error) {
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
        } else {
            logger.info('Clear snapshots completed: no snapshots to delete');
            vscode.window.showInformationMessage('Cleanup completed: no snapshots to delete');
        }
    } catch (error) {
        // Обработка неожиданных ошибок
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error in clearSnapshotsCommand', error);
        vscode.window.showErrorMessage(`Failed to clear snapshots: ${errorMessage}`);
    }
}
