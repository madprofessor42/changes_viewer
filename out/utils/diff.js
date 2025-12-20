"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeDiff = computeDiff;
exports.computeDetailedDiff = computeDetailedDiff;
/**
 * Вычисляет различия между двумя версиями содержимого файла.
 * Использует простой алгоритм построчного сравнения.
 *
 * @param content1 - Первая версия содержимого
 * @param content2 - Вторая версия содержимого
 * @returns Информация об изменениях (DiffInfo)
 */
function computeDiff(content1, content2) {
    const lines1 = content1.split(/\r?\n/);
    const lines2 = content2.split(/\r?\n/);
    let addedLines = 0;
    let removedLines = 0;
    let modifiedLines = 0;
    // Простой алгоритм: построчное сравнение
    // Используем подход на основе longest common subsequence (LCS)
    const maxLength = Math.max(lines1.length, lines2.length);
    // Создаем карту строк для быстрого поиска
    const lines1Map = new Map();
    const lines2Map = new Map();
    // Подсчитываем частоту каждой строки
    for (const line of lines1) {
        lines1Map.set(line, (lines1Map.get(line) || 0) + 1);
    }
    for (const line of lines2) {
        lines2Map.set(line, (lines2Map.get(line) || 0) + 1);
    }
    // Находим общие строки (которые есть в обеих версиях)
    const commonLines = new Set();
    for (const line of lines1Map.keys()) {
        if (lines2Map.has(line)) {
            commonLines.add(line);
        }
    }
    // Подсчитываем добавленные строки (есть во второй, но нет в первой)
    for (const line of lines2) {
        if (!commonLines.has(line) || (lines1Map.get(line) || 0) < (lines2Map.get(line) || 0)) {
            addedLines++;
        }
    }
    // Подсчитываем удаленные строки (есть в первой, но нет во второй)
    for (const line of lines1) {
        if (!commonLines.has(line) || (lines2Map.get(line) || 0) < (lines1Map.get(line) || 0)) {
            removedLines++;
        }
    }
    // Улучшенный алгоритм: используем более точное сравнение
    // Для более точного определения измененных строк используем позиционное сравнение
    const lcs = computeLCS(lines1, lines2);
    const totalCommon = lcs.length;
    // Пересчитываем на основе LCS
    const actualRemoved = lines1.length - totalCommon;
    const actualAdded = lines2.length - totalCommon;
    // Измененные строки - это строки, которые были изменены, но не полностью удалены/добавлены
    // Для простоты считаем, что измененные строки = min(удаленных, добавленных), которые не являются полностью новыми
    modifiedLines = Math.min(actualRemoved, actualAdded);
    removedLines = actualRemoved - modifiedLines;
    addedLines = actualAdded - modifiedLines;
    return {
        addedLines: Math.max(0, addedLines),
        removedLines: Math.max(0, removedLines),
        modifiedLines: Math.max(0, modifiedLines)
    };
}
/**
 * Вычисляет детальные изменения (changesets) между двумя версиями.
 * Возвращает список блоков изменений (удаление + добавление).
 */
function computeDetailedDiff(content1, content2) {
    const lines1 = content1.split(/\r?\n/);
    const lines2 = content2.split(/\r?\n/);
    // Используем простой diff алгоритм (Myers или подобный был бы лучше, но для простоты используем LCS)
    const lcs = computeLCS(lines1, lines2);
    const changes = [];
    let i = 0; // index in lines1
    let j = 0; // index in lines2
    let lcsIdx = 0; // index in lcs
    while (i < lines1.length || j < lines2.length) {
        // Если достигли конца LCS, все оставшееся - изменения
        if (lcsIdx >= lcs.length) {
            if (i < lines1.length || j < lines2.length) {
                changes.push({
                    originalStart: i,
                    originalLength: lines1.length - i,
                    modifiedStart: j,
                    modifiedLength: lines2.length - j,
                    originalContent: lines1.slice(i),
                    modifiedContent: lines2.slice(j)
                });
            }
            break;
        }
        const commonLine = lcs[lcsIdx];
        // Ищем следующий общий элемент
        // Пропускаем строки, которые не совпадают с commonLine -> это изменения
        let iNext = i;
        while (iNext < lines1.length && lines1[iNext] !== commonLine) {
            iNext++;
        }
        let jNext = j;
        while (jNext < lines2.length && lines2[jNext] !== commonLine) {
            jNext++;
        }
        // Если нашли изменения перед общим блоком
        if (iNext > i || jNext > j) {
            changes.push({
                originalStart: i,
                originalLength: iNext - i,
                modifiedStart: j,
                modifiedLength: jNext - j,
                originalContent: lines1.slice(i, iNext),
                modifiedContent: lines2.slice(j, jNext)
            });
        }
        // Сдвигаем указатели за общий элемент
        // ВАЖНО: computeLCS может вернуть повторяющиеся строки. 
        // Нам нужно убедиться, что мы синхронизируемся правильно.
        // Простой подход с LCS массивом строк может быть ненадежен для повторяющихся строк.
        // Но для прототипа сойдет.
        i = iNext + 1;
        j = jNext + 1;
        lcsIdx++;
    }
    return changes;
}
/**
 * Вычисляет Longest Common Subsequence (LCS) между двумя массивами строк.
 * Используется для более точного определения общих строк.
 */
function computeLCS(arr1, arr2) {
    const m = arr1.length;
    const n = arr2.length;
    // Создаем таблицу для динамического программирования
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    // Заполняем таблицу
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (arr1[i - 1] === arr2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            }
            else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    // Восстанавливаем LCS
    const lcs = [];
    let i = m;
    let j = n;
    while (i > 0 && j > 0) {
        if (arr1[i - 1] === arr2[j - 1]) {
            lcs.unshift(arr1[i - 1]);
            i--;
            j--;
        }
        else if (dp[i - 1][j] > dp[i][j - 1]) {
            i--;
        }
        else {
            j--;
        }
    }
    return lcs;
}
//# sourceMappingURL=diff.js.map