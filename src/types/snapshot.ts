/**
 * Источник создания снапшота
 */
export type SnapshotSource = 'typing' | 'save' | 'filesystem' | 'manual';

/**
 * Информация об изменениях между версиями
 */
export interface DiffInfo {
    /** Количество добавленных строк */
    addedLines: number;
    /** Количество удаленных строк */
    removedLines: number;
    /** Количество измененных строк */
    modifiedLines: number;
    /** ID предыдущего снапшота (если есть) */
    previousSnapshotId?: string;
}

/**
 * Метаданные снапшота
 */
export interface SnapshotMetadata {
    /** Удален ли файл (маркер удаления) */
    deleted: boolean | undefined;
    /** Сжат ли файл содержимого */
    compressed: boolean | undefined;
    /** Размер содержимого в байтах */
    size: number;
    /** Количество строк в файле */
    lineCount: number;
    /** Кодировка файла */
    encoding?: string;
    /** Создан ли файл (маркер создания) */
    created?: boolean;
    /** ID снапшота, из которого был восстановлен файл */
    restoredFrom?: string;
}

/**
 * Основная сущность снапшота
 */
export interface Snapshot {
    /** Уникальный идентификатор снапшота */
    id: string;
    /** URI исходного файла (строка для сериализации) */
    fileUri: string;
    /** Путь к файлу (строка) */
    filePath: string;
    /** Путь к файлу содержимого снапшота */
    contentPath: string;
    /** Временная метка создания снапшота (timestamp) */
    timestamp: number;
    /** Источник создания снапшота */
    source: SnapshotSource;
    /** Метаданные снапшота */
    metadata: SnapshotMetadata;
    /** Хеш содержимого файла (SHA-256) */
    contentHash: string;
    /** Информация об изменениях относительно предыдущей версии */
    diffInfo?: DiffInfo;
    /** Принят ли снапшот (скрыт из Timeline) */
    accepted: boolean;
    /** Время принятия снапшота (если принят) */
    acceptedTimestamp?: number;
    /** Отброшен ли снапшот (содержит отброшенные изменения) */
    discarded?: boolean;
}

/**
 * Фильтры для поиска снапшотов
 */
export interface SnapshotFilters {
    /** Начальная временная метка (от) */
    from: number | undefined;
    /** Конечная временная метка (до) */
    to: number | undefined;
    /** Фильтр по источнику создания */
    source: SnapshotSource | undefined;
    /** Фильтр по статусу принятия */
    accepted: boolean | undefined;
    /** Лимит количества результатов */
    limit: number | undefined;
    /** ID снапшота для cursor (для пагинации - исключаем снапшоты до этого ID включительно) */
    cursorId: string | undefined;
}

/**
 * Индекс для быстрого поиска снапшотов по файлам
 */
export interface SnapshotIndex {
    /** Карта файлов к спискам ID снапшотов */
    files: Record<string, string[]>;
    /** Версия формата индекса */
    version: string;
}

/**
 * Метаданные хранилища
 */
export interface StorageMetadata {
    /** Версия формата хранилища */
    version: string;
    /** Временная метка создания хранилища */
    created: number;
    /** Временная метка последней очистки */
    lastCleanup: number;
    /** Общее количество снапшотов в хранилище */
    totalSnapshots?: number;
    /** Общий размер хранилища в байтах */
    totalSize?: number;
}
