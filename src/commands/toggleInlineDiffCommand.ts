import * as vscode from 'vscode';
import { InlineDiffService } from '../services/InlineDiffService';
import { Logger } from '../utils/logger';
import { LocalHistoryManager } from '../services/LocalHistoryManager';

/**
 * Toggle inline diff command.
 *
 * Two modes:
 * 1. Clicking on a snapshot: Shows diff between this snapshot and the previous snapshot
 *    - snapshotId is set, isSnapshotClick = true
 * 2. Clicking on a file in tree: Shows diff between current file and last approved/base snapshot
 *    - fileUriString is set, isSnapshotClick = false/undefined
 *
 * @param inlineDiffService - The inline diff service
 * @param snapshotId - The snapshot ID (for snapshot click mode)
 * @param fileUriString - The file URI string
 * @param historyManager - The history manager
 * @param isSnapshotClick - True if clicking on a snapshot item (show diff with previous snapshot)
 */
export async function toggleInlineDiffCommand(
    inlineDiffService: InlineDiffService,
    snapshotId?: string,
    fileUriString?: string,
    historyManager?: LocalHistoryManager,
    isSnapshotClick: boolean = false
): Promise<void> {
    const logger = Logger.getInstance();

    if (!snapshotId && !fileUriString) {
        logger.warn('ToggleInlineDiff command called without snapshotId or fileUri');
        return;
    }

    const editor = vscode.window.activeTextEditor;

    try {
        let targetSnapshotId = snapshotId;
        let baseSnapshotId: string | undefined;
        let targetFileUri: vscode.Uri | undefined;

        if (fileUriString) {
            targetFileUri = vscode.Uri.parse(fileUriString);
        } else if (editor) {
            targetFileUri = editor.document.uri;
        }

        if (!targetFileUri) {
             vscode.window.showErrorMessage('Could not determine file URI.');
             return;
        }

        if (isSnapshotClick && targetSnapshotId && historyManager) {
            // Mode 1: Clicking on a snapshot - show diff between this snapshot and previous snapshot
            const snapshots = await historyManager.getSnapshotsForFile(targetFileUri);
            
            // Check if the clicked snapshot is a "Restored" snapshot
            const clickedSnapshot = snapshots.find(s => s.id === targetSnapshotId);
            if (clickedSnapshot?.metadata?.restoredFrom) {
                // For a "Restored" snapshot, show the diff between:
                // - Base: the snapshot we restored FROM (restoredFrom)
                // - Target: the snapshot that existed BEFORE the restore operation
                
                const clickedIndex = snapshots.findIndex(s => s.id === targetSnapshotId);
                
                if (clickedIndex === -1) {
                    vscode.window.showErrorMessage('Restored snapshot not found in history.');
                    return;
                }
                
                // The snapshot BEFORE the restore is at index + 1 (newer snapshots are at lower indices)
                if (clickedIndex < snapshots.length - 1) {
                    // targetSnapshotId = snapshot before restore (the state we were in before restoring)
                    targetSnapshotId = snapshots[clickedIndex + 1].id;
                    // baseSnapshotId = snapshot we restored from (the old state we went back to)
                    baseSnapshotId = clickedSnapshot.metadata.restoredFrom;
                    
                    Logger.getInstance().debug(
                        `Showing restore diff: comparing snapshot ${targetSnapshotId} (before restore) ` +
                        `vs ${baseSnapshotId} (restored from)`
                    );
                } else {
                    // This restored snapshot is the oldest - nothing to compare
                    vscode.window.showInformationMessage('This is the oldest snapshot. No previous version to compare.');
                    return;
                }
            } else {
                // Not a restored snapshot - normal flow
                // Find the index of the target snapshot
                const targetIndex = snapshots.findIndex(s => s.id === targetSnapshotId);
                
                if (targetIndex === -1) {
                    vscode.window.showErrorMessage('Snapshot not found in history.');
                    return;
                }
                
                // The previous snapshot is at index + 1 (snapshots are sorted newest first)
                if (targetIndex < snapshots.length - 1) {
                    baseSnapshotId = snapshots[targetIndex + 1].id;
                } else {
                    // This is the oldest snapshot - no previous snapshot to compare
                    vscode.window.showInformationMessage('This is the oldest snapshot. No previous version to compare.');
                    return;
                }
            }
        } else if (!targetSnapshotId && targetFileUri && historyManager) {
            // Mode 2: Clicking on a file - show diff between current file and last approved/base
            const snapshots = await historyManager.getSnapshotsForFile(targetFileUri);
            
            // Find the last accepted snapshot
            const approvedSnapshot = snapshots.find(s => s.accepted);
            
            if (approvedSnapshot) {
                targetSnapshotId = approvedSnapshot.id;
            } else if (snapshots.length > 0) {
                 // Fallback: use the oldest snapshot as base if no approved one exists
                 targetSnapshotId = snapshots[snapshots.length - 1].id;
            } else {
                vscode.window.showInformationMessage('No history found for this file.');
                return;
            }
            // baseSnapshotId stays undefined - will compare current file vs targetSnapshotId
        }

        if (!targetSnapshotId) {
             vscode.window.showInformationMessage('Could not determine base snapshot for diff.');
             return;
        }

        await inlineDiffService.openInlineDiffDocument(targetFileUri, targetSnapshotId, baseSnapshotId);
    } catch (error) {
        logger.error('Error toggling inline diff', error);
        vscode.window.showErrorMessage(`Failed to toggle inline diff: ${error instanceof Error ? error.message : String(error)}`);
    }
}
