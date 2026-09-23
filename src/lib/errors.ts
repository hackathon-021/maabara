import type { ErrorCode } from './contracts';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly messageHe: string,
    public readonly status: number,
  ) {
    super(`${code}: ${messageHe}`);
  }
}

export const Errors = {
  illegalTransition: (fromLabel: string, toLabel: string) =>
    new AppError('ILLEGAL_TRANSITION', `לא ניתן לעבור מ"${fromLabel}" ל"${toLabel}"`, 409),
  notOnThisTruck: (code: string) =>
    new AppError('NOT_ON_THIS_TRUCK', `אריזה ${code} לא הועמסה על יחידת הובלה זו`, 409),
  quantityExceeds: (itemName: string, max: number) =>
    new AppError('QUANTITY_EXCEEDS_REMAINING', `הכמות עבור "${itemName}" גדולה מהמותר (${max})`, 409),
  roomNotMapped: () => new AppError('ROOM_NOT_MAPPED', 'יש לסיים את המיפוי', 409),
  notFound: (what: string) => new AppError('NOT_FOUND', `${what} לא נמצא`, 404),
  validation: (messageHe: string) => new AppError('VALIDATION', messageHe, 400),
  unauthenticated: () => new AppError('UNAUTHENTICATED', 'יש להתחבר מחדש', 401),
  forbidden: (messageHe: string) => new AppError('FORBIDDEN', messageHe, 403),
};
