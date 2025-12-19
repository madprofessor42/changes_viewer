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
    EventEmitter: class EventEmitter<T = any> {
        private listeners: Function[] = [];
        public event: (listener: (e: T) => any) => { dispose: () => void };
        
        constructor() {
            // VS Code EventEmitter использует паттерн, где event - это функция, которая регистрирует слушателя
            this.event = (listener: (e: T) => any) => {
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
        
        fire(data: T): void {
            // fire вызывает все зарегистрированные слушатели
            this.listeners.forEach(listener => {
                try {
                    listener(data);
                } catch (error) {
                    console.error('Error in event listener:', error);
                }
            });
        }
        
        dispose(): void {
            this.listeners = [];
        }
    },
    ThemeIcon: class ThemeIcon {
        constructor(public id: string) {}
    },
    Uri: class {
        static file(path: string) {
            return new mockVscode.Uri(path);
        }
        static parse(uri: string) {
            return new mockVscode.Uri(uri.replace('file://', ''));
        }
        constructor(public fsPath: string) {
            // Определяем схему на основе пути
            if (fsPath.startsWith('file://') || !fsPath.includes('://')) {
                this.scheme = 'file';
            } else {
                const parts = fsPath.split('://');
                this.scheme = parts[0];
            }
        }
        scheme: string = 'file';
        toString() {
            return `file://${this.fsPath}`;
        }
    },
    workspace: {
        getConfiguration: (section?: string) => {
            // Возвращаем мок конфигурации с значениями по умолчанию
            return {
                get: <T>(key: string, defaultValue: T): T => {
                    return defaultValue;
                }
            };
        },
        onDidChangeConfiguration: () => {
            return { dispose: () => {} };
        },
        onDidChangeTextDocument: (callback: (event: any) => void) => {
            // Возвращаем мок disposable для onDidChangeTextDocument
            return { dispose: () => {} };
        },
        onDidSaveTextDocument: (callback: (document: any) => void) => {
            // Возвращаем мок disposable для onDidSaveTextDocument
            return { dispose: () => {} };
        },
        createFileSystemWatcher: (pattern: string | any) => {
            // Возвращаем мок FileSystemWatcher
            return {
                onDidChange: (callback: (uri: any) => void) => {
                    return { dispose: () => {} };
                },
                onDidCreate: (callback: (uri: any) => void) => {
                    return { dispose: () => {} };
                },
                onDidDelete: (callback: (uri: any) => void) => {
                    return { dispose: () => {} };
                },
                dispose: () => {}
            };
        },
        fs: {
            readFile: async (uri: any): Promise<Buffer> => {
                // По умолчанию возвращаем пустой буфер
                // Тесты могут переопределить это поведение
                return Buffer.from('', 'utf8');
            },
            stat: async (uri: any): Promise<any> => {
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
        showErrorMessage: async (message: string) => {
            // Мок для showErrorMessage - можно переопределить в тестах
            return undefined;
        },
        showInformationMessage: async (message: string) => {
            // Мок для showInformationMessage - можно переопределить в тестах
            return undefined;
        },
        showWarningMessage: async (message: string) => {
            // Мок для showWarningMessage - можно переопределить в тестах
            return undefined;
        },
        createOutputChannel: (name: string) => {
            // Мок для createOutputChannel
            return {
                name: name,
                append: (value: string) => {},
                appendLine: (value: string) => {},
                clear: () => {},
                show: (preserveFocus?: boolean) => {},
                hide: () => {},
                dispose: () => {}
            };
        }
    },
    env: {
        clipboard: {
            writeText: async (text: string) => {
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
        static FileNotFound(uri: any): FileSystemError {
            const error = new FileSystemError(`File not found: ${uri}`);
            (error as any).code = 'FileNotFound';
            return error;
        }
        static PermissionDenied(uri: any): FileSystemError {
            const error = new FileSystemError(`Permission denied: ${uri}`);
            (error as any).code = 'PermissionDenied';
            return error;
        }
        code?: string;
    },
    CancellationTokenSource: class CancellationTokenSource {
        private _isCancelled: boolean = false;
        
        get token(): any {
            const self = this;
            return {
                get isCancellationRequested() { return self._isCancelled; },
                onCancellationRequested: () => ({ dispose: () => {} })
            };
        }
        
        cancel(): void {
            this._isCancelled = true;
        }
        
        dispose(): void {
            this._isCancelled = false;
        }
    }
};

// Устанавливаем мок в require cache
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id: string) {
    if (id === 'vscode') {
        return mockVscode;
    }
    return originalRequire.apply(this, arguments);
};
