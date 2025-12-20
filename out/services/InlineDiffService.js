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
exports.InlineDiffService = void 0;
const vscode = __importStar(require("vscode"));
const diff_1 = require("../utils/diff");
const logger_1 = require("../utils/logger");
class InlineDiffService {
    constructor(storageService, historyManager) {
        this.storageService = storageService;
        this.historyManager = historyManager;
        this.sessions = new Map();
        this._onDidChangeCodeLenses = new vscode.EventEmitter();
        this.onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
        // TextDocumentContentProvider event
        this._onDidChange = new vscode.EventEmitter();
        this.onDidChange = this._onDidChange.event;
        // Map to store diff state (original file and snapshot ID) by virtual URI string
        this.resourceState = new Map();
        this.addedDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(0, 255, 0, 0.1)',
            isWholeLine: true,
            overviewRulerColor: 'green',
            overviewRulerLane: vscode.OverviewRulerLane.Left
        });
        this.deletedDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 0, 0, 0.15)', // Red background for deleted lines
            isWholeLine: true,
            textDecoration: 'line-through', // Strikethrough
            overviewRulerColor: 'red',
            overviewRulerLane: vscode.OverviewRulerLane.Left
        });
    }
    /**
     * Open inline diff document.
     * @param fileUri - URI of the file
     * @param snapshotId - The "newer" snapshot to compare
     * @param baseSnapshotId - The "older" snapshot to compare against. If undefined, compare against current file content.
     */
    async openInlineDiffDocument(fileUri, snapshotId, baseSnapshotId) {
        // Prevent recursive diffing: if input URI is already our virtual URI, resolve to original
        if (fileUri.scheme === 'changes-viewer') {
            const state = this.resourceState.get(fileUri.toString());
            if (state) {
                fileUri = state.originalUri;
            }
        }
        // Construct URI for virtual document with a different name
        // We add (Diff) to the filename to distinguish it, but keep the extension for syntax highlighting
        const pathStr = fileUri.path;
        const lastDotIdx = pathStr.lastIndexOf('.');
        let newPath = "";
        if (lastDotIdx > pathStr.lastIndexOf('/')) {
            newPath = pathStr.substring(0, lastDotIdx) + ' (Diff)' + pathStr.substring(lastDotIdx);
        }
        else {
            newPath = pathStr + ' (Diff)';
        }
        // Use a stable URI for the file + snapshot combo
        // Actually, we want a stable URI for the FILE, so we can switch snapshots without closing the tab?
        // If we want "one file", we should map the virtual URI back to the file.
        // And the virtual URI should be unique per original file.
        const uri = fileUri.with({ scheme: 'changes-viewer', path: newPath, query: '' });
        // Update state - Preserve ignoredChanges if already exists for this URI and snapshot
        let ignoredChanges = new Set();
        const existingState = this.resourceState.get(uri.toString());
        if (existingState && existingState.snapshotId === snapshotId && existingState.originalUri.toString() === fileUri.toString()) {
            ignoredChanges = existingState.ignoredChanges;
        }
        this.resourceState.set(uri.toString(), { originalUri: fileUri, snapshotId, baseSnapshotId, ignoredChanges });
        // Notify change if already open (to refresh content with new snapshot)
        this._onDidChange.fire(uri);
        // Open the document
        await vscode.window.showTextDocument(uri, { preview: true });
    }
    getChangeSignature(change, type) {
        // Signature to identify a change block across re-renders
        // We use originalStart as anchor (stable in snapshot)
        if (type === 'deleted') {
            return `del:${change.originalStart}:${change.originalLength}`;
        }
        else {
            // For added, originalStart is the insertion point in snapshot
            // We also include content hash/length to differentiate different additions at same point
            const content = change.modifiedContent.join('');
            return `add:${change.originalStart}:${change.modifiedLength}:${content.length}`; // Simple hash
        }
    }
    // TextDocumentContentProvider implementation
    async provideTextDocumentContent(uri) {
        try {
            // Retrieve state
            const state = this.resourceState.get(uri.toString());
            if (!state) {
                return `Error: No diff state found for ${uri.toString()}`;
            }
            const { snapshotId, baseSnapshotId, originalUri, ignoredChanges } = state;
            // Two modes:
            // 1. baseSnapshotId is set: Compare snapshotId (newer) vs baseSnapshotId (older) - for clicking on snapshot
            // 2. baseSnapshotId is NOT set: Compare current file vs snapshotId (base) - for clicking on file
            let baseContent = ''; // "Old" content (left side of diff conceptually)
            let newContent = ''; // "New" content (right side of diff conceptually)
            if (baseSnapshotId) {
                // Mode 1: Snapshot vs Previous Snapshot
                // baseSnapshotId is the "older" snapshot
                // snapshotId is the "newer" snapshot (the one being clicked)
                // Load base (older) snapshot content
                const baseSnapshot = await this.historyManager.getSnapshot(baseSnapshotId);
                if (!baseSnapshot) {
                    return `Error: Base snapshot ${baseSnapshotId} not found`;
                }
                const baseSnapshotContent = await this.storageService.getSnapshotContent(baseSnapshot.contentPath, baseSnapshot.id, baseSnapshot.metadata);
                if (baseSnapshotContent === null) {
                    return 'Error: Failed to load base snapshot content';
                }
                baseContent = baseSnapshotContent;
                // Load new (clicked) snapshot content
                const newSnapshot = await this.historyManager.getSnapshot(snapshotId);
                if (!newSnapshot) {
                    return `Error: Snapshot ${snapshotId} not found`;
                }
                // Load processed changes from metadata
                if (newSnapshot.metadata.processedChanges) {
                    newSnapshot.metadata.processedChanges.forEach(sig => ignoredChanges.add(sig));
                }
                const newSnapshotContent = await this.storageService.getSnapshotContent(newSnapshot.contentPath, newSnapshot.id, newSnapshot.metadata);
                if (newSnapshotContent === null) {
                    return 'Error: Failed to load snapshot content';
                }
                newContent = newSnapshotContent;
            }
            else {
                // Mode 2: Current file vs Snapshot (base/approved)
                // snapshotId is the base to compare against
                // Load base snapshot content
                const snapshot = await this.historyManager.getSnapshot(snapshotId);
                if (!snapshot) {
                    return `Error: Snapshot ${snapshotId} not found`;
                }
                // Load processed changes from metadata
                if (snapshot.metadata.processedChanges) {
                    snapshot.metadata.processedChanges.forEach(sig => ignoredChanges.add(sig));
                }
                const snapshotContent = await this.storageService.getSnapshotContent(snapshot.contentPath, snapshot.id, snapshot.metadata);
                if (snapshotContent === null) {
                    return 'Error: Failed to load snapshot content';
                }
                baseContent = snapshotContent;
                // Load current content from disk/editor
                const openDoc = vscode.workspace.textDocuments.find(d => d.uri.toString() === originalUri.toString());
                if (openDoc) {
                    newContent = openDoc.getText();
                }
                else {
                    const fileData = await vscode.workspace.fs.readFile(originalUri);
                    newContent = Buffer.from(fileData).toString('utf8');
                }
            }
            // Compute diff and combined content
            // baseContent = old, newContent = new
            const changes = (0, diff_1.computeDetailedDiff)(baseContent, newContent);
            const lines1 = baseContent.split(/\r?\n/);
            const lines2 = newContent.split(/\r?\n/);
            const combinedLines = [];
            const changeBlocks = [];
            let currentLineIdx = 0;
            let currentBlockIndex = -1;
            let lastChangeEndLine = -1; // Track where last change ended to detect consecutive changes
            for (const change of changes) {
                // Add unchanged lines before this change
                const unchangedStartIdx = combinedLines.length;
                while (currentLineIdx < change.modifiedStart) {
                    combinedLines.push({ type: 'unchanged', content: lines2[currentLineIdx] });
                    currentLineIdx++;
                }
                // Determine if this change should start a new block or continue existing one
                // A new block starts only if there was at least one NON-EMPTY unchanged line since the last change
                // This allows grouping changes that are separated only by empty lines
                const currentCombinedLineIdx = combinedLines.length;
                let hasNonEmptyUnchangedBetween = false;
                if (currentBlockIndex >= 0 && lastChangeEndLine < currentCombinedLineIdx) {
                    // Check if any unchanged lines between lastChangeEndLine and currentCombinedLineIdx are non-empty
                    for (let i = lastChangeEndLine; i < currentCombinedLineIdx; i++) {
                        if (combinedLines[i] && combinedLines[i].type === 'unchanged' && combinedLines[i].content.trim() !== '') {
                            hasNonEmptyUnchangedBetween = true;
                            break;
                        }
                    }
                }
                const shouldStartNewBlock = currentBlockIndex === -1 || hasNonEmptyUnchangedBetween;
                if (shouldStartNewBlock) {
                    // Start a new block
                    currentBlockIndex = changeBlocks.length;
                    changeBlocks.push({
                        startLine: currentCombinedLineIdx,
                        endLine: currentCombinedLineIdx, // Will be updated
                        changes: [change],
                        hasDeleted: false,
                        hasAdded: false
                    });
                }
                else {
                    // Continue existing block
                    changeBlocks[currentBlockIndex].changes.push(change);
                }
                // Check if this change is completely ignored
                const deletedIgnored = change.originalLength > 0 ? ignoredChanges.has(this.getChangeSignature(change, 'deleted')) : true;
                const addedIgnored = change.modifiedLength > 0 ? ignoredChanges.has(this.getChangeSignature(change, 'added')) : true;
                const isCompletelyIgnored = deletedIgnored && addedIgnored;
                // Skip completely ignored changes - don't add them to blocks
                if (isCompletelyIgnored) {
                    // Still need to advance currentLineIdx for added lines
                    if (change.modifiedLength > 0) {
                        for (let i = 0; i < change.modifiedLength; i++) {
                            combinedLines.push({
                                type: 'unchanged',
                                content: lines2[currentLineIdx]
                            });
                            currentLineIdx++;
                        }
                    }
                    continue; // Skip to next change
                }
                const currentBlock = changeBlocks[currentBlockIndex];
                if (change.originalLength > 0 && !deletedIgnored) {
                    currentBlock.hasDeleted = true;
                    const deletedLines = change.originalContent;
                    for (const line of deletedLines) {
                        combinedLines.push({
                            type: 'deleted',
                            content: line,
                            originalChange: change,
                            blockIndex: currentBlockIndex
                        });
                    }
                }
                if (change.modifiedLength > 0) {
                    if (!addedIgnored) {
                        currentBlock.hasAdded = true;
                    }
                    for (let i = 0; i < change.modifiedLength; i++) {
                        combinedLines.push({
                            type: addedIgnored ? 'unchanged' : 'added',
                            content: lines2[currentLineIdx],
                            originalChange: addedIgnored ? undefined : change,
                            blockIndex: addedIgnored ? undefined : currentBlockIndex
                        });
                        currentLineIdx++;
                    }
                }
                // Update block end line and last change end
                currentBlock.endLine = combinedLines.length - 1;
                lastChangeEndLine = combinedLines.length;
            }
            while (currentLineIdx < lines2.length) {
                combinedLines.push({ type: 'unchanged', content: lines2[currentLineIdx] });
                currentLineIdx++;
            }
            // Store session
            const session = {
                snapshotId,
                originalContent: baseContent,
                lines: combinedLines,
                changeBlocks: changeBlocks,
                decorations: []
            };
            this.sessions.set(uri.toString(), session);
            // Notify about code lenses change
            setTimeout(() => this._onDidChangeCodeLenses.fire(), 100);
            return combinedLines.map(l => l.content).join('\n');
        }
        catch (error) {
            console.error(error);
            return `Error loading diff: ${error}`;
        }
    }
    async onDocumentOpened(document) {
        // Use URI comparison to find editor, as object reference might differ slightly in some events
        const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === document.uri.toString());
        if (editor) {
            this.updateDecorations(editor);
        }
    }
    /**
     * Force refresh decorations for all visible editors showing our virtual documents
     */
    refreshAllDecorations() {
        for (const editor of vscode.window.visibleTextEditors) {
            if (editor.document.uri.scheme === 'changes-viewer') {
                this.updateDecorations(editor);
            }
        }
    }
    // Removed toggleInlineDiff and restoreOriginalContent as we now use virtual documents
    clearSession(docUri) {
        // Just remove from map
        this.sessions.delete(docUri);
        this._onDidChangeCodeLenses.fire();
    }
    updateDecorations(editor) {
        const session = this.sessions.get(editor.document.uri.toString());
        if (!session)
            return;
        const addedRanges = [];
        const deletedRanges = [];
        session.lines.forEach((line, index) => {
            const range = new vscode.Range(index, 0, index, 0); // Whole line
            if (line.type === 'added') {
                addedRanges.push(range);
            }
            else if (line.type === 'deleted') {
                deletedRanges.push(range);
            }
        });
        editor.setDecorations(this.addedDecorationType, addedRanges);
        editor.setDecorations(this.deletedDecorationType, deletedRanges);
    }
    // CodeLens Provider implementation - one CodeLens per ChangeBlock (group of consecutive changes)
    provideCodeLenses(document, token) {
        const session = this.sessions.get(document.uri.toString());
        const state = this.resourceState.get(document.uri.toString());
        if (!session)
            return [];
        // Simplified: In Snapshot vs Snapshot mode (history view), do not show any actions (read-only diff).
        if (state?.baseSnapshotId) {
            return [];
        }
        const lenses = [];
        // Iterate through changeBlocks - each block gets one CodeLens
        for (let blockIdx = 0; blockIdx < session.changeBlocks.length; blockIdx++) {
            const block = session.changeBlocks[blockIdx];
            // Skip empty blocks or blocks with no active changes (all ignored)
            if (block.changes.length === 0)
                continue;
            if (!block.hasDeleted && !block.hasAdded)
                continue;
            const range = new vscode.Range(block.startLine, 0, block.startLine, 0);
            // Pass blockIndex instead of individual change
            const args = [document.uri, session.snapshotId, blockIdx];
            // Determine label based on what types of changes are in the block
            let approveTitle = "$(check) Approve";
            let undoTitle = "$(reply) Reject";
            let approveTooltip = "Approve this change";
            let undoTooltip = "Reject this change";
            if (block.hasDeleted && block.hasAdded) {
                approveTitle = "$(check) Approve Change";
                undoTitle = "$(reply) Revert Change";
                approveTooltip = "Approve modification";
                undoTooltip = "Revert to original";
            }
            else if (block.hasDeleted) {
                approveTitle = "$(check) Approve Deletion";
                undoTitle = "$(reply) Restore";
                approveTooltip = "Confirm deletion";
                undoTooltip = "Restore this content";
            }
            else if (block.hasAdded) {
                approveTitle = "$(check) Approve Addition";
                undoTitle = "$(reply) Reject";
                approveTooltip = "Keep this code";
                undoTooltip = "Delete this code";
            }
            lenses.push(new vscode.CodeLens(range, {
                title: approveTitle,
                command: "changes-viewer.inline.approveBlock",
                arguments: args,
                tooltip: approveTooltip
            }));
            lenses.push(new vscode.CodeLens(range, {
                title: undoTitle,
                command: "changes-viewer.inline.undoBlock",
                arguments: args,
                tooltip: undoTooltip
            }));
        }
        return lenses;
    }
    /**
     * Apply action to an entire block of consecutive changes
     */
    async applyBlockAction(uri, snapshotId, blockIndex, action) {
        // Retrieve state and session
        const state = this.resourceState.get(uri.toString());
        const session = this.sessions.get(uri.toString());
        if (!state || !session) {
            vscode.window.showErrorMessage("Could not determine session state (session expired)");
            return;
        }
        const originalFileUri = state.originalUri;
        const block = session.changeBlocks[blockIndex];
        if (!block) {
            vscode.window.showErrorMessage("Change block not found");
            return;
        }
        if (action === 'approve') {
            // Mark all changes in the block as ignored
            const signatures = [];
            for (const change of block.changes) {
                if (change.originalLength > 0) {
                    const sig = this.getChangeSignature(change, 'deleted');
                    state.ignoredChanges.add(sig);
                    signatures.push(sig);
                }
                if (change.modifiedLength > 0) {
                    const sig = this.getChangeSignature(change, 'added');
                    state.ignoredChanges.add(sig);
                    signatures.push(sig);
                }
            }
            // Persist to snapshot metadata
            try {
                const snapshot = await this.historyManager.getSnapshot(snapshotId);
                if (snapshot) {
                    const existing = snapshot.metadata.processedChanges || [];
                    const updated = Array.from(new Set([...existing, ...signatures]));
                    await this.historyManager.updateSnapshot(snapshotId, {
                        metadata: {
                            ...snapshot.metadata,
                            processedChanges: updated
                        }
                    });
                }
            }
            catch (e) {
                logger_1.Logger.getInstance().error("Failed to persist processed changes", e);
            }
            // Trigger re-render and refresh decorations
            this._onDidChange.fire(uri);
            // Allow time for content to update, then refresh decorations
            setTimeout(() => {
                this.refreshAllDecorations();
                this._onDidChangeCodeLenses.fire();
            }, 150);
            return;
        }
        // Undo action - need to revert changes in the original file
        // Process changes in reverse order to maintain line positions
        const workspaceEdit = new vscode.WorkspaceEdit();
        // First, collect all the edits we need to make
        // We need to handle them carefully to avoid position conflicts
        // Sort changes by position in reverse order
        const sortedChanges = [...block.changes].sort((a, b) => b.modifiedStart - a.modifiedStart);
        for (const change of sortedChanges) {
            if (change.modifiedLength > 0) {
                // Delete added lines
                const startPos = new vscode.Position(change.modifiedStart, 0);
                const endPos = new vscode.Position(change.modifiedStart + change.modifiedLength, 0);
                const range = new vscode.Range(startPos, endPos);
                workspaceEdit.delete(originalFileUri, range);
            }
            if (change.originalLength > 0) {
                // Restore deleted lines
                const textToInsert = change.originalContent.join('\n') + '\n';
                const position = new vscode.Position(change.modifiedStart, 0);
                workspaceEdit.insert(originalFileUri, position, textToInsert);
            }
        }
        // Apply edit to original file
        if (workspaceEdit.size > 0) {
            // Pause snapshot creation to prevent "revert" from creating a new snapshot
            this.historyManager.pauseSnapshotCreation(originalFileUri, 3000);
            await vscode.workspace.applyEdit(workspaceEdit);
            const doc = await vscode.workspace.openTextDocument(originalFileUri);
            await doc.save();
            this._onDidChange.fire(uri);
            // Allow time for content to update, then refresh decorations
            setTimeout(() => {
                this.refreshAllDecorations();
                this._onDidChangeCodeLenses.fire();
            }, 150);
        }
    }
    // Block-based adapters for new commands
    async approveBlock(uri, snapshotId, blockIndex) {
        await this.applyBlockAction(uri, snapshotId, blockIndex, 'approve');
    }
    async undoBlock(uri, snapshotId, blockIndex) {
        await this.applyBlockAction(uri, snapshotId, blockIndex, 'undo');
    }
    // Legacy methods for backward compatibility (kept but may not be used)
    async applyAction(uri, snapshotId, change, type, action) {
        // Retrieve state to get original file URI
        const state = this.resourceState.get(uri.toString());
        if (!state) {
            vscode.window.showErrorMessage("Could not determine original file URI (session expired)");
            return;
        }
        const originalFileUri = state.originalUri;
        // Logic:
        // Deleted + Approve = No Op (Already deleted in original)
        // Deleted + Undo = Insert content back to original
        // Added + Approve = No Op (Already added in original)
        // Added + Undo = Delete content from original
        const workspaceEdit = new vscode.WorkspaceEdit();
        if (type === 'deleted' && action === 'undo') {
            // Restore content
            // We need to find WHERE to insert.
            // change.modifiedStart is the index in the CURRENT file where the deletion happened.
            // So we insert at line change.modifiedStart.
            const textToInsert = change.originalContent.join('\n') + '\n';
            const position = new vscode.Position(change.modifiedStart, 0);
            workspaceEdit.insert(originalFileUri, position, textToInsert);
        }
        else if (type === 'added' && action === 'undo') {
            // Reject addition (delete lines)
            // change.modifiedStart is start line in CURRENT file
            // change.modifiedLength is number of lines
            const startPos = new vscode.Position(change.modifiedStart, 0);
            const endPos = new vscode.Position(change.modifiedStart + change.modifiedLength, 0);
            const range = new vscode.Range(startPos, endPos);
            workspaceEdit.delete(originalFileUri, range);
        }
        else {
            // Approve actions
            // Store this change as ignored in the state
            const state = this.resourceState.get(uri.toString());
            if (state) {
                const sig = this.getChangeSignature(change, type);
                state.ignoredChanges.add(sig);
                // Trigger re-render of virtual document
                // This will call provideTextDocumentContent, which will filter out the ignored change
                this._onDidChange.fire(uri);
            }
            return;
        }
        // Apply edit to original file
        if (workspaceEdit.size > 0) {
            await vscode.workspace.applyEdit(workspaceEdit);
            // Save the file to trigger events?
            const doc = await vscode.workspace.openTextDocument(originalFileUri);
            await doc.save();
            // The provider should automatically update because we load content from disk in provideTextDocumentContent
            // But we need to trigger it.
            this._onDidChange.fire(uri);
        }
    }
    // Adapters for existing commands
    async applyApprove(uri, snapshotId, change, type) {
        await this.applyAction(uri, snapshotId, change, type, 'approve');
    }
    async applyUndo(uri, snapshotId, change, type) {
        await this.applyAction(uri, snapshotId, change, type, 'undo');
    }
    onDocumentClosed(uri) {
        this.clearSession(uri.toString());
        // Also clear resource state
        this.resourceState.delete(uri.toString());
    }
}
exports.InlineDiffService = InlineDiffService;
//# sourceMappingURL=InlineDiffService.js.map