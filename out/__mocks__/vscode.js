"use strict";
/**
 * Мок для модуля vscode для тестирования вне Extension Host
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Uri = exports.ExtensionMode = void 0;
var ExtensionMode;
(function (ExtensionMode) {
    ExtensionMode[ExtensionMode["Production"] = 1] = "Production";
    ExtensionMode[ExtensionMode["Development"] = 2] = "Development";
    ExtensionMode[ExtensionMode["Test"] = 3] = "Test";
})(ExtensionMode || (exports.ExtensionMode = ExtensionMode = {}));
class Uri {
    static file(path) {
        return new Uri(path);
    }
    constructor(fsPath) {
        this.fsPath = fsPath;
    }
    toString() {
        return `file://${this.fsPath}`;
    }
}
exports.Uri = Uri;
//# sourceMappingURL=vscode.js.map