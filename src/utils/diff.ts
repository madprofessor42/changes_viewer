import { DiffInfo } from '../types/snapshot';

/**
 * Вычисляет различия между двумя версиями содержимого файла.
 * Использует простой алгоритм построчного сравнения.
 * 
 * @param content1 - Первая версия содержимого
 * @param content2 - Вторая версия содержимого
 * @returns Информация об изменениях (DiffInfo)
 */
export function computeDiff(content1: string, content2: string): DiffInfo {
    const lines1 = content1.split(/\r?\n/);
    const lines2 = content2.split(/\r?\n/);
    
    let addedLines = 0;
    let removedLines = 0;
    let modifiedLines = 0;
    
    // Простой алгоритм: построчное сравнение
    // Используем подход на основе longest common subsequence (LCS)
    const maxLength = Math.max(lines1.length, lines2.length);
    
    // Создаем карту строк для быстрого поиска
    const lines1Map = new Map<string, number>();
    const lines2Map = new Map<string, number>();
    
    // Подсчитываем частоту каждой строки
    for (const line of lines1) {
        lines1Map.set(line, (lines1Map.get(line) || 0) + 1);
    }
    for (const line of lines2) {
        lines2Map.set(line, (lines2Map.get(line) || 0) + 1);
    }
    
    // Находим общие строки (которые есть в обеих версиях)
    const commonLines = new Set<string>();
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
 * Вычисляет Longest Common Subsequence (LCS) между двумя массивами строк.
 * Используется для более точного определения общих строк.
 */
function computeLCS(arr1: string[], arr2: string[]): string[] {
    const m = arr1.length;
    const n = arr2.length;
    
    // Создаем таблицу для динамического программирования
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    // Заполняем таблицу
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (arr1[i - 1] === arr2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    
    // Восстанавливаем LCS
    const lcs: string[] = [];
    let i = m;
    let j = n;
    
    while (i > 0 && j > 0) {
        if (arr1[i - 1] === arr2[j - 1]) {
            lcs.unshift(arr1[i - 1]);
            i--;
            j--;
        } else if (dp[i - 1][j] > dp[i][j - 1]) {
            i--;
        } else {
            j--;
        }
    }
    
    return lcs;
}
