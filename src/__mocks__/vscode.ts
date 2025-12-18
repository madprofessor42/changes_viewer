/**
 * Мок для модуля vscode для тестирования вне Extension Host
 */

export enum ExtensionMode {
    Production = 1,
    Development = 2,
    Test = 3
}

export class Uri {
    static file(path: string): Uri {
        return new Uri(path);
    }
    
    constructor(public fsPath: string) {}
    
    toString(): string {
        return `file://${this.fsPath}`;
    }
}

export interface Memento {
    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    update(key: string, value: any): Thenable<void>;
    keys(): readonly string[];
}

export interface ExtensionContext {
    readonly globalStoragePath: string;
    readonly globalState: Memento;
    readonly workspaceState: Memento;
    readonly subscriptions: { dispose(): any }[];
    readonly extensionPath: string;
    readonly extensionUri: Uri;
    readonly storagePath: string;
    readonly globalStorageUri: Uri;
    readonly logPath: string;
    readonly extensionMode: ExtensionMode;
    readonly secrets: any;
    readonly environmentVariableCollection: any;
    asAbsolutePath(relativePath: string): string;
    readonly storageUri: Uri;
    readonly logUri: Uri;
    readonly extension: any;
    readonly languageModelAccessInformation: any;
}

// Базовые типы и интерфейсы для тестирования
export interface ExtensionContext {
    readonly globalStoragePath: string;
    readonly globalState: Memento;
    readonly workspaceState: Memento;
    readonly subscriptions: { dispose(): any }[];
    readonly extensionPath: string;
    readonly extensionUri: Uri;
    readonly storagePath: string;
    readonly globalStorageUri: Uri;
    readonly logPath: string;
    readonly extensionMode: ExtensionMode;
    readonly secrets: any;
    readonly environmentVariableCollection: any;
    asAbsolutePath(relativePath: string): string;
    readonly storageUri: Uri;
    readonly logUri: Uri;
    readonly extension: any;
    readonly languageModelAccessInformation: any;
}
