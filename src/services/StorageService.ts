import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { Snapshot, StorageMetadata, SnapshotIndex } from '../types/snapshot';
import { computeHash } from '../utils/hash';
import { migrateToVersion, getCurrentVersion, isValidVersion } from '../migrations';
import { migrateToV1_0 } from '../migrations/v1.0';
import { ConfigurationService } from './ConfigurationService';
import { Logger } from '../utils/logger';
import { retryWithBackoff } from '../utils/retry';

/**
 * Структура данных индекса в Memento API
 */
export interface StorageIndex {
    version: string;
    metadata: StorageMetadata;
    snapshots: Snapshot[];
    index: SnapshotIndex['files']; // Используем тип из snapshot.ts
}

/**
 * Сервис для работы с хранилищем данных.
 * Использует Memento API для метаданных и файловую систему для содержимого снапшотов.
 */
export class StorageService {
    private readonly mementoKey = 'snapshots';
    private readonly globalState: vscode.Memento;
    private readonly storagePath: string;
    private readonly snapshotsDir: string;
    private readonly currentVersion = '1.0';
    private readonly configService: ConfigurationService;
    private onSnapshotAccessed?: (snapshotId: string) => void;
    private readonly gzip = promisify(zlib.gzip);
    private readonly gunzip = promisify(zlib.gunzip);
    private readonly logger: Logger;

    constructor(context: vscode.ExtensionContext, configService: ConfigurationService) {
        this.globalState = context.globalState;
        this.storagePath = context.globalStoragePath;
        this.snapshotsDir = path.join(this.storagePath, 'snapshots');
        this.configService = configService;
        this.logger = Logger.getInstance();
        
        // Создаем директорию для снапшотов, если её нет
        // Используем async инициализацию в фоне
        this.ensureSnapshotsDirectory().catch(err => {
            this.logger.error('Failed to create snapshots directory', err);
        });
    }

    /**
     * Устанавливает callback для обновления времени доступа к снапшотам (для LRU стратегии).
     * @param callback Функция, которая будет вызвана при доступе к снапшоту
     */
    setOnSnapshotAccessed(callback: (snapshotId: string) => void): void {
        this.onSnapshotAccessed = callback;
    }

