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
exports.approveAllChangesCommand = approveAllChangesCommand;
const vscode = __importStar(require("vscode"));
const logger_1 = require("../utils/logger");
const diff_1 = require("../utils/diff");
/**
 * Command to approve (accept) all changes for a specific file.
 * This marks the latest snapshot as accepted and removes all intermediate unaccepted snapshots.
 * effectively "squashing" the changes into a single approved entry.
 *
 * @param historyManager History manager
 * @param storageService Storage service
 * @param fileUri URI of the file to approve
 * @param options Optional parameters
 * @param inlineDiffService Optional InlineDiffService to update active diff views
 */
async function approveAllChangesCommand(historyManager, storageService, fileUri, options, inlineDiffService) {
    const logger = logger_1.Logger.getInstance();
    if (!fileUri) {
        if (!options?.silent) {
            logger.warn('ApproveAllChanges command called without fileUri');
        }
        return;
    }
    logger.info(`ApproveAllChanges command started for file: ${fileUri.fsPath}`);
    try {
        // 1. Get all snapshots
        const snapshots = await historyManager.getSnapshotsForFile(fileUri);
        if (snapshots.length === 0) {
            if (!options?.silent) {
                vscode.window.showInformationMessage('No changes to approve.');
            }
            return;
        }
        // 2. Identify snapshots to squash
        // We look for the sequence of unaccepted snapshots starting from the top (newest).
        // If the newest snapshot is already accepted, there is nothing to approve.
        if (snapshots[0].accepted) {
            if (!options?.silent) {
                vscode.window.showInformationMessage('All changes are already approved.');
            }
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
        let preservedBaseSnapshot;
        // NEW LOGIC: If no previously approved snapshot, preserve the oldest one as base
        if (lastApprovedIndex === -1 && snapshotsToDelete.length > 0) {
            // The last one is the oldest
            preservedBaseSnapshot = snapshotsToDelete[snapshotsToDelete.length - 1];
            // Remove it from deletion list
            snapshotsToDelete.pop();
        }
        // 3. Confirm with user? (Implicitly requested by user: "Approve" button)
        // No confirmation dialog needed for now as it's an explicit action.
        const processApprove = async (progress) => {
            // 4. Delete intermediate snapshots
            if (snapshotsToDelete.length > 0) {
                progress?.report({ message: `Deleting ${snapshotsToDelete.length} intermediate snapshots...` });
                const idsToDelete = snapshotsToDelete.map(s => s.id);
                try {
                    await historyManager.deleteSnapshots(idsToDelete);
                }
                catch (error) {
                    logger.error('Failed to delete intermediate snapshots', error);
                    // Continue anyway to try to accept the latest one
                }
            }
            // 5. Recompute diff for the snapshot we keep
            // It should be compared against the last approved snapshot (if it exists)
            // or effectively be the "init" snapshot if no approved exists.
            let newDiffInfo = snapshotToKeep.diffInfo;
            // Determine the previous snapshot for diff calculation
            const previousSnapshotForDiff = lastApprovedIndex !== -1 ? snapshots[lastApprovedIndex] : preservedBaseSnapshot;
            if (previousSnapshotForDiff) {
                try {
                    progress?.report({ message: "Computing cumulative diff..." });
                    // Get content of snapshotToKeep
                    const contentToKeep = await storageService.getSnapshotContent(snapshotToKeep.contentPath, snapshotToKeep.id, snapshotToKeep.metadata);
                    // Get content of previous snapshot
                    const contentPrevious = await storageService.getSnapshotContent(previousSnapshotForDiff.contentPath, previousSnapshotForDiff.id, previousSnapshotForDiff.metadata);
                    const calculatedDiff = (0, diff_1.computeDiff)(contentPrevious, contentToKeep);
                    newDiffInfo = {
                        ...calculatedDiff,
                        previousSnapshotId: previousSnapshotForDiff.id
                    };
                }
                catch (error) {
                    logger.error('Failed to recompute diff during approve', error);
                }
            }
            else {
                // No approved snapshot existed and no base preserved. This becomes the baseline.
                // It has no previous snapshot.
                newDiffInfo = undefined;
            }
            // 6. Update the kept snapshot
            progress?.report({ message: "Updating approved snapshot..." });
            try {
                await historyManager.updateSnapshot(snapshotToKeep.id, {
                    accepted: true,
                    acceptedTimestamp: Date.now(),
                    diffInfo: newDiffInfo
                });
                if (!options?.silent) {
                    vscode.window.showInformationMessage('Changes approved and squashed successfully.');
                }
                logger.info(`Approved and squashed snapshots for ${fileUri.fsPath}. Kept: ${snapshotToKeep.id}`);
                // 7. Update InlineDiffService if provided
                if (inlineDiffService) {
                    // Update the active diff session to use the new approved snapshot as base
                    // This will refresh the view and should show no differences (since current content == approved snapshot)
                    await inlineDiffService.openInlineDiffDocument(fileUri, snapshotToKeep.id);
                }
            }
            catch (error) {
                logger.error(`Failed to update snapshot ${snapshotToKeep.id}`, error);
                if (!options?.silent) {
                    vscode.window.showErrorMessage(`Failed to update snapshot: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        };
        if (options?.silent) {
            await processApprove();
        }
        else {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Approving and squashing changes...",
                cancellable: false
            }, processApprove);
        }
    }
    catch (error) {
        logger.error('Error in approveAllChangesCommand', error);
        if (!options?.silent) {
            vscode.window.showErrorMessage(`Failed to approve changes: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
//# sourceMappingURL=approveAllChangesCommand.js.map