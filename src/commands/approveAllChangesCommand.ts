import * as vscode from 'vscode';
import { LocalHistoryManager } from '../services/LocalHistoryManager';
import { StorageService } from '../services/StorageService';
import { Logger } from '../utils/logger';
import { computeDiff } from '../utils/diff';

/**
 * Command to approve (accept) all changes for a specific file.
 * This marks the latest snapshot as accepted and removes all intermediate unaccepted snapshots.
 * effectively "squashing" the changes into a single approved entry.
 * 
 * @param historyManager History manager
 * @param storageService Storage service
 * @param fileUri URI of the file to approve
 */
export async function approveAllChangesCommand(
    historyManager: LocalHistoryManager,
    storageService: StorageService,
    fileUri?: vscode.Uri
): Promise<void> {
    const logger = Logger.getInstance();

    if (!fileUri) {
        logger.warn('ApproveAllChanges command called without fileUri');
        return;
    }

    logger.info(`ApproveAllChanges command started for file: ${fileUri.fsPath}`);

    try {
        // 1. Get all snapshots
        const snapshots = await historyManager.getSnapshotsForFile(fileUri);
        
        if (snapshots.length === 0) {
            vscode.window.showInformationMessage('No changes to approve.');
            return;
        }

        // 2. Identify snapshots to squash
        // We look for the sequence of unaccepted snapshots starting from the top (newest).
        // If the newest snapshot is already accepted, there is nothing to approve.
        if (snapshots[0].accepted) {
            vscode.window.showInformationMessage('All changes are already approved.');
            return;
        }

        const lastApprovedIndex = snapshots.findIndex(s => s.accepted);
        
        // Snapshots to be considered are those before the last approved one (or all if none approved)
        // Since snapshots are sorted new -> old, these are at the beginning of the array.
        const unapprovedSnapshots = lastApprovedIndex === -1 
            ? snapshots 
            : snapshots.slice(0, lastApprovedIndex);

        if (unapprovedSnapshots.length === 0) {
            // Should not happen given check above, but purely for safety
            return;
        }

        const snapshotToKeep = unapprovedSnapshots[0]; // The newest unapproved snapshot
        const snapshotsToDelete = unapprovedSnapshots.slice(1); // All older unapproved snapshots to squash
        
        // 3. Confirm with user? (Implicitly requested by user: "Approve" button)
        // No confirmation dialog needed for now as it's an explicit action.

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Approving and squashing changes...",
            cancellable: false
        }, async (progress) => {
            
            // 4. Delete intermediate snapshots
            if (snapshotsToDelete.length > 0) {
                progress.report({ message: `Deleting ${snapshotsToDelete.length} intermediate snapshots...` });
                const idsToDelete = snapshotsToDelete.map(s => s.id);
                try {
                    await historyManager.deleteSnapshots(idsToDelete);
                } catch (error) {
                    logger.error('Failed to delete intermediate snapshots', error);
                    // Continue anyway to try to accept the latest one
                }
            }

            // 5. Recompute diff for the snapshot we keep
            // It should be compared against the last approved snapshot (if it exists)
            // or effectively be the "init" snapshot if no approved exists.
            let newDiffInfo = snapshotToKeep.diffInfo;
            
            if (lastApprovedIndex !== -1) {
                const lastApproved = snapshots[lastApprovedIndex];
                try {
                    progress.report({ message: "Computing cumulative diff..." });
                    // Get content of snapshotToKeep
                    const contentToKeep = await storageService.getSnapshotContent(
                        snapshotToKeep.contentPath, 
                        snapshotToKeep.id, 
                        snapshotToKeep.metadata
                    );
                    
                    // Get content of lastApproved
                    const contentApproved = await storageService.getSnapshotContent(
                        lastApproved.contentPath,
                        lastApproved.id,
                        lastApproved.metadata
                    );

                    const calculatedDiff = computeDiff(contentApproved, contentToKeep);
                    newDiffInfo = { 
                        ...calculatedDiff, 
                        previousSnapshotId: lastApproved.id 
                    };
                } catch (error) {
                    logger.error('Failed to recompute diff during approve', error);
                    // Keep original diffInfo or maybe undefined? 
                    // Keeping original is probably safer than nothing, though it might be wrong (relative to deleted snapshot).
                    // But if we deleted the previous snapshot, the original diffInfo referring to it is also invalid/dangling.
                }
            } else {
                // No approved snapshot existed. This becomes the baseline.
                // It has no previous snapshot.
                newDiffInfo = undefined;
            }

            // 6. Update the kept snapshot
            progress.report({ message: "Updating approved snapshot..." });
            try {
                await historyManager.updateSnapshot(snapshotToKeep.id, {
                    accepted: true,
                    acceptedTimestamp: Date.now(),
                    diffInfo: newDiffInfo
                });
                
                vscode.window.showInformationMessage('Changes approved and squashed successfully.');
                logger.info(`Approved and squashed snapshots for ${fileUri.fsPath}. Kept: ${snapshotToKeep.id}`);
            } catch (error) {
                logger.error(`Failed to update snapshot ${snapshotToKeep.id}`, error);
                vscode.window.showErrorMessage(`Failed to update snapshot: ${error instanceof Error ? error.message : String(error)}`);
            }
        });

    } catch (error) {
        logger.error('Error in approveAllChangesCommand', error);
        vscode.window.showErrorMessage(`Failed to approve changes: ${error instanceof Error ? error.message : String(error)}`);
    }
}
