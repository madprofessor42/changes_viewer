// Мокируем vscode перед импортом
import '../../__mocks__/setup';

import * as assert from 'assert';
import * as vscode from 'vscode';
import { DocumentWatcher } from '../DocumentWatcher';
import { LocalHistoryManager } from '../LocalHistoryManager';
import { ConfigurationService } from '../ConfigurationService';
import { Snapshot } from '../../types/snapshot';
import * as uriUtils from '../../utils/uri';

// Мокируем isInWorkspace для тестов
const originalIsInWorkspace = uriUtils.isInWorkspace;

/**
 * Базовые unit-тесты для DocumentWatcher.
 * Тестируют основную логику отслеживания изменений и debounce механизм.
 */

describe('DocumentWatcher', () => {
    let historyManager: LocalHistoryManager;
    let configService: ConfigurationService;
    let documentWatcher: DocumentWatcher;
    let createdSnapshots: Snapshot[] = [];

    beforeEach(() => {
            // Мокируем isInWorkspace, чтобы всегда возвращать true для тестовых файлов
            // Используем spyOn если это было бы возможно с jest, но здесь мы просто подменяем метод
            (uriUtils as any).isInWorkspace = (uri: vscode.Uri) => {
                return true;
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
            }
        } as unknown as LocalHistoryManager;

        configService = {
            getTypingDebounce: () => 100, // Короткий debounce для тестов (100ms)
            getMaxFileSize: () => 52428800 // 50 MB
        } as unknown as ConfigurationService;

        documentWatcher = new DocumentWatcher(historyManager, configService);
        createdSnapshots = [];
    });

    afterEach(() => {
        // Останавливаем отслеживание после каждого теста
        documentWatcher.stopWatching();
        createdSnapshots = [];
        
        // Восстанавливаем оригинальную функцию isInWorkspace
        (uriUtils as any).isInWorkspace = originalIsInWorkspace;
    });

    describe('startWatching and stopWatching', () => {
        it('should start watching documents', () => {
            documentWatcher.startWatching();
            // Если не выброшено исключение, значит запуск прошел успешно
            assert.ok(true);
        });

        it('should stop watching documents', () => {
            documentWatcher.startWatching();
            documentWatcher.stopWatching();
            // Если не выброшено исключение, значит остановка прошла успешно
            assert.ok(true);
        });

        it('should handle multiple start calls', () => {
            documentWatcher.startWatching();
            documentWatcher.startWatching(); // Второй вызов не должен вызвать ошибку
            assert.ok(true);
        });

        it('should handle multiple stop calls', () => {
            documentWatcher.startWatching();
            documentWatcher.stopWatching();
            documentWatcher.stopWatching(); // Второй вызов не должен вызвать ошибку
            assert.ok(true);
        });
    });

    describe('debounce mechanism', () => {
        it('should have debounce timers map', () => {
            // Проверяем, что debounceTimers существует и является Map
            const timers = (documentWatcher as any).debounceTimers;
            assert.ok(timers instanceof Map);
        });

        it('should clear timers on stopWatching', () => {
            documentWatcher.startWatching();
            
            // Устанавливаем тестовый таймер
            const testUri = 'file:///workspace/test.ts';
            const testTimer = setTimeout(() => {}, 1000);
            (documentWatcher as any).debounceTimers.set(testUri, testTimer);
            
            assert.strictEqual((documentWatcher as any).debounceTimers.size, 1);
            
            // Останавливаем отслеживание
            documentWatcher.stopWatching();
            
            // Проверяем, что таймеры очищены
            assert.strictEqual((documentWatcher as any).debounceTimers.size, 0);
        });
    });

    describe('file filtering', () => {
        it('should ignore non-file schemes', async () => {
            documentWatcher.startWatching();

            const mockDocument = {
                uri: { scheme: 'output', toString: () => 'output://test' },
                scheme: 'output',
                getText: () => 'test content',
                isClosed: false
            } as unknown as vscode.TextDocument;

            const mockEvent = {
                document: mockDocument
            } as vscode.TextDocumentChangeEvent;

            (documentWatcher as any).handleDocumentChange(mockEvent);

            // Ждем debounce
            await new Promise(resolve => setTimeout(resolve, 200));

            // Снапшот не должен быть создан
            assert.strictEqual(createdSnapshots.length, 0);
        });

        it('should ignore closed documents', async () => {
            documentWatcher.startWatching();

            const mockDocument = {
                uri: vscode.Uri.file('/workspace/test.ts'),
                scheme: 'file',
                getText: () => 'test content',
                isClosed: true
            } as unknown as vscode.TextDocument;

            const mockEvent = {
                document: mockDocument
            } as vscode.TextDocumentChangeEvent;

            (documentWatcher as any).handleDocumentChange(mockEvent);

            // Ждем debounce
            await new Promise(resolve => setTimeout(resolve, 200));

            // Снапшот не должен быть создан
            assert.strictEqual(createdSnapshots.length, 0);
        });
    });

    describe('file size limit', () => {
        it('should skip files larger than maxFileSize', async function() {
            this.timeout(5000);

            // Мокаем configService с маленьким maxFileSize
            const smallConfigService = {
                getTypingDebounce: () => 100,
                getMaxFileSize: () => 100 // 100 байт - очень маленький лимит
            } as unknown as ConfigurationService;

            const smallWatcher = new DocumentWatcher(historyManager, smallConfigService);
            smallWatcher.startWatching();

            // Создаем документ с большим содержимым
            const largeContent = 'x'.repeat(200); // 200 байт > 100 байт лимита
            const mockDocument = {
                uri: vscode.Uri.file('/workspace/test.ts'),
                scheme: 'file',
                getText: () => largeContent,
                isClosed: false
            } as unknown as vscode.TextDocument;

            const mockEvent = {
                document: mockDocument
            } as vscode.TextDocumentChangeEvent;

            (smallWatcher as any).handleDocumentChange(mockEvent);

            // Ждем debounce
            await new Promise(resolve => setTimeout(resolve, 200));

            // Снапшот не должен быть создан (файл слишком большой)
            assert.strictEqual(createdSnapshots.length, 0);

            smallWatcher.stopWatching();
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

            const errorWatcher = new DocumentWatcher(errorHistoryManager, configService);
            errorWatcher.startWatching();

            const mockDocument = {
                uri: vscode.Uri.file('/workspace/test.ts'),
                scheme: 'file',
                getText: () => 'test content',
                isClosed: false
            } as unknown as vscode.TextDocument;

            const mockEvent = {
                document: mockDocument
            } as vscode.TextDocumentChangeEvent;

            // Не должно выбросить исключение
            (errorWatcher as any).handleDocumentChange(mockEvent);

            // Ждем debounce
            await new Promise(resolve => setTimeout(resolve, 200));

            // Ошибка должна быть обработана без прерывания работы
            assert.ok(true);

            errorWatcher.stopWatching();
        });
    });

    describe('document save handling', () => {
        it('should create snapshot when file is saved', async function() {
            this.timeout(5000);

            documentWatcher.startWatching();

            // Мокируем vscode.workspace.fs.stat
            const originalStat = vscode.workspace.fs.stat;
            (vscode.workspace.fs as any).stat = async (uri: vscode.Uri) => {
                return {
                    type: 1,
                    ctime: Date.now(),
                    mtime: Date.now(),
                    size: 100
                };
            };
            
            // Мокируем vscode.workspace.fs.readFile
            const originalReadFile = vscode.workspace.fs.readFile;
            (vscode.workspace.fs as any).readFile = async (uri: vscode.Uri) => {
                const content = 'saved file content';
                return Buffer.from(content, 'utf8');
            };

            const mockDocument = {
                uri: vscode.Uri.file('/workspace/test.ts'),
                scheme: 'file',
                isClosed: false
            } as unknown as vscode.TextDocument;

            // Вызываем обработчик сохранения
            (documentWatcher as any).handleDocumentSave(mockDocument);

            // Ждем асинхронной обработки
            await new Promise(resolve => setTimeout(resolve, 200));

            // Снапшот должен быть создан с source='save'
            assert.strictEqual(createdSnapshots.length, 1);
            assert.strictEqual(createdSnapshots[0].source, 'save');
            assert.strictEqual(createdSnapshots[0].fileUri, 'file:///workspace/test.ts');

            // Восстанавливаем оригинальные функции
            (vscode.workspace.fs as any).readFile = originalReadFile;
            (vscode.workspace.fs as any).stat = originalStat;
        });

        it('should ignore non-file schemes when saving', async function() {
            this.timeout(5000);

            documentWatcher.startWatching();

            const mockDocument = {
                uri: { scheme: 'output', toString: () => 'output://test' },
                scheme: 'output',
                isClosed: false
            } as unknown as vscode.TextDocument;

            // Вызываем обработчик сохранения
            (documentWatcher as any).handleDocumentSave(mockDocument);

            // Ждем асинхронной обработки
            await new Promise(resolve => setTimeout(resolve, 200));

            // Снапшот не должен быть создан
            assert.strictEqual(createdSnapshots.length, 0);
        });

        it('should ignore files outside workspace when saving', async function() {
            this.timeout(5000);

            // Мокируем isInWorkspace, чтобы возвращать false для файлов вне рабочей области
            (uriUtils as any).isInWorkspace = (uri: vscode.Uri) => {
                return false; // Файл вне рабочей области
            };

            documentWatcher.startWatching();

            const mockDocument = {
                uri: vscode.Uri.file('/outside/test.ts'),
                scheme: 'file',
                isClosed: false
            } as unknown as vscode.TextDocument;

            // Вызываем обработчик сохранения
            (documentWatcher as any).handleDocumentSave(mockDocument);

            // Ждем асинхронной обработки
            await new Promise(resolve => setTimeout(resolve, 200));

            // Снапшот не должен быть создан
            assert.strictEqual(createdSnapshots.length, 0);
        });

        it('should skip files larger than maxFileSize when saving', async function() {
            this.timeout(5000);

            // Мокаем configService с маленьким maxFileSize
            const smallConfigService = {
                getTypingDebounce: () => 100,
                getMaxFileSize: () => 100 // 100 байт - очень маленький лимит
            } as unknown as ConfigurationService;

            const smallWatcher = new DocumentWatcher(historyManager, smallConfigService);
            smallWatcher.startWatching();

            // Мокируем vscode.workspace.fs.readFile для возврата большого файла
            const originalReadFile = vscode.workspace.fs.readFile;
            (vscode.workspace.fs as any).readFile = async (uri: vscode.Uri) => {
                const largeContent = 'x'.repeat(200); // 200 байт > 100 байт лимита
                return Buffer.from(largeContent, 'utf8');
            };

            const mockDocument = {
                uri: vscode.Uri.file('/workspace/test.ts'),
                scheme: 'file',
                isClosed: false
            } as unknown as vscode.TextDocument;

            // Вызываем обработчик сохранения
            (smallWatcher as any).handleDocumentSave(mockDocument);

            // Ждем асинхронной обработки
            await new Promise(resolve => setTimeout(resolve, 200));

            // Снапшот не должен быть создан (файл слишком большой)
            assert.strictEqual(createdSnapshots.length, 0);

            // Восстанавливаем оригинальную функцию
            (vscode.workspace.fs as any).readFile = originalReadFile;

            smallWatcher.stopWatching();
        });

        it('should handle file system errors gracefully', async function() {
            this.timeout(5000);

            documentWatcher.startWatching();

            // Мокируем vscode.workspace.fs.readFile для выбрасывания ошибки
            const originalReadFile = vscode.workspace.fs.readFile;
            (vscode.workspace.fs as any).readFile = async (uri: vscode.Uri) => {
                throw vscode.FileSystemError.FileNotFound(uri);
            };

            const mockDocument = {
                uri: vscode.Uri.file('/workspace/test.ts'),
                scheme: 'file',
                isClosed: false
            } as unknown as vscode.TextDocument;

            // Вызываем обработчик сохранения - не должно выбросить исключение
            (documentWatcher as any).handleDocumentSave(mockDocument);

            // Ждем асинхронной обработки
            await new Promise(resolve => setTimeout(resolve, 200));

            // Ошибка должна быть обработана без прерывания работы
            assert.ok(true);
            assert.strictEqual(createdSnapshots.length, 0);

            // Восстанавливаем оригинальную функцию
            (vscode.workspace.fs as any).readFile = originalReadFile;
        });

        it('should handle errors from historyManager gracefully', async function() {
            this.timeout(5000);

            // Создаем мок historyManager, который выбрасывает ошибку
            const errorHistoryManager = {
                createSnapshot: async () => {
                    throw new Error('Test error');
                }
            } as unknown as LocalHistoryManager;

            const errorWatcher = new DocumentWatcher(errorHistoryManager, configService);
            errorWatcher.startWatching();

            // Мокируем vscode.workspace.fs.readFile
            const originalReadFile = vscode.workspace.fs.readFile;
            (vscode.workspace.fs as any).readFile = async (uri: vscode.Uri) => {
                const content = 'saved file content';
                return Buffer.from(content, 'utf8');
            };

            const mockDocument = {
                uri: vscode.Uri.file('/workspace/test.ts'),
                scheme: 'file',
                isClosed: false
            } as unknown as vscode.TextDocument;

            // Вызываем обработчик сохранения - не должно выбросить исключение
            (errorWatcher as any).handleDocumentSave(mockDocument);

            // Ждем асинхронной обработки
            await new Promise(resolve => setTimeout(resolve, 200));

            // Ошибка должна быть обработана без прерывания работы
            assert.ok(true);

            // Восстанавливаем оригинальную функцию
            (vscode.workspace.fs as any).readFile = originalReadFile;

            errorWatcher.stopWatching();
        });
    });
});
