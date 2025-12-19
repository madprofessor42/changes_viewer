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
const index_1 = require("../index");
const constants_1 = require("../constants");
/**
 * Тесты для системы миграций (index.ts)
 */
// Хранилище для мок данных Memento
let testMementoData = {};
describe('Migrations (index.ts)', () => {
    let mockGlobalState;
    const storagePath = '/test/storage';
    beforeEach(() => {
        // Очищаем мок данные перед каждым тестом
        testMementoData = {};
        // Создаем мок Memento
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
    });
    afterEach(() => {
        // Очищаем мок данные
        testMementoData = {};
    });
    describe('isValidVersion', () => {
        it('should return true for valid versions', () => {
            assert.strictEqual((0, index_1.isValidVersion)('1.0'), true);
            assert.strictEqual((0, index_1.isValidVersion)('1.1'), true);
            assert.strictEqual((0, index_1.isValidVersion)('2.0'), true);
            assert.strictEqual((0, index_1.isValidVersion)('1.0.0'), true);
            assert.strictEqual((0, index_1.isValidVersion)('10.20'), true);
        });
        it('should return false for invalid versions', () => {
            assert.strictEqual((0, index_1.isValidVersion)(null), false);
            assert.strictEqual((0, index_1.isValidVersion)(undefined), false);
            assert.strictEqual((0, index_1.isValidVersion)(''), false);
            assert.strictEqual((0, index_1.isValidVersion)('invalid'), false);
            assert.strictEqual((0, index_1.isValidVersion)('1'), false);
            assert.strictEqual((0, index_1.isValidVersion)('1.'), false);
            assert.strictEqual((0, index_1.isValidVersion)('.1'), false);
            assert.strictEqual((0, index_1.isValidVersion)('a.b'), false);
        });
    });
    describe('compareVersions', () => {
        it('should compare versions correctly', () => {
            assert.strictEqual((0, index_1.compareVersions)('1.0', '1.1'), -1);
            assert.strictEqual((0, index_1.compareVersions)('1.1', '1.0'), 1);
            assert.strictEqual((0, index_1.compareVersions)('1.0', '1.0'), 0);
            assert.strictEqual((0, index_1.compareVersions)('1.0', '2.0'), -1);
            assert.strictEqual((0, index_1.compareVersions)('2.0', '1.0'), 1);
            assert.strictEqual((0, index_1.compareVersions)('1.0.0', '1.0.1'), -1);
        });
        it('should throw error for invalid versions', () => {
            assert.throws(() => (0, index_1.compareVersions)(null, '1.0'), /Invalid version format/);
            assert.throws(() => (0, index_1.compareVersions)(undefined, '1.0'), /Invalid version format/);
            assert.throws(() => (0, index_1.compareVersions)('1.0', null), /Invalid version format/);
            assert.throws(() => (0, index_1.compareVersions)('invalid', '1.0'), /Invalid version format/);
            assert.throws(() => (0, index_1.compareVersions)('1.0', 'invalid'), /Invalid version format/);
        });
    });
    describe('getCurrentVersion', () => {
        it('should return version when data exists', () => {
            const index = {
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
            testMementoData[constants_1.MEMENTO_KEY] = index;
            const version = (0, index_1.getCurrentVersion)(mockGlobalState, constants_1.MEMENTO_KEY);
            assert.strictEqual(version, '1.0');
        });
        it('should return null when data does not exist', () => {
            const version = (0, index_1.getCurrentVersion)(mockGlobalState, constants_1.MEMENTO_KEY);
            assert.strictEqual(version, null);
        });
        it('should return null when version is missing', () => {
            const index = {
                metadata: {},
                snapshots: [],
                index: {}
            };
            testMementoData[constants_1.MEMENTO_KEY] = index;
            const version = (0, index_1.getCurrentVersion)(mockGlobalState, constants_1.MEMENTO_KEY);
            assert.strictEqual(version, null);
        });
    });
    describe('migrateToVersion', () => {
        it('should migrate from no data to version 1.0', async () => {
            // Данных нет
            assert.strictEqual(testMementoData[constants_1.MEMENTO_KEY], undefined);
            // Выполняем миграцию к версии 1.0
            await (0, index_1.migrateToVersion)(mockGlobalState, storagePath, '0.0', '1.0');
            // Проверяем, что данные созданы
            const result = testMementoData[constants_1.MEMENTO_KEY];
            assert.ok(result);
            assert.strictEqual(result.version, '1.0');
            assert.ok(result.metadata);
            assert.strictEqual(result.metadata.version, '1.0');
        });
        it('should be idempotent (migrate 1.0 to 1.0)', async () => {
            // Создаем данные версии 1.0
            const index = {
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
            testMementoData[constants_1.MEMENTO_KEY] = index;
            // Выполняем миграцию от 1.0 к 1.0
            await (0, index_1.migrateToVersion)(mockGlobalState, storagePath, '1.0', '1.0');
            // Проверяем, что данные не изменились
            const result = testMementoData[constants_1.MEMENTO_KEY];
            assert.ok(result);
            assert.strictEqual(result.version, '1.0');
            assert.strictEqual(result.metadata.created, 1000);
            assert.strictEqual(result.metadata.totalSnapshots, 5);
        });
        it('should throw error when migrating to older version', async () => {
            const index = {
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
            testMementoData[constants_1.MEMENTO_KEY] = index;
            // Попытка миграции от 1.1 к 1.0 должна выбросить ошибку
            await assert.rejects(async () => await (0, index_1.migrateToVersion)(mockGlobalState, storagePath, '1.1', '1.0'), /Cannot migrate from version 1.1 to 1.0/);
        });
        it('should throw error for invalid current version', async () => {
            await assert.rejects(async () => await (0, index_1.migrateToVersion)(mockGlobalState, storagePath, null, '1.0'), /Invalid version format/);
        });
        it('should throw error for invalid target version', async () => {
            await assert.rejects(async () => await (0, index_1.migrateToVersion)(mockGlobalState, storagePath, '1.0', null), /Invalid version format/);
        });
        it('should handle migration when no migration path exists', async () => {
            // Попытка миграции от версии, которая больше целевой, но не зарегистрирована
            // В этом случае должна быть ошибка, так как нет миграций после текущей версии
            // Но если текущая версия уже больше целевой, то просто возвращаемся
            // Поэтому тестируем случай, когда версия меньше целевой, но нет миграций
            // Для этого нужно использовать версию, которая меньше 1.0, но не 0.0
            // Но так как есть миграция 1.0, то от 0.9 к 1.0 должна быть миграция
            // Поэтому тестируем случай, когда целевая версия больше, чем зарегистрированные миграции
            await assert.rejects(async () => await (0, index_1.migrateToVersion)(mockGlobalState, storagePath, '1.0', '2.0'), /No migration path found/);
        });
    });
});
//# sourceMappingURL=index.test.js.map