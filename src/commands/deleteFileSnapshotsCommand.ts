import * as vscode from 'vscode';
import { LocalHistoryManager } from '../services/LocalHistoryManager';
import { Logger } from '../utils/logger';

/**
 * Command to delete all snapshots for a specific file.
 * 
 * @param historyManager Local history manager
 * @param fileUri URI of the file
 */
export async function deleteFileSnapshotsCommand(
    historyManager: LocalHistoryManager,
    fileUri: vscode.Uri | undefined
): Promise<void> {
    const logger = Logger.getInstance();

    if (!fileUri) {
        vscode.window.showErrorMessage('No file selected.');
        return;
    }

    // 1. Confirm with user
    const choice = await vscode.window.showWarningMessage(
        `Are you sure you want to delete all snapshots for ${fileUri.fsPath}?`,
        { modal: true },
        'Delete All',
        'Cancel'
    );

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

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to delete snapshots for file ${fileUri.fsPath}`, error);
        vscode.window.showErrorMessage(`Failed to delete snapshots: ${errorMessage}`);
    }
}

