import * as vscode from 'vscode';
import { LocalHistoryManager } from '../services/LocalHistoryManager';
import { Logger } from '../utils/logger';

/**
 * Command to delete a specific snapshot.
 * 
 * @param historyManager Local history manager
 * @param snapshotId ID of the snapshot to delete
 */
export async function deleteSnapshotCommand(
    historyManager: LocalHistoryManager,
    snapshotId: string | undefined
): Promise<void> {
    const logger = Logger.getInstance();

    if (!snapshotId) {
        vscode.window.showErrorMessage('No snapshot selected.');
        return;
    }

    // 1. Confirm with user
    const choice = await vscode.window.showWarningMessage(
        'Are you sure you want to delete this snapshot?',
        { modal: true },
        'Delete',
        'Cancel'
    );

    if (choice !== 'Delete') {
        return;
    }

    try {
        await historyManager.deleteSnapshot(snapshotId);
        logger.info(`Snapshot deleted: ${snapshotId}`);
        vscode.window.showInformationMessage('Snapshot deleted successfully.');
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to delete snapshot ${snapshotId}`, error);
        vscode.window.showErrorMessage(`Failed to delete snapshot: ${errorMessage}`);
    }
}

