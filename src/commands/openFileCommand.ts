import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

/**
 * Command to open a file in the editor.
 * 
 * @param fileUri URI of the file to open
 */
export async function openFileCommand(fileUri: vscode.Uri | undefined): Promise<void> {
    const logger = Logger.getInstance();

    if (!fileUri) {
        vscode.window.showErrorMessage('No file selected.');
        return;
    }

    try {
        await vscode.window.showTextDocument(fileUri, {
            preview: false // Open in a new tab, not preview mode (optional, but usually better for "Open" action)
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to open file ${fileUri.fsPath}`, error);
        vscode.window.showErrorMessage(`Failed to open file: ${errorMessage}`);
    }
}

