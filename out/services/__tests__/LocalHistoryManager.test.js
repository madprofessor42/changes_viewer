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
const LocalHistoryManager_1 = require("../LocalHistoryManager");
const StorageService_1 = require("../StorageService");
const CleanupService_1 = require("../CleanupService");
const ConfigurationService_1 = require("../ConfigurationService");
/**
 * Базовые unit-тесты для LocalHistoryManager.
 * Проверяют основную функциональность: создание, чтение, обновление, удаление снапшотов,
 * дедупликацию и вычисление diff.
 */
// Хранилище для мок данных Memento
let testMementoData = {};
describe('LocalHistoryManager', () => {
    let tempDir;
    let storageService;
    let cleanupService;
    let configService;
    let historyManager;
    let mockContext;
    let mockGlobalState;
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
        // Инициализируем сервисы
        configService = new ConfigurationService_1.ConfigurationService();
        storageService = new StorageService_1.StorageService(mockContext, configService);
        cleanupService = new CleanupService_1.CleanupService(storageService, configService);
        historyManager = new LocalHistoryManager_1.LocalHistoryManager(storageService, cleanupService, configService);
    });
    afterEach(() => {
        // Очищаем временную директорию
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        // Очищаем мок данные
        testMementoData = {};
    });
    describe('createSnapshot', () => {
        it('should create a new snapshot with metadata', async () => {
            const fileUri = vscode.Uri.file('/test/file.ts');
            const content = 'const x = 1;\nconst y = 2;';
            const source = 'typing';
            const snapshot = await historyManager.createSnapshot(fileUri, content, source);
            assert.ok(snapshot);
            assert.ok(snapshot.id);
            assert.strictEqual(snapshot.fileUri, fileUri.toString());
            assert.strictEqual(snapshot.source, source);
            assert.ok(snapshot.contentHash);
            assert.strictEqual(snapshot.metadata.lineCount, 2);
            assert.ok(snapshot.metadata.size > 0);
            assert.strictEqual(snapshot.accepted, false);
        });
        it('should prevent duplicate snapshots (deduplication)', async () => {
            const fileUri = vscode.Uri.file('/test/file.ts');
            const content = 'const x = 1;';
            const source = 'typing';
            // Создаем первый снапшот
            const snapshot1 = await historyManager.createSnapshot(fileUri, content, source);
            // Пытаемся создать второй снапшот с тем же содержимым
            const snapshot2 = await historyManager.createSnapshot(fileUri, content, source);
            // Должен вернуться тот же снапшот (дедупликация)
            assert.strictEqual(snapshot1.id, snapshot2.id);
            assert.strictEqual(snapshot1.contentHash, snapshot2.contentHash);
        });
        it('should compute diff with previous snapshot', async () => {
            const fileUri = vscode.Uri.file('/test/file.ts');
            const content1 = 'const x = 1;';
            const content2 = 'const x = 1;\nconst y = 2;';
            const source = 'typing';
            // Создаем первый снапшот
            const snapshot1 = await historyManager.createSnapshot(fileUri, content1, source);
            // Создаем второй снапшот с изменениями
            const snapshot2 = await historyManager.createSnapshot(fileUri, content2, source);
            // Проверяем, что diff вычислен
            assert.ok(snapshot2.diffInfo);
            assert.strictEqual(snapshot2.diffInfo.previousSnapshotId, snapshot1.id);
            assert.ok(snapshot2.diffInfo.addedLines > 0);
        });
        it('should save snapshot content to filesystem', async () => {
            const fileUri = vscode.Uri.file('/test/file.ts');
            const content = 'Test content';
            const source = 'typing';
            const snapshot = await historyManager.createSnapshot(fileUri, content, source);
            // Проверяем, что содержимое сохранено
            const savedContent = await storageService.getSnapshotContent(snapshot.contentPath);
            assert.strictEqual(savedContent, content);
        });
    });
    describe('getSnapshot', () => {
        it('should retrieve snapshot by ID', async () => {
            const fileUri = vscode.Uri.file('/test/file.ts');
            const content = 'Test content';
            const source = 'typing';
            const created = await historyManager.createSnapshot(fileUri, content, source);
            const retrieved = await historyManager.getSnapshot(created.id);
            assert.ok(retrieved);
            assert.strictEqual(retrieved.id, created.id);
            assert.strictEqual(retrieved.fileUri, created.fileUri);
        });
        it('should return null for non-existent snapshot', async () => {
            const retrieved = await historyManager.getSnapshot('non-existent-id');
            assert.strictEqual(retrieved, null);
        });
    });
    describe('getSnapshotsForFile', () => {
        it('should return all snapshots for a file', async () => {
            const fileUri = vscode.Uri.file('/test/file.ts');
            const source = 'typing';
            await historyManager.createSnapshot(fileUri, 'content1', source);
            await historyManager.createSnapshot(fileUri, 'content2', source);
            await historyManager.createSnapshot(fileUri, 'content3', source);
            const snapshots = await historyManager.getSnapshotsForFile(fileUri);
            assert.strictEqual(snapshots.length, 3);
            // Проверяем сортировку (новые первыми)
            assert.ok(snapshots[0].timestamp >= snapshots[1].timestamp);
        });
        it('should filter snapshots by accepted status', async () => {
            const fileUri = vscode.Uri.file('/test/file.ts');
            const source = 'typing';
            const snapshot1 = await historyManager.createSnapshot(fileUri, 'content1', source);
            const snapshot2 = await historyManager.createSnapshot(fileUri, 'content2', source);
            // Принимаем первый снапшот
            await historyManager.updateSnapshot(snapshot1.id, { accepted: true });
            // Получаем только непринятые
            const unaccepted = await historyManager.getSnapshotsForFile(fileUri, { accepted: false });
            assert.strictEqual(unaccepted.length, 1);
            assert.strictEqual(unaccepted[0].id, snapshot2.id);
            // Получаем только принятые
            const accepted = await historyManager.getSnapshotsForFile(fileUri, { accepted: true });
            assert.strictEqual(accepted.length, 1);
            assert.strictEqual(accepted[0].id, snapshot1.id);
        });
        it('should filter snapshots by source', async () => {
            const fileUri = vscode.Uri.file('/test/file.ts');
            await historyManager.createSnapshot(fileUri, 'content1', 'typing');
            await historyManager.createSnapshot(fileUri, 'content2', 'save');
            await historyManager.createSnapshot(fileUri, 'content3', 'typing');
            const typingSnapshots = await historyManager.getSnapshotsForFile(fileUri, { source: 'typing' });
            assert.strictEqual(typingSnapshots.length, 2);
            const saveSnapshots = await historyManager.getSnapshotsForFile(fileUri, { source: 'save' });
            assert.strictEqual(saveSnapshots.length, 1);
        });
        it('should apply limit filter', async () => {
            const fileUri = vscode.Uri.file('/test/file.ts');
            const source = 'typing';
            await historyManager.createSnapshot(fileUri, 'content1', source);
            await historyManager.createSnapshot(fileUri, 'content2', source);
            await historyManager.createSnapshot(fileUri, 'content3', source);
            const limited = await historyManager.getSnapshotsForFile(fileUri, { limit: 2 });
            assert.strictEqual(limited.length, 2);
        });
    });
    describe('updateSnapshot', () => {
        it('should update snapshot metadata', async () => {
            const fileUri = vscode.Uri.file('/test/file.ts');
            const source = 'typing';
            const snapshot = await historyManager.createSnapshot(fileUri, 'content', source);
            const updated = await historyManager.updateSnapshot(snapshot.id, {
                accepted: true,
                acceptedTimestamp: Date.now()
            });
            assert.strictEqual(updated.accepted, true);
            assert.ok(updated.acceptedTimestamp);
        });
        it('should throw error for non-existent snapshot', async () => {
            try {
                await historyManager.updateSnapshot('non-existent-id', { accepted: true });
                assert.fail('Should have thrown an error');
            }
            catch (error) {
                assert.ok(error instanceof Error);
                assert.ok(error.message.includes('not found'));
            }
        });
    });
    describe('deleteSnapshot', () => {
        it('should delete snapshot and its content', async () => {
            const fileUri = vscode.Uri.file('/test/file.ts');
            const source = 'typing';
            const snapshot = await historyManager.createSnapshot(fileUri, 'content', source);
            // Проверяем, что содержимое существует
            const contentPath = path.resolve(tempDir, snapshot.contentPath);
            assert.ok(fs.existsSync(contentPath));
            // Удаляем снапшот
            await historyManager.deleteSnapshot(snapshot.id);
            // Проверяем, что снапшот удален
            const retrieved = await historyManager.getSnapshot(snapshot.id);
            assert.strictEqual(retrieved, null);
            // Проверяем, что содержимое удалено
            assert.ok(!fs.existsSync(contentPath));
        });
        it('should throw error for non-existent snapshot', async () => {
            try {
                await historyManager.deleteSnapshot('non-existent-id');
                assert.fail('Should have thrown an error');
            }
            catch (error) {
                assert.ok(error instanceof Error);
                assert.ok(error.message.includes('not found'));
            }
        });
    });
    describe('deleteSnapshots', () => {
        it('should delete multiple snapshots', async () => {
            const fileUri = vscode.Uri.file('/test/file.ts');
            const source = 'typing';
            const snapshot1 = await historyManager.createSnapshot(fileUri, 'content1', source);
            const snapshot2 = await historyManager.createSnapshot(fileUri, 'content2', source);
            const snapshot3 = await historyManager.createSnapshot(fileUri, 'content3', source);
            await historyManager.deleteSnapshots([snapshot1.id, snapshot2.id]);
            // Проверяем, что снапшоты удалены
            assert.strictEqual(await historyManager.getSnapshot(snapshot1.id), null);
            assert.strictEqual(await historyManager.getSnapshot(snapshot2.id), null);
            // Проверяем, что третий снапшот остался
            assert.ok(await historyManager.getSnapshot(snapshot3.id));
        });
    });
});
//# sourceMappingURL=LocalHistoryManager.test.js.map