    /**
     * Сохраняет метаданные снапшота в Memento API и обновляет индекс.
     * @param snapshot Снапшот для сохранения
     */
    async saveSnapshotMetadata(snapshot: Snapshot): Promise<void> {
        const index = await this.getIndex();
        
        // Проверяем, существует ли уже снапшот с таким ID
        const existingIndex = index.snapshots.findIndex(s => s.id === snapshot.id);
        if (existingIndex >= 0) {
            // Обновляем существующий снапшот
            index.snapshots[existingIndex] = snapshot;
        } else {
            // Добавляем новый снапшот
            index.snapshots.push(snapshot);
        }
        
        // Обновляем индекс по fileUri
        if (!index.index[snapshot.fileUri]) {
            index.index[snapshot.fileUri] = [];
        }
        
        // Добавляем ID в индекс, если его там еще нет
        if (!index.index[snapshot.fileUri].includes(snapshot.id)) {
            index.index[snapshot.fileUri].push(snapshot.id);
            // Сортируем только массив ID по timestamp снапшотов (более эффективно)
            index.index[snapshot.fileUri].sort((id1, id2) => {
                const s1 = index.snapshots.find(s => s.id === id1);
                const s2 = index.snapshots.find(s => s.id === id2);
                return (s2?.timestamp || 0) - (s1?.timestamp || 0);
            });
        } else {
            // Если снапшот уже есть в индексе, обновляем его позицию в отсортированном массиве
            // Удаляем старую позицию и вставляем в правильное место
            const ids = index.index[snapshot.fileUri];
            const oldIndex = ids.indexOf(snapshot.id);
            if (oldIndex >= 0) {
                ids.splice(oldIndex, 1);
            }
            ids.push(snapshot.id);
            // Сортируем только массив ID по timestamp снапшотов
            ids.sort((id1, id2) => {
                const s1 = index.snapshots.find(s => s.id === id1);
                const s2 = index.snapshots.find(s => s.id === id2);
                return (s2?.timestamp || 0) - (s1?.timestamp || 0);
            });
        }
        
        // Обновляем метаданные хранилища
        index.metadata.totalSnapshots = index.snapshots.length;
        
        // Сохраняем в Memento API с повторными попытками (максимум 3 попытки)
        try {
            await retryWithBackoff(
                async () => {
                    await this.globalState.update(this.mementoKey, index);
                },
                3, // максимум 3 попытки
                500 // начальная задержка 500ms
            );
        } catch (error) {
            this.logger.error('Failed to save snapshot metadata to Memento after retries', error);
            throw new Error(`Failed to save snapshot metadata: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Получает метаданные снапшота по ID.
     * @param snapshotId ID снапшота
     * @returns Снапшот или null, если не найден
     */
    async getSnapshotMetadata(snapshotId: string): Promise<Snapshot | null> {
        const index = await this.getIndex();
        const snapshot = index.snapshots.find(s => s.id === snapshotId);
        if (snapshot && this.onSnapshotAccessed) {
            this.onSnapshotAccessed(snapshotId);
        }
        return snapshot || null;
    }

    /**
     * Получает все снапшоты для указанного файла.
     * @param fileUri URI файла (строка)
     * @returns Массив снапшотов, отсортированных по timestamp (новые первыми)
     */
    async getSnapshotsForFile(fileUri: string): Promise<Snapshot[]> {
        const index = await this.getIndex();
        const snapshotIds = index.index[fileUri] || [];
        
        // Получаем снапшоты по ID из индекса
        const snapshots = snapshotIds
            .map(id => index.snapshots.find(s => s.id === id))
            .filter((s): s is Snapshot => s !== undefined)
            .sort((a, b) => b.timestamp - a.timestamp);
        
        // Обновляем время доступа для всех полученных снапшотов
        if (this.onSnapshotAccessed) {
            for (const snapshot of snapshots) {
                this.onSnapshotAccessed(snapshot.id);
            }
        }
        
        return snapshots;
    }

    /**
     * Сохраняет содержимое снапшота в файловую систему.
     * Применяет сжатие для больших файлов, если включено в настройках.
     * @param snapshotId ID снапшота
     * @param content Содержимое файла
     * @param fileHash Хеш файла (используется для создания директории)
     * @returns Относительный путь к сохраненному файлу
     */
    async saveSnapshotContent(snapshotId: string, content: string, fileHash: string): Promise<string> {
        // Используем первые 16 символов хеша для создания директории (увеличено для уменьшения коллизий)
        const fileHashPrefix = fileHash.substring(0, 16);
        const fileDir = path.join(this.snapshotsDir, fileHashPrefix);
        
        // Создаем директорию, если её нет
        try {
            await fs.access(fileDir);
        } catch {
            // Директория не существует, создаем её
            await fs.mkdir(fileDir, { recursive: true });
        }
        
        // Определяем, нужно ли сжимать файл
        const contentSize = Buffer.byteLength(content, 'utf8');
        const enableCompression = this.configService.getEnableCompression();
        const compressionThreshold = this.configService.getCompressionThreshold();
        const shouldCompress = enableCompression && contentSize > compressionThreshold;
        
        let fileName: string;
        let filePath: string;
        let dataToWrite: Buffer | string;
        
        if (shouldCompress) {
            // Сжимаем содержимое
            try {
                const compressed = await this.gzip(Buffer.from(content, 'utf8'));
                fileName = `${snapshotId}.txt.gz`;
                filePath = path.join(fileDir, fileName);
                dataToWrite = compressed;
            } catch (error) {
                // Если сжатие не удалось, сохраняем без сжатия
                this.logger.warn(`Failed to compress snapshot ${snapshotId}: ${error instanceof Error ? error.message : String(error)}`);
                fileName = `${snapshotId}.txt`;
                filePath = path.join(fileDir, fileName);
                dataToWrite = content;
            }
        } else {
            // Сохраняем без сжатия
            fileName = `${snapshotId}.txt`;
            filePath = path.join(fileDir, fileName);
            dataToWrite = content;
        }
        
        // Валидация пути (защита от path traversal)
        this.validatePath(filePath);
        
        // Записываем содержимое (сжатое или нет) с повторными попытками (максимум 3 попытки)
        try {
            await retryWithBackoff(
                async () => {
                    if (shouldCompress && Buffer.isBuffer(dataToWrite)) {
                        await fs.writeFile(filePath, dataToWrite);
                    } else {
                        await fs.writeFile(filePath, dataToWrite as string, 'utf8');
                    }
                },
                3, // максимум 3 попытки
                500 // начальная задержка 500ms
            );
        } catch (error) {
            this.logger.error(`Failed to write snapshot content after retries: ${snapshotId}`, error);
            throw new Error(`Failed to save snapshot content: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // Возвращаем относительный путь от storagePath
        // path.relative уже возвращает путь с правильными разделителями для текущей платформы
        const relativePath = path.relative(this.storagePath, filePath);
        return relativePath;
    }

    /**
     * Получает содержимое снапшота из файловой системы.
     * Автоматически распаковывает сжатые файлы.
     * @param contentPath Относительный путь к файлу содержимого
     * @param snapshotId ID снапшота (опционально, для обновления времени доступа)
     * @param snapshotMetadata Метаданные снапшота (опционально, для определения сжатия)
     * @returns Содержимое файла
     * @throws Error если файл не найден или произошла ошибка чтения/распаковки
     */
    async getSnapshotContent(contentPath: string, snapshotId?: string, snapshotMetadata?: { compressed?: boolean }): Promise<string> {
        // Преобразуем относительный путь в абсолютный
        const absolutePath = path.resolve(this.storagePath, contentPath);
        
        // Валидация пути (защита от path traversal)
        this.validatePath(absolutePath);
        
        // Проверяем существование файла
        try {
            await fs.access(absolutePath);
        } catch {
            throw new Error(`Snapshot content file not found: ${contentPath}`);
        }
        
        // Определяем, сжат ли файл (по расширению или метаданным)
        const isCompressed = snapshotMetadata?.compressed === true || contentPath.endsWith('.gz');
        
        // Читаем содержимое с повторными попытками (максимум 3 попытки)
        try {
            const content = await retryWithBackoff(
                async () => {
                    if (isCompressed) {
                        // Читаем сжатый файл как Buffer и распаковываем
                        const compressedData = await fs.readFile(absolutePath);
                        const decompressed = await this.gunzip(compressedData);
                        return decompressed.toString('utf8');
                    } else {
                        // Читаем обычный файл
                        const content = await fs.readFile(absolutePath, 'utf8');
                        return content;
                    }
                },
                3, // максимум 3 попытки
                500 // начальная задержка 500ms
            );
            
            // Обновляем время доступа при чтении содержимого
            if (snapshotId && this.onSnapshotAccessed) {
                this.onSnapshotAccessed(snapshotId);
            }
            return content;
        } catch (error) {
            this.logger.error(`Failed to read snapshot content after retries: ${contentPath}`, error);
            if (isCompressed) {
                throw new Error(`Failed to decompress snapshot content: ${error instanceof Error ? error.message : String(error)}`);
            } else {
                throw new Error(`Failed to read snapshot content: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    /**
     * Удаляет содержимое снапшота из файловой системы.
     * @param contentPath Относительный путь к файлу содержимого
     * @throws Error если файл не найден или произошла ошибка удаления
     */
    async deleteSnapshotContent(contentPath: string): Promise<void> {
        // Преобразуем относительный путь в абсолютный
        const absolutePath = path.resolve(this.storagePath, contentPath);
        
        // Валидация пути (защита от path traversal)
        this.validatePath(absolutePath);
        
        // Проверяем существование файла
        try {
            await fs.access(absolutePath);
        } catch {
            // Файл уже удален, это не ошибка
            return;
        }
        
        try {
            // Удаляем файл
            await fs.unlink(absolutePath);
            
            // Рекурсивно удаляем пустые директории
            let dir = path.dirname(absolutePath);
            while (dir !== this.snapshotsDir && dir.startsWith(this.snapshotsDir)) {
                try {
                    const files = await fs.readdir(dir);
                    if (files.length === 0) {
                        await fs.rmdir(dir);
                        dir = path.dirname(dir);
                    } else {
                        break;
                    }
                } catch {
                    // Игнорируем ошибки при удалении директории
                    break;
                }
            }
        } catch (error) {
            throw new Error(`Failed to delete snapshot content: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Вычисляет общий размер хранилища в байтах.
     * @returns Размер хранилища в байтах
     * @throws Error если произошла ошибка при вычислении размера
     */
    async getStorageSize(): Promise<number> {
        try {
            await fs.access(this.snapshotsDir);
        } catch {
            return 0;
        }
        
        try {
            const calculateDirSize = async (dirPath: string): Promise<number> => {
                let size = 0;
                const items = await fs.readdir(dirPath);
                
                for (const item of items) {
                    const itemPath = path.join(dirPath, item);
                    const stats = await fs.stat(itemPath);
                    
                    if (stats.isDirectory()) {
                        size += await calculateDirSize(itemPath);
                    } else {
                        size += stats.size;
                    }
                }
                
                return size;
            };
            
            const totalSize = await calculateDirSize(this.snapshotsDir);
            return totalSize;
        } catch (error) {
            this.logger.error('Error calculating storage size', error);
            throw new Error(`Failed to calculate storage size: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Возвращает абсолютный путь к хранилищу.
     * @returns Путь к директории хранилища
     */
    getStoragePath(): string {
        return this.storagePath;
    }

    /**
     * Получает все снапшоты из хранилища.
     * Используется CleanupService для проверки лимитов и очистки.
     * @returns Массив всех снапшотов
     */
    async getAllSnapshots(): Promise<Snapshot[]> {
        const index = await this.getIndex();
        return index.snapshots || [];
    }

    /**
     * Получает индекс хранилища для работы CleanupService.
     * @returns Индекс хранилища
     */
    async getStorageIndex(): Promise<StorageIndex> {
        return await this.getIndex();
    }

    /**
     * Обновляет индекс хранилища после удаления снапшотов.
     * Используется CleanupService для обновления индекса после очистки.
     * @param index Обновленный индекс
     */
    async updateStorageIndex(index: StorageIndex): Promise<void> {
        await this.globalState.update(this.mementoKey, index);
    }

    /**
     * Получает или создает индекс хранилища.
     * При необходимости выполняет миграции данных до текущей версии.
     * @returns Индекс хранилища
     */
    private async getIndex(): Promise<StorageIndex> {
        const existing = this.globalState.get<StorageIndex>(this.mementoKey);
        const currentVersion = existing?.version || null;
        
        // Если версия отсутствует или невалидна, инициализируем через миграцию v1.0
        if (!currentVersion || !isValidVersion(currentVersion)) {
            if (!isValidVersion(currentVersion) && currentVersion) {
                this.logger.warn(`Invalid version format: ${currentVersion}. Resetting to 1.0.`);
            }
            
            try {
                await migrateToV1_0(this.globalState, this.storagePath);
                const initialized = this.globalState.get<StorageIndex>(this.mementoKey);
                if (initialized) {
                    return initialized;
                }
            } catch (error) {
                this.logger.error('Failed to initialize storage', error);
            }
            
            // Fallback: создаем структуру вручную, если миграция не сработала
            return await this.createDefaultIndex();
        }
        
        // Если версия совпадает с текущей, возвращаем существующие данные
        if (currentVersion === this.currentVersion) {
            return existing!;
        }
        
        // Выполняем миграцию от текущей версии до целевой
        try {
            await migrateToVersion(
                this.globalState,
                this.storagePath,
                currentVersion,
                this.currentVersion
            );
            
            // После миграции получаем обновленные данные
            const migrated = this.globalState.get<StorageIndex>(this.mementoKey);
            if (migrated) {
                return migrated;
            }
        } catch (error) {
            // Если миграция не удалась, предупреждаем пользователя
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error('Migration failed', new Error(errorMessage));
            
            // Показываем предупреждение пользователю
            vscode.window.showWarningMessage(
                `Failed to migrate data storage: ${errorMessage}. ` +
                `Some features may not work correctly. Please report this issue.`,
                'OK'
            );
            
            // Возвращаем существующие данные (может быть несовместимая версия)
            return existing!;
        }
        
        // Fallback: возвращаем существующие данные или создаем новую структуру
        return existing || await this.createDefaultIndex();
    }

    /**
     * Создает индекс хранилища со структурой по умолчанию.
     * @returns Индекс хранилища версии 1.0
     */
    private async createDefaultIndex(): Promise<StorageIndex> {
        const newIndex: StorageIndex = {
            version: this.currentVersion,
            metadata: {
                version: this.currentVersion,
                created: Date.now(),
                lastCleanup: 0,
                totalSnapshots: 0,
                totalSize: 0
            },
            snapshots: [],
            index: {}
        };
        
        await this.globalState.update(this.mementoKey, newIndex);
        return newIndex;
    }

    /**
     * Создает директорию для снапшотов, если её нет.
     */
    private async ensureSnapshotsDirectory(): Promise<void> {
        try {
            await fs.access(this.snapshotsDir);
        } catch {
            // Директория не существует, создаем её
            await fs.mkdir(this.snapshotsDir, { recursive: true });
        }
    }

    /**
     * Валидирует путь для защиты от path traversal атак.
     * Проверяет, что путь находится внутри storagePath.
     * @param filePath Абсолютный путь для валидации
     * @throws Error если путь невалиден (выходит за пределы storagePath)
     */
    private validatePath(filePath: string): void {
        // Дополнительная проверка: путь не должен содержать опасные символы ДО нормализации
        const originalPath = filePath;
        if (originalPath.includes('..') || originalPath.includes('~')) {
            throw new Error(`Invalid path: contains dangerous characters. Path: ${filePath}`);
        }
        
        // Нормализуем пути для корректного сравнения
        const normalizedStoragePath = path.normalize(this.storagePath);
        const normalizedFilePath = path.normalize(filePath);
        
        // Разрешаем пути до абсолютных
        const resolvedStoragePath = path.resolve(normalizedStoragePath);
        const resolvedFilePath = path.resolve(normalizedFilePath);
        
        // Проверяем, что файл находится внутри storagePath
        // Используем path.relative для кроссплатформенности
        const relativePath = path.relative(resolvedStoragePath, resolvedFilePath);
        
        // Проверяем, что относительный путь не выходит за пределы storagePath
        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
            throw new Error(`Invalid path: path traversal detected. Path: ${filePath}`);
        }
    }
}
