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
    
    // Регистрируем провайдер для View ID из package.json
    const treeViewDisposable = vscode.window.registerTreeDataProvider(
        'changes-viewer-view',
        treeProvider
    );
    context.subscriptions.push(treeViewDisposable);

    // Устанавливаем callback для уведомления Tree Provider о создании снапшотов
    historyManager.setOnSnapshotCreatedCallback((snapshot) => {
        // Просто обновляем дерево, если снапшот относится к текущему файлу
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
