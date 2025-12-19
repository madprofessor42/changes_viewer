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
exports.DocumentWatcher = void 0;
const vscode = __importStar(require("vscode"));
const uriUtils = __importStar(require("../utils/uri"));
const logger_1 = require("../utils/logger");
/**
 * Компонент для отслеживания изменений файлов в редакторе VS Code.
 * Отслеживает изменения через события onDidChangeTextDocument и создает снапшоты
 * с debounce механизмом для каждого файла независимо.
 */
class DocumentWatcher {
    constructor(historyManager, configService) {
        this.disposables = [];
        this.debounceTimers = new Map();
        this.isWatching = false;
        this.historyManager = historyManager;
        this.configService = configService;
        this.logger = logger_1.Logger.getInstance();
    }
    /**
     * Запускает отслеживание изменений в редакторе.
     * Регистрирует обработчики событий onDidChangeTextDocument и onDidSaveTextDocument.
     */
    startWatching() {
        if (this.isWatching) {
            return; // Уже отслеживаем
        }
        // Регистрируем обработчик изменений документов
        const changeDisposable = vscode.workspace.onDidChangeTextDocument((event) => this.handleDocumentChange(event));
        this.disposables.push(changeDisposable);
        // Регистрируем обработчик сохранения документов
        const saveDisposable = vscode.workspace.onDidSaveTextDocument((document) => this.handleDocumentSave(document));
        this.disposables.push(saveDisposable);
        this.isWatching = true;
    }
    /**
     * Останавливает отслеживание изменений.
     * Очищает все таймеры debounce и отменяет подписки.
     */
    stopWatching() {
        if (!this.isWatching) {
            return; // Уже остановлено
        }
        // Очищаем все таймеры debounce
        for (const [fileUri, timer] of this.debounceTimers.entries()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
        // Отменяем все подписки
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
        this.isWatching = false;
    }
    /**
     * Обрабатывает событие изменения документа.
     * Применяет debounce и создает снапшот после задержки.
     *
     * @param event Событие изменения документа
     */
    handleDocumentChange(event) {
        const document = event.document;
        // Фильтруем изменения:
        // 1. Игнорируем несохраненные файлы, которые не являются текстовыми документами
        if (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled') {
            return;
        }
        // 2. Игнорируем изменения в файлах вне рабочей области (для file:// URI)
        if (document.uri.scheme === 'file' && !uriUtils.isInWorkspace(document.uri)) {
            return;
        }
        // 3. Игнорируем закрытые документы
        if (document.isClosed) {
            return;
        }
        const fileUri = document.uri.toString();
        // Получаем debounce значение из конфигурации
        const debounceMs = this.configService.getTypingDebounce();
        // Отменяем предыдущий таймер для этого файла, если он существует
        const existingTimer = this.debounceTimers.get(fileUri);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        // Создаем новый таймер для этого файла
        const timer = setTimeout(() => {
            // Удаляем таймер из Map после выполнения
            this.debounceTimers.delete(fileUri);
            // Создаем снапшот асинхронно, чтобы не блокировать ввод текста
            this.createSnapshotForDocument(document).catch((error) => {
                // Ошибки создания снапшотов не должны прерывать работу редактора
                this.logger.error(`Failed to create snapshot for ${fileUri}`, error);
            });
        }, debounceMs);
        // Сохраняем таймер в Map
        this.debounceTimers.set(fileUri, timer);
    }
    /**
     * Обрабатывает событие сохранения документа.
     * Читает файл с диска и создает снапшот с source='save'.
     *
     * @param document Сохраненный документ
     */
    async handleDocumentSave(document) {
        // Фильтруем сохранения:
        // 1. Игнорируем файлы не в схеме 'file'
        if (document.uri.scheme !== 'file') {
            return;
        }
        // 2. Игнорируем файлы вне рабочей области
        if (!uriUtils.isInWorkspace(document.uri)) {
            return;
        }
        // 3. Игнорируем закрытые документы
        if (document.isClosed) {
            return;
        }
        // Читаем сохраненный файл с диска асинхронно, чтобы не блокировать сохранение
        this.createSnapshotForSavedFile(document.uri).catch((error) => {
            // Ошибки создания снапшотов не должны прерывать работу редактора
            this.logger.error(`Failed to create snapshot for saved file ${document.uri.toString()}`, error);
        });
    }
    /**
     * Создает снапшот для указанного документа.
     * Проверяет размер файла и создает снапшот через LocalHistoryManager.
     *
     * @param document Документ для создания снапшота
     */
    async createSnapshotForDocument(document) {
        // Получаем содержимое файла из редактора (включая dirty state)
        const content = document.getText();
        // Проверяем размер файла
        const maxFileSize = this.configService.getMaxFileSize();
        const contentSize = Buffer.byteLength(content, 'utf8');
        if (contentSize > maxFileSize) {
            // Файл слишком большой, пропускаем создание снапшота
            this.logger.debug(`Skipping snapshot for ${document.uri.toString()}: file size ${contentSize} exceeds maxFileSize ${maxFileSize}`);
            return;
        }
        // Создаем снапшот через LocalHistoryManager с source='typing'
        try {
            await this.historyManager.createSnapshot(document.uri, content, 'typing');
        }
        catch (error) {
            // Ошибки создания снапшотов не должны прерывать работу редактора
            // Логируем ошибку, но не пробрасываем её дальше
            this.logger.error(`Error creating snapshot for ${document.uri.toString()}`, error);
        }
    }
    /**
     * Создает снапшот для сохраненного файла.
     * Читает файл с диска, проверяет размер и создает снапшот через LocalHistoryManager.
     *
     * @param fileUri URI сохраненного файла
     */
    async createSnapshotForSavedFile(fileUri) {
        try {
            // UC-02 А2: Проверяем существование файла перед созданием снапшота
            try {
                await vscode.workspace.fs.stat(fileUri);
            }
            catch (statError) {
                // Файл удален до сохранения - не создаем снапшот, логируем
                if (statError instanceof vscode.FileSystemError && statError.code === 'FileNotFound') {
                    this.logger.debug(`File deleted before save, skipping snapshot creation: ${fileUri.toString()}`);
                    return;
                }
                // Другие ошибки - пробрасываем дальше
                throw statError;
            }
            // Читаем файл с диска через vscode.workspace.fs.readFile()
            const fileData = await vscode.workspace.fs.readFile(fileUri);
            // Преобразуем Buffer в строку (UTF-8)
            const content = Buffer.from(fileData).toString('utf8');
            // Проверяем размер файла
            const maxFileSize = this.configService.getMaxFileSize();
            const contentSize = fileData.length;
            if (contentSize > maxFileSize) {
                // Файл слишком большой, пропускаем создание снапшота
                this.logger.debug(`Skipping snapshot for ${fileUri.toString()}: file size ${contentSize} exceeds maxFileSize ${maxFileSize}`);
                return;
            }
            // Создаем снапшот через LocalHistoryManager с source='save'
            // Дедупликация уже реализована в LocalHistoryManager
            await this.historyManager.createSnapshot(fileUri, content, 'save');
        }
        catch (error) {
            // Обрабатываем различные типы ошибок:
            // - Файл удален (FileNotFound)
            // - Нет прав доступа (PermissionDenied)
            // - Ошибка чтения файла
            // Не пробрасываем ошибку дальше, чтобы не прерывать работу редактора
            if (error instanceof vscode.FileSystemError) {
                // VS Code FileSystemError - логируем с деталями
                this.logger.warn(`File system error while creating snapshot for ${fileUri.toString()}: ${error.code} - ${error.message}`);
            }
            else {
                // Другие ошибки
                this.logger.error(`Error creating snapshot for saved file ${fileUri.toString()}`, error);
            }
        }
    }
}
exports.DocumentWatcher = DocumentWatcher;
//# sourceMappingURL=DocumentWatcher.js.map