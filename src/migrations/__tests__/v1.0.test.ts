// Мокируем vscode перед импортом
import '../../__mocks__/setup';

import * as assert from 'assert';
import * as vscode from 'vscode';
import { migrateToV1_0 } from '../v1.0';
import { StorageIndex } from '../../services/StorageService';
import { MEMENTO_KEY } from '../constants';

/**
 * Тесты для миграции v1.0
 */

// Хранилище для мок данных Memento
let testMementoData: Record<string, any> = {};

describe('Migration v1.0', () => {
    let mockGlobalState: vscode.Memento;
    const storagePath = '/test/storage';

    beforeEach(() => {
        // Очищаем мок данные перед каждым тестом
        testMementoData = {};
        
        // Создаем мок Memento
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
    });

    afterEach(() => {
        // Очищаем мок данные
        testMementoData = {};
    });

    describe('migrateToV1_0', () => {
        it('should create structure when no data exists', async () => {
            // Данных нет
            assert.strictEqual(testMementoData[MEMENTO_KEY], undefined);

            // Выполняем миграцию
            await migrateToV1_0(mockGlobalState, storagePath);

            // Проверяем, что структура создана
            const result = testMementoData[MEMENTO_KEY] as StorageIndex | undefined;
            assert.ok(result);
            assert.strictEqual(result!.version, '1.0');
            assert.ok(result!.metadata);
            assert.strictEqual(result!.metadata.version, '1.0');
            assert.strictEqual(result!.metadata.totalSnapshots, 0);
            assert.strictEqual(result!.metadata.totalSize, 0);
            assert.ok(Array.isArray(result!.snapshots));
            assert.ok(typeof result!.index === 'object');
            assert.ok(result!.metadata.created > 0);
        });

        it('should be idempotent (can run multiple times)', async () => {
            // Создаем данные версии 1.0
            const createdTime = 1000;
            const index: StorageIndex = {
                version: '1.0',
                metadata: {
                    version: '1.0',
                    created: createdTime,
                    lastCleanup: 0,
                    totalSnapshots: 5,
                    totalSize: 1000
                },
                snapshots: [],
                index: {}
            };
            testMementoData[MEMENTO_KEY] = index;

            // Выполняем миграцию еще раз
            await migrateToV1_0(mockGlobalState, storagePath);

            // Проверяем, что данные не изменились (идемпотентность)
            const result = testMementoData[MEMENTO_KEY] as StorageIndex | undefined;
            assert.ok(result);
            assert.strictEqual(result!.version, '1.0');
            assert.strictEqual(result!.metadata.version, '1.0');
            assert.strictEqual(result!.metadata.created, createdTime);
            assert.strictEqual(result!.metadata.totalSnapshots, 5);
            assert.strictEqual(result!.metadata.totalSize, 1000);
        });

        it('should update version when version is different', async () => {
            // Создаем данные с невалидной версией
            const index: any = {
                version: '0.9',
                metadata: {
                    version: '0.9',
                    created: 1000,
                    lastCleanup: 0
                },
                snapshots: [{ id: 'test-1' }],
                index: { 'file:///test': ['test-1'] }
            };
            testMementoData[MEMENTO_KEY] = index;

            // Выполняем миграцию
            await migrateToV1_0(mockGlobalState, storagePath);

            // Проверяем, что версия обновлена, но данные сохранены
            const result = testMementoData[MEMENTO_KEY] as StorageIndex | undefined;
            assert.ok(result);
            assert.strictEqual(result!.version, '1.0');
            assert.strictEqual(result!.metadata.version, '1.0');
            assert.strictEqual(result!.metadata.created, 1000);
            assert.strictEqual(result!.snapshots.length, 1);
            assert.strictEqual(result!.snapshots[0].id, 'test-1');
        });

        it('should fix missing metadata', async () => {
            // Создаем данные без metadata
            const index: any = {
                version: '1.0',
                snapshots: [],
                index: {}
            };
            testMementoData[MEMENTO_KEY] = index;

            // Выполняем миграцию
            await migrateToV1_0(mockGlobalState, storagePath);

            // Проверяем, что metadata создана
            const result = testMementoData[MEMENTO_KEY] as StorageIndex | undefined;
            assert.ok(result);
            assert.ok(result!.metadata);
            assert.strictEqual(result!.metadata.version, '1.0');
            assert.strictEqual(result!.metadata.totalSnapshots, 0);
            assert.strictEqual(result!.metadata.totalSize, 0);
        });

        it('should preserve existing snapshots and index', async () => {
            // Создаем данные с существующими снапшотами
            const snapshot1 = {
                id: 'snapshot-1',
                fileUri: 'file:///test/file1.ts',
                filePath: '/test/file1.ts',
                timestamp: 1000,
                source: 'typing' as const,
                contentHash: 'hash1',
                contentPath: 'path1',
                metadata: { size: 100, lineCount: 10, deleted: false, compressed: false },
                accepted: false
            };
            const snapshot2 = {
                id: 'snapshot-2',
                fileUri: 'file:///test/file2.ts',
                filePath: '/test/file2.ts',
                timestamp: 2000,
                source: 'save' as const,
                contentHash: 'hash2',
                contentPath: 'path2',
                metadata: { size: 200, lineCount: 20, deleted: false, compressed: false },
                accepted: false
            };

            const index: StorageIndex = {
                version: '0.9',
                metadata: {
                    version: '0.9',
                    created: 500,
                    lastCleanup: 0,
                    totalSnapshots: 2,
                    totalSize: 300
                },
                snapshots: [snapshot1, snapshot2],
                index: {
                    'file:///test/file1.ts': ['snapshot-1'],
                    'file:///test/file2.ts': ['snapshot-2']
                }
            };
            testMementoData[MEMENTO_KEY] = index;

            // Выполняем миграцию
            await migrateToV1_0(mockGlobalState, storagePath);

            // Проверяем, что снапшоты и индекс сохранены
            const result = testMementoData[MEMENTO_KEY] as StorageIndex | undefined;
            assert.ok(result);
            assert.strictEqual(result!.version, '1.0');
            assert.strictEqual(result!.snapshots.length, 2);
            assert.strictEqual(result!.snapshots[0].id, 'snapshot-1');
            assert.strictEqual(result!.snapshots[1].id, 'snapshot-2');
            assert.ok(result!.index['file:///test/file1.ts']);
            assert.ok(result!.index['file:///test/file2.ts']);
            assert.strictEqual(result!.metadata.totalSnapshots, 2);
        });

        it('should calculate totalSnapshots from snapshots length if missing', async () => {
            // Создаем данные без totalSnapshots в metadata
            const index: any = {
                version: '1.0',
                metadata: {
                    version: '1.0',
                    created: 1000,
                    lastCleanup: 0
                },
                snapshots: [{ id: '1' }, { id: '2' }, { id: '3' }],
                index: {}
            };
            testMementoData[MEMENTO_KEY] = index;

            // Выполняем миграцию
            await migrateToV1_0(mockGlobalState, storagePath);

            // Проверяем, что totalSnapshots вычислен
            const result = testMementoData[MEMENTO_KEY] as StorageIndex | undefined;
            assert.ok(result);
            assert.strictEqual(result!.metadata.totalSnapshots, 3);
        });
    });
});
