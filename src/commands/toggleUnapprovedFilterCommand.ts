import * as vscode from 'vscode';
import { LocalHistoryTreeProvider } from '../providers/LocalHistoryTreeProvider';
import { Logger } from '../utils/logger';

/**
 * Команда для переключения фильтра "показывать только непросмотренные/непринятые".
 * 
 * @param treeProvider Провайдер дерева для обновления состояния фильтрации
 */
export async function toggleUnapprovedFilterCommand(
    treeProvider: LocalHistoryTreeProvider
): Promise<void> {
    const logger = Logger.getInstance();
    
    // Переключаем состояние фильтра в провайдере
    treeProvider.toggleUnapprovedFilter();
    const newState = treeProvider.getUnapprovedFilter();
    
    // Обновляем контекст VS Code для переключения иконки в UI
    await vscode.commands.executeCommand('setContext', 'changes-viewer.filterUnapprovedActive', newState);

    // Обновляем дерево
    treeProvider.refresh();
    
    logger.info(`Toggled unapproved filter. New state: ${newState}`);
}

