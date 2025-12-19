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
exports.FileSystemWatcher = void 0;
const vscode = __importStar(require("vscode"));
const uri_1 = require("../utils/uri");
const retry_1 = require("../utils/retry");
const logger_1 = require("../utils/logger");
/**
 * Компонент для отслеживания изменений файлов от внешних процессов через FileSystemWatcher.
 * Отслеживает изменения, создание и удаление файлов в рабочей области и создает снапшоты
 * с debounce механизмом для каждого файла независимо.
 */
class FileSystemWatcher {
    constructor(historyManager, configService) {
        this.disposables = [];
        this.debounceTimers = new Map();
        this.isWatching = false;
        // Паттерны временных файлов
        this.temporaryFilePatterns = [
            /\.tmp$/i,
            /\.temp$/i,
            /^\.~/,
            /~$/,
            /\.swp$/i,
            /\.swpx$/i,
            /\.swo$/i
        ];
        // Системные папки для игнорирования
        this.ignoredFolders = [
            '.git',
            'node_modules',
            '.vscode',
            '.idea',
            'out',
            'dist',
            '.next',
            '.nuxt',
            'build',
            'target',
            '.cache',
            '.tmp',
            '.temp'
        ];
        this.historyManager = historyManager;
        this.configService = configService;
        this.logger = logger_1.Logger.getInstance();
    }
    /**
     * Запускает отслеживание изменений файлов через FileSystemWatcher.
     * Создает watcher для всей рабочей области и регистрирует обработчики событий.
     */
    startWatching() {
        if (this.isWatching) {
            return; // Уже отслеживаем
        }
        // Создаем FileSystemWatcher для всей рабочей области
        // Паттерн '**/*' отслеживает все файлы в рабочей области
        this.fileSystemWatcher = vscode.workspace.createFileSystemWatcher('**/*');
        // Регистрируем обработчики событий
        if (this.fileSystemWatcher) {
            const changeDisposable = this.fileSystemWatcher.onDidChange((uri) => this.handleFileChange(uri));
            this.disposables.push(changeDisposable);
            const createDisposable = this.fileSystemWatcher.onDidCreate((uri) => this.handleFileCreate(uri));
            this.disposables.push(createDisposable);
            const deleteDisposable = this.fileSystemWatcher.onDidDelete((uri) => this.handleFileDelete(uri));
            this.disposables.push(deleteDisposable);
            // Добавляем сам watcher в disposables для корректной очистки
            this.disposables.push(this.fileSystemWatcher);
        }
        this.isWatching = true;
    }
    /**
     * Останавливает отслеживание изменений.
     * Очищает все таймеры debounce, отменяет подписки и закрывает FileSystemWatcher.
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
        this.fileSystemWatcher = undefined;
        this.isWatching = false;
    }
    /**
     * Обрабатывает событие изменения файла.
     * Применяет debounce и создает снапшот после задержки.
     *
     * @param uri URI измененного файла
     */
    handleFileChange(uri) {
        // Фильтруем изменения:
        // 1. Игнорируем файлы не в схеме 'file'
        if (uri.scheme !== 'file') {
            return;
        }
        // 2. Игнорируем файлы вне рабочей области
        if (!(0, uri_1.isInWorkspace)(uri)) {
            return;
        }
        // 3. Игнорируем временные файлы
        if (this.isTemporaryFile(uri)) {
            return;
        }
        // 4. Проверяем dirty state - если файл открыт с несохраненными изменениями, не создаем снапшот
        if (this.hasDirtyState(uri)) {
            return;
        }
        const fileUri = uri.toString();
        // Получаем debounce значение из конфигурации
        const debounceMs = this.configService.getFileSystemDebounce();
        // Отменяем предыдущий таймер для этого файла, если он существует
        const existingTimer = this.debounceTimers.get(fileUri);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        // Создаем новый таймер для этого файла
        const timer = setTimeout(() => {
            // Удаляем таймер из Map после выполнения
            this.debounceTimers.delete(fileUri);
            // Создаем снапшот асинхронно, чтобы не блокировать работу VS Code
            this.createSnapshotForFile(uri, 'filesystem').catch((error) => {
                // Ошибки создания снапшотов не должны прерывать работу VS Code
                this.logger.error(`Failed to create snapshot for ${fileUri}`, error);
            });
        }, debounceMs);
        // Сохраняем таймер в Map
        this.debounceTimers.set(fileUri, timer);
    }
    /**
     * Обрабатывает событие создания файла.
     * Создает снапшот с metadata.created=true.
     *
     * @param uri URI созданного файла
     */
    handleFileCreate(uri) {
        // Фильтруем создания:
        // 1. Игнорируем файлы не в схеме 'file'
        if (uri.scheme !== 'file') {
            return;
        }
        // 2. Игнорируем файлы вне рабочей области
        if (!(0, uri_1.isInWorkspace)(uri)) {
            return;
        }
        // 3. Игнорируем временные файлы
        if (this.isTemporaryFile(uri)) {
            return;
        }
        // 4. Проверяем dirty state
        if (this.hasDirtyState(uri)) {
            return;
        }
        // Для создания файла также применяем debounce, чтобы избежать множественных снапшотов
        const fileUri = uri.toString();
        const debounceMs = this.configService.getFileSystemDebounce();
        const existingTimer = this.debounceTimers.get(fileUri);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        const timer = setTimeout(() => {
            this.debounceTimers.delete(fileUri);
            // Создаем снапшот с metadata.created=true
            this.createSnapshotForFile(uri, 'filesystem', { created: true }).catch((error) => {
                this.logger.error(`Failed to create snapshot for created file ${fileUri}`, error);
            });
        }, debounceMs);
        this.debounceTimers.set(fileUri, timer);
    }
    /**
     * Обрабатывает событие удаления файла.
     * Создает снапшот-маркер с metadata.deleted=true и пустым contentHash.
     *
     * @param uri URI удаленного файла
     */
    handleFileDelete(uri) {
        // Фильтруем удаления:
        // 1. Игнорируем файлы не в схеме 'file'
        if (uri.scheme !== 'file') {
            return;
        }
        // 2. Игнорируем файлы вне рабочей области
        if (!(0, uri_1.isInWorkspace)(uri)) {
            return;
        }
        // 3. Игнорируем временные файлы
        if (this.isTemporaryFile(uri)) {
            return;
        }
        // Для удаления файла создаем снапшот-маркер без задержки (debounce не нужен)
        // Создаем снапшот-маркер с пустым содержимым и metadata.deleted=true
        this.createSnapshotForDeletedFile(uri).catch((error) => {
            this.logger.error(`Failed to create snapshot marker for deleted file ${uri.toString()}`, error);
        });
    }
    /**
     * Проверяет, является ли файл временным.
     * Проверяет имя файла и путь на соответствие паттернам временных файлов
     * и системным папкам.
     *
     * @param uri URI файла для проверки
     * @returns true, если файл является временным
     */
    isTemporaryFile(uri) {
        const path = uri.fsPath;
        const fileName = uri.fsPath.split(/[/\\]/).pop() || '';
        // Проверяем паттерны временных файлов по имени
        for (const pattern of this.temporaryFilePatterns) {
            if (pattern.test(fileName)) {
                return true;
            }
        }
        // Проверяем системные папки в пути
        const pathParts = path.split(/[/\\]/);
        for (const part of pathParts) {
            if (this.ignoredFolders.includes(part)) {
                return true;
            }
        }
        return false;
    }
    /**
     * Проверяет, имеет ли файл dirty state (несохраненные изменения в редакторе).
     *
     * @param uri URI файла для проверки
     * @returns true, если файл открыт с несохраненными изменениями
     */
    hasDirtyState(uri) {
        // Проверяем открытые документы в VS Code
        const openDocuments = vscode.workspace.textDocuments;
        for (const document of openDocuments) {
            // Сравниваем URI (используем toString() для корректного сравнения)
            if (document.uri.toString() === uri.toString()) {
                // Если файл открыт и имеет несохраненные изменения, возвращаем true
                if (document.isDirty) {
                    return true;
                }
            }
        }
        return false;
    }
    /**
     * Создает снапшот для указанного файла.
     * Читает файл с диска с повторными попытками, проверяет размер и создает снапшот.
     *
     * @param uri URI файла
     * @param source Источник создания снапшота
     * @param metadata Дополнительные метаданные для снапшота
     */
    async createSnapshotForFile(uri, source, metadata) {
        try {
            // Читаем файл с диска с повторными попытками (максимум 3 попытки)
            const fileData = await (0, retry_1.retryWithBackoff)(async () => {
                return await vscode.workspace.fs.readFile(uri);
            }, 3, // максимум 3 попытки
            500 // начальная задержка 500ms
            );
            // Преобразуем Buffer в строку (UTF-8)
            const content = Buffer.from(fileData).toString('utf8');
            // Проверяем размер файла
            const maxFileSize = this.configService.getMaxFileSize();
            const contentSize = fileData.length;
            if (contentSize > maxFileSize) {
                // Файл слишком большой, пропускаем создание снапшота
                this.logger.debug(`Skipping snapshot for ${uri.toString()}: file size ${contentSize} exceeds maxFileSize ${maxFileSize}`);
                return;
            }
            // Создаем снапшот через LocalHistoryManager с source='filesystem'
            const snapshot = await this.historyManager.createSnapshot(uri, content, source);
            // Если переданы дополнительные метаданные, обновляем снапшот
            if (metadata && metadata.created) {
                await this.historyManager.updateSnapshot(snapshot.id, {
                    metadata: {
                        ...snapshot.metadata,
                        created: true
                    }
                });
            }
        }
        catch (error) {
            // Обрабатываем различные типы ошибок:
            // - Файл удален (FileNotFound)
            // - Нет прав доступа (PermissionDenied)
            // - Ошибка чтения файла после всех попыток
            // Не пробрасываем ошибку дальше, чтобы не прерывать работу VS Code
            if (error instanceof vscode.FileSystemError) {
                // VS Code FileSystemError - логируем с деталями
                this.logger.warn(`File system error while creating snapshot for ${uri.toString()}: ${error.code} - ${error.message}`);
            }
            else {
                // Другие ошибки
                this.logger.error(`Error creating snapshot for file ${uri.toString()}`, error);
            }
        }
    }
    /**
     * Создает снапшот-маркер для удаленного файла.
     * Создает снапшот с metadata.deleted=true и пустым contentHash.
     *
     * @param uri URI удаленного файла
     */
    async createSnapshotForDeletedFile(uri) {
        try {
            // Для удаленного файла создаем снапшот-маркер с пустым содержимым
            const emptyContent = '';
            const snapshot = await this.historyManager.createSnapshot(uri, emptyContent, 'filesystem');
            // Обновляем снапшот, добавляя metadata.deleted=true
            // Для удаленного файла contentHash будет хешом пустой строки
            await this.historyManager.updateSnapshot(snapshot.id, {
                metadata: {
                    ...snapshot.metadata,
                    deleted: true
                }
            });
        }
        catch (error) {
            // Ошибки создания снапшота-маркера не должны прерывать работу VS Code
            this.logger.error(`Error creating snapshot marker for deleted file ${uri.toString()}`, error);
        }
    }
}
exports.FileSystemWatcher = FileSystemWatcher;
//# sourceMappingURL=FileSystemWatcher.js.map