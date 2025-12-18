/**
 * Выполняет функцию с повторными попытками при ошибке.
 * Использует экспоненциальную задержку между попытками.
 * 
 * @param fn - Функция для выполнения (должна возвращать Promise)
 * @param maxRetries - Максимальное количество попыток (включая первую)
 * @param delay - Начальная задержка в миллисекундах
 * @returns Promise с результатом выполнения функции
 * @throws Последняя ошибка, если все попытки исчерпаны
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
): Promise<T> {
    if (maxRetries < 1) {
        throw new Error('maxRetries must be at least 1');
    }
    
    let lastError: Error | unknown;
    let currentDelay = delay;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            
            // Если это последняя попытка, выбрасываем ошибку
            if (attempt === maxRetries - 1) {
                throw lastError;
            }
            
            // Ждем перед следующей попыткой с экспоненциальной задержкой
            await new Promise(resolve => setTimeout(resolve, currentDelay));
            
            // Увеличиваем задержку экспоненциально (удваиваем)
            currentDelay *= 2;
        }
    }
    
    // Этот код не должен выполняться, но TypeScript требует возврата
    throw lastError;
}
