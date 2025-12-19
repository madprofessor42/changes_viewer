// Мокируем vscode перед импортом
import '../../__mocks__/setup';

import * as assert from 'assert';
import * as vscode from 'vscode';
import { migrateToVersion, getCurrentVersion, compareVersions, isValidVersion } from '../index';
import { StorageIndex } from '../../services/StorageService';
import { MEMENTO_KEY } from '../constants';

/**
 * Тесты для системы миграций (index.ts)
 */

// Хранилище для мок данных Memento
let testMementoData: Record<string, any> = {};

describe('Migrations (index.ts)', () => {
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

    describe('isValidVersion', () => {
        it('should return true for valid versions', () => {
            assert.strictEqual(isValidVersion('1.0'), true);
            assert.strictEqual(isValidVersion('1.1'), true);
            assert.strictEqual(isValidVersion('2.0'), true);
            assert.strictEqual(isValidVersion('1.0.0'), true);
            assert.strictEqual(isValidVersion('10.20'), true);
        });

        it('should return false for invalid versions', () => {
            assert.strictEqual(isValidVersion(null), false);
            assert.strictEqual(isValidVersion(undefined), false);
            assert.strictEqual(isValidVersion(''), false);
            assert.strictEqual(isValidVersion('invalid'), false);
            assert.strictEqual(isValidVersion('1'), false);
            assert.strictEqual(isValidVersion('1.'), false);
            assert.strictEqual(isValidVersion('.1'), false);
            assert.strictEqual(isValidVersion('a.b'), false);
        });
    });

    describe('compareVersions', () => {
        it('should compare versions correctly', () => {
            assert.strictEqual(compareVersions('1.0', '1.1'), -1);
            assert.strictEqual(compareVersions('1.1', '1.0'), 1);
            assert.strictEqual(compareVersions('1.0', '1.0'), 0);
            assert.strictEqual(compareVersions('1.0', '2.0'), -1);
            assert.strictEqual(compareVersions('2.0', '1.0'), 1);
            assert.strictEqual(compareVersions('1.0.0', '1.0.1'), -1);
        });

        it('should throw error for invalid versions', () => {
            assert.throws(() => compareVersions(null as any, '1.0'), /Invalid version format/);
            assert.throws(() => compareVersions(undefined as any, '1.0'), /Invalid version format/);
            assert.throws(() => compareVersions('1.0', null as any), /Invalid version format/);
            assert.throws(() => compareVersions('invalid', '1.0'), /Invalid version format/);
            assert.throws(() => compareVersions('1.0', 'invalid'), /Invalid version format/);
        });
    });

    describe('getCurrentVersion', () => {
        it('should return version when data exists', () => {
            const index: StorageIndex = {
                version: '1.0',
                metadata: {
                    version: '1.0',
                    created: Date.now(),
                    lastCleanup: 0,
                    totalSnapshots: 0,
                    totalSize: 0
                },
                snapshots: [],
                index: {}
            };
            testMementoData[MEMENTO_KEY] = index;

            const version = getCurrentVersion(mockGlobalState, MEMENTO_KEY);
            assert.strictEqual(version, '1.0');
        });

        it('should return null when data does not exist', () => {
            const version = getCurrentVersion(mockGlobalState, MEMENTO_KEY);
            assert.strictEqual(version, null);
        });

        it('should return null when version is missing', () => {
            const index: any = {
                metadata: {},
                snapshots: [],
                index: {}
            };
            testMementoData[MEMENTO_KEY] = index;

            const version = getCurrentVersion(mockGlobalState, MEMENTO_KEY);
            assert.strictEqual(version, null);
        });
    });

    describe('migrateToVersion', () => {
        it('should migrate from no data to version 1.0', async () => {
            // Данных нет
            assert.strictEqual(testMementoData[MEMENTO_KEY], undefined);

            // Выполняем миграцию к версии 1.0
            await migrateToVersion(mockGlobalState, storagePath, '0.0', '1.0');

            // Проверяем, что данные созданы
            const result = testMementoData[MEMENTO_KEY] as StorageIndex | undefined;
            assert.ok(result);
            assert.strictEqual(result!.version, '1.0');
            assert.ok(result!.metadata);
            assert.strictEqual(result!.metadata.version, '1.0');
        });

        it('should be idempotent (migrate 1.0 to 1.0)', async () => {
            // Создаем данные версии 1.0
            const index: StorageIndex = {
                version: '1.0',
                metadata: {
                    version: '1.0',
                    created: 1000,
                    lastCleanup: 0,
                    totalSnapshots: 5,
                    totalSize: 1000
                },
                snapshots: [],
                index: {}
            };
            testMementoData[MEMENTO_KEY] = index;

            // Выполняем миграцию от 1.0 к 1.0
            await migrateToVersion(mockGlobalState, storagePath, '1.0', '1.0');

            // Проверяем, что данные не изменились
            const result = testMementoData[MEMENTO_KEY] as StorageIndex | undefined;
            assert.ok(result);
            assert.strictEqual(result!.version, '1.0');
            assert.strictEqual(result.metadata.created, 1000);
            assert.strictEqual(result!.metadata.totalSnapshots, 5);
        });

        it('should throw error when migrating to older version', async () => {
            const index: StorageIndex = {
                version: '1.1',
                metadata: {
                    version: '1.1',
                    created: Date.now(),
                    lastCleanup: 0,
                    totalSnapshots: 0,
                    totalSize: 0
                },
                snapshots: [],
                index: {}
            };
            testMementoData[MEMENTO_KEY] = index;

            // Попытка миграции от 1.1 к 1.0 должна выбросить ошибку
            await assert.rejects(
                async () => await migrateToVersion(mockGlobalState, storagePath, '1.1', '1.0'),
                /Cannot migrate from version 1.1 to 1.0/
            );
        });

        it('should throw error for invalid current version', async () => {
            await assert.rejects(
                async () => await migrateToVersion(mockGlobalState, storagePath, null as any, '1.0'),
                /Invalid version format/
            );
        });

        it('should throw error for invalid target version', async () => {
            await assert.rejects(
                async () => await migrateToVersion(mockGlobalState, storagePath, '1.0', null as any),
                /Invalid version format/
            );
        });

        it('should handle migration when no migration path exists', async () => {
            // Попытка миграции от версии, которая больше целевой, но не зарегистрирована
            // В этом случае должна быть ошибка, так как нет миграций после текущей версии
            // Но если текущая версия уже больше целевой, то просто возвращаемся
            // Поэтому тестируем случай, когда версия меньше целевой, но нет миграций
            // Для этого нужно использовать версию, которая меньше 1.0, но не 0.0
            // Но так как есть миграция 1.0, то от 0.9 к 1.0 должна быть миграция
            // Поэтому тестируем случай, когда целевая версия больше, чем зарегистрированные миграции
            await assert.rejects(
                async () => await migrateToVersion(mockGlobalState, storagePath, '1.0', '2.0'),
                /No migration path found/
            );
        });
    });
});
