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
            let currentLineIdx = 0;
            for (const change of changes) {
                while (currentLineIdx < change.modifiedStart) {
                    combinedLines.push({ type: 'unchanged', content: lines2[currentLineIdx] });
                    currentLineIdx++;
                }
                if (change.originalLength > 0) {
                    const sig = this.getChangeSignature(change, 'deleted');
                    const isIgnored = ignoredChanges.has(sig);
                    if (!isIgnored) {
                        const deletedLines = change.originalContent;
                        for (const line of deletedLines) {
                            combinedLines.push({ type: 'deleted', content: line, originalChange: change });
                        }
                    }
                }
                if (change.modifiedLength > 0) {
                    const sig = this.getChangeSignature(change, 'added');
                    const isIgnored = ignoredChanges.has(sig);
                    for (let i = 0; i < change.modifiedLength; i++) {
                        combinedLines.push({
                            type: isIgnored ? 'unchanged' : 'added',
                            content: lines2[currentLineIdx],
                            originalChange: isIgnored ? undefined : change
                        });
                        currentLineIdx++;
                    }
                }
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
    // CodeLens Provider implementation (unchanged logic, just ensures it uses the session)
    provideCodeLenses(document, token) {
        const session = this.sessions.get(document.uri.toString());
        if (!session)
            return [];
        const lenses = [];
        // We want to group consecutive lines of the same type and change into one CodeLens
        let currentChange;
        let currentType = 'unchanged';
        let startLine = -1;
        for (let i = 0; i < session.lines.length; i++) {
            const line = session.lines[i];
            // Check if we are starting a new block
            const isDifferentChange = line.originalChange !== currentChange;
            const isDifferentType = line.type !== currentType;
            if (isDifferentChange || isDifferentType) {
                // If we were tracking a block, emit CodeLens for it
                if (currentChange && (currentType === 'added' || currentType === 'deleted')) {
                    this.addCodeLensForBlock(lenses, document.uri, session.snapshotId, currentChange, currentType, startLine, i - 1);
                }
                // Start new block
                currentChange = line.originalChange;
                currentType = line.type;
                startLine = i;
            }
        }
        // Handle last block
        if (currentChange && (currentType === 'added' || currentType === 'deleted')) {
            this.addCodeLensForBlock(lenses, document.uri, session.snapshotId, currentChange, currentType, startLine, session.lines.length - 1);
        }
        return lenses;
    }
    addCodeLensForBlock(lenses, uri, snapshotId, change, type, startLine, endLine) {
        const range = new vscode.Range(startLine, 0, startLine, 0);
        const args = [uri, snapshotId, change, type];
        if (type === 'deleted') {
            // Deleted Block:
            // "Approve" -> Confirm deletion (Remove from view) -> No action on file (already deleted)
            // "Undo" -> Restore content -> Insert into original file
            lenses.push(new vscode.CodeLens(range, {
                title: "$(check) Approve Deletion",
                command: "changes-viewer.inline.approve",
                arguments: args,
                tooltip: "Confirm deletion"
            }));
            lenses.push(new vscode.CodeLens(range, {
                title: "$(reply) Restore",
                command: "changes-viewer.inline.undo",
                arguments: args,
                tooltip: "Restore this content (undo deletion)"
            }));
        }
        else {
            // Added Block:
            // "Approve" -> Keep addition -> No action on file (already added)
            // "Undo" -> Reject addition -> Delete from original file
            lenses.push(new vscode.CodeLens(range, {
                title: "$(check) Approve Addition",
                command: "changes-viewer.inline.approve",
                arguments: args,
                tooltip: "Keep this code"
            }));
            lenses.push(new vscode.CodeLens(range, {
                title: "$(reply) Reject",
                command: "changes-viewer.inline.undo",
                arguments: args,
                tooltip: "Delete this code (undo addition)"
            }));
        }
    }
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