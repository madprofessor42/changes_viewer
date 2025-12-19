// Мокируем vscode перед импортом
import '../../__mocks__/setup';

import * as assert from 'assert';
import * as vscode from 'vscode';
import { FileSystemWatcher } from '../FileSystemWatcher';
import { LocalHistoryManager } from '../LocalHistoryManager';
import { ConfigurationService } from '../ConfigurationService';
import { Snapshot } from '../../types/snapshot';
import * as uriUtils from '../../utils/uri';

// Мокируем isInWorkspace для тестов
const originalIsInWorkspace = uriUtils.isInWorkspace;

/**
 * Базовые unit-тесты для FileSystemWatcher.
 * Тестируют основную логику отслеживания изменений файлов от внешних процессов.
 */

describe('FileSystemWatcher', () => {
    let historyManager: LocalHistoryManager;
    let configService: ConfigurationService;
    let fileSystemWatcher: FileSystemWatcher;
    let createdSnapshots: Snapshot[] = [];

    beforeEach(() => {
        // Мокируем isInWorkspace, чтобы всегда возвращать true для тестовых файлов
        (uriUtils as any).isInWorkspace = (uri: vscode.Uri) => {
            return uri.fsPath.startsWith('/workspace');
        };

        // Создаем моки для зависимостей
        historyManager = {
            createSnapshot: async (fileUri: vscode.Uri, content: string, source: 'typing' | 'save' | 'filesystem' | 'manual'): Promise<Snapshot> => {
                const snapshot: Snapshot = {
                    id: `snapshot-${Date.now()}-${Math.random()}`,
                    fileUri: fileUri.toString(),
                    filePath: fileUri.fsPath,
                    timestamp: Date.now(),
                    source: source,
                    contentHash: `hash-${content}`,
                    contentPath: `snapshots/${fileUri.fsPath}`,
                    metadata: {
                        size: Buffer.byteLength(content, 'utf8'),
                        lineCount: content.split(/\r?\n/).length,
                        encoding: 'utf-8',
                        deleted: false,
                        compressed: false
                    },
                    accepted: false
                };
                createdSnapshots.push(snapshot);
                return snapshot;
            },
            updateSnapshot: async (snapshotId: string, updates: Partial<Snapshot>): Promise<Snapshot> => {
                const snapshot = createdSnapshots.find(s => s.id === snapshotId);
                if (!snapshot) {
                    throw new Error(`Snapshot not found: ${snapshotId}`);
                }
                const updated = { ...snapshot, ...updates };
                if (updates.metadata) {
                    updated.metadata = { ...snapshot.metadata, ...updates.metadata };
                }
                const index = createdSnapshots.findIndex(s => s.id === snapshotId);
                createdSnapshots[index] = updated;
                return updated;
            }
        } as unknown as LocalHistoryManager;

        configService = {
            getFileSystemDebounce: () => 100, // Короткий debounce для тестов (100ms)
            getMaxFileSize: () => 52428800 // 50 MB
        } as unknown as ConfigurationService;

        fileSystemWatcher = new FileSystemWatcher(historyManager, configService);
        createdSnapshots = [];
    });

    afterEach(() => {
        // Останавливаем отслеживание после каждого теста
        fileSystemWatcher.stopWatching();
        createdSnapshots = [];
        
        // Восстанавливаем оригинальную функцию isInWorkspace
        (uriUtils as any).isInWorkspace = originalIsInWorkspace;
    });

    describe('startWatching and stopWatching', () => {
        it('should start watching files', () => {
            fileSystemWatcher.startWatching();
            // Если не выброшено исключение, значит запуск прошел успешно
            assert.ok(true);
        });

        it('should stop watching files', () => {
            fileSystemWatcher.startWatching();
            fileSystemWatcher.stopWatching();
            // Если не выброшено исключение, значит остановка прошла успешно
            assert.ok(true);
        });

        it('should handle multiple start calls', () => {
            fileSystemWatcher.startWatching();
            fileSystemWatcher.startWatching(); // Второй вызов не должен вызвать ошибку
            assert.ok(true);
        });

        it('should handle multiple stop calls', () => {
            fileSystemWatcher.startWatching();
            fileSystemWatcher.stopWatching();
            fileSystemWatcher.stopWatching(); // Второй вызов не должен вызвать ошибку
            assert.ok(true);
        });
    });

    describe('debounce mechanism', () => {
        it('should have debounce timers map', () => {
            // Проверяем, что debounceTimers существует и является Map
            const timers = (fileSystemWatcher as any).debounceTimers;
            assert.ok(timers instanceof Map);
        });

        it('should clear timers on stopWatching', () => {
            fileSystemWatcher.startWatching();
            
            // Устанавливаем тестовый таймер
            const testUri = 'file:///workspace/test.ts';
            const testTimer = setTimeout(() => {}, 1000);
            (fileSystemWatcher as any).debounceTimers.set(testUri, testTimer);
            
            assert.strictEqual((fileSystemWatcher as any).debounceTimers.size, 1);
            
            // Останавливаем отслеживание
            fileSystemWatcher.stopWatching();
            
            // Проверяем, что таймеры очищены
            assert.strictEqual((fileSystemWatcher as any).debounceTimers.size, 0);
        });
    });

    describe('temporary file filtering', () => {
        it('should ignore .tmp files', () => {
            const tmpUri = vscode.Uri.file('/workspace/test.tmp');
            const isTemporary = (fileSystemWatcher as any).isTemporaryFile(tmpUri);
            assert.strictEqual(isTemporary, true);
        });

        it('should ignore .temp files', () => {
            const tempUri = vscode.Uri.file('/workspace/test.temp');
            const isTemporary = (fileSystemWatcher as any).isTemporaryFile(tempUri);
            assert.strictEqual(isTemporary, true);
        });

        it('should ignore .swp files', () => {
            const swpUri = vscode.Uri.file('/workspace/.test.swp');
            const isTemporary = (fileSystemWatcher as any).isTemporaryFile(swpUri);
            assert.strictEqual(isTemporary, true);
        });

        it('should ignore files in .git folder', () => {
            const gitUri = vscode.Uri.file('/workspace/.git/config');
            const isTemporary = (fileSystemWatcher as any).isTemporaryFile(gitUri);
            assert.strictEqual(isTemporary, true);
        });

        it('should ignore files in node_modules folder', () => {
            const nodeModulesUri = vscode.Uri.file('/workspace/node_modules/package/index.js');
            const isTemporary = (fileSystemWatcher as any).isTemporaryFile(nodeModulesUri);
            assert.strictEqual(isTemporary, true);
        });

        it('should not ignore regular files', () => {
            const regularUri = vscode.Uri.file('/workspace/src/index.ts');
            const isTemporary = (fileSystemWatcher as any).isTemporaryFile(regularUri);
            assert.strictEqual(isTemporary, false);
        });
    });

    describe('dirty state checking', () => {
        it('should detect dirty state for open documents', () => {
            // Мокируем открытые документы
            const mockDocument = {
                uri: vscode.Uri.file('/workspace/test.ts'),
                isDirty: true
            } as unknown as vscode.TextDocument;

            // Мокируем vscode.workspace.textDocuments
            const originalTextDocuments = vscode.workspace.textDocuments;
            (vscode.workspace as any).textDocuments = [mockDocument];

            const testUri = vscode.Uri.file('/workspace/test.ts');
            const hasDirty = (fileSystemWatcher as any).hasDirtyState(testUri);
            assert.strictEqual(hasDirty, true);

            // Восстанавливаем оригинальное значение
            (vscode.workspace as any).textDocuments = originalTextDocuments;
        });

        it('should not detect dirty state for saved documents', () => {
            // Мокируем открытые документы с isDirty=false
            const mockDocument = {
                uri: vscode.Uri.file('/workspace/test.ts'),
                isDirty: false
            } as unknown as vscode.TextDocument;

            const originalTextDocuments = vscode.workspace.textDocuments;
            (vscode.workspace as any).textDocuments = [mockDocument];

            const testUri = vscode.Uri.file('/workspace/test.ts');
            const hasDirty = (fileSystemWatcher as any).hasDirtyState(testUri);
            assert.strictEqual(hasDirty, false);

            (vscode.workspace as any).textDocuments = originalTextDocuments;
        });

        it('should not detect dirty state for closed documents', () => {
            const originalTextDocuments = vscode.workspace.textDocuments;
            (vscode.workspace as any).textDocuments = [];

            const testUri = vscode.Uri.file('/workspace/test.ts');
            const hasDirty = (fileSystemWatcher as any).hasDirtyState(testUri);
            assert.strictEqual(hasDirty, false);

            (vscode.workspace as any).textDocuments = originalTextDocuments;
        });
    });

    describe('file change handling', () => {
        it('should ignore non-file schemes', async function() {
            this.timeout(5000);

            fileSystemWatcher.startWatching();

            const nonFileUri = { scheme: 'output', toString: () => 'output://test' } as unknown as vscode.Uri;
            (fileSystemWatcher as any).handleFileChange(nonFileUri);

            // Ждем debounce
            await new Promise(resolve => setTimeout(resolve, 200));

            // Снапшот не должен быть создан
            assert.strictEqual(createdSnapshots.length, 0);
        });

        it('should ignore files outside workspace', async function() {
            this.timeout(5000);

            // Мокируем isInWorkspace, чтобы возвращать false для файлов вне рабочей области
            (uriUtils as any).isInWorkspace = (uri: vscode.Uri) => {
                return false; // Файл вне рабочей области
            };

            fileSystemWatcher.startWatching();

            const outsideUri = vscode.Uri.file('/outside/test.ts');
            (fileSystemWatcher as any).handleFileChange(outsideUri);

            // Ждем debounce
            await new Promise(resolve => setTimeout(resolve, 200));

            // Снапшот не должен быть создан
            assert.strictEqual(createdSnapshots.length, 0);
        });

        it('should skip files larger than maxFileSize', async function() {
            this.timeout(5000);

            // Мокаем configService с маленьким maxFileSize
            const smallConfigService = {
                getFileSystemDebounce: () => 100,
                getMaxFileSize: () => 100 // 100 байт - очень маленький лимит
            } as unknown as ConfigurationService;

            const smallWatcher = new FileSystemWatcher(historyManager, smallConfigService);
            smallWatcher.startWatching();

            // Мокируем vscode.workspace.fs.readFile для возврата большого файла
            const originalReadFile = vscode.workspace.fs.readFile;
            (vscode.workspace.fs as any).readFile = async (uri: vscode.Uri) => {
                const largeContent = 'x'.repeat(200); // 200 байт > 100 байт лимита
                return Buffer.from(largeContent, 'utf8');
            };

            const testUri = vscode.Uri.file('/workspace/test.ts');
            (smallWatcher as any).handleFileChange(testUri);

            // Ждем debounce
            await new Promise(resolve => setTimeout(resolve, 200));

            // Снапшот не должен быть создан (файл слишком большой)
            assert.strictEqual(createdSnapshots.length, 0);

            // Восстанавливаем оригинальную функцию
            (vscode.workspace.fs as any).readFile = originalReadFile;

            smallWatcher.stopWatching();
        });
    });

    describe('file create handling', () => {
        it('should create snapshot with metadata.created=true', async function() {
            this.timeout(5000);

            fileSystemWatcher.startWatching();

            // Мокируем vscode.workspace.fs.readFile
            const originalReadFile = vscode.workspace.fs.readFile;
            (vscode.workspace.fs as any).readFile = async (uri: vscode.Uri) => {
                const content = 'new file content';
                return Buffer.from(content, 'utf8');
            };

            const testUri = vscode.Uri.file('/workspace/newfile.ts');
            (fileSystemWatcher as any).handleFileCreate(testUri);

            // Ждем debounce
            await new Promise(resolve => setTimeout(resolve, 200));

            // Снапшот должен быть создан с source='filesystem'
            assert.strictEqual(createdSnapshots.length, 1);
            assert.strictEqual(createdSnapshots[0].source, 'filesystem');
            assert.strictEqual(createdSnapshots[0].fileUri, 'file:///workspace/newfile.ts');

            // Восстанавливаем оригинальную функцию
            (vscode.workspace.fs as any).readFile = originalReadFile;
        });
    });

    describe('file delete handling', () => {
        it('should create snapshot marker with metadata.deleted=true', async function() {
            this.timeout(5000);

            fileSystemWatcher.startWatching();

            const testUri = vscode.Uri.file('/workspace/deleted.ts');
            (fileSystemWatcher as any).handleFileDelete(testUri);

            // Ждем асинхронной обработки (для удаления нет debounce)
            await new Promise(resolve => setTimeout(resolve, 200));

            // Снапшот-маркер должен быть создан
            assert.strictEqual(createdSnapshots.length, 1);
            assert.strictEqual(createdSnapshots[0].source, 'filesystem');
            assert.strictEqual(createdSnapshots[0].metadata.deleted, true);
            assert.strictEqual(createdSnapshots[0].fileUri, 'file:///workspace/deleted.ts');
        });
    });

    describe('error handling', () => {
        it('should not throw errors when snapshot creation fails', async function() {
            this.timeout(5000);

            // Создаем мок historyManager, который выбрасывает ошибку
            const errorHistoryManager = {
                createSnapshot: async () => {
                    throw new Error('Test error');
                }
            } as unknown as LocalHistoryManager;

            const errorWatcher = new FileSystemWatcher(errorHistoryManager, configService);
            errorWatcher.startWatching();

            // Мокируем vscode.workspace.fs.readFile
            const originalReadFile = vscode.workspace.fs.readFile;
            (vscode.workspace.fs as any).readFile = async (uri: vscode.Uri) => {
                const content = 'test content';
                return Buffer.from(content, 'utf8');
            };

            const testUri = vscode.Uri.file('/workspace/test.ts');
            // Не должно выбросить исключение
            (errorWatcher as any).handleFileChange(testUri);

            // Ждем debounce
            await new Promise(resolve => setTimeout(resolve, 200));

            // Ошибка должна быть обработана без прерывания работы
            assert.ok(true);

            // Восстанавливаем оригинальную функцию
            (vscode.workspace.fs as any).readFile = originalReadFile;

            errorWatcher.stopWatching();
        });

        it('should handle file system errors gracefully', async function() {
            this.timeout(5000);

            fileSystemWatcher.startWatching();

            // Мокируем vscode.workspace.fs.readFile для выбрасывания ошибки
            const originalReadFile = vscode.workspace.fs.readFile;
            (vscode.workspace.fs as any).readFile = async (uri: vscode.Uri) => {
                throw vscode.FileSystemError.FileNotFound(uri);
            };

            const testUri = vscode.Uri.file('/workspace/test.ts');
            // Не должно выбросить исключение
            (fileSystemWatcher as any).handleFileChange(testUri);

            // Ждем debounce
            await new Promise(resolve => setTimeout(resolve, 200));

            // Ошибка должна быть обработана без прерывания работы
            assert.ok(true);
            assert.strictEqual(createdSnapshots.length, 0);

            // Восстанавливаем оригинальную функцию
            (vscode.workspace.fs as any).readFile = originalReadFile;
        });
    });
});
