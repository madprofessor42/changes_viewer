"use strict";
/**
 * Утилиты для валидации входных данных
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidUUID = isValidUUID;
exports.validateSnapshotId = validateSnapshotId;
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
function isValidUUID(id) {
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
function validateSnapshotId(snapshotId) {
    if (!snapshotId || typeof snapshotId !== 'string') {
        throw new Error('Snapshot ID is required and must be a string');
    }
    if (!isValidUUID(snapshotId)) {
        throw new Error(`Invalid snapshot ID format: ${snapshotId}. Expected UUID v4 format.`);
    }
}
//# sourceMappingURL=validation.js.map