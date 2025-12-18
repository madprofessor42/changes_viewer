import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Snapshot, StorageMetadata, SnapshotIndex } from '../types/snapshot';
import { computeHash } from '../utils/hash';

/**
 * Структура данных индекса в Memento API
 */
interface StorageIndex {
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

    constructor(context: vscode.ExtensionContext) {
        this.globalState = context.globalState;
        this.storagePath = context.globalStoragePath;
        this.snapshotsDir = path.join(this.storagePath, 'snapshots');
        
        // Создаем директорию для снапшотов, если её нет
        // Используем async инициализацию в фоне
        this.ensureSnapshotsDirectory().catch(err => {
            console.error('Failed to create snapshots directory:', err);
        });
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
        
        // Сохраняем в Memento API
        await this.globalState.update(this.mementoKey, index);
    }

    /**
     * Получает метаданные снапшота по ID.
     * @param snapshotId ID снапшота
     * @returns Снапшот или null, если не найден
     */
    async getSnapshotMetadata(snapshotId: string): Promise<Snapshot | null> {
        const index = await this.getIndex();
        const snapshot = index.snapshots.find(s => s.id === snapshotId);
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
        
        return snapshots;
    }

    /**
     * Сохраняет содержимое снапшота в файловую систему.
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
        
        // Путь к файлу содержимого
        const fileName = `${snapshotId}.txt`;
        const filePath = path.join(fileDir, fileName);
        
        // Валидация пути (защита от path traversal)
        this.validatePath(filePath);
        
        // Записываем содержимое
        await fs.writeFile(filePath, content, 'utf8');
        
        // Возвращаем относительный путь от storagePath
        // path.relative уже возвращает путь с правильными разделителями для текущей платформы
        const relativePath = path.relative(this.storagePath, filePath);
        return relativePath;
    }

    /**
     * Получает содержимое снапшота из файловой системы.
     * @param contentPath Относительный путь к файлу содержимого
     * @returns Содержимое файла
     * @throws Error если файл не найден или произошла ошибка чтения
     */
    async getSnapshotContent(contentPath: string): Promise<string> {
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
        
        // Читаем содержимое
        try {
            const content = await fs.readFile(absolutePath, 'utf8');
            return content;
        } catch (error) {
            throw new Error(`Failed to read snapshot content: ${error instanceof Error ? error.message : String(error)}`);
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
            console.error('Error calculating storage size:', error);
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
     * Получает или создает индекс хранилища.
     * @returns Индекс хранилища
     */
    private async getIndex(): Promise<StorageIndex> {
        const existing = this.globalState.get<StorageIndex>(this.mementoKey);
        
        if (existing) {
            // Проверяем версию и обновляем структуру, если нужно
            if (existing.version !== this.currentVersion) {
                // В будущем здесь будет миграция данных
                // Пока просто обновляем версию
                existing.version = this.currentVersion;
                await this.globalState.update(this.mementoKey, existing);
            }
            return existing;
        }
        
        // Создаем новый индекс
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
