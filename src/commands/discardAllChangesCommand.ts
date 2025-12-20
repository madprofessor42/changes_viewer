import * as vscode from 'vscode';
import { LocalHistoryManager } from '../services/LocalHistoryManager';
import { StorageService } from '../services/StorageService';
import { restoreCommand } from './restoreCommand';
import { Logger } from '../utils/logger';
import { computeDiff } from '../utils/diff';

/**
 * Command to discard all changes for a file, reverting to the last accepted snapshot (or base).
 * This squashes all intermediate changes into a single "discarded" snapshot and reverts the file.
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

        // 2. Identify snapshots
        // Find the latest accepted snapshot
        const lastAcceptedIndex = snapshots.findIndex(s => s.accepted);
        const lastAcceptedSnapshot = lastAcceptedIndex !== -1 ? snapshots[lastAcceptedIndex] : undefined;
        
        // Target snapshot to revert to (last accepted or oldest/base)
        // snapshots are sorted by timestamp desc (newest first), so oldest is last
        const targetSnapshot = lastAcceptedSnapshot || snapshots[snapshots.length - 1];
        
        // Unapproved snapshots to squash (all snapshots BEFORE the target)
        // Since sorted Newest -> Oldest, these are snapshots with index < targetIndex
        const targetIndex = lastAcceptedIndex !== -1 ? lastAcceptedIndex : snapshots.length - 1;
        const unapprovedSnapshots = snapshots.slice(0, targetIndex);

        if (unapprovedSnapshots.length === 0) {
            // Check if current file content differs from target
             // If file matches target, nothing to discard?
             // But we might have unsaved changes in editor.
             // restoreCommand handles dirty editor check.
        }

        const isApproved = !!lastAcceptedSnapshot;
        const versionLabel = isApproved ? 'last approved version' : 'base version';
        const timestamp = new Date(targetSnapshot.timestamp).toLocaleString();

        // 3. Confirm with user FIRST (before modifying history)
        const choice = await vscode.window.showWarningMessage(
            `Discard all changes for "${vscode.workspace.asRelativePath(fileUri)}"?\n\nThis will revert the file to the ${versionLabel} (${timestamp}) and move current changes to 'Discarded' state.`,
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

            // 4. Handle "Discarded" snapshot logic
            if (unapprovedSnapshots.length > 0) {
                const snapshotToKeep = unapprovedSnapshots[0]; // Newest unapproved
                const snapshotsToDelete = unapprovedSnapshots.slice(1); // Intermediates

                // Delete intermediate snapshots
                if (snapshotsToDelete.length > 0) {
                    progress.report({ message: "Squashing intermediate snapshots..." });
                    const idsToDelete = snapshotsToDelete.map(s => s.id);
                    try {
                        await historyManager.deleteSnapshots(idsToDelete);
                    } catch (error) {
                        logger.error('Failed to delete intermediate snapshots during discard', error);
                    }
                }

                // Update the kept snapshot to be "Discarded"
                progress.report({ message: "Marking changes as discarded..." });
                try {
                    // Recompute diff against target (Last Approved)
                    // This is similar to approve logic: diff(LastApproved, Discarded)
                    let newDiffInfo = snapshotToKeep.diffInfo;
                    
                    try {
                         const contentDiscarded = await storageService.getSnapshotContent(
                            snapshotToKeep.contentPath, 
                            snapshotToKeep.id, 
                            snapshotToKeep.metadata
                        );
                        
                        const contentTarget = await storageService.getSnapshotContent(
                            targetSnapshot.contentPath,
                            targetSnapshot.id,
                            targetSnapshot.metadata
                        );

                        const calculatedDiff = computeDiff(contentTarget, contentDiscarded);
                        newDiffInfo = { 
                            ...calculatedDiff, 
                            previousSnapshotId: targetSnapshot.id 
                        };
                    } catch (error) {
                        logger.warn('Failed to recompute diff for discarded snapshot', error);
                    }

                    await historyManager.updateSnapshot(snapshotToKeep.id, {
                        discarded: true,
                        accepted: false, // Ensure it's not accepted
                        diffInfo: newDiffInfo,
                        source: 'manual' // Maybe mark as manual to indicate explicit user action?
                    });
                } catch (error) {
                    logger.error(`Failed to update discarded snapshot ${snapshotToKeep.id}`, error);
                }
            } else {
                // If no unapproved snapshots exist (e.g. we edited file but haven't saved/debounced yet),
                // we might want to create a snapshot of current state as "Discarded".
                // restoreCommand usually does backup, but we want to mark it as discarded.
                
                // Let's create a snapshot manually if needed.
                // But for now, if there are no snapshots to squash, we assume there are no significant tracked changes to "save as discarded".
                // If the user has unsaved changes in editor, `restoreCommand` asks to Save or Discard.
                // If they Save, a snapshot is created.
                // If they Discard, changes are lost.
                
                // If we want to capture "Unsaved" changes as "Discarded" history, we would need to force save or read from editor.
                // But typically "Discard Changes" implies reverting to disk state.
                
                // Let's stick to handling existing snapshots.
            }

            // 5. Restore file content
            progress.report({ message: "Restoring file..." });
            
            await restoreCommand(
                historyManager, 
                storageService, 
                targetSnapshot.id,
                {
                    skipConfirmation: true,
                    skipBackup: true // We already handled history by squashing into "Discarded"
                }
            );
        });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to discard changes for file ${fileUri.fsPath}`, error);
        vscode.window.showErrorMessage(`Failed to discard changes: ${errorMessage}`);
    }
}
