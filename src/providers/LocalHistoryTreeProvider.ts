import * as vscode from 'vscode';
import * as path from 'path';
import { LocalHistoryManager } from '../services/LocalHistoryManager';
import { Snapshot } from '../types/snapshot';
import { formatRelativeTime } from '../utils/time';

export class LocalHistoryTreeProvider implements vscode.TreeDataProvider<HistoryTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<HistoryTreeItem | undefined | void> = new vscode.EventEmitter<HistoryTreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<HistoryTreeItem | undefined | void> = this._onDidChangeTreeData.event;

    constructor(private historyManager: LocalHistoryManager) {
        // Следим за созданием новых снапшотов для обновления дерева
        historyManager.setOnSnapshotCreatedCallback(() => this.refresh());
        // Также обновляем при сохранении файлов
        vscode.workspace.onDidSaveTextDocument(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: HistoryTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: HistoryTreeItem): Promise<HistoryTreeItem[]> {
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
                    const relativeTime = formatRelativeTime(snapshot.timestamp);
                    const label = `${this.getSourceLabel(snapshot.source)} (${relativeTime})`;
                    
                    return new HistoryTreeItem(
                        label,
                        snapshot.id,
                        vscode.TreeItemCollapsibleState.None,
                        snapshot,
                        this.getIconPath(snapshot.source),
                        element.fileUri // Передаем fileUri для контекста
                    );
                });
            } catch (error) {
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
                
                return new HistoryTreeItem(
                    fileName,
                    '', // Нет snapshotId для файла
                    vscode.TreeItemCollapsibleState.Collapsed, // Файлы можно раскрывать
                    undefined, // Нет snapshot для файла
                    new vscode.ThemeIcon('file'),
                    fileUri // Сохраняем fileUri для получения снапшотов
                );
            });
        } catch (error) {
            console.error(error);
            return [new HistoryTreeItem('Error loading files', '', vscode.TreeItemCollapsibleState.None)];
        }
    }

    private getSourceLabel(source: string): string {
        switch (source) {
            case 'typing': return 'Typing';
            case 'save': return 'Saved';
            case 'manual': return 'Manual';
            case 'filesystem': return 'External';
            default: return source;
        }
    }

    private getIconPath(source: string): vscode.ThemeIcon {
        switch (source) {
            case 'typing': return new vscode.ThemeIcon('edit');
            case 'save': return new vscode.ThemeIcon('save');
            case 'filesystem': return new vscode.ThemeIcon('file');
            case 'manual': return new vscode.ThemeIcon('history');
            default: return new vscode.ThemeIcon('circle-outline');
        }
    }
}

export class HistoryTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly snapshotId: string, // ID снапшота (пустая строка для файлов)
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly snapshot?: Snapshot,
        public readonly iconPath?: vscode.ThemeIcon,
        public readonly fileUri?: string // URI файла (для файлов на корневом уровне)
    ) {
        super(label, collapsibleState);
        
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
        } else if (fileUri) {
            // Это файл
            const uri = vscode.Uri.parse(fileUri);
            this.tooltip = `File: ${uri.fsPath}\nClick to view history`;
            this.description = path.dirname(uri.fsPath); // Показываем директорию
            this.contextValue = 'changes-viewer.fileItem';
            // Нет команды по клику - просто раскрывает дерево
        } else {
            // Это информационное сообщение
            this.tooltip = label;
        }
    }
}
