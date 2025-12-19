import * as vscode from 'vscode';
import { StorageIndex } from '../services/StorageService';
import { migrateToV1_0 } from './v1.0';
import { MEMENTO_KEY } from './constants';

/**
 * Тип функции миграции
 */
type MigrationFunction = (globalState: vscode.Memento, storagePath: string) => Promise<void>;

/**
 * Регистрация миграций по версиям
 * Ключ - версия формата данных (например, "1.0", "1.1", "2.0")
 * Значение - функция миграции, которая преобразует данные к этой версии
 */
const migrations: Record<string, MigrationFunction> = {
    '1.0': migrateToV1_0,
    // В будущем можно добавить:
    // '1.1': migrateToV1_1,
    // '2.0': migrateToV2_0,
};

/**
 * Валидирует формат версии.
 * @param version Версия для валидации
 * @returns true, если версия валидна
 */
export function isValidVersion(version: string | null | undefined): boolean {
    if (!version || typeof version !== 'string') {
        return false;
    }
    // Проверяем формат версии (X.Y или X.Y.Z и т.д.)
    const versionPattern = /^\d+(\.\d+)+$/;
    return versionPattern.test(version);
}

/**
 * Сравнивает две версии формата данных.
 * @param version1 Версия 1 (например, "1.0")
 * @param version2 Версия 2 (например, "1.1")
 * @returns Отрицательное число, если version1 < version2, положительное если version1 > version2, 0 если равны
 * @throws Error если версия невалидна
 */
export function compareVersions(version1: string, version2: string): number {
    // Валидация входных данных
    if (!isValidVersion(version1)) {
        throw new Error(`Invalid version format: version1=${version1}. Expected format: X.Y or X.Y.Z`);
    }
    if (!isValidVersion(version2)) {
        throw new Error(`Invalid version format: version2=${version2}. Expected format: X.Y or X.Y.Z`);
    }
    
    const parts1 = version1.split('.').map(Number);
    const parts2 = version2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const part1 = parts1[i] || 0;
        const part2 = parts2[i] || 0;
        
        if (part1 < part2) return -1;
        if (part1 > part2) return 1;
    }
    
    return 0;
}

/**
 * Получает список версий миграций, отсортированных по возрастанию.
 * @returns Массив версий (например, ["1.0", "1.1", "2.0"])
 */
function getSortedMigrationVersions(): string[] {
    return Object.keys(migrations).sort(compareVersions);
}

/**
 * Выполняет миграцию данных от текущей версии до целевой версии.
 * Миграции выполняются последовательно (1.0 → 1.1 → 2.0).
 * 
 * @param globalState Memento API для чтения/записи данных
 * @param storagePath Путь к хранилищу (для доступа к файлам, если нужно)
 * @param currentVersion Текущая версия формата данных
 * @param targetVersion Целевая версия формата данных
 * @throws Error если миграция невозможна
 */
export async function migrateToVersion(
    globalState: vscode.Memento,
    storagePath: string,
    currentVersion: string,
    targetVersion: string
): Promise<void> {
    // Если версии совпадают, миграция не нужна
    if (currentVersion === targetVersion) {
        return;
    }

    // Проверяем, что целевая версия больше текущей
    if (compareVersions(currentVersion, targetVersion) >= 0) {
        throw new Error(
            `Cannot migrate from version ${currentVersion} to ${targetVersion}. ` +
            `Target version must be greater than current version.`
        );
    }

    // Получаем отсортированный список версий миграций
    const migrationVersions = getSortedMigrationVersions();
    
    // Находим начальную позицию (первая версия больше текущей)
    const startIndex = migrationVersions.findIndex(v => compareVersions(v, currentVersion) > 0);
    
    if (startIndex === -1) {
        // Проверяем, может быть текущая версия уже больше целевой?
        if (compareVersions(currentVersion, targetVersion) > 0) {
            // Текущая версия новее целевой - это нормально
            return;
        }
        // Нет миграций, но версия меньше целевой - это проблема
        throw new Error(
            `No migration path found from version ${currentVersion} to ${targetVersion}. ` +
            `Current version is not registered in migrations.`
        );
    }

    // Выполняем миграции последовательно от текущей до целевой версии
    for (let i = startIndex; i < migrationVersions.length; i++) {
        const migrationVersion = migrationVersions[i];
        
        // Если достигли целевой версии или превысили её, останавливаемся
        if (compareVersions(migrationVersion, targetVersion) > 0) {
            break;
        }

        // Получаем функцию миграции
        const migrationFn = migrations[migrationVersion];
        if (!migrationFn) {
            throw new Error(`Migration function not found for version ${migrationVersion}`);
        }

        // Выполняем миграцию
        try {
            await migrationFn(globalState, storagePath);
            
            // Проверяем, что версия обновилась после миграции
            const updated = globalState.get<StorageIndex>(MEMENTO_KEY);
            if (updated && updated.version !== migrationVersion) {
                throw new Error(
                    `Migration to version ${migrationVersion} did not update version. ` +
                    `Expected: ${migrationVersion}, got: ${updated.version}`
                );
            }
        } catch (error) {
            throw new Error(
                `Migration to version ${migrationVersion} failed: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
}

/**
 * Получает текущую версию данных из хранилища или возвращает null, если данных нет.
 * @param globalState Memento API
 * @param mementoKey Ключ для хранения индекса
 * @returns Текущая версия или null
 */
export function getCurrentVersion(globalState: vscode.Memento, mementoKey: string): string | null {
    const index = globalState.get<StorageIndex>(mementoKey);
    return index?.version || null;
}
