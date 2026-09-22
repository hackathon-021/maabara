import type { PackingUnitDTO } from '@/lib/contracts';
import { PACKING_UNIT_STATUS_LABELS } from '@/lib/labels';

/** Only a box that was received may be distributed (spec §5.4.1). */
export function distributeVerdict(
  code: string,
  unit: PackingUnitDTO | null,
): { kind: 'open'; unit: PackingUnitDTO } | { kind: 'reject'; messageHe: string } {
  if (!unit) return { kind: 'reject', messageHe: `אריזה ${code} לא נמצאה` };
  if (unit.status !== 'received') {
    return {
      kind: 'reject',
      messageHe: `אריזה ${code} בסטטוס "${PACKING_UNIT_STATUS_LABELS[unit.status]}" — ניתן לפזר רק אריזה שהתקבלה`,
    };
  }
  return { kind: 'open', unit };
}

const or = (value: string | null) => value ?? '—';

export function destinationLine(unit: PackingUnitDTO): string {
  return `${or(unit.destBuilding)} · ${or(unit.destFloor)} · ${or(unit.destRoom)}`;
}

/**
 * The wrong-room guard (spec §5.4.2). A warning, never a block — the distributor
 * may be right and the label wrong, and the override is recorded in the event note.
 */
export function roomWarning(unit: PackingUnitDTO, atRoom: string): string | null {
  const here = atRoom.trim();
  if (!here || !unit.destRoom) return null;
  if (here === unit.destRoom.trim()) return null;
  return `האריזה מיועדת ל${unit.destRoom} — ודאו שאתם בחדר הנכון`;
}

/**
 * A personal carton is sealed and has no item rows, so there is nothing to tick
 * (flows/distributing_flow.md note Fn). Recognised by its empty contents rather
 * than its type, so this module never reaches into the packing flow's code.
 */
export function needsItemStep(unit: PackingUnitDTO): boolean {
  return unit.items.length > 0;
}
