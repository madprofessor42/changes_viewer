import * as crypto from 'crypto';

/**
 * Вычисляет SHA-256 хеш содержимого файла.
 * 
 * @param content - Содержимое файла (строка или Buffer)
 * @returns Promise с хешем в виде шестнадцатеричной строки
 */
export async function computeHash(content: string | Buffer): Promise<string> {
    const hash = crypto.createHash('sha256');
    
    if (typeof content === 'string') {
        hash.update(content, 'utf8');
    } else {
        hash.update(content);
    }
    
    return hash.digest('hex');
}
