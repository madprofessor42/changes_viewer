import * as vscode from 'vscode';
import { CleanupService } from '../services/CleanupService';
import { Logger } from '../utils/logger';

/**
 * Command to delete ALL snapshots.
 * This is a destructive operation that clears the entire history.
 * 
 * @param cleanupService Cleanup service
 */
export async function deleteAllSnapshotsCommand(
    cleanupService: CleanupService
): Promise<void> {
    const logger = Logger.getInstance();
    
    // 1. Confirm with user
    const choice = await vscode.window.showWarningMessage(
        'Are you sure you want to delete ALL snapshots? This action cannot be undone.',
        { modal: true },
        'Delete All',
        'Cancel'
    );

    if (choice !== 'Delete All') {
        return;
    }

    logger.info('Delete all snapshots command started');

    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Deleting all snapshots...",
            cancellable: false
        }, async () => {
             const deletedCount = await cleanupService.deleteAllSnapshots();
             logger.info(`Deleted ${deletedCount} snapshots.`);
             vscode.window.showInformationMessage(`Successfully deleted ${deletedCount} snapshots.`);
        });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error in deleteAllSnapshotsCommand', error);
        vscode.window.showErrorMessage(`Failed to delete snapshots: ${errorMessage}`);
    }
}

