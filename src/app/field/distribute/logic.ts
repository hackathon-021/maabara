import type { DistributeReq, PackingUnitDTO, PackingUnitItemDTO } from '@/lib/contracts';
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

/** How much of this item is still in the box. */
export function maxFor(item: PackingUnitItemDTO): number {
  return Math.max(0, item.quantity - item.distributedQuantity);
}

/**
 * Nothing is handed over until the distributor says so (Conventions #5).
 * Prefilling would mean a box nobody looked into is recorded as fully distributed.
 */
export function emptyDraft(items: PackingUnitItemDTO[]): Record<number, number> {
  return Object.fromEntries(items.map((i) => [i.id, 0]));
}

/** The "פוזר הכל" shortcut: everything in the box, in one tap. */
export function fullDraft(items: PackingUnitItemDTO[]): Record<number, number> {
  return Object.fromEntries(items.map((i) => [i.id, maxFor(i)]));
}

/** What is about to be recorded as short (flows/distributing_flow.md nodes J–K). */
export function shortfall(
  items: PackingUnitItemDTO[],
  draft: Record<number, number>,
): { item: PackingUnitItemDTO; missing: number }[] {
  return items
    .map((item) => ({ item, missing: maxFor(item) - (draft[item.id] ?? 0) }))
    .filter((row) => row.missing > 0);
}

export function distributeRequest(draft: Record<number, number>, atRoom: string): DistributeReq {
  return {
    items: Object.entries(draft)
      .filter(([, quantity]) => quantity > 0)
      .map(([packingUnitItemId, quantity]) => ({ packingUnitItemId: Number(packingUnitItemId), quantity })),
    atRoom: atRoom.trim(),
  };
}

/**
 * The closing screen. Driven by the status the server returned — an empty request
 * means `distributed` for a personal carton and `distributed_short` for a box with
 * contents, and only the server knows which happened.
 */
export function distributeSummary(unit: PackingUnitDTO): {
  title: string;
  tone: 'ok' | 'warn';
  lines: string[];
} {
  const lines = [`מספר אריזה: ${unit.code ?? '—'}`];

  if (unit.status === 'distributed') {
    return { title: 'האריזה פוזרה במלואה', tone: 'ok', lines };
  }

  if (unit.status === 'distributed_short') {
    for (const i of unit.items.filter((i) => i.itemStatus === 'short')) {
      lines.push(`${i.name}: פוזרו ${i.distributedQuantity} מתוך ${i.quantity}`);
    }
    return { title: 'האריזה פוזרה עם חוסר', tone: 'warn', lines };
  }

  // Should not happen. Say so rather than claiming a success nobody confirmed.
  return { title: 'הפיזור לא הושלם', tone: 'warn', lines };
}
