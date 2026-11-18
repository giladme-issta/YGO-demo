export class AppError extends Error {
  constructor(status, code, message, options = {}) {
    super(message, options);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.retryAfter = options.retryAfter;
  }
}

export const AI_STATUS = Object.freeze({
  available: false,
  reason: 'שאלות AI חופשיות אינן זמינות כרגע: יש להגדיר הרשאה לשירות השאלות של YGO בשרת. ניתן לשאול שאלות עובדתיות על המידע הקיים.',
});
