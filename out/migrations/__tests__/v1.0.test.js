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
const v1_0_1 = require("../v1.0");
const constants_1 = require("../constants");
/**
 * Тесты для миграции v1.0
 */
// Хранилище для мок данных Memento
let testMementoData = {};
describe('Migration v1.0', () => {
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
    describe('migrateToV1_0', () => {
        it('should create structure when no data exists', async () => {
            // Данных нет
            assert.strictEqual(testMementoData[constants_1.MEMENTO_KEY], undefined);
            // Выполняем миграцию
            await (0, v1_0_1.migrateToV1_0)(mockGlobalState, storagePath);
            // Проверяем, что структура создана
            const result = testMementoData[constants_1.MEMENTO_KEY];
            assert.ok(result);
            assert.strictEqual(result.version, '1.0');
            assert.ok(result.metadata);
            assert.strictEqual(result.metadata.version, '1.0');
            assert.strictEqual(result.metadata.totalSnapshots, 0);
            assert.strictEqual(result.metadata.totalSize, 0);
            assert.ok(Array.isArray(result.snapshots));
            assert.ok(typeof result.index === 'object');
            assert.ok(result.metadata.created > 0);
        });
        it('should be idempotent (can run multiple times)', async () => {
            // Создаем данные версии 1.0
            const createdTime = 1000;
            const index = {
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
            testMementoData[constants_1.MEMENTO_KEY] = index;
            // Выполняем миграцию еще раз
            await (0, v1_0_1.migrateToV1_0)(mockGlobalState, storagePath);
            // Проверяем, что данные не изменились (идемпотентность)
            const result = testMementoData[constants_1.MEMENTO_KEY];
            assert.ok(result);
            assert.strictEqual(result.version, '1.0');
            assert.strictEqual(result.metadata.version, '1.0');
            assert.strictEqual(result.metadata.created, createdTime);
            assert.strictEqual(result.metadata.totalSnapshots, 5);
            assert.strictEqual(result.metadata.totalSize, 1000);
        });
        it('should update version when version is different', async () => {
            // Создаем данные с невалидной версией
            const index = {
                version: '0.9',
                metadata: {
                    version: '0.9',
                    created: 1000,
                    lastCleanup: 0
                },
                snapshots: [{ id: 'test-1' }],
                index: { 'file:///test': ['test-1'] }
            };
            testMementoData[constants_1.MEMENTO_KEY] = index;
            // Выполняем миграцию
            await (0, v1_0_1.migrateToV1_0)(mockGlobalState, storagePath);
            // Проверяем, что версия обновлена, но данные сохранены
            const result = testMementoData[constants_1.MEMENTO_KEY];
            assert.ok(result);
            assert.strictEqual(result.version, '1.0');
            assert.strictEqual(result.metadata.version, '1.0');
            assert.strictEqual(result.metadata.created, 1000);
            assert.strictEqual(result.snapshots.length, 1);
            assert.strictEqual(result.snapshots[0].id, 'test-1');
        });
        it('should fix missing metadata', async () => {
            // Создаем данные без metadata
            const index = {
                version: '1.0',
                snapshots: [],
                index: {}
            };
            testMementoData[constants_1.MEMENTO_KEY] = index;
            // Выполняем миграцию
            await (0, v1_0_1.migrateToV1_0)(mockGlobalState, storagePath);
            // Проверяем, что metadata создана
            const result = testMementoData[constants_1.MEMENTO_KEY];
            assert.ok(result);
            assert.ok(result.metadata);
            assert.strictEqual(result.metadata.version, '1.0');
            assert.strictEqual(result.metadata.totalSnapshots, 0);
            assert.strictEqual(result.metadata.totalSize, 0);
        });
        it('should preserve existing snapshots and index', async () => {
            // Создаем данные с существующими снапшотами
            const snapshot1 = {
                id: 'snapshot-1',
                fileUri: 'file:///test/file1.ts',
                filePath: '/test/file1.ts',
                timestamp: 1000,
                source: 'typing',
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
                source: 'save',
                contentHash: 'hash2',
                contentPath: 'path2',
                metadata: { size: 200, lineCount: 20, deleted: false, compressed: false },
                accepted: false
            };
            const index = {
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
            testMementoData[constants_1.MEMENTO_KEY] = index;
            // Выполняем миграцию
            await (0, v1_0_1.migrateToV1_0)(mockGlobalState, storagePath);
            // Проверяем, что снапшоты и индекс сохранены
            const result = testMementoData[constants_1.MEMENTO_KEY];
            assert.ok(result);
            assert.strictEqual(result.version, '1.0');
            assert.strictEqual(result.snapshots.length, 2);
            assert.strictEqual(result.snapshots[0].id, 'snapshot-1');
            assert.strictEqual(result.snapshots[1].id, 'snapshot-2');
            assert.ok(result.index['file:///test/file1.ts']);
            assert.ok(result.index['file:///test/file2.ts']);
            assert.strictEqual(result.metadata.totalSnapshots, 2);
        });
        it('should calculate totalSnapshots from snapshots length if missing', async () => {
            // Создаем данные без totalSnapshots в metadata
            const index = {
                version: '1.0',
                metadata: {
                    version: '1.0',
                    created: 1000,
                    lastCleanup: 0
                },
                snapshots: [{ id: '1' }, { id: '2' }, { id: '3' }],
                index: {}
            };
            testMementoData[constants_1.MEMENTO_KEY] = index;
            // Выполняем миграцию
            await (0, v1_0_1.migrateToV1_0)(mockGlobalState, storagePath);
            // Проверяем, что totalSnapshots вычислен
            const result = testMementoData[constants_1.MEMENTO_KEY];
            assert.ok(result);
            assert.strictEqual(result.metadata.totalSnapshots, 3);
        });
    });
});
//# sourceMappingURL=v1.0.test.js.map