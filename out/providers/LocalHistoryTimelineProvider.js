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
exports.LocalHistoryTimelineProvider = void 0;
const vscode = __importStar(require("vscode"));
const time_1 = require("../utils/time");
const logger_1 = require("../utils/logger");
/**
 * Создает cursor для пагинации Timeline API.
 * Cursor содержит timestamp и id последнего элемента для продолжения пагинации.
 *
 * @param timestamp Временная метка последнего элемента
 * @param id ID последнего элемента
 * @returns Строка cursor в формате "timestamp:id"
 */
function createCursor(timestamp, id) {
    return `${timestamp}:${id}`;
}
/**
 * Парсит cursor из строки.
 *
 * @param cursor Строка cursor в формате "timestamp:id"
 * @returns Объект с timestamp и id, или null если cursor невалиден
 */
function parseCursor(cursor) {
    const parts = cursor.split(':');
    if (parts.length !== 2) {
        return null;
    }
    const timestamp = parseInt(parts[0], 10);
    const id = parts[1];
    if (isNaN(timestamp) || !id) {
        return null;
    }
    return { timestamp, id };
}
/**
 * Провайдер для интеграции с VS Code Timeline API.
 * Отображает историю изменений файлов в стандартном Timeline view.
 */
class LocalHistoryTimelineProvider {
    constructor(historyManager) {
        this.onDidChangeEmitter = new vscode.EventEmitter();
        this.onDidChange = this.onDidChangeEmitter.event;
        // Кеш отсортированных снапшотов для часто запрашиваемых файлов
        this.sortedSnapshotsCache = new Map();
        this.cacheTTL = 5000; // 5 секунд
        this.historyManager = historyManager;
        this.logger = logger_1.Logger.getInstance();
    }
    /**
     * Предоставляет Timeline items для указанного файла.
     *
     * @param uri URI файла
     * @param options Опции Timeline (временной диапазон, количество, cursor для пагинации)
     * @param token Токен отмены
     * @returns Массив TimelineItem или объект Timeline с пагинацией для VS Code Timeline API
     */
    async provideTimeline(uri, options, token) {
        try {
            // Проверяем отмену запроса
            if (token.isCancellationRequested) {
                return [];
            }
            // Обрабатываем options.limit
            let limit = undefined;
            let fromTimestamp = undefined;
            let cursorTimestamp = undefined;
            let cursorId = undefined;
            if (typeof options.limit === 'number') {
                limit = options.limit;
            }
            else if (options.limit && typeof options.limit === 'object') {
                if (options.limit.timestamp) {
                    // Если передан timestamp, получаем все до этого момента
                    fromTimestamp = options.limit.timestamp;
                }
                // options.limit.id можно использовать для точной позиции, но пока не используем
            }
            // Если не указан limit, используем значение по умолчанию
            if (limit === undefined && fromTimestamp === undefined) {
                limit = 50;
            }
            // Обрабатываем options.cursor для пагинации
            if (options.cursor) {
                const parsedCursor = parseCursor(options.cursor);
                if (parsedCursor) {
                    // Используем cursor для получения следующей страницы
                    // Получаем снапшоты с timestamp меньше cursor.timestamp
                    cursorTimestamp = parsedCursor.timestamp;
                    cursorId = parsedCursor.id;
                    // Используем fromTimestamp для фильтрации (получаем снапшоты до cursor timestamp)
                    if (fromTimestamp === undefined || fromTimestamp > cursorTimestamp) {
                        fromTimestamp = cursorTimestamp;
                    }
                }
            }
            // Получаем снапшоты для файла с учетом фильтров
            // UC-04 А3: Обработка ошибок чтения из Local Storage
            let snapshots;
            try {
                // Проверяем кеш для оптимизации
                const cacheKey = uri.toString();
                const cached = this.sortedSnapshotsCache.get(cacheKey);
                const now = Date.now();
                if (cached && (now - cached.timestamp) < this.cacheTTL && !fromTimestamp && !cursorId) {
                    // Используем кешированные снапшоты, если они актуальны и нет фильтров по времени
                    snapshots = cached.snapshots;
                }
                else {
                    // Получаем снапшоты из хранилища
                    snapshots = await this.historyManager.getSnapshotsForFile(uri, {
                        accepted: false,
                        // Не применяем limit здесь, чтобы можно было использовать кеш
                        to: fromTimestamp, // Получаем снапшоты до указанного timestamp
                        cursorId: cursorId // Для точной позиции (опционально)
                    });
                    // Кешируем отсортированные снапшоты (только если нет фильтров по времени)
                    if (!fromTimestamp && !cursorId) {
                        const sorted = snapshots.sort((a, b) => b.timestamp - a.timestamp);
                        this.sortedSnapshotsCache.set(cacheKey, {
                            snapshots: sorted,
                            timestamp: now
                        });
                        snapshots = sorted;
                    }
                    else {
                        // Сортируем снапшоты по timestamp (новые сверху)
                        snapshots = snapshots.sort((a, b) => b.timestamp - a.timestamp);
                    }
                }
            }
            catch (error) {
                // Ошибка чтения из Local Storage - показываем уведомление и логируем
                this.logger.error('Failed to load local history from storage', error);
                // Не показываем уведомление здесь, так как это может быть вызвано часто
                // Уведомление будет показано при явном запросе пользователя
                return [];
            }
            // UC-04 А1: Нет снапшотов - возвращаем пустой список (Timeline API покажет пустое состояние)
            // UC-04 А2: Все снапшоты приняты - фильтр accepted: false уже применен, вернется пустой список
            if (snapshots.length === 0) {
                return [];
            }
            // Проверяем отмену после получения снапшотов
            if (token.isCancellationRequested) {
                return [];
            }
            // Применяем limit после получения и сортировки снапшотов
            let sortedSnapshots = snapshots;
            if (limit !== undefined && limit > 0) {
                sortedSnapshots = snapshots.slice(0, limit);
            }
            // Преобразуем снапшоты в TimelineItem
            const timelineItems = [];
            for (const snapshot of sortedSnapshots) {
                // Проверяем отмену в цикле
                if (token.isCancellationRequested) {
                    break;
                }
                const timelineItem = this.formatSnapshotToTimelineItem(snapshot);
                timelineItems.push(timelineItem);
            }
            // Определяем, есть ли следующая страница
            // Если получено ровно limit элементов, возможно есть еще снапшоты в исходном списке
            if (limit !== undefined && limit > 0 && timelineItems.length === limit) {
                // Проверяем, есть ли еще снапшоты после примененного limit
                // Для этого проверяем, есть ли снапшоты в исходном списке после последнего элемента
                const lastItem = timelineItems[timelineItems.length - 1];
                const lastItemIndex = snapshots.findIndex(s => s.id === lastItem.id);
                const hasMoreAfterLimit = lastItemIndex >= 0 && lastItemIndex < snapshots.length - 1;
                if (hasMoreAfterLimit) {
                    const nextCursor = createCursor(lastItem.timestamp, lastItem.id);
                    return {
                        items: timelineItems,
                        paging: {
                            cursor: nextCursor
                        }
                    };
                }
            }
            return timelineItems;
        }
        catch (error) {
            // При ошибках возвращаем пустой список (не прерываем работу VS Code)
            this.logger.error('Error providing timeline', error);
            return [];
        }
    }
    /**
     * Форматирует снапшот в TimelineItem для VS Code Timeline API.
     *
     * @param snapshot Снапшот для форматирования
     * @returns TimelineItem для отображения в Timeline view
     */
    formatSnapshotToTimelineItem(snapshot) {
        // Форматируем label: "Typing - 2 minutes ago"
        const sourceLabel = this.getSourceLabel(snapshot.source);
        const relativeTime = (0, time_1.formatRelativeTime)(snapshot.timestamp);
        const label = `${sourceLabel} - ${relativeTime}`;
        // Форматируем description (diff summary)
        const description = this.formatDiffSummary(snapshot);
        // Создаем TimelineItem
        const timelineItem = {
            id: snapshot.id,
            label: label,
            timestamp: snapshot.timestamp,
            description: description,
            contextValue: 'changes-viewer.snapshot',
            iconPath: this.getIconPath(snapshot.source),
            command: {
                title: 'Show Details',
                command: 'changes-viewer.showDetails',
                arguments: [snapshot.id]
            }
        };
        return timelineItem;
    }
    /**
     * Получает читаемую метку для источника создания снапшота.
     *
     * @param source Источник создания
     * @returns Читаемая метка
     */
    getSourceLabel(source) {
        switch (source) {
            case 'typing':
                return 'Typing';
            case 'save':
                return 'Saved';
            case 'filesystem':
                return 'External change';
            case 'manual':
                return 'Manual';
            default:
                return 'Unknown';
        }
    }
    /**
     * Форматирует summary изменений для отображения в description.
     *
     * @param snapshot Снапшот с информацией об изменениях
     * @returns Отформатированная строка с summary изменений
     */
    formatDiffSummary(snapshot) {
        if (!snapshot.diffInfo) {
            // Если нет информации об изменениях, показываем базовую информацию
            return `${snapshot.metadata.lineCount} lines, ${this.formatSize(snapshot.metadata.size)}`;
        }
        const { addedLines, removedLines, modifiedLines } = snapshot.diffInfo;
        const parts = [];
        if (addedLines > 0) {
            parts.push(`Added ${addedLines} line${addedLines !== 1 ? 's' : ''}`);
        }
        if (removedLines > 0) {
            parts.push(`Removed ${removedLines} line${removedLines !== 1 ? 's' : ''}`);
        }
        if (modifiedLines > 0) {
            parts.push(`Modified ${modifiedLines} line${modifiedLines !== 1 ? 's' : ''}`);
        }
        if (parts.length === 0) {
            // Если нет изменений, показываем базовую информацию
            return `${snapshot.metadata.lineCount} lines, ${this.formatSize(snapshot.metadata.size)}`;
        }
        return parts.join(', ');
    }
    /**
     * Форматирует размер файла в читаемый формат.
     *
     * @param size Размер в байтах
     * @returns Отформатированная строка (например, "5.2 KB")
     */
    formatSize(size) {
        if (size < 1024) {
            return `${size} B`;
        }
        else if (size < 1024 * 1024) {
            return `${(size / 1024).toFixed(1)} KB`;
        }
        else {
            return `${(size / (1024 * 1024)).toFixed(1)} MB`;
        }
    }
    /**
     * Получает путь к иконке в зависимости от источника создания снапшота.
     * Использует встроенные иконки VS Code или путь к файлу.
     *
     * @param source Источник создания
     * @returns Путь к иконке или ThemeIcon
     */
    getIconPath(source) {
        // Используем встроенные иконки VS Code через ThemeIcon
        // ThemeIcon доступен с VS Code 1.60.0
        switch (source) {
            case 'typing':
                return new vscode.ThemeIcon('edit');
            case 'save':
                return new vscode.ThemeIcon('save');
            case 'filesystem':
                return new vscode.ThemeIcon('file');
            case 'manual':
                return new vscode.ThemeIcon('history');
            default:
                return new vscode.ThemeIcon('circle-outline');
        }
    }
    /**
     * Уведомляет VS Code об изменении Timeline для указанного файла.
     * Вызывается при создании новых снапшотов или изменении существующих.
     * Очищает кеш для указанного файла.
     *
     * @param uri URI файла, для которого нужно обновить Timeline (опционально, если не указан - обновляется для всех файлов)
     */
    notifyTimelineChange(uri) {
        // Очищаем кеш для обновленного файла
        if (uri) {
            this.sortedSnapshotsCache.delete(uri.toString());
            // Уведомляем об изменении для конкретного файла
            this.onDidChangeEmitter.fire({ uri });
        }
        else {
            // Очищаем весь кеш при глобальном обновлении
            this.sortedSnapshotsCache.clear();
            // Уведомляем об изменении для всех файлов
            this.onDidChangeEmitter.fire({});
        }
    }
    /**
     * Освобождает ресурсы провайдера.
     */
    dispose() {
        this.onDidChangeEmitter.dispose();
        this.sortedSnapshotsCache.clear();
    }
}
exports.LocalHistoryTimelineProvider = LocalHistoryTimelineProvider;
//# sourceMappingURL=LocalHistoryTimelineProvider.js.map