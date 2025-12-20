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
// import { LocalHistoryTimelineProvider } from './providers/LocalHistoryTimelineProvider'; // Убрали Timeline
const LocalHistoryTreeProvider_1 = require("./providers/LocalHistoryTreeProvider");
const restoreCommand_1 = require("./commands/restoreCommand");
const acceptCommand_1 = require("./commands/acceptCommand");
const diffCommand_1 = require("./commands/diffCommand");
const showDetailsCommand_1 = require("./commands/showDetailsCommand");
const clearSnapshotsCommand_1 = require("./commands/clearSnapshotsCommand");
const diffWithLastApprovedCommand_1 = require("./commands/diffWithLastApprovedCommand");
const approveAllChangesCommand_1 = require("./commands/approveAllChangesCommand");
const deleteAllSnapshotsCommand_1 = require("./commands/deleteAllSnapshotsCommand");
const deleteSnapshotCommand_1 = require("./commands/deleteSnapshotCommand");
const deleteFileSnapshotsCommand_1 = require("./commands/deleteFileSnapshotsCommand");
const openFileCommand_1 = require("./commands/openFileCommand");
const discardAllChangesCommand_1 = require("./commands/discardAllChangesCommand");
const toggleUnapprovedFilterCommand_1 = require("./commands/toggleUnapprovedFilterCommand");
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
    const changeTrackerDisposable = {
        dispose: () => {
            changeTracker.stopTracking();
            cleanupService.stopPeriodicCleanup();
        }
    };
    context.subscriptions.push(changeTrackerDisposable);
    // --- UI: Регистрация Tree View Provider (вместо Timeline) ---
    const treeProvider = new LocalHistoryTreeProvider_1.LocalHistoryTreeProvider(historyManager);
    // Инициализируем контекст фильтра (по умолчанию выключен)
    vscode.commands.executeCommand('setContext', 'changes-viewer.filterUnapprovedActive', false);
    // Регистрируем провайдер для View ID из package.json
    const treeViewDisposable = vscode.window.registerTreeDataProvider('changes-viewer-view', treeProvider);
    context.subscriptions.push(treeViewDisposable);
    // Устанавливаем callback для уведомления Tree Provider об изменениях
    historyManager.setOnChangeCallback(() => {
        // Просто обновляем дерево
        treeProvider.refresh();
    });
    logger.info('Tree View Provider: registered successfully');
    // --- Команды ---
    // Вспомогательная функция для извлечения ID из аргументов команды
    // Команды из TreeView получают первым аргументом элемент дерева (HistoryTreeItem)
    const getSnapshotId = (arg) => {
        if (typeof arg === 'string')
            return arg;
        if (arg instanceof LocalHistoryTreeProvider_1.HistoryTreeItem && arg.snapshotId)
            return arg.snapshotId;
        return undefined;
    };
    // Вспомогательная функция для извлечения URI файла из аргументов команды
    const getFileUri = (arg) => {
        if (arg instanceof vscode.Uri)
            return arg;
        if (arg instanceof LocalHistoryTreeProvider_1.HistoryTreeItem && arg.fileUri)
            return vscode.Uri.parse(arg.fileUri);
        // Если команда вызвана из редактора
        if (!arg && vscode.window.activeTextEditor)
            return vscode.window.activeTextEditor.document.uri;
        return undefined;
    };
    // Команда restore
    const restoreCommandDisposable = vscode.commands.registerCommand('changes-viewer.restore', async (arg) => {
        const snapshotId = getSnapshotId(arg);
        await (0, restoreCommand_1.restoreCommand)(historyManager, storageService, snapshotId);
    });
    context.subscriptions.push(restoreCommandDisposable);
    // Команда accept
    const acceptCommandDisposable = vscode.commands.registerCommand('changes-viewer.accept', async (arg) => {
        const snapshotId = getSnapshotId(arg);
        // timelineProvider больше нет, передаем undefined
        await (0, acceptCommand_1.acceptCommand)(historyManager, undefined, snapshotId);
        treeProvider.refresh(); // Обновляем дерево после изменения статуса
    });
    context.subscriptions.push(acceptCommandDisposable);
    // Команда diff
    const diffCommandDisposable = vscode.commands.registerCommand('changes-viewer.diff', async (arg) => {
        const snapshotId = getSnapshotId(arg);
        await (0, diffCommand_1.diffCommand)(historyManager, storageService, snapshotId);
    });
    context.subscriptions.push(diffCommandDisposable);
    // Команда diffWithLastApproved
    const diffWithLastApprovedCommandDisposable = vscode.commands.registerCommand('changes-viewer.diffWithLastApproved', async (arg) => {
        const fileUri = getFileUri(arg);
        await (0, diffWithLastApprovedCommand_1.diffWithLastApprovedCommand)(historyManager, storageService, fileUri);
    });
    context.subscriptions.push(diffWithLastApprovedCommandDisposable);
    // Команда approveAllChanges
    const approveAllChangesCommandDisposable = vscode.commands.registerCommand('changes-viewer.approveAllChanges', async (arg) => {
        const fileUri = getFileUri(arg);
        await (0, approveAllChangesCommand_1.approveAllChangesCommand)(historyManager, storageService, fileUri);
        treeProvider.refresh();
    });
    context.subscriptions.push(approveAllChangesCommandDisposable);
    // Команда showDetails
    const showDetailsCommandDisposable = vscode.commands.registerCommand('changes-viewer.showDetails', async (arg) => {
        const snapshotId = getSnapshotId(arg);
        await (0, showDetailsCommand_1.showDetailsCommand)(historyManager, snapshotId);
    });
    context.subscriptions.push(showDetailsCommandDisposable);
    // Команда clearSnapshots
    const clearSnapshotsCommandDisposable = vscode.commands.registerCommand('changes-viewer.clearSnapshots', async () => {
        await (0, clearSnapshotsCommand_1.clearSnapshotsCommand)(cleanupService, configService);
        treeProvider.refresh(); // Обновляем дерево после очистки
    });
    context.subscriptions.push(clearSnapshotsCommandDisposable);
    // Команды фильтрации (enable/disable для переключения иконки)
    const enableFilterDisposable = vscode.commands.registerCommand('changes-viewer.enableUnapprovedFilter', async () => {
        if (!treeProvider.getUnapprovedFilter()) {
            await (0, toggleUnapprovedFilterCommand_1.toggleUnapprovedFilterCommand)(treeProvider);
        }
    });
    context.subscriptions.push(enableFilterDisposable);
    const disableFilterDisposable = vscode.commands.registerCommand('changes-viewer.disableUnapprovedFilter', async () => {
        if (treeProvider.getUnapprovedFilter()) {
            await (0, toggleUnapprovedFilterCommand_1.toggleUnapprovedFilterCommand)(treeProvider);
        }
    });
    context.subscriptions.push(disableFilterDisposable);
    // Команда deleteAllSnapshots
    const deleteAllSnapshotsCommandDisposable = vscode.commands.registerCommand('changes-viewer.deleteAllSnapshots', async () => {
        await (0, deleteAllSnapshotsCommand_1.deleteAllSnapshotsCommand)(cleanupService);
        treeProvider.refresh();
    });
    context.subscriptions.push(deleteAllSnapshotsCommandDisposable);
    // Команда deleteSnapshot
    const deleteSnapshotCommandDisposable = vscode.commands.registerCommand('changes-viewer.deleteSnapshot', async (arg) => {
        const snapshotId = getSnapshotId(arg);
        await (0, deleteSnapshotCommand_1.deleteSnapshotCommand)(historyManager, snapshotId);
        treeProvider.refresh();
    });
    context.subscriptions.push(deleteSnapshotCommandDisposable);
    // Команда deleteFileSnapshots
    const deleteFileSnapshotsCommandDisposable = vscode.commands.registerCommand('changes-viewer.deleteFileSnapshots', async (arg) => {
        const fileUri = getFileUri(arg);
        await (0, deleteFileSnapshotsCommand_1.deleteFileSnapshotsCommand)(historyManager, fileUri);
        treeProvider.refresh();
    });
    context.subscriptions.push(deleteFileSnapshotsCommandDisposable);
    // Команда openFile
    const openFileCommandDisposable = vscode.commands.registerCommand('changes-viewer.openFile', async (arg) => {
        const fileUri = getFileUri(arg);
        await (0, openFileCommand_1.openFileCommand)(fileUri);
    });
    context.subscriptions.push(openFileCommandDisposable);
    // Команда discardAllChanges
    const discardAllChangesCommandDisposable = vscode.commands.registerCommand('changes-viewer.discardAllChanges', async (arg) => {
        const fileUri = getFileUri(arg);
        await (0, discardAllChangesCommand_1.discardAllChangesCommand)(historyManager, storageService, fileUri);
    });
    context.subscriptions.push(discardAllChangesCommandDisposable);
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
 */
function deactivate() {
    const logger = logger_1.Logger.getInstance();
    logger.info('Changes Viewer extension is deactivating...');
    logger.info('Changes Viewer extension deactivated');
}
//# sourceMappingURL=extension.js.map