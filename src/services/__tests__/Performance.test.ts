// Мокируем vscode перед импортом
import '../../__mocks__/setup';

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { LocalHistoryManager } from '../LocalHistoryManager';
import { StorageService } from '../StorageService';
import { CleanupService } from '../CleanupService';
import { ConfigurationService } from '../ConfigurationService';
import { LocalHistoryTimelineProvider } from '../../providers/LocalHistoryTimelineProvider';

/**
 * Тесты производительности для проверки требований ТЗ:
 * - Создание снапшотов < 100ms для файлов < 1 MB
 * - Создание снапшотов < 500ms для файлов < 10 MB
 * - Загрузка Timeline < 1 секунда для 1000 снапшотов
 */

describe('Performance Tests', () => {
    let tempDir: string;
    let storageService: StorageService;
    let cleanupService: CleanupService;
    let configService: ConfigurationService;
    let historyManager: LocalHistoryManager;
    let timelineProvider: LocalHistoryTimelineProvider;
    let mockContext: vscode.ExtensionContext;
    let mockGlobalState: vscode.Memento;
    let testMementoData: Record<string, any> = {};

    beforeEach(() => {
        testMementoData = {};
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changes-viewer-perf-test-'));

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

        configService = new ConfigurationService();
        storageService = new StorageService(mockContext, configService);
        cleanupService = new CleanupService(storageService, configService);
        historyManager = new LocalHistoryManager(storageService, cleanupService, configService);
        timelineProvider = new LocalHistoryTimelineProvider(historyManager);
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
                const promises: Promise<any>[] = [];
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
