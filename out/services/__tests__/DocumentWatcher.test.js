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
// Мокируем vscode перед импортом
require("../../__mocks__/setup");
const assert = __importStar(require("assert"));
const vscode = __importStar(require("vscode"));
const DocumentWatcher_1 = require("../DocumentWatcher");
const uriUtils = __importStar(require("../../utils/uri"));
// Мокируем isInWorkspace для тестов
const originalIsInWorkspace = uriUtils.isInWorkspace;
/**
 * Базовые unit-тесты для DocumentWatcher.
 * Тестируют основную логику отслеживания изменений и debounce механизм.
 */
describe('DocumentWatcher', () => {
    let historyManager;
    let configService;
    let documentWatcher;
    let createdSnapshots = [];
    beforeEach(() => {
        // Мокируем isInWorkspace, чтобы всегда возвращать true для тестовых файлов
        // Используем spyOn если это было бы возможно с jest, но здесь мы просто подменяем метод
        uriUtils.isInWorkspace = (uri) => {
            return true;
        };
        // Создаем моки для зависимостей
        historyManager = {
            createSnapshot: async (fileUri, content, source) => {
                const snapshot = {
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
        };
        configService = {
            getTypingDebounce: () => 100, // Короткий debounce для тестов (100ms)
            getMaxFileSize: () => 52428800 // 50 MB
        };
        documentWatcher = new DocumentWatcher_1.DocumentWatcher(historyManager, configService);
        createdSnapshots = [];
    });
    afterEach(() => {
        // Останавливаем отслеживание после каждого теста
        documentWatcher.stopWatching();
        createdSnapshots = [];
        // Восстанавливаем оригинальную функцию isInWorkspace
        uriUtils.isInWorkspace = originalIsInWorkspace;
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
            const timers = documentWatcher.debounceTimers;
            assert.ok(timers instanceof Map);
        });
        it('should clear timers on stopWatching', () => {
            documentWatcher.startWatching();
            // Устанавливаем тестовый таймер
            const testUri = 'file:///workspace/test.ts';
            const testTimer = setTimeout(() => { }, 1000);
            documentWatcher.debounceTimers.set(testUri, testTimer);
            assert.strictEqual(documentWatcher.debounceTimers.size, 1);
            // Останавливаем отслеживание
            documentWatcher.stopWatching();
            // Проверяем, что таймеры очищены
            assert.strictEqual(documentWatcher.debounceTimers.size, 0);
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
            };
            const mockEvent = {
                document: mockDocument
            };
            documentWatcher.handleDocumentChange(mockEvent);
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
            };
            const mockEvent = {
                document: mockDocument
            };
            documentWatcher.handleDocumentChange(mockEvent);
            // Ждем debounce
            await new Promise(resolve => setTimeout(resolve, 200));
            // Снапшот не должен быть создан
            assert.strictEqual(createdSnapshots.length, 0);
        });
    });
    describe('file size limit', () => {
        it('should skip files larger than maxFileSize', async function () {
            this.timeout(5000);
            // Мокаем configService с маленьким maxFileSize
            const smallConfigService = {
                getTypingDebounce: () => 100,
                getMaxFileSize: () => 100 // 100 байт - очень маленький лимит
            };
            const smallWatcher = new DocumentWatcher_1.DocumentWatcher(historyManager, smallConfigService);
            smallWatcher.startWatching();
            // Создаем документ с большим содержимым
            const largeContent = 'x'.repeat(200); // 200 байт > 100 байт лимита
            const mockDocument = {
                uri: vscode.Uri.file('/workspace/test.ts'),
                scheme: 'file',
                getText: () => largeContent,
                isClosed: false
            };
            const mockEvent = {
                document: mockDocument
            };
            smallWatcher.handleDocumentChange(mockEvent);
            // Ждем debounce
            await new Promise(resolve => setTimeout(resolve, 200));
            // Снапшот не должен быть создан (файл слишком большой)
            assert.strictEqual(createdSnapshots.length, 0);
            smallWatcher.stopWatching();
        });
    });
    describe('error handling', () => {
        it('should not throw errors when snapshot creation fails', async function () {
            this.timeout(5000);
            // Создаем мок historyManager, который выбрасывает ошибку
            const errorHistoryManager = {
                createSnapshot: async () => {
                    throw new Error('Test error');
                }
            };
            const errorWatcher = new DocumentWatcher_1.DocumentWatcher(errorHistoryManager, configService);
            errorWatcher.startWatching();
            const mockDocument = {
                uri: vscode.Uri.file('/workspace/test.ts'),
                scheme: 'file',
                getText: () => 'test content',
                isClosed: false
            };
            const mockEvent = {
                document: mockDocument
            };
            // Не должно выбросить исключение
            errorWatcher.handleDocumentChange(mockEvent);
            // Ждем debounce
            await new Promise(resolve => setTimeout(resolve, 200));
            // Ошибка должна быть обработана без прерывания работы
            assert.ok(true);
            errorWatcher.stopWatching();
        });
    });
    describe('document save handling', () => {
        it('should create snapshot when file is saved', async function () {
            this.timeout(5000);
            documentWatcher.startWatching();
            // Мокируем vscode.workspace.fs.stat
            const originalStat = vscode.workspace.fs.stat;
            vscode.workspace.fs.stat = async (uri) => {
                return {
                    type: 1,
                    ctime: Date.now(),
                    mtime: Date.now(),
                    size: 100
                };
            };
            // Мокируем vscode.workspace.fs.readFile
            const originalReadFile = vscode.workspace.fs.readFile;
            vscode.workspace.fs.readFile = async (uri) => {
                const content = 'saved file content';
                return Buffer.from(content, 'utf8');
            };
            const mockDocument = {
                uri: vscode.Uri.file('/workspace/test.ts'),
                scheme: 'file',
                isClosed: false
            };
            // Вызываем обработчик сохранения
            documentWatcher.handleDocumentSave(mockDocument);
            // Ждем асинхронной обработки
            await new Promise(resolve => setTimeout(resolve, 200));
            // Снапшот должен быть создан с source='save'
            assert.strictEqual(createdSnapshots.length, 1);
            assert.strictEqual(createdSnapshots[0].source, 'save');
            assert.strictEqual(createdSnapshots[0].fileUri, 'file:///workspace/test.ts');
            // Восстанавливаем оригинальные функции
            vscode.workspace.fs.readFile = originalReadFile;
            vscode.workspace.fs.stat = originalStat;
        });
        it('should ignore non-file schemes when saving', async function () {
            this.timeout(5000);
            documentWatcher.startWatching();
            const mockDocument = {
                uri: { scheme: 'output', toString: () => 'output://test' },
                scheme: 'output',
                isClosed: false
            };
            // Вызываем обработчик сохранения
            documentWatcher.handleDocumentSave(mockDocument);
            // Ждем асинхронной обработки
            await new Promise(resolve => setTimeout(resolve, 200));
            // Снапшот не должен быть создан
            assert.strictEqual(createdSnapshots.length, 0);
        });
        it('should ignore files outside workspace when saving', async function () {
            this.timeout(5000);
            // Мокируем isInWorkspace, чтобы возвращать false для файлов вне рабочей области
            uriUtils.isInWorkspace = (uri) => {
                return false; // Файл вне рабочей области
            };
            documentWatcher.startWatching();
            const mockDocument = {
                uri: vscode.Uri.file('/outside/test.ts'),
                scheme: 'file',
                isClosed: false
            };
            // Вызываем обработчик сохранения
            documentWatcher.handleDocumentSave(mockDocument);
            // Ждем асинхронной обработки
            await new Promise(resolve => setTimeout(resolve, 200));
            // Снапшот не должен быть создан
            assert.strictEqual(createdSnapshots.length, 0);
        });
        it('should skip files larger than maxFileSize when saving', async function () {
            this.timeout(5000);
            // Мокаем configService с маленьким maxFileSize
            const smallConfigService = {
                getTypingDebounce: () => 100,
                getMaxFileSize: () => 100 // 100 байт - очень маленький лимит
            };
            const smallWatcher = new DocumentWatcher_1.DocumentWatcher(historyManager, smallConfigService);
            smallWatcher.startWatching();
            // Мокируем vscode.workspace.fs.readFile для возврата большого файла
            const originalReadFile = vscode.workspace.fs.readFile;
            vscode.workspace.fs.readFile = async (uri) => {
                const largeContent = 'x'.repeat(200); // 200 байт > 100 байт лимита
                return Buffer.from(largeContent, 'utf8');
            };
            const mockDocument = {
                uri: vscode.Uri.file('/workspace/test.ts'),
                scheme: 'file',
                isClosed: false
            };
            // Вызываем обработчик сохранения
            smallWatcher.handleDocumentSave(mockDocument);
            // Ждем асинхронной обработки
            await new Promise(resolve => setTimeout(resolve, 200));
            // Снапшот не должен быть создан (файл слишком большой)
            assert.strictEqual(createdSnapshots.length, 0);
            // Восстанавливаем оригинальную функцию
            vscode.workspace.fs.readFile = originalReadFile;
            smallWatcher.stopWatching();
        });
        it('should handle file system errors gracefully', async function () {
            this.timeout(5000);
            documentWatcher.startWatching();
            // Мокируем vscode.workspace.fs.readFile для выбрасывания ошибки
            const originalReadFile = vscode.workspace.fs.readFile;
            vscode.workspace.fs.readFile = async (uri) => {
                throw vscode.FileSystemError.FileNotFound(uri);
            };
            const mockDocument = {
                uri: vscode.Uri.file('/workspace/test.ts'),
                scheme: 'file',
                isClosed: false
            };
            // Вызываем обработчик сохранения - не должно выбросить исключение
            documentWatcher.handleDocumentSave(mockDocument);
            // Ждем асинхронной обработки
            await new Promise(resolve => setTimeout(resolve, 200));
            // Ошибка должна быть обработана без прерывания работы
            assert.ok(true);
            assert.strictEqual(createdSnapshots.length, 0);
            // Восстанавливаем оригинальную функцию
            vscode.workspace.fs.readFile = originalReadFile;
        });
        it('should handle errors from historyManager gracefully', async function () {
            this.timeout(5000);
            // Создаем мок historyManager, который выбрасывает ошибку
            const errorHistoryManager = {
                createSnapshot: async () => {
                    throw new Error('Test error');
                }
            };
            const errorWatcher = new DocumentWatcher_1.DocumentWatcher(errorHistoryManager, configService);
            errorWatcher.startWatching();
            // Мокируем vscode.workspace.fs.readFile
            const originalReadFile = vscode.workspace.fs.readFile;
            vscode.workspace.fs.readFile = async (uri) => {
                const content = 'saved file content';
                return Buffer.from(content, 'utf8');
            };
            const mockDocument = {
                uri: vscode.Uri.file('/workspace/test.ts'),
                scheme: 'file',
                isClosed: false
            };
            // Вызываем обработчик сохранения - не должно выбросить исключение
            errorWatcher.handleDocumentSave(mockDocument);
            // Ждем асинхронной обработки
            await new Promise(resolve => setTimeout(resolve, 200));
            // Ошибка должна быть обработана без прерывания работы
            assert.ok(true);
            // Восстанавливаем оригинальную функцию
            vscode.workspace.fs.readFile = originalReadFile;
            errorWatcher.stopWatching();
        });
    });
});
//# sourceMappingURL=DocumentWatcher.test.js.map