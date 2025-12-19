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
const LocalHistoryTimelineProvider_1 = require("../../providers/LocalHistoryTimelineProvider");
/**
 * Тесты производительности для проверки требований ТЗ:
 * - Создание снапшотов < 100ms для файлов < 1 MB
 * - Создание снапшотов < 500ms для файлов < 10 MB
 * - Загрузка Timeline < 1 секунда для 1000 снапшотов
 */
describe('Performance Tests', () => {
    let tempDir;
    let storageService;
    let cleanupService;
    let configService;
    let historyManager;
    let timelineProvider;
    let mockContext;
    let mockGlobalState;
    let testMementoData = {};
    beforeEach(() => {
        testMementoData = {};
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changes-viewer-perf-test-'));
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
        configService = new ConfigurationService_1.ConfigurationService();
        storageService = new StorageService_1.StorageService(mockContext, configService);
        cleanupService = new CleanupService_1.CleanupService(storageService, configService);
        historyManager = new LocalHistoryManager_1.LocalHistoryManager(storageService, cleanupService, configService);
        timelineProvider = new LocalHistoryTimelineProvider_1.LocalHistoryTimelineProvider(historyManager);
    });
    afterEach(() => {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        testMementoData = {};
    });
    describe('Snapshot creation performance', () => {
        it('should create snapshot for file < 1 MB in < 100ms', async () => {
            // Создаем файл размером ~500 KB
            const content = 'x'.repeat(500 * 1024);
            const fileUri = vscode.Uri.file('/test/file.ts');
            const startTime = Date.now();
            const snapshot = await historyManager.createSnapshot(fileUri, content, 'typing');
            const duration = Date.now() - startTime;
            assert.ok(snapshot);
            assert.ok(duration < 100, `Snapshot creation took ${duration}ms, expected < 100ms`);
        });
        it('should create snapshot for file < 10 MB in < 500ms', async () => {
            // Создаем файл размером ~5 MB
            const content = 'x'.repeat(5 * 1024 * 1024);
            const fileUri = vscode.Uri.file('/test/large-file.ts');
            const startTime = Date.now();
            const snapshot = await historyManager.createSnapshot(fileUri, content, 'typing');
            const duration = Date.now() - startTime;
            assert.ok(snapshot);
            assert.ok(duration < 500, `Snapshot creation took ${duration}ms, expected < 500ms`);
        });
    });
    describe('Timeline loading performance', () => {
        it('should load timeline for 1000 snapshots in < 1 second', async () => {
            // Создаем 1000 снапшотов для одного файла
            const fileUri = vscode.Uri.file('/test/file.ts');
            const baseContent = 'const x = 1;';
            // Создаем снапшоты пакетами для ускорения
            const batchSize = 100;
            const totalSnapshots = 1000;
            for (let i = 0; i < totalSnapshots; i += batchSize) {
                const promises = [];
                for (let j = 0; j < batchSize && (i + j) < totalSnapshots; j++) {
                    // Добавляем уникальное содержимое для каждого снапшота, чтобы избежать дедупликации
                    const content = `${baseContent}\n// Snapshot ${i + j}`;
                    promises.push(historyManager.createSnapshot(fileUri, content, 'typing'));
                }
                await Promise.all(promises);
            }
            // Проверяем производительность загрузки Timeline
            const cancellationToken = new vscode.CancellationTokenSource().token;
            const startTime = Date.now();
            const result = await timelineProvider.provideTimeline(fileUri, {}, cancellationToken);
            const duration = Date.now() - startTime;
            assert.ok(Array.isArray(result) || 'items' in result);
            const items = Array.isArray(result) ? result : result.items;
            assert.ok(items.length > 0);
            assert.ok(duration < 1000, `Timeline loading took ${duration}ms, expected < 1000ms`);
        });
    });
    describe('Async operations', () => {
        it('should not block UI during snapshot creation', async () => {
            // Проверяем, что операции действительно асинхронные
            const fileUri = vscode.Uri.file('/test/file.ts');
            const content = 'const x = 1;';
            // Запускаем несколько операций параллельно
            const promises = Array.from({ length: 10 }, (_, i) => {
                const uniqueContent = `${content}\n// ${i}`;
                return historyManager.createSnapshot(fileUri, uniqueContent, 'typing');
            });
            // Все операции должны выполняться параллельно
            const startTime = Date.now();
            const snapshots = await Promise.all(promises);
            const duration = Date.now() - startTime;
            assert.strictEqual(snapshots.length, 10);
            // Параллельное выполнение должно быть быстрее последовательного
            // Если бы было последовательно, каждая операция заняла бы ~10-20ms, итого ~100-200ms
            // Параллельно должно быть значительно быстрее
            assert.ok(duration < 500, `Parallel snapshot creation took ${duration}ms, expected < 500ms`);
        });
    });
});
//# sourceMappingURL=Performance.test.js.map