"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatRelativeTime = formatRelativeTime;
/**
 * Форматирует временную метку в относительное время (например, "2 minutes ago").
 *
 * @param timestamp - Unix timestamp в миллисекундах
 * @returns Отформатированная строка с относительным временем
 */
function formatRelativeTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    // Если время в будущем (некорректный timestamp)
    if (diff < 0) {
        return 'just now';
    }
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);
    if (seconds < 10) {
        return 'just now';
    }
    else if (seconds < 60) {
        return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
    }
    else if (minutes < 60) {
        return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    }
    else if (hours < 24) {
        return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    }
    else if (days < 7) {
        return `${days} day${days !== 1 ? 's' : ''} ago`;
    }
    else if (weeks < 4) {
        return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
    }
    else if (months < 12) {
        return `${months} month${months !== 1 ? 's' : ''} ago`;
    }
    else {
        return `${years} year${years !== 1 ? 's' : ''} ago`;
    }
}
//# sourceMappingURL=time.js.map