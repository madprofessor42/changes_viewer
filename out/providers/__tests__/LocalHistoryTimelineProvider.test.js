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
const vscode = __importStar(require("vscode"));
const LocalHistoryTimelineProvider_1 = require("../LocalHistoryTimelineProvider");
/**
 * Unit-тесты для LocalHistoryTimelineProvider.
 * Проверяют основную функциональность: provideTimeline, formatSnapshotToTimelineItem, notifyTimelineChange,
 * пагинацию и обработку опций Timeline API.
 */
describe('LocalHistoryTimelineProvider', () => {
    let provider;
    let mockHistoryManager;
    let mockSnapshots;
    let fileUri;
    beforeEach(() => {
        fileUri = vscode.Uri.file('/test/file.ts');
        // Создаем тестовые снапшоты
        const baseTime = Date.now();
        mockSnapshots = [
            {
                id: 'snapshot-1',
                fileUri: fileUri.toString(),
                filePath: fileUri.fsPath,
                contentPath: 'snapshots/abc123/snapshot-1.txt',
                timestamp: baseTime - 10000, // 10 секунд назад
                source: 'typing',
                contentHash: 'hash1',
                metadata: {
                    lineCount: 10,
                    size: 100,
                    encoding: 'utf-8',
                    deleted: false,
                    compressed: false
                },
                diffInfo: {
                    addedLines: 2,
                    removedLines: 1,
                    modifiedLines: 0,
                    previousSnapshotId: undefined
                },
                accepted: false
            },
            {
                id: 'snapshot-2',
                fileUri: fileUri.toString(),
                filePath: fileUri.fsPath,
                contentPath: 'snapshots/abc123/snapshot-2.txt',
                timestamp: baseTime - 5000, // 5 секунд назад
                source: 'save',
                contentHash: 'hash2',
                metadata: {
                    lineCount: 12,
                    size: 120,
                    encoding: 'utf-8',
                    deleted: false,
                    compressed: false
                },
                diffInfo: {
                    addedLines: 3,
                    removedLines: 0,
                    modifiedLines: 1,
                    previousSnapshotId: 'snapshot-1'
                },
                accepted: false
            },
            {
                id: 'snapshot-3',
                fileUri: fileUri.toString(),
                filePath: fileUri.fsPath,
                contentPath: 'snapshots/abc123/snapshot-3.txt',
                timestamp: baseTime, // сейчас
                source: 'manual',
                contentHash: 'hash3',
                metadata: {
                    lineCount: 15,
                    size: 150,
                    encoding: 'utf-8',
                    deleted: false,
                    compressed: false
                },
                diffInfo: undefined,
                accepted: false
            }
        ];
        // Создаем мок LocalHistoryManager
        mockHistoryManager = {
            getSnapshotsForFile: async (uri, filters) => {
                let filtered = [...mockSnapshots];
                // Применяем фильтры
                if (filters) {
                    if (filters.accepted !== undefined) {
                        filtered = filtered.filter(s => s.accepted === filters.accepted);
                    }
                    if (filters.to !== undefined) {
                        filtered = filtered.filter(s => s.timestamp < filters.to);
                    }
                    if (filters.cursorId !== undefined) {
                        const cursorIndex = filtered.findIndex(s => s.id === filters.cursorId);
                        if (cursorIndex >= 0) {
                            filtered = filtered.slice(cursorIndex + 1);
                        }
                    }
                }
                // Сортируем по timestamp (новые первыми)
                filtered = filtered.sort((a, b) => b.timestamp - a.timestamp);
                // Применяем limit после сортировки (как в реальном коде)
                if (filters && filters.limit !== undefined && filters.limit > 0) {
                    filtered = filtered.slice(0, filters.limit);
                }
                return filtered;
            }
        };
        provider = new LocalHistoryTimelineProvider_1.LocalHistoryTimelineProvider(mockHistoryManager);
    });
    describe('provideTimeline', () => {
        it('should return timeline items for file', async () => {
            const cancellationToken = new vscode.CancellationTokenSource().token;
            const result = await provider.provideTimeline(fileUri, {}, cancellationToken);
            assert.ok(Array.isArray(result));
            assert.strictEqual(result.length, 3);
            // Проверяем структуру первого элемента
            const firstItem = result[0];
            assert.ok(firstItem.id);
            assert.ok(firstItem.label);
            assert.ok(typeof firstItem.timestamp === 'number');
            assert.ok(firstItem.iconPath);
            assert.ok(firstItem.description);
        });
        it('should filter accepted snapshots', async () => {
            // Делаем один снапшот принятым
            mockSnapshots[1].accepted = true;
            const cancellationToken = new vscode.CancellationTokenSource().token;
            const result = await provider.provideTimeline(fileUri, {}, cancellationToken);
            assert.ok(Array.isArray(result));
            // Должно быть 2 снапшота (один принят и скрыт)
            assert.strictEqual(result.length, 2);
        });
        it('should respect limit option', async () => {
            const cancellationToken = new vscode.CancellationTokenSource().token;
            const result = await provider.provideTimeline(fileUri, { limit: 2 }, cancellationToken);
            const items = Array.isArray(result) ? result : result.items;
            assert.strictEqual(items.length, 2);
        });
        it('should handle pagination with cursor', async () => {
            const cancellationToken = new vscode.CancellationTokenSource().token;
            // Первый запрос - получаем первые 2 элемента
            const firstResult = await provider.provideTimeline(fileUri, { limit: 2 }, cancellationToken);
            // Проверяем, что вернулся объект Timeline с paging.cursor
            assert.ok(!Array.isArray(firstResult));
            assert.ok('items' in firstResult);
            assert.ok('paging' in firstResult);
            assert.ok(firstResult.paging?.cursor);
            assert.strictEqual(firstResult.items.length, 2);
            // Второй запрос - используем cursor для получения следующей страницы
            const cursor = firstResult.paging.cursor;
            const secondResult = await provider.provideTimeline(fileUri, { cursor, limit: 2 }, cancellationToken);
            // Проверяем, что получили оставшиеся элементы
            assert.ok(Array.isArray(secondResult) || 'items' in secondResult);
            const items = Array.isArray(secondResult) ? secondResult : secondResult.items;
            assert.strictEqual(items.length, 1);
            // Проверяем, что это действительно следующий элемент
            assert.strictEqual(items[0].id, 'snapshot-1');
        });
        it('should handle limit as object with timestamp', async () => {
            const cancellationToken = new vscode.CancellationTokenSource().token;
            const timestamp = mockSnapshots[1].timestamp;
            // Запрашиваем снапшоты до определенного timestamp
            const result = await provider.provideTimeline(fileUri, { limit: { timestamp } }, cancellationToken);
            assert.ok(Array.isArray(result) || 'items' in result);
            const items = Array.isArray(result) ? result : result.items;
            // Должны получить только снапшоты до указанного timestamp
            assert.ok(items.length > 0);
            items.forEach(item => {
                assert.ok(item.timestamp < timestamp);
            });
        });
        it('should handle cancellation token', async () => {
            const cancellationSource = new vscode.CancellationTokenSource();
            const cancellationToken = cancellationSource.token;
            // Отменяем запрос сразу
            cancellationSource.cancel();
            const result = await provider.provideTimeline(fileUri, {}, cancellationToken);
            assert.ok(Array.isArray(result));
            assert.strictEqual(result.length, 0);
        });
        it('should return empty array on error', async () => {
            // Создаем мок, который выбрасывает ошибку
            const errorHistoryManager = {
                getSnapshotsForFile: async () => {
                    throw new Error('Test error');
                }
            };
            const errorProvider = new LocalHistoryTimelineProvider_1.LocalHistoryTimelineProvider(errorHistoryManager);
            const cancellationToken = new vscode.CancellationTokenSource().token;
            const result = await errorProvider.provideTimeline(fileUri, {}, cancellationToken);
            assert.ok(Array.isArray(result));
            assert.strictEqual(result.length, 0);
        });
        it('should sort snapshots by timestamp (newest first)', async () => {
            const cancellationToken = new vscode.CancellationTokenSource().token;
            const result = await provider.provideTimeline(fileUri, {}, cancellationToken);
            assert.ok(Array.isArray(result));
            assert.strictEqual(result.length, 3);
            // Проверяем, что снапшоты отсортированы по timestamp (новые первыми)
            for (let i = 0; i < result.length - 1; i++) {
                assert.ok(result[i].timestamp >= result[i + 1].timestamp);
            }
        });
    });
    describe('formatSnapshotToTimelineItem', () => {
        it('should format snapshot correctly', () => {
            const snapshot = mockSnapshots[0];
            // Используем рефлексию для доступа к приватному методу через тестирование provideTimeline
            const cancellationToken = new vscode.CancellationTokenSource().token;
            // Создаем провайдер с одним снапшотом
            const singleSnapshotManager = {
                getSnapshotsForFile: async () => {
                    return [snapshot];
                }
            };
            const singleProvider = new LocalHistoryTimelineProvider_1.LocalHistoryTimelineProvider(singleSnapshotManager);
            // Получаем timeline item через provideTimeline
            singleProvider.provideTimeline(fileUri, {}, cancellationToken).then(result => {
                const items = Array.isArray(result) ? result : result.items;
                assert.strictEqual(items.length, 1);
                const item = items[0];
                assert.strictEqual(item.id, snapshot.id);
                assert.strictEqual(item.timestamp, snapshot.timestamp);
                assert.ok(item.label.includes('Typing'));
                assert.ok(item.description);
                assert.ok(item.iconPath);
            });
        });
        it('should set correct icon based on source', async () => {
            const cancellationToken = new vscode.CancellationTokenSource().token;
            const result = await provider.provideTimeline(fileUri, {}, cancellationToken);
            assert.ok(Array.isArray(result));
            // Проверяем иконки для разных источников
            const typingItem = result.find(item => item.id === 'snapshot-1');
            const saveItem = result.find(item => item.id === 'snapshot-2');
            const manualItem = result.find(item => item.id === 'snapshot-3');
            assert.ok(typingItem?.iconPath);
            assert.ok(saveItem?.iconPath);
            assert.ok(manualItem?.iconPath);
        });
        it('should format diff summary correctly', async () => {
            const cancellationToken = new vscode.CancellationTokenSource().token;
            const result = await provider.provideTimeline(fileUri, {}, cancellationToken);
            assert.ok(Array.isArray(result));
            // Проверяем description для снапшота с diffInfo
            const itemWithDiff = result.find(item => item.id === 'snapshot-2');
            assert.ok(itemWithDiff?.description);
            assert.ok(itemWithDiff.description.includes('Added'));
            assert.ok(itemWithDiff.description.includes('Modified'));
        });
        it('should format snapshot without diffInfo', async () => {
            const cancellationToken = new vscode.CancellationTokenSource().token;
            const result = await provider.provideTimeline(fileUri, {}, cancellationToken);
            assert.ok(Array.isArray(result));
            // Проверяем description для снапшота без diffInfo
            const itemWithoutDiff = result.find(item => item.id === 'snapshot-3');
            assert.ok(itemWithoutDiff?.description);
            // Должно содержать информацию о размере и количестве строк
            assert.ok(itemWithoutDiff.description.includes('lines'));
        });
    });
    describe('notifyTimelineChange', () => {
        it('should emit onDidChange event for specific file', (done) => {
            const cancellationToken = new vscode.CancellationTokenSource().token;
            // Подписываемся на событие
            const disposable = provider.onDidChange?.((event) => {
                assert.ok(event.uri);
                assert.strictEqual(event.uri?.toString(), fileUri.toString());
                disposable?.dispose();
                done();
            });
            // Уведомляем об изменении
            provider.notifyTimelineChange(fileUri);
        });
        it('should emit onDidChange event for all files', (done) => {
            const cancellationToken = new vscode.CancellationTokenSource().token;
            // Подписываемся на событие
            const disposable = provider.onDidChange?.((event) => {
                assert.ok(event);
                // URI может быть undefined для обновления всех файлов
                disposable?.dispose();
                done();
            });
            // Уведомляем об изменении для всех файлов
            provider.notifyTimelineChange();
        });
    });
    describe('dispose', () => {
        it('should dispose event emitter', () => {
            // Проверяем, что dispose не выбрасывает ошибку
            assert.doesNotThrow(() => {
                provider.dispose();
            });
        });
    });
});
//# sourceMappingURL=LocalHistoryTimelineProvider.test.js.map