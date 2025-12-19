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
import { Snapshot, SnapshotSource } from '../../types/snapshot';

/**
 * Базовые unit-тесты для LocalHistoryManager.
 * Проверяют основную функциональность: создание, чтение, обновление, удаление снапшотов,
 * дедупликацию и вычисление diff.
 */

// Хранилище для мок данных Memento
let testMementoData: Record<string, any> = {};

describe('LocalHistoryManager', () => {
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
            const source: SnapshotSource = 'typing';

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
            const source: SnapshotSource = 'typing';

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
            const source: SnapshotSource = 'typing';

            // Создаем первый снапшот
            const snapshot1 = await historyManager.createSnapshot(fileUri, content1, source);
            
            // Создаем второй снапшот с изменениями
            const snapshot2 = await historyManager.createSnapshot(fileUri, content2, source);

            // Проверяем, что diff вычислен
            assert.ok(snapshot2.diffInfo);
            assert.strictEqual(snapshot2.diffInfo!.previousSnapshotId, snapshot1.id);
            assert.ok(snapshot2.diffInfo!.addedLines > 0);
        });

        it('should save snapshot content to filesystem', async () => {
            const fileUri = vscode.Uri.file('/test/file.ts');
            const content = 'Test content';
            const source: SnapshotSource = 'typing';

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
            const source: SnapshotSource = 'typing';

            const created = await historyManager.createSnapshot(fileUri, content, source);
            const retrieved = await historyManager.getSnapshot(created.id);

            assert.ok(retrieved);
            assert.strictEqual(retrieved!.id, created.id);
            assert.strictEqual(retrieved!.fileUri, created.fileUri);
        });

        it('should return null for non-existent snapshot', async () => {
            const retrieved = await historyManager.getSnapshot('non-existent-id');
            assert.strictEqual(retrieved, null);
        });
    });

    describe('getSnapshotsForFile', () => {
        it('should return all snapshots for a file', async () => {
            const fileUri = vscode.Uri.file('/test/file.ts');
            const source: SnapshotSource = 'typing';

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
            const source: SnapshotSource = 'typing';

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
            const source: SnapshotSource = 'typing';

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
            const source: SnapshotSource = 'typing';

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
            } catch (error) {
                assert.ok(error instanceof Error);
                assert.ok(error.message.includes('not found'));
            }
        });
    });

    describe('deleteSnapshot', () => {
        it('should delete snapshot and its content', async () => {
            const fileUri = vscode.Uri.file('/test/file.ts');
            const source: SnapshotSource = 'typing';

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
            } catch (error) {
                assert.ok(error instanceof Error);
                assert.ok(error.message.includes('not found'));
            }
        });
    });

    describe('deleteSnapshots', () => {
        it('should delete multiple snapshots', async () => {
            const fileUri = vscode.Uri.file('/test/file.ts');
            const source: SnapshotSource = 'typing';

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
