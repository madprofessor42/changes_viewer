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
exports.deleteSnapshotCommand = deleteSnapshotCommand;
const vscode = __importStar(require("vscode"));
const logger_1 = require("../utils/logger");
/**
 * Command to delete a specific snapshot.
 *
 * @param historyManager Local history manager
 * @param snapshotId ID of the snapshot to delete
 */
async function deleteSnapshotCommand(historyManager, snapshotId) {
    const logger = logger_1.Logger.getInstance();
    if (!snapshotId) {
        vscode.window.showErrorMessage('No snapshot selected.');
        return;
    }
    // 1. Confirm with user
    const choice = await vscode.window.showWarningMessage('Are you sure you want to delete this snapshot?', { modal: true }, 'Delete', 'Cancel');
    if (choice !== 'Delete') {
        return;
    }
    try {
        await historyManager.deleteSnapshot(snapshotId);
        logger.info(`Snapshot deleted: ${snapshotId}`);
        vscode.window.showInformationMessage('Snapshot deleted successfully.');
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to delete snapshot ${snapshotId}`, error);
        vscode.window.showErrorMessage(`Failed to delete snapshot: ${errorMessage}`);
    }
}
//# sourceMappingURL=deleteSnapshotCommand.js.map