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
const acceptCommand_1 = require("../acceptCommand");
const LocalHistoryManager_1 = require("../../services/LocalHistoryManager");
const LocalHistoryTimelineProvider_1 = require("../../providers/LocalHistoryTimelineProvider");
const StorageService_1 = require("../../services/StorageService");
const CleanupService_1 = require("../../services/CleanupService");
const ConfigurationService_1 = require("../../services/ConfigurationService");
/**
 * Базовые unit-тесты для acceptCommand.
 * Проверяют основную функциональность: принятие/отмена принятия снапшотов.
 */
// Хранилище для мок данных Memento
let testMementoData = {};
// Мок для window.showErrorMessage, showInformationMessage, showWarningMessage
let showErrorMessageCalls = [];
let showInformationMessageCalls = [];
let showWarningMessageCalls = [];
// Сохраняем оригинальные функции для восстановления
let originalShowErrorMessage;
let originalShowInformationMessage;
let originalShowWarningMessage;
describe('acceptCommand', () => {
    let tempDir;
    let storageService;
    let cleanupService;
    let configService;
    let historyManager;
    let timelineProvider;
    let mockContext;
    let mockGlobalState;
    beforeEach(() => {
        // Очищаем мок данные перед каждым тестом
        testMementoData = {};
        showErrorMessageCalls = [];
        showInformationMessageCalls = [];
        showWarningMessageCalls = [];
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
        timelineProvider = new LocalHistoryTimelineProvider_1.LocalHistoryTimelineProvider(historyManager);
        // Сохраняем оригинальные функции
        originalShowErrorMessage = vscode.window.showErrorMessage;
        originalShowInformationMessage = vscode.window.showInformationMessage;
        originalShowWarningMessage = vscode.window.showWarningMessage;
        // Мокируем window методы
        vscode.window.showErrorMessage = async (message) => {
            showErrorMessageCalls.push(message);
            return undefined;
        };
        vscode.window.showInformationMessage = async (message) => {
            showInformationMessageCalls.push(message);
            return undefined;
        };
        vscode.window.showWarningMessage = async (message) => {
            showWarningMessageCalls.push(message);
            return undefined;
        };
    });
    afterEach(() => {
        // Восстанавливаем оригинальные функции
        if (originalShowErrorMessage) {
            vscode.window.showErrorMessage = originalShowErrorMessage;
        }
        if (originalShowInformationMessage) {
            vscode.window.showInformationMessage = originalShowInformationMessage;
        }
        if (originalShowWarningMessage) {
            vscode.window.showWarningMessage = originalShowWarningMessage;
        }
        // Очищаем временную директорию
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        // Очищаем мок данные
        testMementoData = {};
    });
    describe('acceptCommand - basic functionality', () => {
        it('should accept a single snapshot', async () => {
            // Создаем снапшот
            const fileUri = vscode.Uri.file('/test/file.ts');
            const content = 'const x = 1;';
            const snapshot = await historyManager.createSnapshot(fileUri, content, 'typing');
            // Проверяем, что снапшот не принят изначально
            assert.strictEqual(snapshot.accepted, false);
            assert.strictEqual(snapshot.acceptedTimestamp, undefined);
            // Вызываем команду accept
            await (0, acceptCommand_1.acceptCommand)(historyManager, timelineProvider, snapshot.id);
            // Проверяем, что снапшот принят
            const updatedSnapshot = await historyManager.getSnapshot(snapshot.id);
            assert.ok(updatedSnapshot);
            assert.strictEqual(updatedSnapshot.accepted, true);
            assert.ok(updatedSnapshot.acceptedTimestamp);
            assert.ok(updatedSnapshot.acceptedTimestamp > 0);
            // Проверяем уведомление пользователю
            assert.strictEqual(showInformationMessageCalls.length, 1);
            assert.ok(showInformationMessageCalls[0].includes('accepted'));
        });
        it('should unaccept an already accepted snapshot', async () => {
            // Создаем снапшот
            const fileUri = vscode.Uri.file('/test/file.ts');
            const content = 'const x = 1;';
            const snapshot = await historyManager.createSnapshot(fileUri, content, 'typing');
            // Принимаем снапшот вручную
            await historyManager.updateSnapshot(snapshot.id, {
                accepted: true,
                acceptedTimestamp: Date.now()
            });
            // Проверяем, что снапшот принят
            let updatedSnapshot = await historyManager.getSnapshot(snapshot.id);
            assert.strictEqual(updatedSnapshot.accepted, true);
            // Вызываем команду accept для отмены принятия
            await (0, acceptCommand_1.acceptCommand)(historyManager, timelineProvider, snapshot.id);
            // Проверяем, что принятие отменено
            updatedSnapshot = await historyManager.getSnapshot(snapshot.id);
            assert.ok(updatedSnapshot);
            assert.strictEqual(updatedSnapshot.accepted, false);
            assert.strictEqual(updatedSnapshot.acceptedTimestamp, undefined);
            // Проверяем уведомление пользователю
            assert.strictEqual(showInformationMessageCalls.length, 1);
            assert.ok(showInformationMessageCalls[0].includes('unaccepted'));
        });
        it('should handle multiple snapshots', async () => {
            // Создаем несколько снапшотов
            const fileUri = vscode.Uri.file('/test/file.ts');
            const snapshot1 = await historyManager.createSnapshot(fileUri, 'const x = 1;', 'typing');
            const snapshot2 = await historyManager.createSnapshot(fileUri, 'const y = 2;', 'typing');
            // Вызываем команду accept для массива снапшотов
            await (0, acceptCommand_1.acceptCommand)(historyManager, timelineProvider, [snapshot1.id, snapshot2.id]);
            // Проверяем, что оба снапшота приняты
            const updated1 = await historyManager.getSnapshot(snapshot1.id);
            const updated2 = await historyManager.getSnapshot(snapshot2.id);
            assert.strictEqual(updated1.accepted, true);
            assert.strictEqual(updated2.accepted, true);
            // Проверяем уведомление пользователю
            assert.strictEqual(showInformationMessageCalls.length, 1);
            assert.ok(showInformationMessageCalls[0].includes('processed'));
        });
        it('should handle non-existent snapshot', async () => {
            // Вызываем команду accept с несуществующим ID (валидный UUID v4)
            await (0, acceptCommand_1.acceptCommand)(historyManager, timelineProvider, '123e4567-e89b-42d3-a456-426614174000');
            // Проверяем, что показана ошибка
            assert.strictEqual(showErrorMessageCalls.length, 1);
            assert.ok(showErrorMessageCalls[0].includes('Failed to process snapshots'));
        });
        it('should handle missing snapshotId', async () => {
            // Вызываем команду accept без ID
            await (0, acceptCommand_1.acceptCommand)(historyManager, timelineProvider, undefined);
            // Проверяем, что показана ошибка
            assert.strictEqual(showErrorMessageCalls.length, 1);
            assert.ok(showErrorMessageCalls[0].includes('required'));
        });
        it('should handle empty array', async () => {
            // Вызываем команду accept с пустым массивом
            await (0, acceptCommand_1.acceptCommand)(historyManager, timelineProvider, []);
            // Проверяем, что показана ошибка
            assert.strictEqual(showErrorMessageCalls.length, 1);
            assert.ok(showErrorMessageCalls[0].includes('required'));
        });
    });
});
//# sourceMappingURL=acceptCommand.test.js.map