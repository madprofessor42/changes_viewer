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
exports.openFileCommand = openFileCommand;
const vscode = __importStar(require("vscode"));
const logger_1 = require("../utils/logger");
/**
 * Command to open a file in the editor.
 *
 * @param fileUri URI of the file to open
 */
async function openFileCommand(fileUri) {
    const logger = logger_1.Logger.getInstance();
    if (!fileUri) {
        vscode.window.showErrorMessage('No file selected.');
        return;
    }
    try {
        await vscode.window.showTextDocument(fileUri, {
            preview: false // Open in a new tab, not preview mode (optional, but usually better for "Open" action)
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to open file ${fileUri.fsPath}`, error);
        vscode.window.showErrorMessage(`Failed to open file: ${errorMessage}`);
    }
}
//# sourceMappingURL=openFileCommand.js.map