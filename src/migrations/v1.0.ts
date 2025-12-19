import * as vscode from 'vscode';
import { StorageIndex } from '../services/StorageService';
import { StorageMetadata } from '../types/snapshot';
import { MEMENTO_KEY } from './constants';

/**
 * Миграция к версии 1.0.
 * Инициализирует структуру данных версии 1.0, если файл не существует.
 * Миграция идемпотентна - можно запускать несколько раз безопасно.
 * 
 * @param globalState Memento API для чтения/записи данных
 * @param storagePath Путь к хранилищу (не используется в этой миграции, но может понадобиться в будущем)
 */
export async function migrateToV1_0(
    globalState: vscode.Memento,
    storagePath: string
): Promise<void> {
    const targetVersion = '1.0';
    
    // Получаем текущие данные
    const existing = globalState.get<StorageIndex>(MEMENTO_KEY);
    
    // Если данных нет, создаем новую структуру версии 1.0
    if (!existing) {
        const newIndex: StorageIndex = {
            version: targetVersion,
            metadata: {
                version: targetVersion,
                created: Date.now(),
                lastCleanup: 0,
                totalSnapshots: 0,
                totalSize: 0
            },
            snapshots: [],
            index: {}
        };
        
        await globalState.update(MEMENTO_KEY, newIndex);
        return;
    }
    
    // Если данные уже есть, но версия не 1.0, обновляем версию и структуру
    // Проверяем, что все необходимые поля присутствуют
    const updatedIndex: StorageIndex = {
        version: targetVersion,
        metadata: {
            version: targetVersion,
            created: existing.metadata?.created || Date.now(),
            lastCleanup: existing.metadata?.lastCleanup || 0,
            totalSnapshots: (existing.metadata?.totalSnapshots !== undefined && existing.metadata.totalSnapshots !== null)
                ? existing.metadata.totalSnapshots 
                : (existing.snapshots?.length || 0),
            totalSize: existing.metadata?.totalSize || 0
        },
        snapshots: existing.snapshots || [],
        index: existing.index || {}
    };
    
    // Обновляем только если версия изменилась или структура неполная
    const needsUpdate = 
        existing.version !== targetVersion || 
        !existing.metadata || 
        existing.metadata.version !== targetVersion ||
        existing.metadata.totalSnapshots === undefined ||
        existing.metadata.totalSnapshots === null;
    
    if (needsUpdate) {
        await globalState.update(MEMENTO_KEY, updatedIndex);
    }
}
