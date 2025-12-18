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
    Uri: class {
        static file(path: string) {
            return new mockVscode.Uri(path);
        }
        constructor(public fsPath: string) {}
        toString() {
            return `file://${this.fsPath}`;
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
