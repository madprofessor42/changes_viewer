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
exports.Logger = exports.LogLevel = void 0;
const vscode = __importStar(require("vscode"));
/**
 * Уровни логирования
 */
var LogLevel;
(function (LogLevel) {
    LogLevel["DEBUG"] = "DEBUG";
    LogLevel["INFO"] = "INFO";
    LogLevel["WARN"] = "WARN";
    LogLevel["ERROR"] = "ERROR";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
/**
 * Класс для логирования в Output Channel VS Code.
 * Поддерживает уровни логирования и форматирование с временными метками.
 */
class Logger {
    constructor() {
        this.enableVerboseLogging = false;
        // Приватный конструктор для singleton
    }
    /**
     * Получает экземпляр Logger (singleton).
     * @returns Экземпляр Logger
     */
    static getInstance() {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }
    /**
     * Инициализирует Logger с функцией для получения настройки детального логирования.
     * @param getEnableVerboseLogging Функция для получения настройки enableVerboseLogging
     */
    initialize(getEnableVerboseLogging) {
        this.configService = getEnableVerboseLogging;
        this.updateVerboseLogging();
    }
    /**
     * Обновляет значение enableVerboseLogging из конфигурации.
     */
    updateVerboseLogging() {
        if (this.configService) {
            this.enableVerboseLogging = this.configService();
        }
    }
    /**
     * Получает или создает Output Channel.
     * @returns Output Channel
     */
    getOutputChannel() {
        if (!this.outputChannel) {
            this.outputChannel = vscode.window.createOutputChannel('Changes Viewer');
        }
        return this.outputChannel;
    }
    /**
     * Форматирует сообщение лога с временной меткой и уровнем.
     * @param level Уровень логирования
     * @param message Сообщение
     * @returns Отформатированное сообщение
     */
    formatMessage(level, message) {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level}] ${message}`;
    }
    /**
     * Записывает сообщение в Output Channel.
     * @param level Уровень логирования
     * @param message Сообщение
     * @param showChannel Показывать ли Output Channel (по умолчанию false)
     */
    log(level, message, showChannel = false) {
        // Обновляем настройку перед логированием (на случай изменения настроек)
        this.updateVerboseLogging();
        // DEBUG логируется только если enableVerboseLogging = true
        if (level === LogLevel.DEBUG && !this.enableVerboseLogging) {
            return;
        }
        const formattedMessage = this.formatMessage(level, message);
        const channel = this.getOutputChannel();
        channel.appendLine(formattedMessage);
        if (showChannel) {
            channel.show(true);
        }
    }
    /**
     * Логирует DEBUG сообщение (только если enableVerboseLogging = true).
     * @param message Сообщение для логирования
     */
    debug(message) {
        this.log(LogLevel.DEBUG, message);
    }
    /**
     * Логирует INFO сообщение.
     * @param message Сообщение для логирования
     */
    info(message) {
        this.log(LogLevel.INFO, message);
    }
    /**
     * Логирует WARN сообщение с опциональной информацией об ошибке.
     * @param message Сообщение для логирования
     * @param error Опциональный объект ошибки
     */
    warn(message, error) {
        let warnMessage = message;
        if (error) {
            if (error instanceof Error) {
                warnMessage += `: ${error.message}`;
                if (error.stack) {
                    warnMessage += `\n${error.stack}`;
                }
            }
            else {
                warnMessage += `: ${String(error)}`;
            }
        }
        this.log(LogLevel.WARN, warnMessage);
    }
    /**
     * Логирует ERROR сообщение с полным stack trace.
     * @param message Сообщение для логирования
     * @param error Опциональный объект ошибки
     */
    error(message, error) {
        let errorMessage = message;
        if (error) {
            if (error instanceof Error) {
                errorMessage += `: ${error.message}`;
                if (error.stack) {
                    errorMessage += `\n${error.stack}`;
                }
            }
            else {
                errorMessage += `: ${String(error)}`;
            }
        }
        this.log(LogLevel.ERROR, errorMessage);
    }
    /**
     * Показывает Output Channel пользователю.
     */
    showOutputChannel() {
        const channel = this.getOutputChannel();
        channel.show(true);
    }
}
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map