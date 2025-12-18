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
exports.validateUri = validateUri;
exports.isInWorkspace = isInWorkspace;
const vscode = __importStar(require("vscode"));
/**
 * Проверяет валидность URI.
 *
 * @param uri - URI для проверки
 * @returns true, если URI валиден, иначе false
 */
function validateUri(uri) {
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
    }
    catch (error) {
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
function isInWorkspace(uri) {
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
    }
    catch (error) {
        // Если произошла ошибка, считаем, что URI не принадлежит рабочей области
        return false;
    }
}
//# sourceMappingURL=uri.js.map