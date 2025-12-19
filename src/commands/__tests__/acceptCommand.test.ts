// Мокируем vscode перед импортом
import '../../__mocks__/setup';

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { acceptCommand } from '../acceptCommand';
import { LocalHistoryManager } from '../../services/LocalHistoryManager';
import { LocalHistoryTimelineProvider } from '../../providers/LocalHistoryTimelineProvider';
import { StorageService } from '../../services/StorageService';
import { CleanupService } from '../../services/CleanupService';
import { ConfigurationService } from '../../services/ConfigurationService';
import { Snapshot } from '../../types/snapshot';

/**
 * Базовые unit-тесты для acceptCommand.
 * Проверяют основную функциональность: принятие/отмена принятия снапшотов.
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

describe('acceptCommand', () => {
    let tempDir: string;
    let storageService: StorageService;
    let cleanupService: CleanupService;
    let configService: ConfigurationService;
    let historyManager: LocalHistoryManager;
    let timelineProvider: LocalHistoryTimelineProvider;
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
        historyManager = new LocalHistoryManager(storageService, cleanupService, configService);
        timelineProvider = new LocalHistoryTimelineProvider(historyManager);

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
            await acceptCommand(historyManager, timelineProvider, snapshot.id);

            // Проверяем, что снапшот принят
            const updatedSnapshot = await historyManager.getSnapshot(snapshot.id);
            assert.ok(updatedSnapshot);
            assert.strictEqual(updatedSnapshot!.accepted, true);
            assert.ok(updatedSnapshot!.acceptedTimestamp);
            assert.ok(updatedSnapshot!.acceptedTimestamp! > 0);

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
            assert.strictEqual(updatedSnapshot!.accepted, true);

            // Вызываем команду accept для отмены принятия
            await acceptCommand(historyManager, timelineProvider, snapshot.id);

            // Проверяем, что принятие отменено
            updatedSnapshot = await historyManager.getSnapshot(snapshot.id);
            assert.ok(updatedSnapshot);
            assert.strictEqual(updatedSnapshot!.accepted, false);
            assert.strictEqual(updatedSnapshot!.acceptedTimestamp, undefined);

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
            await acceptCommand(historyManager, timelineProvider, [snapshot1.id, snapshot2.id]);

            // Проверяем, что оба снапшота приняты
            const updated1 = await historyManager.getSnapshot(snapshot1.id);
            const updated2 = await historyManager.getSnapshot(snapshot2.id);
            assert.strictEqual(updated1!.accepted, true);
            assert.strictEqual(updated2!.accepted, true);

            // Проверяем уведомление пользователю
            assert.strictEqual(showInformationMessageCalls.length, 1);
            assert.ok(showInformationMessageCalls[0].includes('processed'));
        });

        it('should handle non-existent snapshot', async () => {
            // Вызываем команду accept с несуществующим ID (валидный UUID v4)
            await acceptCommand(historyManager, timelineProvider, '123e4567-e89b-42d3-a456-426614174000');

            // Проверяем, что показана ошибка
            assert.strictEqual(showErrorMessageCalls.length, 1);
            assert.ok(showErrorMessageCalls[0].includes('Failed to process snapshots'));
        });

        it('should handle missing snapshotId', async () => {
            // Вызываем команду accept без ID
            await acceptCommand(historyManager, timelineProvider, undefined);

            // Проверяем, что показана ошибка
            assert.strictEqual(showErrorMessageCalls.length, 1);
            assert.ok(showErrorMessageCalls[0].includes('required'));
        });

        it('should handle empty array', async () => {
            // Вызываем команду accept с пустым массивом
            await acceptCommand(historyManager, timelineProvider, []);

            // Проверяем, что показана ошибка
            assert.strictEqual(showErrorMessageCalls.length, 1);
            assert.ok(showErrorMessageCalls[0].includes('required'));
        });
    });
});
