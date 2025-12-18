import * as vscode from 'vscode';

/**
 * Сервис для чтения и валидации настроек расширения из VS Code Settings.
 * Предоставляет типизированные методы для получения настроек с значениями по умолчанию.
 */
export class ConfigurationService {
    private readonly configSection = 'changes-viewer';
    private config: vscode.WorkspaceConfiguration;

    // Значения по умолчанию
    private static readonly DEFAULT_TYPING_DEBOUNCE = 2000; // мс
    private static readonly DEFAULT_FILESYSTEM_DEBOUNCE = 1000; // мс
    private static readonly DEFAULT_MAX_SNAPSHOTS_PER_FILE = 100;
    private static readonly DEFAULT_MAX_STORAGE_SIZE = 524288000; // 500 MB в байтах
    private static readonly DEFAULT_TTL_DAYS = 90;
    private static readonly DEFAULT_MAX_FILE_SIZE = 52428800; // 50 MB в байтах

    constructor() {
        this.config = vscode.workspace.getConfiguration(this.configSection);
    }

    /**
     * Возвращает debounce для typing (задержка перед созданием снапшота при вводе текста).
     * @returns Debounce в миллисекундах (по умолчанию 2000 мс)
     */
    getTypingDebounce(): number {
        const value = this.config.get<number>('typingDebounce', ConfigurationService.DEFAULT_TYPING_DEBOUNCE);
        return this.validatePositiveNumber(value, ConfigurationService.DEFAULT_TYPING_DEBOUNCE, 'typingDebounce');
    }

    /**
     * Возвращает debounce для FileSystemWatcher (задержка перед созданием снапшота при изменении файла).
     * @returns Debounce в миллисекундах (по умолчанию 1000 мс)
     */
    getFileSystemDebounce(): number {
        const value = this.config.get<number>('fileSystemDebounce', ConfigurationService.DEFAULT_FILESYSTEM_DEBOUNCE);
        return this.validatePositiveNumber(value, ConfigurationService.DEFAULT_FILESYSTEM_DEBOUNCE, 'fileSystemDebounce');
    }

    /**
     * Возвращает максимальное количество снапшотов на файл.
     * @returns Максимальное количество (по умолчанию 100)
     */
    getMaxSnapshotsPerFile(): number {
        const value = this.config.get<number>('maxSnapshotsPerFile', ConfigurationService.DEFAULT_MAX_SNAPSHOTS_PER_FILE);
        return this.validatePositiveNumber(value, ConfigurationService.DEFAULT_MAX_SNAPSHOTS_PER_FILE, 'maxSnapshotsPerFile');
    }

    /**
     * Возвращает максимальный размер хранилища в байтах.
     * @returns Максимальный размер в байтах (по умолчанию 500 MB)
     */
    getMaxStorageSize(): number {
        const value = this.config.get<number>('maxStorageSize', ConfigurationService.DEFAULT_MAX_STORAGE_SIZE);
        return this.validatePositiveNumber(value, ConfigurationService.DEFAULT_MAX_STORAGE_SIZE, 'maxStorageSize');
    }

    /**
     * Возвращает TTL (Time To Live) в днях - срок хранения снапшотов.
     * @returns TTL в днях (по умолчанию 90)
     */
    getTTLDays(): number {
        const value = this.config.get<number>('ttlDays', ConfigurationService.DEFAULT_TTL_DAYS);
        return this.validatePositiveNumber(value, ConfigurationService.DEFAULT_TTL_DAYS, 'ttlDays');
    }

    /**
     * Возвращает максимальный размер файла для создания снапшота в байтах.
     * @returns Максимальный размер файла в байтах (по умолчанию 50 MB)
     */
    getMaxFileSize(): number {
        const value = this.config.get<number>('maxFileSize', ConfigurationService.DEFAULT_MAX_FILE_SIZE);
        return this.validatePositiveNumber(value, ConfigurationService.DEFAULT_MAX_FILE_SIZE, 'maxFileSize');
    }

    /**
     * Подписка на изменения настроек.
     * @param callback Функция, которая будет вызвана при изменении настроек
     * @returns Disposable для отмены подписки
     */
    onDidChangeConfiguration(callback: () => void): vscode.Disposable {
        return vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration(this.configSection)) {
                // Обновляем конфигурацию при изменении
                this.config = vscode.workspace.getConfiguration(this.configSection);
                callback();
            }
        });
    }

    /**
     * Валидирует, что значение является положительным числом.
     * Если значение невалидно, возвращает значение по умолчанию и логирует предупреждение.
     * @param value Значение для валидации
     * @param defaultValue Значение по умолчанию
     * @param settingName Имя настройки для логирования
     * @returns Валидное положительное число
     */
    private validatePositiveNumber(value: number | undefined, defaultValue: number, settingName: string): number {
        if (value === undefined || value === null) {
            return defaultValue;
        }

        if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
            console.warn(`Invalid value for setting ${this.configSection}.${settingName}: ${value}. Using default: ${defaultValue}`);
            return defaultValue;
        }

        if (value <= 0) {
            console.warn(`Invalid value for setting ${this.configSection}.${settingName}: ${value} (must be positive). Using default: ${defaultValue}`);
            return defaultValue;
        }

        return value;
    }
}
