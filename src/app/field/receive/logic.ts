import type { PackingUnitDTO, TransportUnitDTO, ReceiveResult } from '@/lib/contracts';
import { PACKING_UNIT_STATUS_LABELS } from '@/lib/labels';
import { CODE_LENGTH, normalizeCode } from '@/lib/scan-session';

/** The boxes this truck was loaded with — the checklist the unloader works against. */
export function expectedCodes(truck: TransportUnitDTO): string[] {
  return truck.boxes.map((b) => b.code).filter((c): c is string => c !== null);
}

export type ReceiveScan =
  | { kind: 'invalid'; messageHe: string }
  | { kind: 'duplicate'; code: string; messageHe: string }
  | { kind: 'confirmed'; code: string; messageHe: string }
  /** Not on this truck: the screen must look the box up before offering anything. */
  | { kind: 'offsite'; code: string };

export function classifyReceiveScan(
  raw: string,
  expected: string[],
  confirmed: string[],
  surplus: string[],
): ReceiveScan {
  const code = normalizeCode(raw);
  if (!code) return { kind: 'invalid', messageHe: `יש להזין מספר אריזה בן ${CODE_LENGTH} ספרות` };
  if (confirmed.includes(code) || surplus.includes(code)) {
    return { kind: 'duplicate', code, messageHe: `אריזה ${code} כבר סומנה` };
  }
  if (expected.includes(code)) return { kind: 'confirmed', code, messageHe: `אריזה ${code} התקבלה` };
  return { kind: 'offsite', code };
}

/**
 * Whether a box that is not on this truck may be offered as surplus (spec §5.3.2).
 *
 * P2 accepts a surplus code only as `in_transit → received`; anything else throws
 * and the *entire* receive is rolled back, taking every other box's confirmation
 * with it. So the prompt is only ever shown for a box the server will accept.
 */
export function surplusVerdict(
  code: string,
  unit: PackingUnitDTO | null,
): { kind: 'offer' | 'reject'; messageHe: string } {
  if (!unit) return { kind: 'reject', messageHe: `אריזה ${code} לא נמצאה` };
  if (unit.status !== 'in_transit') {
    return {
      kind: 'reject',
      messageHe: `אריזה ${code} בסטטוס "${PACKING_UNIT_STATUS_LABELS[unit.status]}" ולא ניתן לקבל אותה כאן`,
    };
  }
  return { kind: 'offer', messageHe: `אריזה ${code} לא הועמסה על יחידת הובלה זו. לקבל בכל זאת?` };
}

export function unconfirmedCodes(expected: string[], confirmed: string[]): string[] {
  return expected.filter((c) => !confirmed.includes(c));
}

/**
 * The closing summary of an unload (flows/unloading_flow.md note Ln1).
 * Everything here comes from the server's result — a code the phone put in
 * `surplusCodes` that was in fact on the truck comes back as a normal receive.
 */
export function receiveSummary(result: ReceiveResult): {
  title: string;
  tone: 'ok' | 'warn';
  lines: string[];
} {
  const lines = [
    `מספר רישוי: ${result.transportUnit.licensePlate}`,
    `התקבלו ${result.receivedCodes.length} אריזות`,
  ];
  if (result.surplusCodes.length > 0) {
    lines.push(`התקבלו בעודף: ${result.surplusCodes.join(', ')}`);
  }
  if (result.missingCodes.length === 0) {
    return { title: 'יחידת הובלה שוחררה', tone: 'ok', lines };
  }
  lines.push(`חסרות ${result.missingCodes.length} אריזות: ${result.missingCodes.join(', ')}`);
  return { title: 'יחידת הובלה שוחררה עם חוסר', tone: 'warn', lines };
}
