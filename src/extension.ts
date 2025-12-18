import * as vscode from 'vscode';

/**
 * Активирует расширение Changes Viewer.
 * Инициализирует сервисы, регистрирует провайдеры и команды.
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('Changes Viewer extension is now active!');
    
    // Получение путей для хранения данных
    const globalStoragePath = context.globalStoragePath;
    const globalState = context.globalState;
    
    console.log('Global storage path:', globalStoragePath);
    
    // Инициализация сервисов (пока заглушки)
    // TODO: Заменить на реальные сервисы в следующих задачах
    console.log('Initializing services...');
    
    // ConfigurationService - заглушка
    console.log('ConfigurationService: initialized (stub)');
    
    // StorageService - заглушка
    console.log('StorageService: initialized (stub)');
    
    // CleanupService - заглушка
    console.log('CleanupService: initialized (stub)');
    
    // LocalHistoryManager - заглушка
    console.log('LocalHistoryManager: initialized (stub)');
    
    // ChangeTracker - заглушка
    console.log('ChangeTracker: initialized (stub)');
    
    // Регистрация Timeline Provider (заглушка)
    // NOTE: Timeline API доступен с VS Code 1.64+, но для совместимости с 1.60.0
    // используем условную регистрацию. Полная реализация будет в задаче 4.1.
    // Для заглушки просто логируем, что провайдер будет зарегистрирован позже.
    console.log('Timeline Provider: will be registered in task 4.1 (stub for now)');
    
    // TODO: Реализовать полную регистрацию Timeline Provider в задаче 4.1
    // const timelineProvider = new LocalHistoryTimelineProvider(...);
    // const timelineProviderDisposable = vscode.workspace.registerTimelineProvider('*', timelineProvider);
    // context.subscriptions.push(timelineProviderDisposable);
    
    // Регистрация команд (заглушки)
    
    // Команда restore
    const restoreCommandDisposable = vscode.commands.registerCommand(
        'changes-viewer.restore',
        async (snapshotId?: string) => {
            console.log('Command restore called with snapshotId:', snapshotId);
            vscode.window.showInformationMessage('Restore command (stub) - snapshotId: ' + snapshotId);
        }
    );
    context.subscriptions.push(restoreCommandDisposable);
    
    // Команда accept
    const acceptCommandDisposable = vscode.commands.registerCommand(
        'changes-viewer.accept',
        async (snapshotId?: string | string[]) => {
            console.log('Command accept called with snapshotId:', snapshotId);
            vscode.window.showInformationMessage('Accept command (stub) - snapshotId: ' + JSON.stringify(snapshotId));
        }
    );
    context.subscriptions.push(acceptCommandDisposable);
    
    // Команда diff
    const diffCommandDisposable = vscode.commands.registerCommand(
        'changes-viewer.diff',
        async (snapshotId?: string) => {
            console.log('Command diff called with snapshotId:', snapshotId);
            vscode.window.showInformationMessage('Diff command (stub) - snapshotId: ' + snapshotId);
        }
    );
    context.subscriptions.push(diffCommandDisposable);
    
    // Команда showDetails
    const showDetailsCommandDisposable = vscode.commands.registerCommand(
        'changes-viewer.showDetails',
        async (snapshotId?: string) => {
            console.log('Command showDetails called with snapshotId:', snapshotId);
            vscode.window.showInformationMessage('Show Details command (stub) - snapshotId: ' + snapshotId);
        }
    );
    context.subscriptions.push(showDetailsCommandDisposable);
    
    // Команда clearSnapshots
    const clearSnapshotsCommandDisposable = vscode.commands.registerCommand(
        'changes-viewer.clearSnapshots',
        async () => {
            console.log('Command clearSnapshots called');
            vscode.window.showInformationMessage('Clear Snapshots command (stub)');
        }
    );
    context.subscriptions.push(clearSnapshotsCommandDisposable);
    
    console.log('All commands registered (stubs)');
    console.log('Changes Viewer extension activated successfully!');
}

/**
 * Деактивирует расширение Changes Viewer.
 * Очищает ресурсы и останавливает сервисы.
 */
export function deactivate() {
    console.log('Changes Viewer extension is deactivating...');
    
    // TODO: Остановить все сервисы и очистить ресурсы
    // - Остановить ChangeTracker
    // - Остановить периодическую очистку
    // - Закрыть все открытые ресурсы
    
    console.log('Changes Viewer extension deactivated');
}
