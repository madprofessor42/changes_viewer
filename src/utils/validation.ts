/**
 * Утилиты для валидации входных данных
 */

/**
 * UUID v4 regex pattern
 */
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Валидирует формат UUID v4.
 * 
 * @param id Строка для валидации
 * @returns true, если строка является валидным UUID v4
 */
export function isValidUUID(id: string): boolean {
    if (!id || typeof id !== 'string') {
        return false;
    }
    
    return UUID_V4_PATTERN.test(id);
}

/**
 * Валидирует snapshotId (должен быть UUID v4).
 * 
 * @param snapshotId ID снапшота для валидации
 * @throws Error если snapshotId невалиден
 */
export function validateSnapshotId(snapshotId: string): void {
    if (!snapshotId || typeof snapshotId !== 'string') {
        throw new Error('Snapshot ID is required and must be a string');
    }
    
    if (!isValidUUID(snapshotId)) {
        throw new Error(`Invalid snapshot ID format: ${snapshotId}. Expected UUID v4 format.`);
    }
}
