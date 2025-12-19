"use strict";
/**
 * Настройка моков для тестирования
 */
// Мокируем модуль vscode перед импортом
const mockVscode = {
    ExtensionMode: {
        Production: 1,
        Development: 2,
        Test: 3
    },
    EventEmitter: class EventEmitter {
        constructor() {
            this.listeners = [];
            // VS Code EventEmitter использует паттерн, где event - это функция, которая регистрирует слушателя
            this.event = (listener) => {
                this.listeners.push(listener);
                return {
                    dispose: () => {
                        const index = this.listeners.indexOf(listener);
                        if (index >= 0) {
                            this.listeners.splice(index, 1);
                        }
                    }
                };
            };
        }
        fire(data) {
            // fire вызывает все зарегистрированные слушатели
            this.listeners.forEach(listener => {
                try {
                    listener(data);
                }
                catch (error) {
                    console.error('Error in event listener:', error);
                }
            });
        }
        dispose() {
            this.listeners = [];
        }
    },
    ThemeIcon: class ThemeIcon {
        constructor(id) {
            this.id = id;
        }
    },
    Uri: class {
        static file(path) {
            return new mockVscode.Uri(path);
        }
        static parse(uri) {
            return new mockVscode.Uri(uri.replace('file://', ''));
        }
        constructor(fsPath) {
            this.fsPath = fsPath;
            this.scheme = 'file';
            // Определяем схему на основе пути
            if (fsPath.startsWith('file://') || !fsPath.includes('://')) {
                this.scheme = 'file';
            }
            else {
                const parts = fsPath.split('://');
                this.scheme = parts[0];
            }
        }
        toString() {
            return `file://${this.fsPath}`;
        }
    },
    workspace: {
        getConfiguration: (section) => {
            // Возвращаем мок конфигурации с значениями по умолчанию
            return {
                get: (key, defaultValue) => {
                    return defaultValue;
                }
            };
        },
        onDidChangeConfiguration: () => {
            return { dispose: () => { } };
        },
        onDidChangeTextDocument: (callback) => {
            // Возвращаем мок disposable для onDidChangeTextDocument
            return { dispose: () => { } };
        },
        onDidSaveTextDocument: (callback) => {
            // Возвращаем мок disposable для onDidSaveTextDocument
            return { dispose: () => { } };
        },
        createFileSystemWatcher: (pattern) => {
            // Возвращаем мок FileSystemWatcher
            return {
                onDidChange: (callback) => {
                    return { dispose: () => { } };
                },
                onDidCreate: (callback) => {
                    return { dispose: () => { } };
                },
                onDidDelete: (callback) => {
                    return { dispose: () => { } };
                },
                dispose: () => { }
            };
        },
        fs: {
            readFile: async (uri) => {
                // По умолчанию возвращаем пустой буфер
                // Тесты могут переопределить это поведение
                return Buffer.from('', 'utf8');
            },
            stat: async (uri) => {
                // По умолчанию возвращаем фиктивную статистику
                return {
                    type: 1, // File
                    ctime: Date.now(),
                    mtime: Date.now(),
                    size: 0
                };
            }
        },
        workspaceFolders: [
            {
                uri: {
                    fsPath: '/workspace',
                    toString: () => 'file:///workspace',
                    scheme: 'file'
                }
            }
        ],
        textDocuments: [] // Массив открытых документов, тесты могут переопределить
    },
    window: {
        showErrorMessage: async (message) => {
            // Мок для showErrorMessage - можно переопределить в тестах
            return undefined;
        },
        showInformationMessage: async (message) => {
            // Мок для showInformationMessage - можно переопределить в тестах
            return undefined;
        },
        showWarningMessage: async (message) => {
            // Мок для showWarningMessage - можно переопределить в тестах
            return undefined;
        },
        createOutputChannel: (name) => {
            // Мок для createOutputChannel
            return {
                name: name,
                append: (value) => { },
                appendLine: (value) => { },
                clear: () => { },
                show: (preserveFocus) => { },
                hide: () => { },
                dispose: () => { }
            };
        }
    },
    env: {
        clipboard: {
            writeText: async (text) => {
                // Мок для clipboard.writeText - можно переопределить в тестах
                return Promise.resolve();
            },
            readText: async () => {
                // Мок для clipboard.readText - можно переопределить в тестах
                return Promise.resolve('');
            }
        }
    },
    FileSystemError: class FileSystemError extends Error {
        static FileNotFound(uri) {
            const error = new FileSystemError(`File not found: ${uri}`);
            error.code = 'FileNotFound';
            return error;
        }
        static PermissionDenied(uri) {
            const error = new FileSystemError(`Permission denied: ${uri}`);
            error.code = 'PermissionDenied';
            return error;
        }
    },
    CancellationTokenSource: class CancellationTokenSource {
        constructor() {
            this._isCancelled = false;
        }
        get token() {
            const self = this;
            return {
                get isCancellationRequested() { return self._isCancelled; },
                onCancellationRequested: () => ({ dispose: () => { } })
            };
        }
        cancel() {
            this._isCancelled = true;
        }
        dispose() {
            this._isCancelled = false;
        }
    }
};
// Устанавливаем мок в require cache
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
    if (id === 'vscode') {
        return mockVscode;
    }
    return originalRequire.apply(this, arguments);
};
//# sourceMappingURL=setup.js.map