import * as vscode from 'vscode';
import * as path from 'path';
import { LocalHistoryManager } from '../services/LocalHistoryManager';
import { Snapshot } from '../types/snapshot';
import { formatRelativeTime } from '../utils/time';

export class LocalHistoryTreeProvider implements vscode.TreeDataProvider<HistoryTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<HistoryTreeItem | undefined | void> = new vscode.EventEmitter<HistoryTreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<HistoryTreeItem | undefined | void> = this._onDidChangeTreeData.event;
    
    // Состояние фильтра "показывать только непросмотренные/непринятые"
    // По умолчанию false - показываем все файлы
    private showOnlyUnapproved: boolean = false;

    constructor(private historyManager: LocalHistoryManager) {
        // Следим за изменениями истории для обновления дерева
        historyManager.setOnChangeCallback(() => this.refresh());
        // Также обновляем при сохранении файлов
        vscode.workspace.onDidSaveTextDocument(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
    
    // Методы управления фильтром
    toggleUnapprovedFilter(): void {
        this.showOnlyUnapproved = !this.showOnlyUnapproved;
    }
    
    getUnapprovedFilter(): boolean {
        return this.showOnlyUnapproved;
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

                return snapshots.map((snapshot, index) => {
                    const relativeTime = formatRelativeTime(snapshot.timestamp);
                    let label = `${this.getSourceLabel(snapshot.source, snapshot.metadata)} (${relativeTime})`;
                    
                    if (snapshot.accepted) {
                        label = `Approved (${relativeTime})`;
                    } else if (snapshot.discarded) {
                        label = `Discarded (${relativeTime})`;
                    } else if (snapshot.source === 'filesystem' && index === snapshots.length - 1) {
                        // Check if it is the oldest snapshot and comes from filesystem
                        label = `Base Snapshot (${relativeTime})`;
                    }
                    
                    return new HistoryTreeItem(
                        label,
                        snapshot.id,
                        vscode.TreeItemCollapsibleState.None,
                        snapshot,
                        this.getIconPath(snapshot), // Передаем snapshot целиком
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
            
            // Фильтрация файлов, если включен чекбокс showOnlyUnapproved
            // Логика UI:
            // "Глазик" (eye) означает режим просмотра "ВСЕХ" файлов. (showOnlyUnapproved = false)
            // "Закрытый глазик" (eye-closed) означает режим "Скрыть утвержденные", т.е. показать только НЕ утвержденные. (showOnlyUnapproved = true)
            
            // Если showOnlyUnapproved = true (глазик закрыт), показываем только Unapproved.
            // Если showOnlyUnapproved = false (глазик открыт), показываем ВСЕ.
            
            // В VS Code команда enableUnapprovedFilter (icon: eye-closed) активна, когда context !filterUnapprovedActive
            // То есть, когда мы видим "eye-closed" в меню, это кнопка "Включить фильтр (скрыть утвержденные)".
            // После нажатия context становится true, и появляется кнопка disableUnapprovedFilter (icon: eye) - "Показать все".
            
            let filesToShow = fileUris;
            
            if (this.showOnlyUnapproved) {
                const unapprovedFiles: string[] = [];
                
                for (const fileUri of fileUris) {
                    const uri = vscode.Uri.parse(fileUri);
                    const snapshots = await this.historyManager.getSnapshotsForFile(uri);
                    
                    // Файл считается "unapproved", если у него есть хотя бы один НЕ принятый снапшот.
                    // НО: у нас логика, что при approve мы удаляем промежуточные снапшоты и оставляем один "approved".
                    // Значит, если последний снапшот accepted, то файл "чистый" (заапрувлен).
                    // Если последний снапшот !accepted (например, typing/save), то файл изменен.
                    
                    if (snapshots.length > 0) {
                        // Берем самый свежий снапшот (первый в списке)
                        const latestSnapshot = snapshots[0];
                        if (!latestSnapshot.accepted) {
                            unapprovedFiles.push(fileUri);
                        }
                    }
                }
                
                filesToShow = unapprovedFiles;
            }

            if (filesToShow.length === 0) {
                if (this.showOnlyUnapproved) {
                    return [new HistoryTreeItem('No unapproved files', '', vscode.TreeItemCollapsibleState.None)];
                }
                return [new HistoryTreeItem('No tracked files', '', vscode.TreeItemCollapsibleState.None)];
            }

            return filesToShow.map(fileUri => {
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

    private getSourceLabel(source: string, metadata?: any): string {
        if (metadata?.restoredFrom) {
            return 'Restored';
        }

        switch (source) {
            case 'typing': return 'Typing';
            case 'save': return 'Saved';
            case 'manual': return 'Manual';
            case 'filesystem': return 'External';
            default: return source;
        }
    }

    private getIconPath(sourceOrSnapshot: string | Snapshot): vscode.ThemeIcon {
        // Если передан snapshot
        if (typeof sourceOrSnapshot === 'object') {
            const snapshot = sourceOrSnapshot as Snapshot;
            if (snapshot.accepted) {
                return new vscode.ThemeIcon('check');
            }
            if (snapshot.discarded) {
                return new vscode.ThemeIcon('discard');
            }
            // Check metadata for restored
            if (snapshot.metadata?.restoredFrom) {
                return new vscode.ThemeIcon('history'); // Or 'reply'
            }
            return this.getIconPath(snapshot.source);
        }

        const source = sourceOrSnapshot as string;
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
            
            // Действие по клику - показать inline diff между этим снапшотом и предыдущим
            // Аргументы: [snapshotId, fileUriString, isSnapshotClick]
            this.command = {
                command: 'changes-viewer.toggleInlineDiff',
                title: 'Show Diff with Previous Snapshot',
                arguments: [snapshot.id, snapshot.fileUri, true] // isSnapshotClick = true
            };
        } else if (fileUri) {
            // Это файл
            const uri = vscode.Uri.parse(fileUri);
            this.tooltip = `File: ${uri.fsPath}\nClick to view changes since last approve`;
            this.description = path.dirname(uri.fsPath); // Показываем директорию
            this.contextValue = 'changes-viewer.fileItem';
            
            // Действие по клику - показать изменения с момента последнего approve
            // Аргументы: [snapshotId, fileUriString, isSnapshotClick]
            this.command = {
                command: 'changes-viewer.toggleInlineDiff',
                title: 'Show Changes Since Last Approve',
                arguments: [undefined, this.fileUri, false] // isSnapshotClick = false - сравнение текущего файла с approved/base
            };
        } else {
            // Это информационное сообщение
            this.tooltip = label;
        }
    }
}
