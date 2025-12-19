"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChangeTracker = void 0;
const DocumentWatcher_1 = require("./DocumentWatcher");
const FileSystemWatcher_1 = require("./FileSystemWatcher");
const logger_1 = require("../utils/logger");
/**
 * Фасад для объединения DocumentWatcher и FileSystemWatcher.
 * Предоставляет единый интерфейс для запуска и остановки отслеживания изменений файлов.
 */
class ChangeTracker {
    constructor(historyManager, configService) {
        this.isTracking = false;
        this.logger = logger_1.Logger.getInstance();
        // Инициализируем DocumentWatcher и FileSystemWatcher
        this.documentWatcher = new DocumentWatcher_1.DocumentWatcher(historyManager, configService);
        this.fileSystemWatcher = new FileSystemWatcher_1.FileSystemWatcher(historyManager, configService);
    }
    /**
     * Запускает отслеживание изменений файлов.
     * Запускает как отслеживание изменений в редакторе, так и отслеживание изменений от внешних процессов.
     */
    startTracking() {
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
    stopTracking() {
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
    isActive() {
        return this.isTracking;
    }
}
exports.ChangeTracker = ChangeTracker;
//# sourceMappingURL=ChangeTracker.js.map