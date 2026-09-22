import type { CreateTransportReq, PackingUnitSummaryDTO, TransportType, TransportUnitDTO } from '@/lib/contracts';
import { TRANSPORT_TYPE_LABELS } from '@/lib/labels';
import { CODE_LENGTH, normalizeCode } from '@/lib/scan-session';
import { formatHeDateTime } from '../format';

export interface TransportDraft {
  type: TransportType | null;
  typeDetails: string;
  licensePlate: string;
  groupId: number | null;
}

/** The form's request, or null while it is not complete enough to send. */
export function transportRequest(draft: TransportDraft): CreateTransportReq | null {
  if (draft.type === null || draft.groupId === null) return null;

  const licensePlate = draft.licensePlate.trim();
  if (!licensePlate) return null;

  const typeDetails = draft.typeDetails.trim();
  // flows/transporting_flow.md note Zn: "אחר" is only meaningful with a description.
  if (draft.type === 'other' && !typeDetails) return null;

  return {
    type: draft.type,
    licensePlate,
    groupId: draft.groupId,
    ...(draft.type === 'other' ? { typeDetails } : {}),
  };
}

export type LoadScan =
  | { kind: 'invalid'; messageHe: string }
  | { kind: 'unknown'; messageHe: string }
  | { kind: 'duplicate'; code: string; messageHe: string }
  | { kind: 'accepted'; code: string; messageHe: string };

/**
 * What a scan means on the loading screen, decided entirely from data the client
 * already has. P2 validates the whole `codes` list before writing anything, so a
 * code it would refuse must never get onto the list in the first place.
 */
export function classifyLoadScan(
  raw: string,
  available: PackingUnitSummaryDTO[],
  picked: string[],
): LoadScan {
  const code = normalizeCode(raw);
  if (!code) return { kind: 'invalid', messageHe: `יש להזין מספר אריזה בן ${CODE_LENGTH} ספרות` };
  if (picked.includes(code)) return { kind: 'duplicate', code, messageHe: `אריזה ${code} כבר בהעמסה` };
  // Absent from the closed list = never closed, already on a truck, or already received.
  if (!available.some((b) => b.code === code)) {
    return { kind: 'unknown', messageHe: `אריזה ${code} אינה זמינה להעמסה` };
  }
  return { kind: 'accepted', code, messageHe: `אריזה ${code} נוספה` };
}

/** The "יחידת הובלה הועמסה" popup (flows/transporting_flow.md note AEn1). */
export function loadSummary(truck: TransportUnitDTO): { title: string; lines: string[] } {
  const lines = [`מספר רישוי: ${truck.licensePlate}`];
  if (truck.type !== 'truck') {
    lines.push(`סוג: ${truck.typeDetails ?? TRANSPORT_TYPE_LABELS[truck.type]}`);
  }
  lines.push(`${truck.boxes.length} אריזות`);
  lines.push(`יציאה: ${formatHeDateTime(truck.departedAt)}`);
  return { title: 'יחידת הובלה הועמסה', lines };
}
