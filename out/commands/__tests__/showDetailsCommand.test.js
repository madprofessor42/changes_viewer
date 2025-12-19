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
const showDetailsCommand_1 = require("../showDetailsCommand");
const LocalHistoryManager_1 = require("../../services/LocalHistoryManager");
const StorageService_1 = require("../../services/StorageService");
const CleanupService_1 = require("../../services/CleanupService");
const ConfigurationService_1 = require("../../services/ConfigurationService");
/**
 * Базовые unit-тесты для showDetailsCommand.
 * Проверяют основную функциональность: отображение детальной информации о снапшоте.
 */
// Хранилище для мок данных Memento
let testMementoData = {};
// Мок для window.showErrorMessage, showInformationMessage
let showErrorMessageCalls = [];
let showInformationMessageCalls = [];
// Мок для env.clipboard.writeText
let clipboardWriteTextCalls = [];
// Сохраняем оригинальные функции для восстановления
let originalShowErrorMessage;
let originalShowInformationMessage;
let originalClipboardWriteText;
describe('showDetailsCommand', () => {
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
        showErrorMessageCalls = [];
        showInformationMessageCalls = [];
        clipboardWriteTextCalls = [];
        // Мокируем env.clipboard ДО создания сервисов
        if (!vscode.env) {
            vscode.env = {};
        }
        if (!vscode.env.clipboard) {
            vscode.env.clipboard = {};
        }
        originalClipboardWriteText = vscode.env.clipboard.writeText;
        vscode.env.clipboard.writeText = async (text) => {
            clipboardWriteTextCalls.push(text);
            return Promise.resolve();
        };
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
        // Сохраняем оригинальные функции
        originalShowErrorMessage = vscode.window.showErrorMessage;
        originalShowInformationMessage = vscode.window.showInformationMessage;
        // Мокируем window методы
        vscode.window.showErrorMessage = async (message) => {
            showErrorMessageCalls.push(message);
            return undefined;
        };
        vscode.window.showInformationMessage = async (message, options, ...items) => {
            showInformationMessageCalls.push({ message, options, items });
            // По умолчанию возвращаем undefined (кнопка не нажата)
            // В специальных тестах можно переопределить это поведение
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
        if (originalClipboardWriteText) {
            vscode.env.clipboard.writeText = originalClipboardWriteText;
        }
        // Очищаем временную директорию
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        // Очищаем мок данные
        testMementoData = {};
    });
    describe('showDetailsCommand - basic functionality', () => {
        it('should display snapshot details for a valid snapshot', async () => {
            // Создаем снапшот
            const fileUri = vscode.Uri.file('/test/file.ts');
            const content = 'const x = 1;\nconst y = 2;';
            const snapshot = await historyManager.createSnapshot(fileUri, content, 'typing');
            // Вызываем команду showDetails
            await (0, showDetailsCommand_1.showDetailsCommand)(historyManager, snapshot.id);
            // Проверяем, что информация была отображена
            assert.strictEqual(showInformationMessageCalls.length, 1);
            const call = showInformationMessageCalls[0];
            // Проверяем, что сообщение содержит основную информацию
            assert.ok(call.message.includes('Snapshot Details'));
            assert.ok(call.message.includes('Date & Time'));
            assert.ok(call.message.includes('Source'));
            assert.ok(call.message.includes('File'));
            assert.ok(call.message.includes('Size'));
            assert.ok(call.message.includes('Lines'));
            // Проверяем, что есть кнопка "Copy Details"
            assert.ok(call.items && call.items.length > 0);
            assert.ok(call.items[0] === 'Copy Details' || call.items.some((item) => item === 'Copy Details'));
        });
        it('should display change information when diffInfo is available', async () => {
            // Создаем первый снапшот
            const fileUri = vscode.Uri.file('/test/file.ts');
            const content1 = 'const x = 1;';
            await historyManager.createSnapshot(fileUri, content1, 'typing');
            // Создаем второй снапшот с изменениями
            const content2 = 'const x = 1;\nconst y = 2;\nconst z = 3;';
            const snapshot2 = await historyManager.createSnapshot(fileUri, content2, 'typing');
            // Вызываем команду showDetails
            await (0, showDetailsCommand_1.showDetailsCommand)(historyManager, snapshot2.id);
            // Проверяем, что информация об изменениях отображается
            assert.strictEqual(showInformationMessageCalls.length, 1);
            const call = showInformationMessageCalls[0];
            // Проверяем, что сообщение содержит информацию об изменениях
            assert.ok(call.message.includes('Change Information') || call.message.includes('Changes:'));
        });
        it('should display accepted status', async () => {
            // Создаем снапшот
            const fileUri = vscode.Uri.file('/test/file.ts');
            const content = 'const x = 1;';
            const snapshot = await historyManager.createSnapshot(fileUri, content, 'typing');
            // Принимаем снапшот
            await historyManager.updateSnapshot(snapshot.id, {
                accepted: true,
                acceptedTimestamp: Date.now()
            });
            // Вызываем команду showDetails
            await (0, showDetailsCommand_1.showDetailsCommand)(historyManager, snapshot.id);
            // Проверяем, что статус принятия отображается
            assert.strictEqual(showInformationMessageCalls.length, 1);
            const call = showInformationMessageCalls[0];
            // Проверяем, что сообщение содержит статус
            assert.ok(call.message.includes('Status:') || call.message.includes('Accepted'));
        });
        it('should handle missing snapshotId', async () => {
            // Вызываем команду showDetails без ID
            await (0, showDetailsCommand_1.showDetailsCommand)(historyManager, undefined);
            // Проверяем, что показана ошибка
            assert.strictEqual(showErrorMessageCalls.length, 1);
            assert.ok(showErrorMessageCalls[0].includes('required'));
        });
        it('should handle non-existent snapshot', async () => {
            // Вызываем команду showDetails с несуществующим ID (валидный UUID v4)
            await (0, showDetailsCommand_1.showDetailsCommand)(historyManager, '123e4567-e89b-42d3-a456-426614174000');
            // Проверяем, что показана ошибка
            assert.strictEqual(showErrorMessageCalls.length, 1);
            assert.ok(showErrorMessageCalls[0].includes('not found'));
        });
        it('should copy details to clipboard when Copy Details button is clicked', async () => {
            // Создаем снапшот
            const fileUri = vscode.Uri.file('/test/file.ts');
            const content = 'const x = 1;';
            const snapshot = await historyManager.createSnapshot(fileUri, content, 'typing');
            // Мокируем showInformationMessage, чтобы вернуть "Copy Details"
            vscode.window.showInformationMessage = async (message, options, ...items) => {
                showInformationMessageCalls.push({ message, options, items });
                // Симулируем нажатие кнопки "Copy Details"
                return 'Copy Details';
            };
            // Вызываем команду showDetails
            await (0, showDetailsCommand_1.showDetailsCommand)(historyManager, snapshot.id);
            // Проверяем, что информация была скопирована в буфер обмена
            assert.strictEqual(clipboardWriteTextCalls.length, 1);
            assert.ok(clipboardWriteTextCalls[0].includes('Snapshot Details'));
            // Проверяем, что показано сообщение об успешном копировании
            assert.strictEqual(showInformationMessageCalls.length, 2);
            assert.ok(showInformationMessageCalls[1].message.includes('copied to clipboard'));
        });
    });
});
//# sourceMappingURL=showDetailsCommand.test.js.map