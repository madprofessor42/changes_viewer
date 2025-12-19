import * as vscode from 'vscode';

/**
 * Уровни логирования
 */
export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR'
}

/**
 * Класс для логирования в Output Channel VS Code.
 * Поддерживает уровни логирования и форматирование с временными метками.
 */
export class Logger {
    private static instance: Logger | undefined;
    private outputChannel: vscode.OutputChannel | undefined;
    private enableVerboseLogging: boolean = false;
    private configService: (() => boolean) | undefined;

    private constructor() {
        // Приватный конструктор для singleton
    }

    /**
     * Получает экземпляр Logger (singleton).
     * @returns Экземпляр Logger
     */
    static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    /**
     * Инициализирует Logger с функцией для получения настройки детального логирования.
     * @param getEnableVerboseLogging Функция для получения настройки enableVerboseLogging
     */
    initialize(getEnableVerboseLogging: () => boolean): void {
        this.configService = getEnableVerboseLogging;
        this.updateVerboseLogging();
    }

    /**
     * Обновляет значение enableVerboseLogging из конфигурации.
     */
    updateVerboseLogging(): void {
        if (this.configService) {
            this.enableVerboseLogging = this.configService();
        }
    }

    /**
     * Получает или создает Output Channel.
     * @returns Output Channel
     */
    private getOutputChannel(): vscode.OutputChannel {
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
    private formatMessage(level: LogLevel, message: string): string {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level}] ${message}`;
    }

    /**
     * Записывает сообщение в Output Channel.
     * @param level Уровень логирования
     * @param message Сообщение
     * @param showChannel Показывать ли Output Channel (по умолчанию false)
     */
    private log(level: LogLevel, message: string, showChannel: boolean = false): void {
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
    debug(message: string): void {
        this.log(LogLevel.DEBUG, message);
    }

    /**
     * Логирует INFO сообщение.
     * @param message Сообщение для логирования
     */
    info(message: string): void {
        this.log(LogLevel.INFO, message);
    }

    /**
     * Логирует WARN сообщение с опциональной информацией об ошибке.
     * @param message Сообщение для логирования
     * @param error Опциональный объект ошибки
     */
    warn(message: string, error?: Error | unknown): void {
        let warnMessage = message;
        
        if (error) {
            if (error instanceof Error) {
                warnMessage += `: ${error.message}`;
                if (error.stack) {
                    warnMessage += `\n${error.stack}`;
                }
            } else {
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
    error(message: string, error?: Error | unknown): void {
        let errorMessage = message;
        
        if (error) {
            if (error instanceof Error) {
                errorMessage += `: ${error.message}`;
                if (error.stack) {
                    errorMessage += `\n${error.stack}`;
                }
            } else {
                errorMessage += `: ${String(error)}`;
            }
        }
        
        this.log(LogLevel.ERROR, errorMessage);
    }

    /**
     * Показывает Output Channel пользователю.
     */
    showOutputChannel(): void {
        const channel = this.getOutputChannel();
        channel.show(true);
    }
}
