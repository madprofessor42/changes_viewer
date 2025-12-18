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
/**
 * Активирует расширение Changes Viewer.
 * Инициализирует сервисы, регистрирует провайдеры и команды.
 */
function activate(context) {
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
    const restoreCommandDisposable = vscode.commands.registerCommand('changes-viewer.restore', async (snapshotId) => {
        console.log('Command restore called with snapshotId:', snapshotId);
        vscode.window.showInformationMessage('Restore command (stub) - snapshotId: ' + snapshotId);
    });
    context.subscriptions.push(restoreCommandDisposable);
    // Команда accept
    const acceptCommandDisposable = vscode.commands.registerCommand('changes-viewer.accept', async (snapshotId) => {
        console.log('Command accept called with snapshotId:', snapshotId);
        vscode.window.showInformationMessage('Accept command (stub) - snapshotId: ' + JSON.stringify(snapshotId));
    });
    context.subscriptions.push(acceptCommandDisposable);
    // Команда diff
    const diffCommandDisposable = vscode.commands.registerCommand('changes-viewer.diff', async (snapshotId) => {
        console.log('Command diff called with snapshotId:', snapshotId);
        vscode.window.showInformationMessage('Diff command (stub) - snapshotId: ' + snapshotId);
    });
    context.subscriptions.push(diffCommandDisposable);
    // Команда showDetails
    const showDetailsCommandDisposable = vscode.commands.registerCommand('changes-viewer.showDetails', async (snapshotId) => {
        console.log('Command showDetails called with snapshotId:', snapshotId);
        vscode.window.showInformationMessage('Show Details command (stub) - snapshotId: ' + snapshotId);
    });
    context.subscriptions.push(showDetailsCommandDisposable);
    // Команда clearSnapshots
    const clearSnapshotsCommandDisposable = vscode.commands.registerCommand('changes-viewer.clearSnapshots', async () => {
        console.log('Command clearSnapshots called');
        vscode.window.showInformationMessage('Clear Snapshots command (stub)');
    });
    context.subscriptions.push(clearSnapshotsCommandDisposable);
    console.log('All commands registered (stubs)');
    console.log('Changes Viewer extension activated successfully!');
}
/**
 * Деактивирует расширение Changes Viewer.
 * Очищает ресурсы и останавливает сервисы.
 */
function deactivate() {
    console.log('Changes Viewer extension is deactivating...');
    // TODO: Остановить все сервисы и очистить ресурсы
    // - Остановить ChangeTracker
    // - Остановить периодическую очистку
    // - Закрыть все открытые ресурсы
    console.log('Changes Viewer extension deactivated');
}
//# sourceMappingURL=extension.js.map