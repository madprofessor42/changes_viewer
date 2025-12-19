// Мокируем vscode перед импортом
import '../../__mocks__/setup';

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { showDetailsCommand } from '../showDetailsCommand';
import { LocalHistoryManager } from '../../services/LocalHistoryManager';
import { StorageService } from '../../services/StorageService';
import { CleanupService } from '../../services/CleanupService';
import { ConfigurationService } from '../../services/ConfigurationService';

/**
 * Базовые unit-тесты для showDetailsCommand.
 * Проверяют основную функциональность: отображение детальной информации о снапшоте.
 */

// Хранилище для мок данных Memento
let testMementoData: Record<string, any> = {};

// Мок для window.showErrorMessage, showInformationMessage
let showErrorMessageCalls: string[] = [];
let showInformationMessageCalls: Array<{ message: string; options?: any; items?: any[] }> = [];

// Мок для env.clipboard.writeText
let clipboardWriteTextCalls: string[] = [];

// Сохраняем оригинальные функции для восстановления
let originalShowErrorMessage: any;
let originalShowInformationMessage: any;
let originalClipboardWriteText: any;

describe('showDetailsCommand', () => {
    let tempDir: string;
    let storageService: StorageService;
    let cleanupService: CleanupService;
    let configService: ConfigurationService;
    let historyManager: LocalHistoryManager;
    let mockContext: vscode.ExtensionContext;
    let mockGlobalState: vscode.Memento;

    beforeEach(() => {
        // Очищаем мок данные перед каждым тестом
        testMementoData = {};
        showErrorMessageCalls = [];
        showInformationMessageCalls = [];
        clipboardWriteTextCalls = [];

        // Мокируем env.clipboard ДО создания сервисов
        if (!(vscode as any).env) {
            (vscode as any).env = {};
        }
        if (!(vscode.env as any).clipboard) {
            (vscode.env as any).clipboard = {};
        }
        originalClipboardWriteText = (vscode.env.clipboard as any).writeText;
        (vscode.env.clipboard as any).writeText = async (text: string) => {
            clipboardWriteTextCalls.push(text);
            return Promise.resolve();
        };

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
        historyManager = new LocalHistoryManager(storageService, cleanupService, configService);

        // Сохраняем оригинальные функции
        originalShowErrorMessage = (vscode.window as any).showErrorMessage;
        originalShowInformationMessage = (vscode.window as any).showInformationMessage;

        // Мокируем window методы
        (vscode.window as any).showErrorMessage = async (message: string) => {
            showErrorMessageCalls.push(message);
            return undefined;
        };
        (vscode.window as any).showInformationMessage = async (
            message: string,
            options?: any,
            ...items: any[]
        ) => {
            showInformationMessageCalls.push({ message, options, items });
            // По умолчанию возвращаем undefined (кнопка не нажата)
            // В специальных тестах можно переопределить это поведение
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
        if (originalClipboardWriteText) {
            (vscode.env.clipboard as any).writeText = originalClipboardWriteText;
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
            await showDetailsCommand(historyManager, snapshot.id);

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
            assert.ok(call.items[0] === 'Copy Details' || call.items.some((item: any) => item === 'Copy Details'));
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
            await showDetailsCommand(historyManager, snapshot2.id);

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
            await showDetailsCommand(historyManager, snapshot.id);

            // Проверяем, что статус принятия отображается
            assert.strictEqual(showInformationMessageCalls.length, 1);
            const call = showInformationMessageCalls[0];
            
            // Проверяем, что сообщение содержит статус
            assert.ok(call.message.includes('Status:') || call.message.includes('Accepted'));
        });

        it('should handle missing snapshotId', async () => {
            // Вызываем команду showDetails без ID
            await showDetailsCommand(historyManager, undefined);

            // Проверяем, что показана ошибка
            assert.strictEqual(showErrorMessageCalls.length, 1);
            assert.ok(showErrorMessageCalls[0].includes('required'));
        });

        it('should handle non-existent snapshot', async () => {
            // Вызываем команду showDetails с несуществующим ID (валидный UUID v4)
            await showDetailsCommand(historyManager, '123e4567-e89b-42d3-a456-426614174000');

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
            (vscode.window as any).showInformationMessage = async (
                message: string,
                options?: any,
                ...items: any[]
            ) => {
                showInformationMessageCalls.push({ message, options, items });
                // Симулируем нажатие кнопки "Copy Details"
                return 'Copy Details';
            };

            // Вызываем команду showDetails
            await showDetailsCommand(historyManager, snapshot.id);

            // Проверяем, что информация была скопирована в буфер обмена
            assert.strictEqual(clipboardWriteTextCalls.length, 1);
            assert.ok(clipboardWriteTextCalls[0].includes('Snapshot Details'));
            
            // Проверяем, что показано сообщение об успешном копировании
            assert.strictEqual(showInformationMessageCalls.length, 2);
            assert.ok(showInformationMessageCalls[1].message.includes('copied to clipboard'));
        });
    });
});
