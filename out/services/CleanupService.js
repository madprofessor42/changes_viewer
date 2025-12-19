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
exports.CleanupService = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const logger_1 = require("../utils/logger");
/**
 * Сервис для управления лимитами хранилища и автоматической очистки старых снапшотов.
 * Реализует стратегию LRU (Least Recently Used) для очистки по размеру.
 */
class CleanupService {
    constructor(storageService, configService) {
        this.periodicCleanupInterval = null;
        /**
         * Карта для отслеживания времени последнего доступа к снапшотам (LRU стратегия).
         * Время доступа обновляется автоматически через callback в StorageService при:
         * - Чтении метаданных снапшота (getSnapshotMetadata)
         * - Чтении содержимого снапшота (getSnapshotContent)
         * - Получении списка снапшотов для файла (getSnapshotsForFile)
         * Если время доступа не обновлялось, используется timestamp создания снапшота как fallback.
         */
        this.lastAccessTime = new Map();
        this.storageService = storageService;
        this.configService = configService;
        this.logger = logger_1.Logger.getInstance();
        // Регистрируем callback для обновления времени доступа при чтении снапшотов
        this.storageService.setOnSnapshotAccessed((snapshotId) => {
            this.updateLastAccessTime(snapshotId);
        });
    }
    /**
     * Проверяет превышение лимитов хранилища.
     * @returns Статус лимитов с информацией о превышениях
     */
    async checkLimits() {
        const maxSnapshotsPerFile = this.configService.getMaxSnapshotsPerFile();
        const maxSize = this.configService.getMaxStorageSize();
        const ttlDays = this.configService.getTTLDays();
        const currentSize = await this.storageService.getStorageSize();
        const sizeExceeded = currentSize > maxSize;
        // Получаем все снапшоты для проверки лимитов
        const allSnapshots = await this.storageService.getAllSnapshots();
        // Проверяем лимит количества на файл
        let filesWithCountExceeded = 0;
        const fileCounts = {};
        for (const snapshot of allSnapshots) {
            fileCounts[snapshot.fileUri] = (fileCounts[snapshot.fileUri] || 0) + 1;
        }
        for (const count of Object.values(fileCounts)) {
            if (count > maxSnapshotsPerFile) {
                filesWithCountExceeded++;
            }
        }
        const countExceeded = filesWithCountExceeded > 0;
        // Проверяем TTL
        const ttlTimestamp = Date.now() - (ttlDays * 24 * 60 * 60 * 1000);
        const snapshotsOlderThanTTL = allSnapshots.filter(s => s.timestamp < ttlTimestamp && !s.accepted).length;
        const ttlExceeded = snapshotsOlderThanTTL > 0;
        return {
            countExceeded,
            sizeExceeded,
            ttlExceeded,
            filesWithCountExceeded,
            currentSize,
            maxSize,
            snapshotsOlderThanTTL
        };
    }
    /**
     * Очищает снапшоты по лимиту количества на файл.
     * Удаляет самые старые снапшоты для указанного файла.
     * Принятые снапшоты (accepted: true) не удаляются.
     * @param fileUri URI файла
     * @param maxCount Максимальное количество снапшотов
     * @returns Количество удаленных снапшотов
     */
    async cleanupByCount(fileUri, maxCount) {
        // Валидация входных параметров
        if (maxCount < 0) {
            throw new Error('maxCount must be non-negative');
        }
        this.logger.debug(`Starting cleanup by count for file: ${fileUri.fsPath}, maxCount: ${maxCount}`);
        const snapshots = await this.storageService.getSnapshotsForFile(fileUri.toString());
        // Исключаем принятые снапшоты из подсчета
        const nonAcceptedSnapshots = snapshots.filter(s => !s.accepted);
        if (nonAcceptedSnapshots.length <= maxCount) {
            this.logger.debug(`No cleanup needed for file: ${fileUri.fsPath} (${nonAcceptedSnapshots.length} <= ${maxCount})`);
            return 0;
        }
        // Сортируем по timestamp (старые первыми), только непринятые
        const sortedSnapshots = [...nonAcceptedSnapshots].sort((a, b) => a.timestamp - b.timestamp);
        // Удаляем лишние снапшоты (самые старые непринятые)
        const toDelete = sortedSnapshots.slice(0, nonAcceptedSnapshots.length - maxCount);
        let deletedCount = 0;
        for (const snapshot of toDelete) {
            try {
                await this.deleteSnapshot(snapshot);
                deletedCount++;
            }
            catch (error) {
                this.logger.error(`Failed to delete snapshot ${snapshot.id}`, error);
            }
        }
        this.logger.info(`Cleanup by count completed for file: ${fileUri.fsPath}, deleted: ${deletedCount} snapshots`);
        return deletedCount;
    }
    /**
     * Очищает снапшоты по лимиту размера хранилища, используя LRU стратегию.
     * Удаляет наименее используемые снапшоты до достижения лимита.
     * Принятые снапшоты (accepted: true) не удаляются.
     * @param maxSize Максимальный размер хранилища в байтах
     * @returns Количество удаленных снапшотов
     */
    async cleanupBySize(maxSize) {
        // Валидация входных параметров
        if (maxSize < 0) {
            throw new Error('maxSize must be non-negative');
        }
        this.logger.debug(`Starting cleanup by size, maxSize: ${maxSize} bytes`);
        const currentSize = await this.storageService.getStorageSize();
        if (currentSize <= maxSize) {
            this.logger.debug(`No cleanup needed by size (${currentSize} <= ${maxSize})`);
            return 0;
        }
        this.logger.info(`Storage size exceeded: ${currentSize} > ${maxSize}, starting cleanup`);
        const allSnapshots = await this.storageService.getAllSnapshots();
        // Исключаем принятые снапшоты из очистки
        const nonAcceptedSnapshots = allSnapshots.filter(s => !s.accepted);
        // Получаем размер каждого снапшота (используем размер из метаданных для оптимизации)
        const snapshotSizePairs = [];
        for (const snapshot of nonAcceptedSnapshots) {
            try {
                // Используем размер из метаданных, если доступен, иначе получаем через fs.stat
                const size = snapshot.metadata.size > 0
                    ? snapshot.metadata.size
                    : await this.getSnapshotSize(snapshot);
                snapshotSizePairs.push({ snapshot, size });
            }
            catch (error) {
                this.logger.error(`Failed to get size for snapshot ${snapshot.id}`, error);
            }
        }
        // Сортируем по времени последнего доступа (LRU) - наименее используемые первыми
        // Используем timestamp как fallback, если время доступа не обновлялось
        snapshotSizePairs.sort((a, b) => {
            const accessTimeA = this.lastAccessTime.get(a.snapshot.id) || a.snapshot.timestamp;
            const accessTimeB = this.lastAccessTime.get(b.snapshot.id) || b.snapshot.timestamp;
            return accessTimeA - accessTimeB;
        });
        // Удаляем снапшоты до достижения лимита
        let totalSize = currentSize;
        let deletedCount = 0;
        for (const { snapshot, size } of snapshotSizePairs) {
            if (totalSize <= maxSize) {
                break;
            }
            try {
                await this.deleteSnapshot(snapshot);
                totalSize -= size;
                deletedCount++;
            }
            catch (error) {
                this.logger.error(`Failed to delete snapshot ${snapshot.id}`, error);
            }
        }
        this.logger.info(`Cleanup by size completed, deleted: ${deletedCount} snapshots, freed: ${currentSize - totalSize} bytes`);
        return deletedCount;
    }
    /**
     * Очищает снапшоты по TTL (Time To Live).
     * Удаляет снапшоты старше указанного срока, но не удаляет принятые снапшоты (accepted: true).
     * @param ttlDays TTL в днях
     * @returns Количество удаленных снапшотов
     */
    async cleanupByTTL(ttlDays) {
        // Валидация входных параметров
        if (ttlDays < 0) {
            throw new Error('ttlDays must be non-negative');
        }
        this.logger.debug(`Starting cleanup by TTL, ttlDays: ${ttlDays}`);
        const ttlTimestamp = Date.now() - (ttlDays * 24 * 60 * 60 * 1000);
        const allSnapshots = await this.storageService.getAllSnapshots();
        // Фильтруем снапшоты старше TTL и не принятые
        const toDelete = allSnapshots.filter(s => s.timestamp < ttlTimestamp && !s.accepted);
        if (toDelete.length === 0) {
            this.logger.debug(`No cleanup needed by TTL (no snapshots older than ${ttlDays} days)`);
            return 0;
        }
        this.logger.info(`Found ${toDelete.length} snapshots older than TTL (${ttlDays} days), starting cleanup`);
        let deletedCount = 0;
        for (const snapshot of toDelete) {
            try {
                await this.deleteSnapshot(snapshot);
                deletedCount++;
            }
            catch (error) {
                this.logger.error(`Failed to delete snapshot ${snapshot.id}`, error);
            }
        }
        this.logger.info(`Cleanup by TTL completed, deleted: ${deletedCount} snapshots`);
        return deletedCount;
    }
    /**
     * Запускает периодическую очистку хранилища.
     * @param intervalHours Интервал очистки в часах (по умолчанию 24 часа)
     */
    startPeriodicCleanup(intervalHours = 24) {
        // Валидация входных параметров
        if (intervalHours <= 0) {
            throw new Error('intervalHours must be positive');
        }
        if (this.periodicCleanupInterval) {
            // Очистка уже запущена
            return;
        }
        const intervalMs = intervalHours * 60 * 60 * 1000;
        this.logger.info(`Starting periodic cleanup with interval: ${intervalHours} hours`);
        // Выполняем очистку сразу при запуске
        this.performPeriodicCleanup().catch(err => {
            this.logger.error('Error in periodic cleanup', err);
        });
        // Затем запускаем периодическую очистку
        this.periodicCleanupInterval = setInterval(() => {
            this.performPeriodicCleanup().catch(err => {
                this.logger.error('Error in periodic cleanup', err);
            });
        }, intervalMs);
    }
    /**
     * Останавливает периодическую очистку.
     */
    stopPeriodicCleanup() {
        if (this.periodicCleanupInterval) {
            clearInterval(this.periodicCleanupInterval);
            this.periodicCleanupInterval = null;
            this.logger.info('Periodic cleanup stopped');
        }
    }
    /**
     * Обновляет время последнего доступа к снапшоту (для LRU стратегии).
     * Этот метод должен вызываться при каждом доступе к снапшоту.
     * @param snapshotId ID снапшота
     */
    updateLastAccessTime(snapshotId) {
        this.lastAccessTime.set(snapshotId, Date.now());
    }
    /**
     * Выполняет периодическую очистку по всем лимитам.
     * Каждая операция очистки обрабатывается отдельно, чтобы ошибка в одной операции
     * не блокировала выполнение остальных.
     */
    async performPeriodicCleanup() {
        const ttlDays = this.configService.getTTLDays();
        const maxSize = this.configService.getMaxStorageSize();
        const maxSnapshotsPerFile = this.configService.getMaxSnapshotsPerFile();
        this.logger.debug('Starting periodic cleanup');
        // Очистка по TTL (обрабатываем ошибки отдельно)
        try {
            await this.cleanupByTTL(ttlDays);
        }
        catch (error) {
            this.logger.error('Error in TTL cleanup during periodic cleanup', error);
        }
        // Очистка по размеру (обрабатываем ошибки отдельно)
        try {
            await this.cleanupBySize(maxSize);
        }
        catch (error) {
            this.logger.error('Error in size cleanup during periodic cleanup', error);
        }
        // Очистка по количеству на файл (обрабатываем ошибки отдельно)
        try {
            const index = await this.getStorageIndex();
            const fileUris = Object.keys(index.index || {});
            for (const fileUri of fileUris) {
                try {
                    await this.cleanupByCount(vscode.Uri.parse(fileUri), maxSnapshotsPerFile);
                }
                catch (error) {
                    this.logger.error(`Failed to cleanup by count for file ${fileUri}`, error);
                }
            }
        }
        catch (error) {
            this.logger.error('Error in count cleanup during periodic cleanup', error);
        }
        this.logger.debug('Periodic cleanup completed');
    }
    /**
     * Удаляет снапшот (метаданные и содержимое).
     * @param snapshot Снапшот для удаления
     */
    async deleteSnapshot(snapshot) {
        // Удаляем содержимое
        try {
            await this.storageService.deleteSnapshotContent(snapshot.contentPath);
        }
        catch (error) {
            this.logger.error(`Failed to delete snapshot content ${snapshot.contentPath}`, error);
        }
        // Удаляем метаданные из индекса
        const index = await this.getStorageIndex();
        const snapshotIndex = index.snapshots.findIndex(s => s.id === snapshot.id);
        if (snapshotIndex >= 0) {
            index.snapshots.splice(snapshotIndex, 1);
        }
        // Удаляем из индекса по fileUri
        if (index.index[snapshot.fileUri]) {
            const ids = index.index[snapshot.fileUri];
            const idIndex = ids.indexOf(snapshot.id);
            if (idIndex >= 0) {
                ids.splice(idIndex, 1);
            }
            // Удаляем пустые записи из индекса
            if (ids.length === 0) {
                delete index.index[snapshot.fileUri];
            }
        }
        // Обновляем метаданные хранилища
        index.metadata.totalSnapshots = index.snapshots.length;
        index.metadata.lastCleanup = Date.now();
        // Сохраняем обновленный индекс
        await this.saveStorageIndex(index);
        // Удаляем из карты времени доступа
        this.lastAccessTime.delete(snapshot.id);
    }
    /**
     * Получает размер снапшота в байтах.
     * Сначала пытается использовать размер из метаданных для оптимизации,
     * если размер недоступен или равен 0, выполняет fs.stat().
     * @param snapshot Снапшот
     * @returns Размер в байтах
     */
    async getSnapshotSize(snapshot) {
        // Используем размер из метаданных, если доступен и больше 0
        if (snapshot.metadata.size > 0) {
            return snapshot.metadata.size;
        }
        // Если размер в метаданных отсутствует или равен 0, получаем через fs.stat()
        const storagePath = this.storageService.getStoragePath();
        const absolutePath = path.resolve(storagePath, snapshot.contentPath);
        try {
            const stats = await fs.stat(absolutePath);
            return stats.size;
        }
        catch (error) {
            // Если файл не найден, возвращаем 0
            return 0;
        }
    }
    /**
     * Получает индекс хранилища из StorageService.
     */
    async getStorageIndex() {
        return await this.storageService.getStorageIndex();
    }
    /**
     * Сохраняет индекс хранилища.
     */
    async saveStorageIndex(index) {
        await this.storageService.updateStorageIndex(index);
    }
}
exports.CleanupService = CleanupService;
//# sourceMappingURL=CleanupService.js.map