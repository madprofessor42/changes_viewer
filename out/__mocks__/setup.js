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
    Uri: class {
        static file(path) {
            return new mockVscode.Uri(path);
        }
        constructor(fsPath) {
            this.fsPath = fsPath;
        }
        toString() {
            return `file://${this.fsPath}`;
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