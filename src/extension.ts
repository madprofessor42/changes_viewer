import * as vscode from 'vscode';
import { ConfigurationService } from './services/ConfigurationService';
import { StorageService } from './services/StorageService';
import { CleanupService } from './services/CleanupService';
import { LocalHistoryManager } from './services/LocalHistoryManager';
import { ChangeTracker } from './services/ChangeTracker';
// import { LocalHistoryTimelineProvider } from './providers/LocalHistoryTimelineProvider'; // Убрали Timeline
import { LocalHistoryTreeProvider, HistoryTreeItem } from './providers/LocalHistoryTreeProvider';
import { restoreCommand } from './commands/restoreCommand';
import { acceptCommand } from './commands/acceptCommand';
import { diffCommand } from './commands/diffCommand';
import { showDetailsCommand } from './commands/showDetailsCommand';
import { clearSnapshotsCommand } from './commands/clearSnapshotsCommand';
import { diffWithLastApprovedCommand } from './commands/diffWithLastApprovedCommand';
import { approveAllChangesCommand } from './commands/approveAllChangesCommand';
import { deleteAllSnapshotsCommand } from './commands/deleteAllSnapshotsCommand';
import { deleteSnapshotCommand } from './commands/deleteSnapshotCommand';
import { deleteFileSnapshotsCommand } from './commands/deleteFileSnapshotsCommand';
import { openFileCommand } from './commands/openFileCommand';
import { discardAllChangesCommand } from './commands/discardAllChangesCommand';
import { toggleUnapprovedFilterCommand } from './commands/toggleUnapprovedFilterCommand';
import { Logger } from './utils/logger';

/**
 * Активирует расширение Changes Viewer.
 * Инициализирует сервисы, регистрирует провайдеры и команды.
 */
