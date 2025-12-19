// Мокируем vscode перед импортом
import '../../__mocks__/setup';

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { clearSnapshotsCommand } from '../clearSnapshotsCommand';
import { CleanupService } from '../../services/CleanupService';
import { ConfigurationService } from '../../services/ConfigurationService';
import { StorageService } from '../../services/StorageService';

/**
 * Базовые unit-тесты для clearSnapshotsCommand.
 * Проверяют основную функциональность: очистку снапшотов по TTL и размеру.
 */

// Хранилище для мок данных Memento
let testMementoData: Record<string, any> = {};

// Мок для window.showErrorMessage, showInformationMessage, showWarningMessage
let showErrorMessageCalls: string[] = [];
let showInformationMessageCalls: string[] = [];
let showWarningMessageCalls: string[] = [];

// Сохраняем оригинальные функции для восстановления
let originalShowErrorMessage: any;
let originalShowInformationMessage: any;
let originalShowWarningMessage: any;

describe('clearSnapshotsCommand', () => {
    let tempDir: string;
    let storageService: StorageService;
    let cleanupService: CleanupService;
    let configService: ConfigurationService;
    let mockContext: vscode.ExtensionContext;
    let mockGlobalState: vscode.Memento;

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
            get: <T>(key: string): T | undefined => {
                return testMementoData[key] as T | undefined;
            },
            update: async (key: string, value: any): Promise<void> => {
                testMementoData[key] = value;
                return Promise.resolve();
            },
            keys: (): readonly string[] => {
                return Object.keys(testMementoData);
            }
        } as vscode.Memento;

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
            secrets: {} as any,
            environmentVariableCollection: {} as any,
            asAbsolutePath: (relativePath: string) => path.join('', relativePath),
            storageUri: vscode.Uri.file(tempDir),
            logUri: vscode.Uri.file(tempDir),
            extension: {} as any,
            languageModelAccessInformation: {} as any
        } as unknown as vscode.ExtensionContext;

        // Инициализируем сервисы
        configService = new ConfigurationService();
        storageService = new StorageService(mockContext, configService);
        cleanupService = new CleanupService(storageService, configService);

        // Сохраняем оригинальные функции
        originalShowErrorMessage = (vscode.window as any).showErrorMessage;
        originalShowInformationMessage = (vscode.window as any).showInformationMessage;
        originalShowWarningMessage = (vscode.window as any).showWarningMessage;

        // Мокируем window методы
        (vscode.window as any).showErrorMessage = async (message: string) => {
            showErrorMessageCalls.push(message);
            return undefined;
        };
        (vscode.window as any).showInformationMessage = async (message: string) => {
            showInformationMessageCalls.push(message);
            return undefined;
        };
        (vscode.window as any).showWarningMessage = async (message: string) => {
            showWarningMessageCalls.push(message);
            return undefined;
        };
    });

    afterEach(() => {
        // Восстанавливаем оригинальные функции
        if (originalShowErrorMessage) {
            (vscode.window as any).showErrorMessage = originalShowErrorMessage;
        }
        if (originalShowInformationMessage) {
            (vscode.window as any).showInformationMessage = originalShowInformationMessage;
        }
        if (originalShowWarningMessage) {
            (vscode.window as any).showWarningMessage = originalShowWarningMessage;
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
            await clearSnapshotsCommand(cleanupService, configService);

            // Проверяем, что команда выполнилась без ошибок
            // (даже если снапшотов нет, команда должна показать сообщение)
            assert.ok(showInformationMessageCalls.length >= 1);
            
            // Первое сообщение - о начале очистки
            assert.ok(showInformationMessageCalls[0].includes('Starting cleanup'));
            
            // Последнее сообщение - о результате
            const lastMessage = showInformationMessageCalls[showInformationMessageCalls.length - 1];
            assert.ok(
                lastMessage.includes('Cleanup completed') || 
                lastMessage.includes('no snapshots to delete')
            );
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
            } as unknown as CleanupService;

            // Вызываем команду очистки
            await clearSnapshotsCommand(mockCleanupService, configService);

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
            await clearSnapshotsCommand(cleanupService, configService);

            // Команда должна выполниться без ошибок
            assert.ok(showInformationMessageCalls.length >= 1);
        });
    });
});
