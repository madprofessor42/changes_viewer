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
exports.deleteAllSnapshotsCommand = deleteAllSnapshotsCommand;
const vscode = __importStar(require("vscode"));
const logger_1 = require("../utils/logger");
/**
 * Command to delete ALL snapshots.
 * This is a destructive operation that clears the entire history.
 *
 * @param cleanupService Cleanup service
 */
async function deleteAllSnapshotsCommand(cleanupService) {
    const logger = logger_1.Logger.getInstance();
    // 1. Confirm with user
    const choice = await vscode.window.showWarningMessage('Are you sure you want to delete ALL snapshots? This action cannot be undone.', { modal: true }, 'Delete All', 'Cancel');
    if (choice !== 'Delete All') {
        return;
    }
    logger.info('Delete all snapshots command started');
    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Deleting all snapshots...",
            cancellable: false
        }, async () => {
            const deletedCount = await cleanupService.deleteAllSnapshots();
            logger.info(`Deleted ${deletedCount} snapshots.`);
            vscode.window.showInformationMessage(`Successfully deleted ${deletedCount} snapshots.`);
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error in deleteAllSnapshotsCommand', error);
        vscode.window.showErrorMessage(`Failed to delete snapshots: ${errorMessage}`);
    }
}
//# sourceMappingURL=deleteAllSnapshotsCommand.js.map