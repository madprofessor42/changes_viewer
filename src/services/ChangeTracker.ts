import * as vscode from 'vscode';
import { DocumentWatcher } from './DocumentWatcher';
import { FileSystemWatcher } from './FileSystemWatcher';
import { LocalHistoryManager } from './LocalHistoryManager';
import { ConfigurationService } from './ConfigurationService';
import { Logger } from '../utils/logger';

/**
 * Фасад для объединения DocumentWatcher и FileSystemWatcher.
 * Предоставляет единый интерфейс для запуска и остановки отслеживания изменений файлов.
 */
export class ChangeTracker {
    private readonly documentWatcher: DocumentWatcher;
    private readonly fileSystemWatcher: FileSystemWatcher;
    private isTracking: boolean = false;
    private readonly logger: Logger;

    constructor(
        historyManager: LocalHistoryManager,
        configService: ConfigurationService
    ) {
        this.logger = Logger.getInstance();
        // Инициализируем DocumentWatcher и FileSystemWatcher
        this.documentWatcher = new DocumentWatcher(historyManager, configService);
        this.fileSystemWatcher = new FileSystemWatcher(historyManager, configService);
    }

    /**
     * Запускает отслеживание изменений файлов.
     * Запускает как отслеживание изменений в редакторе, так и отслеживание изменений от внешних процессов.
     */
    startTracking(): void {
        if (this.isTracking) {
            this.logger.debug('Change tracking already started');
            return; // Уже отслеживаем
        }

        this.logger.debug('Starting change tracking');
        
        // Запускаем отслеживание изменений в редакторе
        this.documentWatcher.startWatching();

        // Запускаем отслеживание изменений от внешних процессов
        this.fileSystemWatcher.startWatching();

        this.isTracking = true;
        this.logger.info('Change tracking started');
    }

    /**
     * Останавливает отслеживание изменений файлов.
     * Останавливает как отслеживание изменений в редакторе, так и отслеживание изменений от внешних процессов.
     */
    stopTracking(): void {
        if (!this.isTracking) {
            this.logger.debug('Change tracking already stopped');
            return; // Уже остановлено
        }

        this.logger.debug('Stopping change tracking');

        // Останавливаем отслеживание изменений в редакторе
        this.documentWatcher.stopWatching();

        // Останавливаем отслеживание изменений от внешних процессов
        this.fileSystemWatcher.stopWatching();

        this.isTracking = false;
        this.logger.info('Change tracking stopped');
    }

    /**
     * Проверяет, запущено ли отслеживание.
     * @returns true, если отслеживание активно
     */
    isActive(): boolean {
        return this.isTracking;
    }
}