export function activate(context: vscode.ExtensionContext) {
    // Инициализация Logger
    const logger = Logger.getInstance();
    
    // 1. ConfigurationService (не имеет зависимостей)
    const configService = new ConfigurationService();
    
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
    const storageService = new StorageService(context, configService);
    logger.info('StorageService: initialized');
    
    // 3. CleanupService (зависит от StorageService и ConfigurationService)
    logger.debug('CleanupService: initializing');
    const cleanupService = new CleanupService(storageService, configService);
    logger.info('CleanupService: initialized');
    
    // 4. LocalHistoryManager (зависит от StorageService, CleanupService и ConfigurationService)
    logger.debug('LocalHistoryManager: initializing');
    const historyManager = new LocalHistoryManager(storageService, cleanupService, configService);
    logger.info('LocalHistoryManager: initialized');
    
    // 5. ChangeTracker (зависит от LocalHistoryManager и ConfigurationService)
    logger.debug('ChangeTracker: initializing');
    const changeTracker = new ChangeTracker(historyManager, configService);
    logger.info('ChangeTracker: initialized');
    
    // Запускаем отслеживание изменений
    changeTracker.startTracking();
    logger.info('Change tracking started');
    
    // Запускаем периодическую очистку (по умолчанию каждые 24 часа)
    cleanupService.startPeriodicCleanup(24);
    logger.info('Periodic cleanup started');
    
    // Сохраняем ChangeTracker в subscriptions для автоматической очистки при деактивации
    const changeTrackerDisposable: vscode.Disposable = {
        dispose: () => {
            changeTracker.stopTracking();
            cleanupService.stopPeriodicCleanup();
        }
    };
    context.subscriptions.push(changeTrackerDisposable);
    
    // --- UI: Регистрация Tree View Provider (вместо Timeline) ---
    const treeProvider = new LocalHistoryTreeProvider(historyManager);
    
    // Инициализируем контекст фильтра (по умолчанию выключен)
    vscode.commands.executeCommand('setContext', 'changes-viewer.filterUnapprovedActive', false);
    
    // Регистрируем провайдер для View ID из package.json
    const treeViewDisposable = vscode.window.registerTreeDataProvider(
        'changes-viewer-view',
        treeProvider
    );
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
    const getSnapshotId = (arg: any): string | undefined => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof HistoryTreeItem && arg.snapshotId) return arg.snapshotId;
        return undefined;
    };

    // Вспомогательная функция для извлечения URI файла из аргументов команды
    const getFileUri = (arg: any): vscode.Uri | undefined => {
        if (arg instanceof vscode.Uri) return arg;
        if (arg instanceof HistoryTreeItem && arg.fileUri) return vscode.Uri.parse(arg.fileUri);
        // Если команда вызвана из редактора
        if (!arg && vscode.window.activeTextEditor) return vscode.window.activeTextEditor.document.uri;
        return undefined;
    };

    // Команда restore
    const restoreCommandDisposable = vscode.commands.registerCommand(
        'changes-viewer.restore',
        async (arg?: any) => {
            const snapshotId = getSnapshotId(arg);
            await restoreCommand(historyManager, storageService, snapshotId);
        }
    );
    context.subscriptions.push(restoreCommandDisposable);
    
    // Команда accept
    const acceptCommandDisposable = vscode.commands.registerCommand(
        'changes-viewer.accept',
        async (arg?: any) => {
            const snapshotId = getSnapshotId(arg);
            // timelineProvider больше нет, передаем undefined
            await acceptCommand(historyManager, undefined, snapshotId);
            treeProvider.refresh(); // Обновляем дерево после изменения статуса
        }
    );
    context.subscriptions.push(acceptCommandDisposable);
    
    // Команда diff
    const diffCommandDisposable = vscode.commands.registerCommand(
        'changes-viewer.diff',
        async (arg?: any) => {
            const snapshotId = getSnapshotId(arg);
            await diffCommand(historyManager, storageService, snapshotId);
        }
    );
    context.subscriptions.push(diffCommandDisposable);

    // Команда diffWithLastApproved
    const diffWithLastApprovedCommandDisposable = vscode.commands.registerCommand(
        'changes-viewer.diffWithLastApproved',
        async (arg?: any) => {
            const fileUri = getFileUri(arg);
            await diffWithLastApprovedCommand(historyManager, storageService, fileUri);
        }
    );
    context.subscriptions.push(diffWithLastApprovedCommandDisposable);

    // Команда approveAllChanges
    const approveAllChangesCommandDisposable = vscode.commands.registerCommand(
        'changes-viewer.approveAllChanges',
        async (arg?: any) => {
            const fileUri = getFileUri(arg);
            await approveAllChangesCommand(historyManager, storageService, fileUri);
            treeProvider.refresh();
        }
    );
    context.subscriptions.push(approveAllChangesCommandDisposable);
    
    // Команда showDetails
    const showDetailsCommandDisposable = vscode.commands.registerCommand(
        'changes-viewer.showDetails',
        async (arg?: any) => {
            const snapshotId = getSnapshotId(arg);
            await showDetailsCommand(historyManager, snapshotId);
        }
    );
    context.subscriptions.push(showDetailsCommandDisposable);
    
    // Команда clearSnapshots
    const clearSnapshotsCommandDisposable = vscode.commands.registerCommand(
        'changes-viewer.clearSnapshots',
        async () => {
            await clearSnapshotsCommand(cleanupService, configService);
            treeProvider.refresh(); // Обновляем дерево после очистки
        }
    );
    context.subscriptions.push(clearSnapshotsCommandDisposable);

    // Команды фильтрации (enable/disable для переключения иконки)
    const enableFilterDisposable = vscode.commands.registerCommand(
        'changes-viewer.enableUnapprovedFilter',
        async () => {
            if (!treeProvider.getUnapprovedFilter()) {
                await toggleUnapprovedFilterCommand(treeProvider);
            }
        }
    );
    context.subscriptions.push(enableFilterDisposable);

    const disableFilterDisposable = vscode.commands.registerCommand(
        'changes-viewer.disableUnapprovedFilter',
        async () => {
            if (treeProvider.getUnapprovedFilter()) {
                await toggleUnapprovedFilterCommand(treeProvider);
            }
        }
    );
    context.subscriptions.push(disableFilterDisposable);

    // Команда deleteAllSnapshots
    const deleteAllSnapshotsCommandDisposable = vscode.commands.registerCommand(
        'changes-viewer.deleteAllSnapshots',
        async () => {
            await deleteAllSnapshotsCommand(cleanupService);
            treeProvider.refresh();
        }
    );
    context.subscriptions.push(deleteAllSnapshotsCommandDisposable);
    
    // Команда deleteSnapshot
    const deleteSnapshotCommandDisposable = vscode.commands.registerCommand(
        'changes-viewer.deleteSnapshot',
        async (arg?: any) => {
            const snapshotId = getSnapshotId(arg);
            await deleteSnapshotCommand(historyManager, snapshotId);
            treeProvider.refresh();
        }
    );
    context.subscriptions.push(deleteSnapshotCommandDisposable);

    // Команда deleteFileSnapshots
    const deleteFileSnapshotsCommandDisposable = vscode.commands.registerCommand(
        'changes-viewer.deleteFileSnapshots',
        async (arg?: any) => {
            const fileUri = getFileUri(arg);
            await deleteFileSnapshotsCommand(historyManager, fileUri);
            treeProvider.refresh();
        }
    );
    context.subscriptions.push(deleteFileSnapshotsCommandDisposable);

    // Команда openFile
    const openFileCommandDisposable = vscode.commands.registerCommand(
        'changes-viewer.openFile',
        async (arg?: any) => {
            const fileUri = getFileUri(arg);
            await openFileCommand(fileUri);
        }
    );
    context.subscriptions.push(openFileCommandDisposable);

    // Команда discardAllChanges
    const discardAllChangesCommandDisposable = vscode.commands.registerCommand(
        'changes-viewer.discardAllChanges',
        async (arg?: any) => {
            const fileUri = getFileUri(arg);
            await discardAllChangesCommand(historyManager, storageService, fileUri);
        }
    );
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
export function deactivate() {
    const logger = Logger.getInstance();
    logger.info('Changes Viewer extension is deactivating...');
    logger.info('Changes Viewer extension deactivated');
}
