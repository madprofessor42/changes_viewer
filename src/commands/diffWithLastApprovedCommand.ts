import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { LocalHistoryManager } from '../services/LocalHistoryManager';
import { StorageService } from '../services/StorageService';
import { Logger } from '../utils/logger';

/**
 * Command to diff the current file content against the last approved (accepted) snapshot.
 * 
 * @param historyManager History manager
 * @param storageService Storage service
 * @param fileUri URI of the file to diff
 */
export async function diffWithLastApprovedCommand(
    historyManager: LocalHistoryManager,
    storageService: StorageService,
    fileUri?: vscode.Uri
): Promise<void> {
    const logger = Logger.getInstance();

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
        } else {
            const timestamp = new Date(targetSnapshot.timestamp).toLocaleString();
            snapshotLabel = `Last Approved (${timestamp})`;
        }

        if (!targetSnapshot) {
             // Should not happen given check above, but for safety
             return;
        }

        logger.debug(`Comparing against snapshot: ${targetSnapshot.id} (${snapshotLabel})`);

        // 3. Get snapshot content
        let snapshotContent: string;
        try {
            snapshotContent = await storageService.getSnapshotContent(
                targetSnapshot.contentPath, 
                targetSnapshot.id, 
                targetSnapshot.metadata
            );
        } catch (error) {
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

        await vscode.commands.executeCommand(
            'vscode.diff',
            leftUri,
            rightUri,
            `${snapshotLabel} ↔ ${currentLabel}`
        );

        // Cleanup temp file after some time
        setTimeout(async () => {
            try {
                await fs.unlink(tempFilePath);
            } catch {
                // Ignore
            }
        }, 5000); // 5 seconds should be enough for VS Code to read it

    } catch (error) {
        logger.error('Error in diffWithLastApprovedCommand', error);
        vscode.window.showErrorMessage(`Failed to open diff: ${error instanceof Error ? error.message : String(error)}`);
    }
}

