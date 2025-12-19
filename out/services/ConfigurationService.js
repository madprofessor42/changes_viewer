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
exports.ConfigurationService = void 0;
const vscode = __importStar(require("vscode"));
const logger_1 = require("../utils/logger");
/**
 * Сервис для чтения и валидации настроек расширения из VS Code Settings.
 * Предоставляет типизированные методы для получения настроек с значениями по умолчанию.
 */
class ConfigurationService {
    constructor() {
        this.configSection = 'changes-viewer';
        this.config = vscode.workspace.getConfiguration(this.configSection);
        this.logger = logger_1.Logger.getInstance();
    }
    /**
     * Возвращает debounce для typing (задержка перед созданием снапшота при вводе текста).
     * @returns Debounce в миллисекундах (по умолчанию 2000 мс)
     */
    getTypingDebounce() {
        const value = this.config.get('typingDebounce', ConfigurationService.DEFAULT_TYPING_DEBOUNCE);
        return this.validatePositiveNumber(value, ConfigurationService.DEFAULT_TYPING_DEBOUNCE, 'typingDebounce');
    }
    /**
     * Возвращает debounce для FileSystemWatcher (задержка перед созданием снапшота при изменении файла).
     * @returns Debounce в миллисекундах (по умолчанию 1000 мс)
     */
    getFileSystemDebounce() {
        const value = this.config.get('fileSystemDebounce', ConfigurationService.DEFAULT_FILESYSTEM_DEBOUNCE);
        return this.validatePositiveNumber(value, ConfigurationService.DEFAULT_FILESYSTEM_DEBOUNCE, 'fileSystemDebounce');
    }
    /**
     * Возвращает максимальное количество снапшотов на файл.
     * @returns Максимальное количество (по умолчанию 100)
     */
    getMaxSnapshotsPerFile() {
        const value = this.config.get('maxSnapshotsPerFile', ConfigurationService.DEFAULT_MAX_SNAPSHOTS_PER_FILE);
        return this.validatePositiveNumber(value, ConfigurationService.DEFAULT_MAX_SNAPSHOTS_PER_FILE, 'maxSnapshotsPerFile');
    }
    /**
     * Возвращает максимальный размер хранилища в байтах.
     * @returns Максимальный размер в байтах (по умолчанию 500 MB)
     */
    getMaxStorageSize() {
        const value = this.config.get('maxStorageSize', ConfigurationService.DEFAULT_MAX_STORAGE_SIZE);
        return this.validatePositiveNumber(value, ConfigurationService.DEFAULT_MAX_STORAGE_SIZE, 'maxStorageSize');
    }
    /**
     * Возвращает TTL (Time To Live) в днях - срок хранения снапшотов.
     * @returns TTL в днях (по умолчанию 90)
     */
    getTTLDays() {
        const value = this.config.get('ttlDays', ConfigurationService.DEFAULT_TTL_DAYS);
        return this.validatePositiveNumber(value, ConfigurationService.DEFAULT_TTL_DAYS, 'ttlDays');
    }
    /**
     * Возвращает максимальный размер файла для создания снапшота в байтах.
     * @returns Максимальный размер файла в байтах (по умолчанию 50 MB)
     */
    getMaxFileSize() {
        const value = this.config.get('maxFileSize', ConfigurationService.DEFAULT_MAX_FILE_SIZE);
        return this.validatePositiveNumber(value, ConfigurationService.DEFAULT_MAX_FILE_SIZE, 'maxFileSize');
    }
    /**
     * Возвращает, включено ли сжатие для больших файлов.
     * @returns true, если сжатие включено (по умолчанию true)
     */
    getEnableCompression() {
        const value = this.config.get('enableCompression', ConfigurationService.DEFAULT_ENABLE_COMPRESSION);
        return value === true;
    }
    /**
     * Возвращает пороговое значение размера файла в байтах для применения сжатия.
     * @returns Пороговое значение в байтах (по умолчанию 10 MB)
     */
    getCompressionThreshold() {
        const value = this.config.get('compressionThreshold', ConfigurationService.DEFAULT_COMPRESSION_THRESHOLD);
        return this.validatePositiveNumber(value, ConfigurationService.DEFAULT_COMPRESSION_THRESHOLD, 'compressionThreshold');
    }
    /**
     * Возвращает, включено ли детальное логирование (DEBUG уровень).
     * @returns true, если детальное логирование включено (по умолчанию false)
     */
    getEnableVerboseLogging() {
        const value = this.config.get('enableVerboseLogging', ConfigurationService.DEFAULT_ENABLE_VERBOSE_LOGGING);
        return value === true;
    }
    /**
     * Подписка на изменения настроек.
     * @param callback Функция, которая будет вызвана при изменении настроек
     * @returns Disposable для отмены подписки
     */
    onDidChangeConfiguration(callback) {
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
    validatePositiveNumber(value, defaultValue, settingName) {
        if (value === undefined || value === null) {
            return defaultValue;
        }
        if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
            this.logger.warn(`Invalid value for setting ${this.configSection}.${settingName}: ${value}. Using default: ${defaultValue}`);
            return defaultValue;
        }
        if (value <= 0) {
            this.logger.warn(`Invalid value for setting ${this.configSection}.${settingName}: ${value} (must be positive). Using default: ${defaultValue}`);
            return defaultValue;
        }
        return value;
    }
}
exports.ConfigurationService = ConfigurationService;
// Значения по умолчанию
ConfigurationService.DEFAULT_TYPING_DEBOUNCE = 2000; // мс
ConfigurationService.DEFAULT_FILESYSTEM_DEBOUNCE = 1000; // мс
ConfigurationService.DEFAULT_MAX_SNAPSHOTS_PER_FILE = 100;
ConfigurationService.DEFAULT_MAX_STORAGE_SIZE = 524288000; // 500 MB в байтах
ConfigurationService.DEFAULT_TTL_DAYS = 90;
ConfigurationService.DEFAULT_MAX_FILE_SIZE = 52428800; // 50 MB в байтах
ConfigurationService.DEFAULT_ENABLE_COMPRESSION = true;
ConfigurationService.DEFAULT_COMPRESSION_THRESHOLD = 10485760; // 10 MB в байтах
ConfigurationService.DEFAULT_ENABLE_VERBOSE_LOGGING = false;
//# sourceMappingURL=ConfigurationService.js.map