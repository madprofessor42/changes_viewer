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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const vscode = __importStar(require("vscode"));
const StorageService_1 = require("../StorageService");
const ConfigurationService_1 = require("../ConfigurationService");
/**
 * Простые unit-тесты для StorageService.
 * Для полного тестирования требуется VS Code Extension Host, но эти тесты
 * проверяют основную логику работы с файловой системой и валидацию путей.
 */
// Хранилище для мок данных Memento
let testMementoData = {};
describe('StorageService', () => {
    let tempDir;
    let storageService;
    let mockContext;
    let mockGlobalState;
    let mockConfigService;
    beforeEach(() => {
        // Очищаем мок данные перед каждым тестом
        testMementoData = {};
        // Создаем временную директорию для тестов
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changes-viewer-test-'));
        // Создаем мок ExtensionContext
        mockGlobalState = {
            get: (key) => {
                return testMementoData[key];
            },
            update: async (key, value) => {
                testMementoData[key] = value;
                return Promise.resolve();
            },
            keys: () => {
                return Object.keys(testMementoData);
            }
        };
        mockContext = {
            globalStoragePath: tempDir,
            globalState: mockGlobalState,
            workspaceState: mockGlobalState,
            subscriptions: [],
            extensionPath: '',
            extensionUri: vscode.Uri.file(''),
            storagePath: tempDir,
            globalStorageUri: vscode.Uri.file(tempDir),
            logPath: tempDir,
            extensionMode: vscode.ExtensionMode.Production,
            secrets: {},
            environmentVariableCollection: {},
            asAbsolutePath: (relativePath) => path.join('', relativePath),
            storageUri: vscode.Uri.file(tempDir),
            logUri: vscode.Uri.file(tempDir),
            extension: {},
            languageModelAccessInformation: {}
        };
        // Создаем реальный ConfigurationService (он не требует моков, так как использует vscode.workspace.getConfiguration)
        mockConfigService = new ConfigurationService_1.ConfigurationService();
        storageService = new StorageService_1.StorageService(mockContext, mockConfigService);
    });
    afterEach(() => {
        // Очищаем временную директорию
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        // Очищаем мок данные
        testMementoData = {};
    });
    describe('getStoragePath', () => {
        it('should return the storage path', () => {
            const storagePath = storageService.getStoragePath();
            assert.strictEqual(storagePath, tempDir);
        });
    });
    describe('saveSnapshotMetadata and getSnapshotMetadata', () => {
        it('should save and retrieve snapshot metadata', async () => {
            const snapshot = {
                id: 'test-snapshot-1',
                fileUri: 'file:///test/file.ts',
                filePath: '/test/file.ts',
                timestamp: Date.now(),
                source: 'typing',
                contentHash: 'test-hash-123',
                contentPath: 'snapshots/test/file.txt',
                metadata: {
                    size: 100,
                    lineCount: 10,
                    encoding: 'utf-8',
                    deleted: false,
                    compressed: false
                },
                accepted: false
            };
            await storageService.saveSnapshotMetadata(snapshot);
            const retrieved = await storageService.getSnapshotMetadata('test-snapshot-1');
            assert.ok(retrieved);
            assert.strictEqual(retrieved.id, snapshot.id);
            assert.strictEqual(retrieved.fileUri, snapshot.fileUri);
            assert.strictEqual(retrieved.contentHash, snapshot.contentHash);
        });
        it('should return null for non-existent snapshot', async () => {
            const retrieved = await storageService.getSnapshotMetadata('non-existent-id');
            assert.strictEqual(retrieved, null);
        });
    });
    describe('getSnapshotsForFile', () => {
        it('should return snapshots for a file', async () => {
            const fileUri = 'file:///test/file.ts';
            const snapshot1 = {
                id: 'snapshot-1',
                fileUri: fileUri,
                filePath: '/test/file.ts',
                timestamp: 1000,
                source: 'typing',
                contentHash: 'hash-1',
                contentPath: 'snapshots/test1.txt',
                metadata: { size: 100, lineCount: 10, deleted: false, compressed: false },
                accepted: false
            };
            const snapshot2 = {
                id: 'snapshot-2',
                fileUri: fileUri,
                filePath: '/test/file.ts',
                timestamp: 2000,
                source: 'save',
                contentHash: 'hash-2',
                contentPath: 'snapshots/test2.txt',
                metadata: { size: 200, lineCount: 20, deleted: false, compressed: false },
                accepted: false
            };
            await storageService.saveSnapshotMetadata(snapshot1);
            await storageService.saveSnapshotMetadata(snapshot2);
            const snapshots = await storageService.getSnapshotsForFile(fileUri);
            assert.strictEqual(snapshots.length, 2);
            // Проверяем сортировку (новые первыми)
            assert.strictEqual(snapshots[0].id, 'snapshot-2');
            assert.strictEqual(snapshots[1].id, 'snapshot-1');
        });
        it('should return empty array for file with no snapshots', async () => {
            const snapshots = await storageService.getSnapshotsForFile('file:///test/nonexistent.ts');
            assert.strictEqual(snapshots.length, 0);
        });
    });
    describe('saveSnapshotContent and getSnapshotContent', () => {
        it('should save and retrieve snapshot content', async () => {
            const snapshotId = 'test-snapshot-1';
            const content = 'Test file content\nLine 2';
            const fileHash = 'a1b2c3d4e5f6g7h8';
            const contentPath = await storageService.saveSnapshotContent(snapshotId, content, fileHash);
            assert.ok(contentPath);
            assert.ok(contentPath.includes(snapshotId));
            const retrievedContent = await storageService.getSnapshotContent(contentPath);
            assert.strictEqual(retrievedContent, content);
        });
        it('should compress large files when compression is enabled', async () => {
            // Создаем большой контент (больше порога сжатия по умолчанию 10 MB)
            const largeContent = 'x'.repeat(11 * 1024 * 1024); // 11 MB
            const snapshotId = 'test-snapshot-large';
            const fileHash = 'a1b2c3d4e5f6g7h8';
            const contentPath = await storageService.saveSnapshotContent(snapshotId, largeContent, fileHash);
            // Проверяем, что файл имеет расширение .gz
            assert.ok(contentPath.endsWith('.gz'), 'Large file should be compressed');
            // Проверяем, что файл действительно сжат (размер меньше оригинала)
            const absolutePath = path.resolve(tempDir, contentPath);
            const stats = fs.statSync(absolutePath);
            assert.ok(stats.size < largeContent.length, 'Compressed file should be smaller than original');
            // Проверяем, что содержимое корректно распаковывается
            const retrievedContent = await storageService.getSnapshotContent(contentPath, undefined, { compressed: true });
            assert.strictEqual(retrievedContent, largeContent);
        });
        it('should not compress small files', async () => {
            const smallContent = 'Small content';
            const snapshotId = 'test-snapshot-small';
            const fileHash = 'a1b2c3d4e5f6g7h8';
            const contentPath = await storageService.saveSnapshotContent(snapshotId, smallContent, fileHash);
            // Проверяем, что файл не имеет расширения .gz
            assert.ok(!contentPath.endsWith('.gz'), 'Small file should not be compressed');
            // Проверяем, что содержимое корректно читается
            const retrievedContent = await storageService.getSnapshotContent(contentPath);
            assert.strictEqual(retrievedContent, smallContent);
        });
        it('should throw error for non-existent content file', async () => {
            try {
                await storageService.getSnapshotContent('non-existent/path.txt');
                assert.fail('Should have thrown an error');
            }
            catch (error) {
                assert.ok(error instanceof Error);
                assert.ok(error.message.includes('not found'));
            }
        });
    });
    describe('deleteSnapshotContent', () => {
        it('should delete snapshot content file', async () => {
            const snapshotId = 'test-snapshot-1';
            const content = 'Test content';
            const fileHash = 'a1b2c3d4';
            const contentPath = await storageService.saveSnapshotContent(snapshotId, content, fileHash);
            // Проверяем, что файл существует
            const absolutePath = path.resolve(tempDir, contentPath);
            assert.ok(fs.existsSync(absolutePath));
            // Удаляем файл
            await storageService.deleteSnapshotContent(contentPath);
            // Проверяем, что файл удален
            assert.ok(!fs.existsSync(absolutePath));
        });
        it('should not throw error when deleting non-existent file', async () => {
            // Должно завершиться без ошибки
            await storageService.deleteSnapshotContent('non-existent/path.txt');
        });
    });
    describe('getStorageSize', () => {
        it('should calculate storage size', async () => {
            const content1 = 'Content 1';
            const content2 = 'Content 2 with more text';
            await storageService.saveSnapshotContent('snapshot-1', content1, 'hash1');
            await storageService.saveSnapshotContent('snapshot-2', content2, 'hash2');
            const size = await storageService.getStorageSize();
            assert.ok(size > 0);
            // Размер должен быть примерно равен сумме размеров файлов
            assert.ok(size >= content1.length + content2.length);
        });
        it('should return 0 for empty storage', async () => {
            const size = await storageService.getStorageSize();
            assert.strictEqual(size, 0);
        });
    });
    describe('path traversal protection', () => {
        it('should reject paths with ..', async () => {
            try {
                await storageService.getSnapshotContent('../../etc/passwd');
                assert.fail('Should have thrown an error');
            }
            catch (error) {
                assert.ok(error instanceof Error);
                assert.ok(error.message.includes('path traversal') || error.message.includes('Invalid path'));
            }
        });
        it('should reject paths with ~', async () => {
            try {
                await storageService.getSnapshotContent('~/home/file.txt');
                assert.fail('Should have thrown an error');
            }
            catch (error) {
                assert.ok(error instanceof Error);
                assert.ok(error.message.includes('dangerous characters') || error.message.includes('Invalid path'));
            }
        });
    });
});
//# sourceMappingURL=StorageService.test.js.map