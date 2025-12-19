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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const ConfigurationService_1 = require("./services/ConfigurationService");
const StorageService_1 = require("./services/StorageService");
const CleanupService_1 = require("./services/CleanupService");
const LocalHistoryManager_1 = require("./services/LocalHistoryManager");
const ChangeTracker_1 = require("./services/ChangeTracker");
const LocalHistoryTimelineProvider_1 = require("./providers/LocalHistoryTimelineProvider");
const restoreCommand_1 = require("./commands/restoreCommand");
const acceptCommand_1 = require("./commands/acceptCommand");
const diffCommand_1 = require("./commands/diffCommand");
const showDetailsCommand_1 = require("./commands/showDetailsCommand");
const clearSnapshotsCommand_1 = require("./commands/clearSnapshotsCommand");
const logger_1 = require("./utils/logger");
/**
 * Активирует расширение Changes Viewer.
 * Инициализирует сервисы, регистрирует провайдеры и команды.
 */
function activate(context) {
    // Инициализация Logger
    const logger = logger_1.Logger.getInstance();
    // 1. ConfigurationService (не имеет зависимостей)
    const configService = new ConfigurationService_1.ConfigurationService();
    // Инициализируем Logger с функцией для получения настройки
    logger.initialize(() => configService.getEnableVerboseLogging());
    logger.info('Changes Viewer extension is now active!');
    // Получение путей для хранения данных
    const globalStoragePath = context.globalStoragePath;
    const globalState = context.globalState;
    logger.debug(`Global storage path: ${globalStoragePath}`);
    // Инициализация сервисов в правильном порядке (с учетом зависимостей)
    logger.info('Initializing services...');
    logger.debug('ConfigurationService: initializing');
    logger.info('ConfigurationService: initialized');
    // 2. StorageService (зависит от context и ConfigurationService)
    logger.debug('StorageService: initializing');
    const storageService = new StorageService_1.StorageService(context, configService);
    logger.info('StorageService: initialized');
    // 3. CleanupService (зависит от StorageService и ConfigurationService)
    logger.debug('CleanupService: initializing');
    const cleanupService = new CleanupService_1.CleanupService(storageService, configService);
    logger.info('CleanupService: initialized');
    // 4. LocalHistoryManager (зависит от StorageService, CleanupService и ConfigurationService)
    logger.debug('LocalHistoryManager: initializing');
    const historyManager = new LocalHistoryManager_1.LocalHistoryManager(storageService, cleanupService, configService);
    logger.info('LocalHistoryManager: initialized');
    // 5. ChangeTracker (зависит от LocalHistoryManager и ConfigurationService)
    logger.debug('ChangeTracker: initializing');
    const changeTracker = new ChangeTracker_1.ChangeTracker(historyManager, configService);
    logger.info('ChangeTracker: initialized');
    // Запускаем отслеживание изменений
    changeTracker.startTracking();
    logger.info('Change tracking started');
    // Запускаем периодическую очистку (по умолчанию каждые 24 часа)
    cleanupService.startPeriodicCleanup(24);
    logger.info('Periodic cleanup started');
    // Сохраняем ChangeTracker в subscriptions для автоматической очистки при деактивации
    // Создаем Disposable для ChangeTracker, который остановит отслеживание
    const changeTrackerDisposable = {
        dispose: () => {
            changeTracker.stopTracking();
            cleanupService.stopPeriodicCleanup();
        }
    };
    context.subscriptions.push(changeTrackerDisposable);
    // Регистрация Timeline Provider
    // NOTE: Timeline API доступен с VS Code 1.64+, но для совместимости с 1.60.0
    // используем условную регистрацию. Если API недоступен, провайдер не будет зарегистрирован.
    let timelineProvider;
    let timelineProviderDisposable;
    // Проверяем наличие Timeline API (доступен с VS Code 1.64+)
    // Используем type assertion для обхода проверки типов, так как API может быть недоступен в старых версиях
    const workspaceWithTimeline = vscode.workspace;
    if (workspaceWithTimeline.registerTimelineProvider) {
        timelineProvider = new LocalHistoryTimelineProvider_1.LocalHistoryTimelineProvider(historyManager);
        // Регистрируем провайдер для всех схем файлов ('file') с source 'changes-viewer'
        // source используется для идентификации Timeline items в меню
        timelineProviderDisposable = workspaceWithTimeline.registerTimelineProvider('file', timelineProvider, 'changes-viewer');
        if (timelineProviderDisposable) {
            context.subscriptions.push(timelineProviderDisposable);
        }
        // Устанавливаем callback для уведомления Timeline Provider о создании снапшотов
        historyManager.setOnSnapshotCreatedCallback((snapshot) => {
            if (timelineProvider) {
                // Уведомляем Timeline Provider об изменении для файла снапшота
                const fileUri = vscode.Uri.parse(snapshot.fileUri);
                timelineProvider.notifyTimelineChange(fileUri);
            }
        });
        logger.info('Timeline Provider: registered successfully');
    }
    else {
        logger.warn('Timeline API is not available in this version of VS Code (requires 1.64+)');
    }
    // Регистрация команд
    // Команда restore
    const restoreCommandDisposable = vscode.commands.registerCommand('changes-viewer.restore', async (snapshotId) => {
        await (0, restoreCommand_1.restoreCommand)(historyManager, storageService, snapshotId);
    });
    context.subscriptions.push(restoreCommandDisposable);
    // Команда accept
    const acceptCommandDisposable = vscode.commands.registerCommand('changes-viewer.accept', async (snapshotId) => {
        await (0, acceptCommand_1.acceptCommand)(historyManager, timelineProvider, snapshotId);
    });
    context.subscriptions.push(acceptCommandDisposable);
    // Команда diff
    const diffCommandDisposable = vscode.commands.registerCommand('changes-viewer.diff', async (snapshotId) => {
        await (0, diffCommand_1.diffCommand)(historyManager, storageService, snapshotId);
    });
    context.subscriptions.push(diffCommandDisposable);
    // Команда showDetails
    const showDetailsCommandDisposable = vscode.commands.registerCommand('changes-viewer.showDetails', async (snapshotId) => {
        await (0, showDetailsCommand_1.showDetailsCommand)(historyManager, snapshotId);
    });
    context.subscriptions.push(showDetailsCommandDisposable);
    // Команда clearSnapshots
    const clearSnapshotsCommandDisposable = vscode.commands.registerCommand('changes-viewer.clearSnapshots', async () => {
        await (0, clearSnapshotsCommand_1.clearSnapshotsCommand)(cleanupService, configService);
    });
    context.subscriptions.push(clearSnapshotsCommandDisposable);
    logger.info('All commands registered');
    logger.info('Changes Viewer extension activated successfully!');
    // Подписываемся на изменения конфигурации для обновления Logger
    configService.onDidChangeConfiguration(() => {
        logger.updateVerboseLogging();
        logger.debug('Configuration changed, verbose logging updated');
    });
}
/**
 * Деактивирует расширение Changes Viewer.
 * Очищает ресурсы и останавливает сервисы.
 *
 * Примечание: Большинство ресурсов очищаются автоматически через context.subscriptions,
 * но эта функция может быть использована для дополнительной очистки, если необходимо.
 */
function deactivate() {
    const logger = logger_1.Logger.getInstance();
    logger.info('Changes Viewer extension is deactivating...');
    // Все Disposable ресурсы автоматически очищаются через context.subscriptions
    // при деактивации расширения. Дополнительная очистка здесь не требуется,
    // так как ChangeTracker и CleanupService уже добавлены в subscriptions
    // и будут автоматически остановлены при вызове dispose().
    logger.info('Changes Viewer extension deactivated');
}
//# sourceMappingURL=extension.js.map