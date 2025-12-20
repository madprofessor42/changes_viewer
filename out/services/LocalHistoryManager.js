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
exports.LocalHistoryManager = void 0;
const crypto = __importStar(require("crypto"));
const hash_1 = require("../utils/hash");
const diff_1 = require("../utils/diff");
const logger_1 = require("../utils/logger");
/**
 * Центральный менеджер для управления жизненным циклом снапшотов (CRUD операции).
 * Интегрирует StorageService, CleanupService и утилиты для полного управления снапшотами.
 */
class LocalHistoryManager {
    constructor(storageService, cleanupService, configService) {
        this.ignoredContentHashes = new Set();
        this.pausedFiles = new Set();
        this.storageService = storageService;
        this.cleanupService = cleanupService;
        this.configService = configService;
        this.logger = logger_1.Logger.getInstance();
    }
    /**
     * Устанавливает callback для уведомлений об изменениях истории (создание, обновление, удаление).
     *
     * @param callback Функция, которая будет вызвана после изменения
     */
    setOnChangeCallback(callback) {
        this.onChangeCallback = callback;
    }
    /**
     * Игнорирует создание следующего снапшота с указанным хешем содержимого.
     * Используется при восстановлении файлов, чтобы избежать создания дубликатов.
     *
     * @param contentHash SHA-256 хеш содержимого
     */
    ignoreContentHash(contentHash) {
        this.ignoredContentHashes.add(contentHash);
        // Очищаем через 5 секунд на всякий случай, если снапшот так и не был создан
        setTimeout(() => {
            this.ignoredContentHashes.delete(contentHash);
        }, 5000);
    }
    /**
     * Временно приостанавливает создание снапшотов для указанного файла.
     * Используется при программном изменении файла (например, при восстановлении или отмене изменений).
     *
     * @param fileUri URI файла
     * @param durationMs Длительность паузы в мс (по умолчанию 2000)
     */
    pauseSnapshotCreation(fileUri, durationMs = 2000) {
        const uriString = fileUri.toString();
        this.pausedFiles.add(uriString);
        this.logger.debug(`Snapshot creation paused for file: ${fileUri.fsPath}`);
        setTimeout(() => {
            if (this.pausedFiles.has(uriString)) {
                this.pausedFiles.delete(uriString);
                this.logger.debug(`Snapshot creation resumed (timeout) for file: ${fileUri.fsPath}`);
            }
        }, durationMs);
    }
    /**
     * Возобновляет создание снапшотов для указанного файла.
     *
     * @param fileUri URI файла
     */
    resumeSnapshotCreation(fileUri) {
        const uriString = fileUri.toString();
        if (this.pausedFiles.has(uriString)) {
            this.pausedFiles.delete(uriString);
            this.logger.debug(`Snapshot creation resumed (manual) for file: ${fileUri.fsPath}`);
        }
    }
    /**
     * Создает новый снапшот для указанного файла.
     * Выполняет дедупликацию, вычисляет diff и проверяет лимиты после создания.
     *
     * @param fileUri URI файла
     * @param content Содержимое файла
     * @param source Источник создания снапшота
     * @returns Созданный снапшот
     * @throws Error если произошла ошибка при создании снапшота
     */
    async createSnapshot(fileUri, content, source) {
        this.logger.debug(`Creating snapshot for file: ${fileUri.fsPath}, source: ${source}`);
        // Проверяем, не приостановлено ли создание снапшотов для этого файла
        if (this.pausedFiles.has(fileUri.toString())) {
            this.logger.debug(`Snapshot creation skipped (paused) for file: ${fileUri.fsPath}`);
            // Возвращаем последний снапшот как fallback
            const snapshots = await this.storageService.getSnapshotsForFile(fileUri.toString());
            const lastSnapshot = snapshots[0];
            if (lastSnapshot) {
                return lastSnapshot;
            }
            // Если снапшотов нет, придется вернуть фиктивный или бросить ошибку, 
            // но DocumentWatcher обрабатывает ошибки, так что можно бросить
            throw new Error('Snapshot creation is paused for this file');
        }
        // 1. Вычисляем contentHash
        const contentHash = await (0, hash_1.computeHash)(content);
        // Проверяем, не нужно ли проигнорировать этот контент
        if (this.ignoredContentHashes.has(contentHash)) {
            this.logger.debug(`Snapshot creation skipped (ignored hash): ${contentHash} for file: ${fileUri.fsPath}`);
            this.ignoredContentHashes.delete(contentHash);
            // Возвращаем последний снапшот как fallback, чтобы не ломать цепочку вызовов
            const snapshots = await this.storageService.getSnapshotsForFile(fileUri.toString());
            const lastSnapshot = snapshots[0];
            if (lastSnapshot) {
                return lastSnapshot;
            }
            // Если снапшотов нет, но мы игнорируем - это странно, но придется создать,
            // или бросить ошибку, или вернуть фиктивный.
            // Вернем "проигнорированный" как дубликат
        }
        // 2. Проверяем дедупликацию
        const isDuplicate = await this.checkDeduplication(fileUri, contentHash);
        if (isDuplicate) {
            // Если это дубликат, получаем последний снапшот и возвращаем его
            const snapshots = await this.storageService.getSnapshotsForFile(fileUri.toString());
            const lastSnapshot = snapshots[0]; // Первый в отсортированном списке (новый)
            if (lastSnapshot && lastSnapshot.contentHash === contentHash) {
                this.logger.debug(`Snapshot creation skipped (duplicate): ${lastSnapshot.id} for file: ${fileUri.fsPath}`);
                return lastSnapshot;
            }
        }
        // 3. Получаем предыдущий снапшот для вычисления diff
        const previousSnapshots = await this.storageService.getSnapshotsForFile(fileUri.toString());
        const previousSnapshot = previousSnapshots.length > 0 ? previousSnapshots[0] : undefined;
        // 4. Вычисляем метаданные
        const lineCount = content.split(/\r?\n/).length;
        const size = Buffer.byteLength(content, 'utf8');
        // 5. Вычисляем хеш файла для создания директории
        const fileHash = await (0, hash_1.computeHash)(fileUri.toString());
        // 6. Создаем ID снапшота (используем crypto.randomUUID() для генерации UUID v4)
        const snapshotId = crypto.randomUUID();
        // 7. Сохраняем содержимое через StorageService
        const contentPath = await this.storageService.saveSnapshotContent(snapshotId, content, fileHash);
        // 8. Вычисляем diff с предыдущим снапшотом (если есть)
        let diffInfo;
        if (previousSnapshot) {
            try {
                const previousContent = await this.storageService.getSnapshotContent(previousSnapshot.contentPath, previousSnapshot.id, previousSnapshot.metadata);
                const diff = (0, diff_1.computeDiff)(previousContent, content);
                diffInfo = {
                    ...diff,
                    previousSnapshotId: previousSnapshot.id
                };
            }
            catch (error) {
                // Если не удалось прочитать предыдущий снапшот, создаем без diff
                this.logger.warn(`Failed to read previous snapshot for diff: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        // 9. Создаем объект снапшота
        // Определяем, был ли файл сжат (по расширению .gz)
        const isCompressed = contentPath.endsWith('.gz');
        const snapshot = {
            id: snapshotId,
            fileUri: fileUri.toString(),
            filePath: fileUri.fsPath,
            contentPath: contentPath,
            timestamp: Date.now(),
            source: source,
            contentHash: contentHash,
            metadata: {
                lineCount: lineCount,
                size: size,
                encoding: 'utf-8',
                deleted: false,
                compressed: isCompressed
            },
            diffInfo: diffInfo,
            accepted: false
        };
        // 10. Сохраняем метаданные через StorageService
        // Обрабатываем ошибки записи в Local Storage (UC-01 А3)
        try {
            await this.storageService.saveSnapshotMetadata(snapshot);
        }
        catch (error) {
            // Ошибка записи в Local Storage - пытаемся освободить место через CleanupService
            this.logger.warn('Failed to save snapshot metadata, attempting to free space', error);
            try {
                // Пытаемся освободить место через CleanupService
                const limitStatus = await this.cleanupService.checkLimits();
                if (limitStatus.sizeExceeded) {
                    const maxSize = this.getMaxStorageSize();
                    await this.cleanupService.cleanupBySize(maxSize);
                }
                // Повторная попытка сохранения после очистки
                await this.storageService.saveSnapshotMetadata(snapshot);
                this.logger.info('Successfully saved snapshot metadata after cleanup');
            }
            catch (retryError) {
                // Если повторная попытка не удалась, логируем ошибку, но не прерываем работу редактора
                this.logger.error('Failed to save snapshot metadata after cleanup attempt', retryError);
                // Пробрасываем ошибку, но она будет обработана в DocumentWatcher/FileSystemWatcher
                throw new Error(`Failed to save snapshot metadata: ${retryError instanceof Error ? retryError.message : String(retryError)}`);
            }
        }
        // 11. Вызываем CleanupService для проверки лимитов
        try {
            const limitStatus = await this.cleanupService.checkLimits();
            // Очистка по количеству на файл
            if (limitStatus.countExceeded) {
                const maxCount = this.getMaxSnapshotsPerFile();
                await this.cleanupService.cleanupByCount(fileUri, maxCount);
            }
            // Очистка по размеру хранилища
            if (limitStatus.sizeExceeded) {
                const maxSize = this.getMaxStorageSize();
                await this.cleanupService.cleanupBySize(maxSize);
            }
        }
        catch (error) {
            // Ошибка очистки не должна прерывать создание снапшота
            this.logger.error('Error during cleanup after snapshot creation', error);
        }
        // 12. Уведомляем callback о создании снапшота
        if (this.onChangeCallback) {
            try {
                this.onChangeCallback();
            }
            catch (error) {
                // Ошибка в callback не должна прерывать создание снапшота
                this.logger.error('Error in onChangeCallback', error);
            }
        }
        this.logger.info(`Snapshot created: ${snapshot.id} for file: ${fileUri.fsPath}, source: ${source}, size: ${snapshot.metadata.size} bytes`);
        return snapshot;
    }
    /**
     * Получает снапшот по ID.
     *
     * @param snapshotId ID снапшота
     * @returns Снапшот или null, если не найден
     * @throws Error если произошла ошибка при чтении метаданных
     */
    async getSnapshot(snapshotId) {
        try {
            return await this.storageService.getSnapshotMetadata(snapshotId);
        }
        catch (error) {
            this.logger.error(`Failed to get snapshot ${snapshotId}`, error);
            throw new Error(`Failed to get snapshot: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Получает все снапшоты для указанного файла с применением фильтров.
     *
     * @param fileUri URI файла
     * @param filters Опциональные фильтры для поиска
     * @returns Массив снапшотов, отсортированных по timestamp (новые первыми)
     */
    async getSnapshotsForFile(fileUri, filters) {
        const snapshots = await this.storageService.getSnapshotsForFile(fileUri.toString());
        // Применяем фильтры
        let filtered = snapshots;
        if (filters) {
            // Фильтр по accepted
            if (filters.accepted !== undefined) {
                filtered = filtered.filter(s => s.accepted === filters.accepted);
            }
            // Фильтр по source
            if (filters.source !== undefined) {
                filtered = filtered.filter(s => s.source === filters.source);
            }
            // Фильтр по временному диапазону
            if (filters.from !== undefined) {
                filtered = filtered.filter(s => s.timestamp >= filters.from);
            }
            if (filters.to !== undefined) {
                filtered = filtered.filter(s => s.timestamp < filters.to);
            }
            // Фильтр по cursorId (для пагинации - исключаем снапшоты до cursorId включительно)
            if (filters.cursorId !== undefined) {
                // Находим индекс снапшота с cursorId
                const cursorIndex = filtered.findIndex(s => s.id === filters.cursorId);
                if (cursorIndex >= 0) {
                    // Исключаем снапшоты до cursorId включительно
                    filtered = filtered.slice(cursorIndex + 1);
                }
                else {
                    // Если cursorId не найден, но есть to timestamp, используем его для фильтрации
                    // Это fallback для случая, когда cursorId не найден, но есть timestamp из cursor
                    // В этом случае фильтрация по to уже применена выше
                }
            }
            // Лимит количества результатов (применяем после всех фильтров)
            if (filters.limit !== undefined && filters.limit > 0) {
                filtered = filtered.slice(0, filters.limit);
            }
        }
        return filtered;
    }
    /**
     * Обновляет метаданные снапшота.
     *
     * @param snapshotId ID снапшота
     * @param updates Обновляемые поля
     * @returns Обновленный снапшот
     * @throws Error если снапшот не найден или произошла ошибка при сохранении
     */
    async updateSnapshot(snapshotId, updates) {
        try {
            const snapshot = await this.storageService.getSnapshotMetadata(snapshotId);
            if (!snapshot) {
                throw new Error(`Snapshot not found: ${snapshotId}`);
            }
            // Объединяем обновления с существующим снапшотом
            const updatedSnapshot = {
                ...snapshot,
                ...updates,
                // Обновляем метаданные, если они переданы
                metadata: updates.metadata ? { ...snapshot.metadata, ...updates.metadata } : snapshot.metadata,
                // Обновляем diffInfo, если он передан
                diffInfo: updates.diffInfo !== undefined ? updates.diffInfo : snapshot.diffInfo
            };
            // Сохраняем обновленный снапшот с обработкой ошибок
            try {
                await this.storageService.saveSnapshotMetadata(updatedSnapshot);
            }
            catch (error) {
                // Ошибка сохранения метаданных (UC-06 А2)
                this.logger.error(`Failed to save snapshot metadata for ${snapshotId}`, error);
                throw new Error(`Failed to save snapshot metadata: ${error instanceof Error ? error.message : String(error)}`);
            }
            // Уведомляем callback об обновлении снапшота
            if (this.onChangeCallback) {
                try {
                    this.onChangeCallback();
                }
                catch (error) {
                    // Ошибка в callback не должна прерывать обновление снапшота
                    this.logger.error('Error in onChangeCallback (update)', error);
                }
            }
            this.logger.debug(`Snapshot updated: ${snapshotId}`);
            return updatedSnapshot;
        }
        catch (error) {
            // Обработка ошибок при обновлении снапшота
            if (error instanceof Error && error.message.includes('Snapshot not found')) {
                throw error; // Пробрасываем ошибку "не найден" как есть
            }
            this.logger.error(`Error updating snapshot ${snapshotId}`, error);
            throw new Error(`Failed to update snapshot: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Обновляет содержимое снапшота.
     * Используется для "Approve" (частичного обновления) снапшота.
     *
     * @param snapshotId ID снапшота
     * @param content Новое содержимое
     * @throws Error если снапшот не найден или ошибка записи
     */
    async updateSnapshotContent(snapshotId, content) {
        const snapshot = await this.getSnapshot(snapshotId);
        if (!snapshot) {
            throw new Error(`Snapshot not found: ${snapshotId}`);
        }
        // Вычисляем новый hash (может понадобиться для дедупликации в будущем, но здесь мы меняем существующий)
        const contentHash = await (0, hash_1.computeHash)(content);
        const size = Buffer.byteLength(content, 'utf8');
        const lineCount = content.split(/\r?\n/).length;
        // Перезаписываем контент
        // saveSnapshotContent использует ID для имени файла, так что он перезапишет существующий
        // Но нам нужно передать fileHash для директории. У снапшота нет fileHash в явном виде в метаданных?
        // StorageService saveSnapshotContent принимает fileHash. 
        // Мы можем вычислить fileHash из fileUri.
        const fileHash = await (0, hash_1.computeHash)(snapshot.fileUri);
        await this.storageService.saveSnapshotContent(snapshotId, content, fileHash);
        // Обновляем метаданные
        await this.updateSnapshot(snapshotId, {
            contentHash,
            metadata: {
                ...snapshot.metadata,
                size,
                lineCount
            }
        });
    }
    /**
     * Удаляет снапшот по ID.
     *
     * @param snapshotId ID снапшота
     * @param skipCallback Опционально: пропустить вызов callback (для пакетного удаления)
     * @throws Error если снапшот не найден или произошла ошибка удаления
     */
    async deleteSnapshot(snapshotId, skipCallback = false) {
        this.logger.debug(`Deleting snapshot: ${snapshotId}`);
        const snapshot = await this.storageService.getSnapshotMetadata(snapshotId);
        if (!snapshot) {
            this.logger.error(`Snapshot not found: ${snapshotId}`);
            throw new Error(`Snapshot not found: ${snapshotId}`);
        }
        // Удаляем содержимое
        await this.storageService.deleteSnapshotContent(snapshot.contentPath);
        // Удаляем метаданные из индекса
        const index = await this.storageService.getStorageIndex();
        const snapshotIndex = index.snapshots.findIndex(s => s.id === snapshotId);
        if (snapshotIndex >= 0) {
            index.snapshots.splice(snapshotIndex, 1);
        }
        // Удаляем из индекса по fileUri
        if (index.index[snapshot.fileUri]) {
            const ids = index.index[snapshot.fileUri];
            const idIndex = ids.indexOf(snapshotId);
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
        // Сохраняем обновленный индекс
        await this.storageService.updateStorageIndex(index);
        this.logger.info(`Snapshot deleted: ${snapshotId} for file: ${snapshot.filePath}`);
        // Уведомляем callback об удалении снапшота
        if (!skipCallback && this.onChangeCallback) {
            try {
                this.onChangeCallback();
            }
            catch (error) {
                this.logger.error('Error in onChangeCallback (delete)', error);
            }
        }
    }
    /**
     * Удаляет несколько снапшотов по списку ID.
     *
     * @param snapshotIds Массив ID снапшотов для удаления
     * @throws Error если произошла ошибка удаления (ошибки для отдельных снапшотов логируются, но не прерывают процесс)
     */
    async deleteSnapshots(snapshotIds) {
        const errors = [];
        for (const snapshotId of snapshotIds) {
            try {
                await this.deleteSnapshot(snapshotId, true); // Пропускаем callback для каждого удаления
            }
            catch (error) {
                errors.push(`Failed to delete snapshot ${snapshotId}: ${error instanceof Error ? error.message : String(error)}`);
                this.logger.error(`Failed to delete snapshot ${snapshotId}`, error);
            }
        }
        // Вызываем callback один раз после всех удалений
        if (this.onChangeCallback) {
            try {
                this.onChangeCallback();
            }
            catch (error) {
                this.logger.error('Error in onChangeCallback (deleteSnapshots)', error);
            }
        }
        if (errors.length > 0) {
            throw new Error(`Failed to delete some snapshots:\n${errors.join('\n')}`);
        }
    }
    /**
     * Проверяет дедупликацию: сравнивает хеш содержимого с последним снапшотом для файла.
     *
     * @param fileUri URI файла
     * @param contentHash SHA-256 хеш содержимого
     * @returns true, если содержимое идентично последнему снапшоту (дубликат)
     */
    async checkDeduplication(fileUri, contentHash) {
        const snapshots = await this.storageService.getSnapshotsForFile(fileUri.toString());
        if (snapshots.length === 0) {
            return false; // Нет предыдущих снапшотов, не дубликат
        }
        // Берем последний снапшот (первый в отсортированном списке)
        const lastSnapshot = snapshots[0];
        // Сравниваем хеши
        return lastSnapshot.contentHash === contentHash;
    }
    /**
     * Вычисляет diff между двумя снапшотами.
     *
     * @param snapshot1 Первый снапшот
     * @param snapshot2 Второй снапшот
     * @returns Информация об изменениях (DiffInfo)
     * @throws Error если не удалось прочитать содержимое снапшотов
     */
    async computeDiff(snapshot1, snapshot2) {
        const content1 = await this.storageService.getSnapshotContent(snapshot1.contentPath, snapshot1.id, snapshot1.metadata);
        const content2 = await this.storageService.getSnapshotContent(snapshot2.contentPath, snapshot2.id, snapshot2.metadata);
        const diff = (0, diff_1.computeDiff)(content1, content2);
        return {
            ...diff,
            previousSnapshotId: snapshot1.id
        };
    }
    /**
     * Получает список всех отслеживаемых файлов.
     *
     * @returns Массив URI строк всех файлов, для которых есть история, отсортированных по времени последнего изменения (новые первыми)
     */
    async getTrackedFiles() {
        return await this.storageService.getAllTrackedFiles();
    }
    /**
     * Получает максимальное количество снапшотов на файл из конфигурации.
     * Используется для очистки после создания снапшота.
     */
    getMaxSnapshotsPerFile() {
        return this.configService.getMaxSnapshotsPerFile();
    }
    /**
     * Получает максимальный размер хранилища из конфигурации.
     * Используется для очистки после создания снапшота.
     */
    getMaxStorageSize() {
        return this.configService.getMaxStorageSize();
    }
}
exports.LocalHistoryManager = LocalHistoryManager;
//# sourceMappingURL=LocalHistoryManager.js.map