import * as vscode from 'vscode';
import { LocalHistoryManager } from '../services/LocalHistoryManager';
import { StorageService } from '../services/StorageService';
import { restoreCommand } from './restoreCommand';
import { Logger } from '../utils/logger';

/**
 * Command to discard all changes for a file, reverting to the last accepted snapshot (or base).
 * This deletes all intermediate snapshots and reverts the file.
 * 
 * @param historyManager Local history manager
 * @param storageService Storage service
 * @param fileUri URI of the file
 */
export async function discardAllChangesCommand(
    historyManager: LocalHistoryManager,
    storageService: StorageService,
    fileUri: vscode.Uri | undefined
): Promise<void> {
    const logger = Logger.getInstance();

    if (!fileUri) {
        vscode.window.showErrorMessage('No file selected.');
        return;
    }

    try {
        // 1. Get all snapshots for the file
        const snapshots = await historyManager.getSnapshotsForFile(fileUri);
        
        if (snapshots.length === 0) {
            vscode.window.showInformationMessage('No snapshots found to revert to.');
            return;
        }

        // 2. Identify target snapshot (last stable: accepted or base/oldest)
        // Snapshots are sorted by timestamp desc (newest first).
        const lastAcceptedSnapshot = snapshots.find(s => s.accepted);
        const targetSnapshot = lastAcceptedSnapshot || snapshots[snapshots.length - 1]; // Fallback to base (oldest)

        // 3. Identify snapshots to delete (all intermediate snapshots newer than target)
        // Since snapshots are sorted desc, these are all snapshots BEFORE target in the array.
        const targetIndex = snapshots.findIndex(s => s.id === targetSnapshot.id);
        if (targetIndex === -1) {
             // Should not happen as we picked it from array
             logger.error('Target snapshot not found in list');
             return;
        }

        const snapshotsToDelete = snapshots.slice(0, targetIndex);
        
        const isApproved = !!lastAcceptedSnapshot;
        const versionLabel = isApproved ? 'last approved version' : 'base version';
        const timestamp = new Date(targetSnapshot.timestamp).toLocaleString();
        const deletedCountText = snapshotsToDelete.length > 0 ? ` and delete ${snapshotsToDelete.length} intermediate snapshot(s)` : '';

        // 4. Confirm with user
        const choice = await vscode.window.showWarningMessage(
            `Discard all changes for "${vscode.workspace.asRelativePath(fileUri)}"?\n\nThis will revert the file to the ${versionLabel} (${timestamp})${deletedCountText}.`,
            { modal: true },
            'Discard Changes',
            'Cancel'
        );

        if (choice !== 'Discard Changes') {
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Discarding changes...",
            cancellable: false
        }, async (progress) => {

            // 5. Delete intermediate snapshots
            if (snapshotsToDelete.length > 0) {
                progress.report({ message: "Deleting intermediate snapshots..." });
                const idsToDelete = snapshotsToDelete.map(s => s.id);
                try {
                    await historyManager.deleteSnapshots(idsToDelete);
                } catch (error) {
                    logger.error('Failed to delete intermediate snapshots during discard', error);
                    // We continue with restore even if some deletions failed, 
                    // as the user intent is to revert.
                }
            }

            // 6. Restore file content
            progress.report({ message: "Restoring file..." });
            
            await restoreCommand(
                historyManager, 
                storageService, 
                targetSnapshot.id,
                {
                    skipConfirmation: true,
                    skipBackup: true, // Do not create a backup of the discarded state
                    ignoreUnsavedChanges: true // Discard unsaved changes in editor too
                }
            );
        });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to discard changes for file ${fileUri.fsPath}`, error);
        vscode.window.showErrorMessage(`Failed to discard changes: ${errorMessage}`);
    }
}
