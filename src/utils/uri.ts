import * as vscode from 'vscode';

/**
 * Проверяет валидность URI.
 * 
 * @param uri - URI для проверки
 * @returns true, если URI валиден, иначе false
 */
export function validateUri(uri: vscode.Uri): boolean {
    try {
        // Проверяем, что URI имеет корректную схему
        if (!uri.scheme || uri.scheme === '') {
            return false;
        }
        
        // Проверяем, что URI имеет путь (для file:// URI)
        if (uri.scheme === 'file' && (!uri.fsPath || uri.fsPath === '')) {
            return false;
        }
        
        // Проверяем, что URI можно преобразовать в строку
        const uriString = uri.toString();
        if (!uriString || uriString === '') {
            return false;
        }
        
        return true;
    } catch (error) {
        // Если произошла ошибка при проверке, URI невалиден
        return false;
    }
}

/**
 * Проверяет, принадлежит ли URI к рабочей области VS Code.
 * 
 * @param uri - URI для проверки
 * @returns true, если URI принадлежит рабочей области, иначе false
 */
export function isInWorkspace(uri: vscode.Uri): boolean {
    try {
        // Если нет открытых рабочих областей, возвращаем false
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return false;
        }
        
        // Проверяем, что URI имеет схему 'file'
        if (uri.scheme !== 'file') {
            return false;
        }
        
        const uriPath = uri.fsPath;
        
        // Проверяем, находится ли путь в одной из открытых рабочих областей
        for (const folder of vscode.workspace.workspaceFolders) {
            const folderPath = folder.uri.fsPath;
            
            // Нормализуем пути для корректного сравнения
            // Проверяем, что uriPath начинается с folderPath
            if (uriPath.startsWith(folderPath)) {
                return true;
            }
        }
        
        return false;
    } catch (error) {
        // Если произошла ошибка, считаем, что URI не принадлежит рабочей области
        return false;
    }
}
