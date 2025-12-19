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
const clearSnapshotsCommand_1 = require("../clearSnapshotsCommand");
const CleanupService_1 = require("../../services/CleanupService");
const ConfigurationService_1 = require("../../services/ConfigurationService");
const StorageService_1 = require("../../services/StorageService");
/**
 * Базовые unit-тесты для clearSnapshotsCommand.
 * Проверяют основную функциональность: очистку снапшотов по TTL и размеру.
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
describe('clearSnapshotsCommand', () => {
    let tempDir;
    let storageService;
    let cleanupService;
    let configService;
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
    describe('clearSnapshotsCommand - basic functionality', () => {
        it('should perform cleanup and show result when snapshots are deleted', async () => {
            // Вызываем команду очистки
            await (0, clearSnapshotsCommand_1.clearSnapshotsCommand)(cleanupService, configService);
            // Проверяем, что команда выполнилась без ошибок
            // (даже если снапшотов нет, команда должна показать сообщение)
            assert.ok(showInformationMessageCalls.length >= 1);
            // Первое сообщение - о начале очистки
            assert.ok(showInformationMessageCalls[0].includes('Starting cleanup'));
            // Последнее сообщение - о результате
            const lastMessage = showInformationMessageCalls[showInformationMessageCalls.length - 1];
            assert.ok(lastMessage.includes('Cleanup completed') ||
                lastMessage.includes('no snapshots to delete'));
        });
        it('should handle cleanup errors gracefully', async () => {
            // Создаем мок CleanupService, который выбрасывает ошибку
            const mockCleanupService = {
                cleanupByTTL: async () => {
                    throw new Error('Test TTL error');
                },
                cleanupBySize: async () => {
                    throw new Error('Test size error');
                }
            };
            // Вызываем команду очистки
            await (0, clearSnapshotsCommand_1.clearSnapshotsCommand)(mockCleanupService, configService);
            // Проверяем, что ошибки обработаны и показаны предупреждения
            assert.ok(showWarningMessageCalls.length >= 2);
            assert.ok(showWarningMessageCalls.some(msg => msg.includes('TTL')));
            assert.ok(showWarningMessageCalls.some(msg => msg.includes('size')));
            // Проверяем, что команда завершилась с сообщением о результате
            assert.ok(showInformationMessageCalls.length >= 1);
        });
        it('should use default configuration values', async () => {
            // Получаем значения по умолчанию из ConfigurationService
            const defaultTTL = configService.getTTLDays();
            const defaultMaxSize = configService.getMaxStorageSize();
            // Проверяем, что значения валидны
            assert.ok(defaultTTL > 0);
            assert.ok(defaultMaxSize > 0);
            // Вызываем команду очистки
            await (0, clearSnapshotsCommand_1.clearSnapshotsCommand)(cleanupService, configService);
            // Команда должна выполниться без ошибок
            assert.ok(showInformationMessageCalls.length >= 1);
        });
    });
});
//# sourceMappingURL=clearSnapshotsCommand.test.js.map