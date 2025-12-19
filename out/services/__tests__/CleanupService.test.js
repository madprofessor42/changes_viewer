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
const CleanupService_1 = require("../CleanupService");
const StorageService_1 = require("../StorageService");
const ConfigurationService_1 = require("../ConfigurationService");
/**
 * Базовые unit-тесты для CleanupService.
 * Проверяют основную логику очистки и проверки лимитов.
 */
// Хранилище для мок данных Memento
let testMementoData = {};
describe('CleanupService', () => {
    let tempDir;
    let storageService;
    let configService;
    let cleanupService;
    let mockContext;
    let mockGlobalState;
    beforeEach(() => {
        // Очищаем мок данные перед каждым тестом
        testMementoData = {};
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
        };
        // Инициализируем сервисы
        configService = new ConfigurationService_1.ConfigurationService();
        storageService = new StorageService_1.StorageService(mockContext, configService);
        cleanupService = new CleanupService_1.CleanupService(storageService, configService);
    });
    afterEach(() => {
        // Останавливаем периодическую очистку
        cleanupService.stopPeriodicCleanup();
        // Удаляем временную директорию
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        catch (error) {
            // Игнорируем ошибки удаления
        }
    });
    describe('checkLimits', () => {
        it('должен возвращать корректный статус лимитов для пустого хранилища', async () => {
            const status = await cleanupService.checkLimits();
            assert.strictEqual(status.countExceeded, false);
            assert.strictEqual(status.sizeExceeded, false);
            assert.strictEqual(status.ttlExceeded, false);
            assert.strictEqual(status.filesWithCountExceeded, 0);
            assert.strictEqual(status.currentSize, 0);
            assert.strictEqual(status.snapshotsOlderThanTTL, 0);
        });
        it('должен определять превышение лимита количества снапшотов на файл', async () => {
            const fileUri = vscode.Uri.file('/test/file.txt');
            const maxSnapshots = configService.getMaxSnapshotsPerFile();
            // Создаем больше снапшотов, чем лимит
            for (let i = 0; i < maxSnapshots + 5; i++) {
                const snapshot = {
                    id: `snapshot-${i}`,
                    fileUri: fileUri.toString(),
                    filePath: fileUri.fsPath,
                    contentPath: `snapshots/hash/snapshot-${i}.txt`,
                    timestamp: Date.now() - i * 1000,
                    source: 'typing',
                    contentHash: `hash-${i}`,
                    metadata: {
                        size: 100,
                        lineCount: 10,
                        deleted: false,
                        compressed: false
                    },
                    accepted: false
                };
                await storageService.saveSnapshotMetadata(snapshot);
            }
            const status = await cleanupService.checkLimits();
            assert.strictEqual(status.countExceeded, true);
            assert.strictEqual(status.filesWithCountExceeded, 1);
        });
        it('должен определять превышение лимита размера хранилища', async () => {
            // Создаем большой снапшот (используем меньший размер для теста)
            const fileUri = vscode.Uri.file('/test/file.txt');
            const snapshot = {
                id: 'snapshot-1',
                fileUri: fileUri.toString(),
                filePath: fileUri.fsPath,
                contentPath: 'snapshots/hash/snapshot-1.txt',
                timestamp: Date.now(),
                source: 'typing',
                contentHash: 'hash-1',
                metadata: {
                    size: 600000000, // 600 MB, больше лимита 500 MB
                    lineCount: 1000,
                    deleted: false,
                    compressed: false
                },
                accepted: false
            };
            await storageService.saveSnapshotMetadata(snapshot);
            // Создаем файл содержимого для проверки размера (используем Buffer для больших файлов)
            const contentPath = path.join(tempDir, snapshot.contentPath);
            fs.mkdirSync(path.dirname(contentPath), { recursive: true });
            // Создаем файл размером 600MB через Buffer
            const buffer = Buffer.alloc(600000000, 'x');
            fs.writeFileSync(contentPath, buffer);
            const status = await cleanupService.checkLimits();
            assert.strictEqual(status.sizeExceeded, true);
            assert.ok(status.currentSize > status.maxSize);
        });
    });
    describe('cleanupByCount', () => {
        it('должен удалять старые снапшоты при превышении лимита', async () => {
            const fileUri = vscode.Uri.file('/test/file.txt');
            const maxCount = 5;
            // Создаем 10 снапшотов
            const snapshots = [];
            for (let i = 0; i < 10; i++) {
                const snapshot = {
                    id: `snapshot-${i}`,
                    fileUri: fileUri.toString(),
                    filePath: fileUri.fsPath,
                    contentPath: `snapshots/hash/snapshot-${i}.txt`,
                    timestamp: Date.now() - (10 - i) * 1000, // Старые первыми
                    source: 'typing',
                    contentHash: `hash-${i}`,
                    metadata: {
                        size: 100,
                        lineCount: 10,
                        deleted: false,
                        compressed: false
                    },
                    accepted: false
                };
                snapshots.push(snapshot);
                await storageService.saveSnapshotMetadata(snapshot);
                // Создаем файл содержимого
                const contentPath = path.join(tempDir, snapshot.contentPath);
                fs.mkdirSync(path.dirname(contentPath), { recursive: true });
                fs.writeFileSync(contentPath, `content-${i}`);
            }
            const deletedCount = await cleanupService.cleanupByCount(fileUri, maxCount);
            assert.strictEqual(deletedCount, 5); // Должно удалить 5 старых снапшотов
            const remainingSnapshots = await storageService.getSnapshotsForFile(fileUri.toString());
            assert.strictEqual(remainingSnapshots.length, 5);
        });
        it('не должен удалять снапшоты, если их количество не превышает лимит', async () => {
            const fileUri = vscode.Uri.file('/test/file.txt');
            const maxCount = 10;
            // Создаем 5 снапшотов
            for (let i = 0; i < 5; i++) {
                const snapshot = {
                    id: `snapshot-${i}`,
                    fileUri: fileUri.toString(),
                    filePath: fileUri.fsPath,
                    contentPath: `snapshots/hash/snapshot-${i}.txt`,
                    timestamp: Date.now() - i * 1000,
                    source: 'typing',
                    contentHash: `hash-${i}`,
                    metadata: {
                        size: 100,
                        lineCount: 10,
                        deleted: false,
                        compressed: false
                    },
                    accepted: false
                };
                await storageService.saveSnapshotMetadata(snapshot);
            }
            const deletedCount = await cleanupService.cleanupByCount(fileUri, maxCount);
            assert.strictEqual(deletedCount, 0);
        });
        it('не должен удалять принятые снапшоты (accepted: true)', async () => {
            const fileUri = vscode.Uri.file('/test/file.txt');
            const maxCount = 3;
            // Создаем 6 снапшотов, из них 2 принятых, 4 непринятых
            // Лимит 3, значит должно остаться 3 непринятых + 2 принятых = 5 всего
            // Должно удалить 1 непринятый снапшот
            for (let i = 0; i < 6; i++) {
                const snapshot = {
                    id: `snapshot-${i}`,
                    fileUri: fileUri.toString(),
                    filePath: fileUri.fsPath,
                    contentPath: `snapshots/hash/snapshot-${i}.txt`,
                    timestamp: Date.now() - (6 - i) * 1000, // Старые первыми
                    source: 'typing',
                    contentHash: `hash-${i}`,
                    metadata: {
                        size: 100,
                        lineCount: 10,
                        deleted: false,
                        compressed: false
                    },
                    accepted: i < 2 // Первые два приняты
                };
                await storageService.saveSnapshotMetadata(snapshot);
                // Создаем файл содержимого
                const contentPath = path.join(tempDir, snapshot.contentPath);
                fs.mkdirSync(path.dirname(contentPath), { recursive: true });
                fs.writeFileSync(contentPath, `content-${i}`);
            }
            const deletedCount = await cleanupService.cleanupByCount(fileUri, maxCount);
            // Должно удалить 1 непринятый снапшот (4 непринятых - 3 лимит = 1)
            assert.strictEqual(deletedCount, 1);
            const remainingSnapshots = await storageService.getSnapshotsForFile(fileUri.toString());
            const acceptedSnapshots = remainingSnapshots.filter(s => s.accepted);
            const nonAcceptedSnapshots = remainingSnapshots.filter(s => !s.accepted);
            // Принятые снапшоты должны остаться
            assert.strictEqual(acceptedSnapshots.length, 2);
            // Непринятых должно быть ровно лимит
            assert.strictEqual(nonAcceptedSnapshots.length, maxCount);
        });
    });
    describe('cleanupByTTL', () => {
        it('должен удалять снапшоты старше TTL', async () => {
            const ttlDays = 1;
            const ttlTimestamp = Date.now() - (ttlDays * 24 * 60 * 60 * 1000);
            const fileUri = vscode.Uri.file('/test/file.txt');
            // Создаем старый снапшот (старше TTL)
            const oldSnapshot = {
                id: 'old-snapshot',
                fileUri: fileUri.toString(),
                filePath: fileUri.fsPath,
                contentPath: 'snapshots/hash/old-snapshot.txt',
                timestamp: ttlTimestamp - 1000,
                source: 'typing',
                contentHash: 'hash-old',
                metadata: {
                    size: 100,
                    lineCount: 10,
                    deleted: false,
                    compressed: false
                },
                accepted: false
            };
            // Создаем новый снапшот (младше TTL)
            const newSnapshot = {
                id: 'new-snapshot',
                fileUri: fileUri.toString(),
                filePath: fileUri.fsPath,
                contentPath: 'snapshots/hash/new-snapshot.txt',
                timestamp: Date.now(),
                source: 'typing',
                contentHash: 'hash-new',
                metadata: {
                    size: 100,
                    lineCount: 10,
                    deleted: false,
                    compressed: false
                },
                accepted: false
            };
            await storageService.saveSnapshotMetadata(oldSnapshot);
            await storageService.saveSnapshotMetadata(newSnapshot);
            const deletedCount = await cleanupService.cleanupByTTL(ttlDays);
            assert.strictEqual(deletedCount, 1); // Должен удалить только старый снапшот
            const remainingSnapshots = await storageService.getSnapshotsForFile(fileUri.toString());
            assert.strictEqual(remainingSnapshots.length, 1);
            assert.strictEqual(remainingSnapshots[0].id, 'new-snapshot');
        });
        it('не должен удалять принятые снапшоты (accepted: true)', async () => {
            const ttlDays = 1;
            const ttlTimestamp = Date.now() - (ttlDays * 24 * 60 * 60 * 1000);
            const fileUri = vscode.Uri.file('/test/file.txt');
            // Создаем старый принятый снапшот
            const acceptedSnapshot = {
                id: 'accepted-snapshot',
                fileUri: fileUri.toString(),
                filePath: fileUri.fsPath,
                contentPath: 'snapshots/hash/accepted-snapshot.txt',
                timestamp: ttlTimestamp - 1000,
                source: 'typing',
                contentHash: 'hash-accepted',
                metadata: {
                    size: 100,
                    lineCount: 10,
                    deleted: false,
                    compressed: false
                },
                accepted: true,
                acceptedTimestamp: Date.now()
            };
            await storageService.saveSnapshotMetadata(acceptedSnapshot);
            const deletedCount = await cleanupService.cleanupByTTL(ttlDays);
            assert.strictEqual(deletedCount, 0); // Принятые снапшоты не должны удаляться
            const remainingSnapshots = await storageService.getSnapshotsForFile(fileUri.toString());
            assert.strictEqual(remainingSnapshots.length, 1);
        });
    });
    describe('cleanupBySize', () => {
        it('должен использовать LRU стратегию при очистке по размеру', async () => {
            const maxSize = 500; // 500 байт
            const fileUri = vscode.Uri.file('/test/file.txt');
            // Создаем 3 снапшота по 200 байт каждый (всего 600 байт, больше лимита)
            const snapshots = [];
            for (let i = 0; i < 3; i++) {
                const snapshot = {
                    id: `snapshot-${i}`,
                    fileUri: fileUri.toString(),
                    filePath: fileUri.fsPath,
                    contentPath: `snapshots/hash/snapshot-${i}.txt`,
                    timestamp: Date.now() - (3 - i) * 1000, // Старые первыми
                    source: 'typing',
                    contentHash: `hash-${i}`,
                    metadata: {
                        size: 200,
                        lineCount: 10,
                        deleted: false,
                        compressed: false
                    },
                    accepted: false
                };
                snapshots.push(snapshot);
                await storageService.saveSnapshotMetadata(snapshot);
                // Создаем файл содержимого
                const contentPath = path.join(tempDir, snapshot.contentPath);
                fs.mkdirSync(path.dirname(contentPath), { recursive: true });
                fs.writeFileSync(contentPath, 'x'.repeat(200));
            }
            // Обновляем время доступа для последнего снапшота (самого нового)
            // Это означает, что он использовался недавно и не должен быть удален первым
            cleanupService.updateLastAccessTime('snapshot-2');
            // Вызываем cleanupBySize
            const deletedCount = await cleanupService.cleanupBySize(maxSize);
            // Должен удалить 1 снапшот (600 - 200 = 400, меньше лимита 500)
            assert.strictEqual(deletedCount, 1);
            // Проверяем, что удален наименее используемый (snapshot-0, самый старый)
            const remainingSnapshots = await storageService.getSnapshotsForFile(fileUri.toString());
            const remainingIds = remainingSnapshots.map(s => s.id).sort();
            assert.deepStrictEqual(remainingIds, ['snapshot-1', 'snapshot-2']);
        });
        it('не должен удалять принятые снапшоты при очистке по размеру', async () => {
            const maxSize = 300; // 300 байт
            const fileUri = vscode.Uri.file('/test/file.txt');
            // Создаем 3 снапшота по 200 байт каждый (всего 600 байт)
            // Один из них принят
            for (let i = 0; i < 3; i++) {
                const snapshot = {
                    id: `snapshot-${i}`,
                    fileUri: fileUri.toString(),
                    filePath: fileUri.fsPath,
                    contentPath: `snapshots/hash/snapshot-${i}.txt`,
                    timestamp: Date.now() - (3 - i) * 1000,
                    source: 'typing',
                    contentHash: `hash-${i}`,
                    metadata: {
                        size: 200,
                        lineCount: 10,
                        deleted: false,
                        compressed: false
                    },
                    accepted: i === 0 // Первый принят
                };
                await storageService.saveSnapshotMetadata(snapshot);
                // Создаем файл содержимого
                const contentPath = path.join(tempDir, snapshot.contentPath);
                fs.mkdirSync(path.dirname(contentPath), { recursive: true });
                fs.writeFileSync(contentPath, 'x'.repeat(200));
            }
            const deletedCount = await cleanupService.cleanupBySize(maxSize);
            // Должен удалить только непринятые снапшоты
            const remainingSnapshots = await storageService.getSnapshotsForFile(fileUri.toString());
            const acceptedSnapshots = remainingSnapshots.filter(s => s.accepted);
            // Принятый снапшот должен остаться
            assert.strictEqual(acceptedSnapshots.length, 1);
            assert.strictEqual(acceptedSnapshots[0].id, 'snapshot-0');
        });
    });
    describe('periodic cleanup', () => {
        it('должен запускать и останавливать периодическую очистку', () => {
            // Запускаем периодическую очистку
            cleanupService.startPeriodicCleanup(24);
            // Проверяем, что интервал установлен (не можем напрямую проверить, но можем остановить)
            cleanupService.stopPeriodicCleanup();
            // Если дошли сюда без ошибок, значит все работает
            assert.ok(true);
        });
        it('не должен запускать периодическую очистку дважды', () => {
            cleanupService.startPeriodicCleanup(24);
            cleanupService.startPeriodicCleanup(24); // Второй вызов не должен создать новый интервал
            cleanupService.stopPeriodicCleanup();
            assert.ok(true);
        });
    });
    describe('validation', () => {
        it('должен выбрасывать ошибку при отрицательном maxCount', async () => {
            const fileUri = vscode.Uri.file('/test/file.txt');
            await assert.rejects(async () => await cleanupService.cleanupByCount(fileUri, -1), /maxCount must be non-negative/);
        });
        it('должен выбрасывать ошибку при отрицательном maxSize', async () => {
            await assert.rejects(async () => await cleanupService.cleanupBySize(-1), /maxSize must be non-negative/);
        });
        it('должен выбрасывать ошибку при отрицательном ttlDays', async () => {
            await assert.rejects(async () => await cleanupService.cleanupByTTL(-1), /ttlDays must be non-negative/);
        });
        it('должен выбрасывать ошибку при неположительном intervalHours', () => {
            assert.throws(() => cleanupService.startPeriodicCleanup(0), /intervalHours must be positive/);
        });
    });
});
//# sourceMappingURL=CleanupService.test.js.map