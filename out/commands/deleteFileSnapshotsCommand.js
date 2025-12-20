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
exports.deleteFileSnapshotsCommand = deleteFileSnapshotsCommand;
const vscode = __importStar(require("vscode"));
const logger_1 = require("../utils/logger");
/**
 * Command to delete all snapshots for a specific file.
 *
 * @param historyManager Local history manager
 * @param fileUri URI of the file
 */
async function deleteFileSnapshotsCommand(historyManager, fileUri) {
    const logger = logger_1.Logger.getInstance();
    if (!fileUri) {
        vscode.window.showErrorMessage('No file selected.');
        return;
    }
    // 1. Confirm with user
    const choice = await vscode.window.showWarningMessage(`Are you sure you want to delete all snapshots for ${fileUri.fsPath}?`, { modal: true }, 'Delete All', 'Cancel');
    if (choice !== 'Delete All') {
        return;
    }
    try {
        // Get all snapshots for the file
        const snapshots = await historyManager.getSnapshotsForFile(fileUri);
        if (snapshots.length === 0) {
            vscode.window.showInformationMessage('No snapshots found for this file.');
            return;
        }
        const snapshotIds = snapshots.map(s => s.id);
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Deleting snapshots...",
            cancellable: false
        }, async () => {
            await historyManager.deleteSnapshots(snapshotIds);
            logger.info(`Deleted ${snapshotIds.length} snapshots for file: ${fileUri.fsPath}`);
            vscode.window.showInformationMessage(`Successfully deleted ${snapshotIds.length} snapshots.`);
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to delete snapshots for file ${fileUri.fsPath}`, error);
        vscode.window.showErrorMessage(`Failed to delete snapshots: ${errorMessage}`);
    }
}
//# sourceMappingURL=deleteFileSnapshotsCommand.js.map