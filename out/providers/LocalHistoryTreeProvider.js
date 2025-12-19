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
exports.HistoryTreeItem = exports.LocalHistoryTreeProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const time_1 = require("../utils/time");
class LocalHistoryTreeProvider {
    constructor(historyManager) {
        this.historyManager = historyManager;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        // Следим за созданием новых снапшотов для обновления дерева
        historyManager.setOnSnapshotCreatedCallback(() => this.refresh());
        // Также обновляем при сохранении файлов
        vscode.workspace.onDidSaveTextDocument(() => this.refresh());
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        // Если это файл (имеет fileUri), показываем его снапшоты
        if (element && element.fileUri) {
            try {
                const fileUri = vscode.Uri.parse(element.fileUri);
                const snapshots = await this.historyManager.getSnapshotsForFile(fileUri, {
                    limit: 50 // Показываем последние 50 снапшотов
                });
                if (snapshots.length === 0) {
                    return [new HistoryTreeItem('No history', '', vscode.TreeItemCollapsibleState.None)];
                }
                return snapshots.map(snapshot => {
                    const relativeTime = (0, time_1.formatRelativeTime)(snapshot.timestamp);
                    const label = `${this.getSourceLabel(snapshot.source)} (${relativeTime})`;
                    return new HistoryTreeItem(label, snapshot.id, vscode.TreeItemCollapsibleState.None, snapshot, this.getIconPath(snapshot.source), element.fileUri // Передаем fileUri для контекста
                    );
                });
            }
            catch (error) {
                console.error(error);
                return [new HistoryTreeItem('Error loading history', '', vscode.TreeItemCollapsibleState.None)];
            }
        }
        // Корневой уровень - показываем список всех файлов с историей
        try {
            const fileUris = await this.historyManager.getTrackedFiles();
            if (fileUris.length === 0) {
                return [new HistoryTreeItem('No tracked files', '', vscode.TreeItemCollapsibleState.None)];
            }
            return fileUris.map(fileUri => {
                const uri = vscode.Uri.parse(fileUri);
                const fileName = path.basename(uri.fsPath);
                const filePath = uri.fsPath;
                return new HistoryTreeItem(fileName, '', // Нет snapshotId для файла
                vscode.TreeItemCollapsibleState.Collapsed, // Файлы можно раскрывать
                undefined, // Нет snapshot для файла
                new vscode.ThemeIcon('file'), fileUri // Сохраняем fileUri для получения снапшотов
                );
            });
        }
        catch (error) {
            console.error(error);
            return [new HistoryTreeItem('Error loading files', '', vscode.TreeItemCollapsibleState.None)];
        }
    }
    getSourceLabel(source) {
        switch (source) {
            case 'typing': return 'Typing';
            case 'save': return 'Saved';
            case 'manual': return 'Manual';
            case 'filesystem': return 'External';
            default: return source;
        }
    }
    getIconPath(source) {
        switch (source) {
            case 'typing': return new vscode.ThemeIcon('edit');
            case 'save': return new vscode.ThemeIcon('save');
            case 'filesystem': return new vscode.ThemeIcon('file');
            case 'manual': return new vscode.ThemeIcon('history');
            default: return new vscode.ThemeIcon('circle-outline');
        }
    }
}
exports.LocalHistoryTreeProvider = LocalHistoryTreeProvider;
class HistoryTreeItem extends vscode.TreeItem {
    constructor(label, snapshotId, // ID снапшота (пустая строка для файлов)
    collapsibleState, snapshot, iconPath, fileUri // URI файла (для файлов на корневом уровне)
    ) {
        super(label, collapsibleState);
        this.label = label;
        this.snapshotId = snapshotId;
        this.collapsibleState = collapsibleState;
        this.snapshot = snapshot;
        this.iconPath = iconPath;
        this.fileUri = fileUri;
        if (snapshot) {
            // Это снапшот
            this.tooltip = `Snapshot ID: ${snapshot.id}\nTime: ${new Date(snapshot.timestamp).toLocaleString()}\nFile: ${snapshot.filePath}`;
            this.description = new Date(snapshot.timestamp).toLocaleTimeString();
            this.contextValue = 'changes-viewer.snapshotItem';
            // Действие по клику - показать детали
            this.command = {
                command: 'changes-viewer.showDetails',
                title: 'Show Details',
                arguments: [snapshot.id]
            };
        }
        else if (fileUri) {
            // Это файл
            const uri = vscode.Uri.parse(fileUri);
            this.tooltip = `File: ${uri.fsPath}\nClick to view history`;
            this.description = path.dirname(uri.fsPath); // Показываем директорию
            this.contextValue = 'changes-viewer.fileItem';
            // Нет команды по клику - просто раскрывает дерево
        }
        else {
            // Это информационное сообщение
            this.tooltip = label;
        }
    }
}
exports.HistoryTreeItem = HistoryTreeItem;
//# sourceMappingURL=LocalHistoryTreeProvider.js.map