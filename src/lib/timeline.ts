import type { EntityType, TimelineEventDTO } from '@/lib/contracts';
import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';
import { statusLabel } from '@/lib/labels';

/**
 * One readable Hebrew line per event. `subject` is whatever identifies the entity
 * on screen — a box code, an item name, a licence plate.
 */
export function timelineLabel(entityType: EntityType, toStatus: string, subject: string): string {
  const status = statusLabel(entityType, toStatus);
  switch (entityType) {
    case 'packing_unit':
      return `אריזה ${subject}: ${status}`;
    case 'packing_unit_item':
      return `פריט "${subject}": ${status}`;
    case 'transport_unit':
      return `יחידת הובלה ${subject}: ${status}`;
    case 'room':
      return `${subject}: ${status}`;
  }
}

/**
 * Everything that happened to one box: its own events, its items', and those of the
 * transport unit it rode on. The truck's events are what answer "where did it go?".
 */
export async function getTimeline(packingUnitId: number): Promise<TimelineEventDTO[]> {
  const unit = await db.packingUnit.findUnique({
    where: { id: packingUnitId },
    select: {
      id: true,
      code: true,
      transportUnitId: true,
      transportUnit: { select: { id: true, licensePlate: true } },
      items: {
        select: {
          id: true,
          mappingReport: { select: { subCategory: { select: { description: true } } } },
        },
      },
    },
  });
  if (!unit) throw Errors.notFound('אריזה');

  // A box has no code until it closes, so its earliest events are labelled by id.
  const subjects = new Map<string, string>();
  subjects.set(`packing_unit:${unit.id}`, unit.code ?? `#${unit.id}`);
  for (const i of unit.items) {
    subjects.set(`packing_unit_item:${i.id}`, i.mappingReport.subCategory.description);
  }
  if (unit.transportUnit) {
    subjects.set(`transport_unit:${unit.transportUnit.id}`, unit.transportUnit.licensePlate);
  }

  const itemIds = unit.items.map((i) => i.id);
  const events = await db.statusEvent.findMany({
    where: {
      OR: [
        { entityType: 'packing_unit', entityId: unit.id },
        ...(itemIds.length > 0 ? [{ entityType: 'packing_unit_item', entityId: { in: itemIds } }] : []),
        ...(unit.transportUnitId !== null
          ? [{ entityType: 'transport_unit', entityId: unit.transportUnitId }]
          : []),
      ],
    },
    // Several events share one transaction timestamp; id breaks the tie deterministically.
    orderBy: [{ at: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      at: true,
      entityType: true,
      entityId: true,
      fromStatus: true,
      toStatus: true,
      note: true,
      actor: { select: { name: true } },
    },
  });

  return events.map((e) => {
    const entityType = e.entityType as EntityType;
    const subject = subjects.get(`${e.entityType}:${e.entityId}`) ?? String(e.entityId);
    return {
      id: e.id,
      at: e.at.toISOString(),
      entityType,
      entityId: e.entityId,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      label: timelineLabel(entityType, e.toStatus, subject),
      actorName: e.actor.name,
      note: e.note,
    };
  });
}
