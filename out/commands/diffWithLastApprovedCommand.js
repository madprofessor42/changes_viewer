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
exports.diffWithLastApprovedCommand = diffWithLastApprovedCommand;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const fs = __importStar(require("fs/promises"));
const logger_1 = require("../utils/logger");
/**
 * Command to diff the current file content against the last approved (accepted) snapshot.
 *
 * @param historyManager History manager
 * @param storageService Storage service
 * @param fileUri URI of the file to diff
 */
async function diffWithLastApprovedCommand(historyManager, storageService, fileUri) {
    const logger = logger_1.Logger.getInstance();
    if (!fileUri) {
        logger.warn('DiffWithLastApproved command called without fileUri');
        return;
    }
    logger.info(`DiffWithLastApproved command started for file: ${fileUri.fsPath}`);
    try {
        // 1. Get all snapshots for the file
        const snapshots = await historyManager.getSnapshotsForFile(fileUri);
        if (snapshots.length === 0) {
            vscode.window.showInformationMessage('No history available for this file.');
            return;
        }
        // 2. Find the latest accepted snapshot
        const lastApprovedSnapshot = snapshots.find(s => s.accepted);
        let targetSnapshot = lastApprovedSnapshot;
        let snapshotLabel = '';
        if (!targetSnapshot) {
            // If no approved snapshot found, warn user and compare with the oldest snapshot
            // or just inform them.
            // User request: "show all changes that were made since last approve"
            // If never approved, show all changes since beginning?
            targetSnapshot = snapshots[snapshots.length - 1]; // Oldest snapshot
            snapshotLabel = 'First Snapshot (No Approved Version)';
            vscode.window.showInformationMessage('No approved version found. Showing changes since the first snapshot.');
        }
        else {
            const timestamp = new Date(targetSnapshot.timestamp).toLocaleString();
            snapshotLabel = `Last Approved (${timestamp})`;
        }
        if (!targetSnapshot) {
            // Should not happen given check above, but for safety
            return;
        }
        logger.debug(`Comparing against snapshot: ${targetSnapshot.id} (${snapshotLabel})`);
        // 3. Get snapshot content
        let snapshotContent;
        try {
            snapshotContent = await storageService.getSnapshotContent(targetSnapshot.contentPath, targetSnapshot.id, targetSnapshot.metadata);
        }
        catch (error) {
            logger.error(`Failed to load snapshot content: ${targetSnapshot.id}`, error);
            vscode.window.showErrorMessage(`Failed to load snapshot content: ${error instanceof Error ? error.message : String(error)}`);
            return;
        }
        // 4. Create temporary file for snapshot content
        const tempDir = os.tmpdir();
        const tempFileName = `changes-viewer-approved-${targetSnapshot.id}.txt`;
        const tempFilePath = path.join(tempDir, tempFileName);
        await fs.writeFile(tempFilePath, snapshotContent, 'utf8');
        const leftUri = vscode.Uri.file(tempFilePath);
        // 5. Open Diff Editor
        // Right side is the current file
        const rightUri = fileUri;
        const currentLabel = 'Current Version';
        await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, `${snapshotLabel} ↔ ${currentLabel}`);
        // Cleanup temp file after some time
        setTimeout(async () => {
            try {
                await fs.unlink(tempFilePath);
            }
            catch {
                // Ignore
            }
        }, 5000); // 5 seconds should be enough for VS Code to read it
    }
    catch (error) {
        logger.error('Error in diffWithLastApprovedCommand', error);
        vscode.window.showErrorMessage(`Failed to open diff: ${error instanceof Error ? error.message : String(error)}`);
    }
}
//# sourceMappingURL=diffWithLastApprovedCommand.js.map