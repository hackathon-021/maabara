import type { DashboardDTO, ItemStatus, PackingUnitStatus, RoomStatus, TransportStatus, TransportType } from '@/lib/contracts';
import { PACKING_UNIT_STATUSES } from '@/lib/contracts';
import { db } from '@/lib/db';

export interface KpiRow {
  quantity: number;
  distributedQuantity: number;
  itemStatus: ItemStatus;
  boxStatus: PackingUnitStatus;
}

/**
 * Where every packed unit of equipment is right now, counted in item quantities.
 *
 * The six buckets partition the packed universe exactly: each row contributes its
 * whole quantity to one bucket, except a `short` row, which splits between what was
 * actually handed over and what was not. That is what makes the KPI row add up.
 */
export function tallyKpis(rows: KpiRow[], totalMapped: number): DashboardDTO['kpis'] {
  const k = { totalMapped, packed: 0, inTransit: 0, received: 0, distributed: 0, missing: 0, short: 0 };

  for (const r of rows) {
    switch (r.itemStatus) {
      case 'missing':
        k.missing += r.quantity;
        break;
      case 'short':
        k.distributed += r.distributedQuantity;
        k.short += r.quantity - r.distributedQuantity;
        break;
      case 'distributed':
        k.distributed += r.quantity;
        break;
      case 'received':
        k.received += r.quantity;
        break;
      case 'packed':
        // Still packed: the box's own status says whether it has left the source.
        if (r.boxStatus === 'in_transit') k.inTransit += r.quantity;
        else k.packed += r.quantity;
        break;
    }
  }

  return k;
}

/** Cartons per status. Every status is present, at zero, so the UI never indexes a missing key. */
export function tallyBoxes(statuses: PackingUnitStatus[]): Record<PackingUnitStatus, number> {
  const counts = Object.fromEntries(PACKING_UNIT_STATUSES.map((s) => [s, 0])) as Record<
    PackingUnitStatus,
    number
  >;
  for (const s of statuses) counts[s] = (counts[s] ?? 0) + 1;
  return counts;
}

export async function dashboardKpis(): Promise<{
  kpis: DashboardDTO['kpis'];
  boxCounts: Record<PackingUnitStatus, number>;
}> {
  // TODO: three small queries reduced in JS. Fine for a demo database; push down into SQL for real data.
  const [items, mapped, boxes] = await Promise.all([
    db.packingUnitItem.findMany({
      select: {
        quantity: true,
        distributedQuantity: true,
        itemStatus: true,
        packingUnit: { select: { status: true } },
      },
    }),
    // transfer + salvage only: a disposal item is never packed, so it is not part of the target.
    db.mappingReport.aggregate({
      where: { isAvailable: true, status: { in: ['transfer', 'salvage'] } },
      _sum: { quantity: true },
    }),
    db.packingUnit.findMany({ select: { status: true } }),
  ]);

  const rows: KpiRow[] = items.map((i) => ({
    quantity: i.quantity,
    distributedQuantity: i.distributedQuantity,
    itemStatus: i.itemStatus as ItemStatus,
    boxStatus: i.packingUnit.status as PackingUnitStatus,
  }));

  return {
    // _sum is null on an empty table.
    kpis: tallyKpis(rows, mapped._sum.quantity ?? 0),
    boxCounts: tallyBoxes(boxes.map((b) => b.status as PackingUnitStatus)),
  };
}

/** Source rooms with their mapped-versus-packed progress (spec §6). */
export async function dashboardRooms(): Promise<DashboardDTO['rooms']> {
  const rooms = await db.room.findMany({
    where: { isAvailable: true },
    // Stable order: the grid must not reshuffle under a 3-second poll.
    orderBy: [{ groupId: 'asc' }, { description: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      description: true,
      status: true,
      group: { select: { name: true } },
      mappingReports: { where: { isAvailable: true }, select: { status: true, quantity: true } },
      packingUnits: { select: { items: { select: { quantity: true } } } },
    },
  });

  return rooms.map((r) => ({
    id: r.id,
    groupName: r.group.name,
    description: r.description,
    status: r.status as RoomStatus,
    mappedQty: r.mappingReports
      .filter((m) => m.status !== 'disposal')
      .reduce((sum, m) => sum + m.quantity, 0),
    packedQty: r.packingUnits.reduce(
      (sum, u) => sum + u.items.reduce((inner, i) => inner + i.quantity, 0),
      0,
    ),
  }));
}

/** Transport units, newest first (spec §6). */
export async function dashboardTrucks(): Promise<DashboardDTO['trucks']> {
  const trucks = await db.transportUnit.findMany({
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      licensePlate: true,
      type: true,
      status: true,
      departedAt: true,
      _count: { select: { packingUnits: true } },
    },
  });

  return trucks.map((t) => ({
    id: t.id,
    licensePlate: t.licensePlate,
    type: t.type as TransportType,
    status: t.status as TransportStatus,
    boxCount: t._count.packingUnits,
    departedAt: t.departedAt?.toISOString() ?? null,
  }));
}

/** Nobody to attribute a row to — a seeded box, or one written outside the lifecycle. */
const UNKNOWN_ACTOR = '—';

/**
 * Every missing box and every short item, with the last actor and time from
 * `status_events` (spec §6). A row with no event behind it is still reported —
 * an unattributed loss is exactly the thing that must not disappear.
 */
export async function dashboardExceptions(): Promise<DashboardDTO['exceptions']> {
  const [missingBoxes, shortItems] = await Promise.all([
    db.packingUnit.findMany({
      where: { status: 'missing' },
      select: {
        id: true,
        code: true,
        openedAt: true,
        sourceRoom: { select: { description: true } },
      },
    }),
    db.packingUnitItem.findMany({
      where: { itemStatus: 'short' },
      select: {
        id: true,
        quantity: true,
        distributedQuantity: true,
        mappingReport: { select: { subCategory: { select: { description: true } } } },
        packingUnit: { select: { id: true, code: true, openedAt: true } },
      },
    }),
  ]);

  const events = await db.statusEvent.findMany({
    where: {
      OR: [
        { entityType: 'packing_unit', entityId: { in: missingBoxes.map((b) => b.id) } },
        { entityType: 'packing_unit_item', entityId: { in: shortItems.map((i) => i.id) } },
      ],
    },
    orderBy: { at: 'desc' },
    select: { entityType: true, entityId: true, at: true, actor: { select: { name: true } } },
  });

  // Ordered newest first, so the first row seen for a key is the latest one.
  const latest = new Map<string, { at: Date; actorName: string }>();
  for (const e of events) {
    const key = `${e.entityType}:${e.entityId}`;
    if (!latest.has(key)) latest.set(key, { at: e.at, actorName: e.actor.name });
  }

  const rows: DashboardDTO['exceptions'] = [];

  for (const b of missingBoxes) {
    const last = latest.get(`packing_unit:${b.id}`);
    rows.push({
      kind: 'missing_box',
      packingUnitId: b.id,
      packingUnitCode: b.code,
      description: `אריזה ${b.code ?? '—'} מ${b.sourceRoom.description}`,
      lastActorName: last?.actorName ?? UNKNOWN_ACTOR,
      at: (last?.at ?? b.openedAt).toISOString(),
    });
  }

  for (const i of shortItems) {
    const last = latest.get(`packing_unit_item:${i.id}`);
    rows.push({
      kind: 'short_item',
      packingUnitId: i.packingUnit.id,
      packingUnitCode: i.packingUnit.code,
      description: `${i.mappingReport.subCategory.description}: פוזרו ${i.distributedQuantity} מתוך ${i.quantity}`,
      lastActorName: last?.actorName ?? UNKNOWN_ACTOR,
      at: (last?.at ?? i.packingUnit.openedAt).toISOString(),
    });
  }

  // ISO strings sort lexicographically, so this is a plain reverse-chronological sort.
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

/** The mocked SMS outbox, newest first. */
export async function dashboardNotifications(): Promise<DashboardDTO['notifications']> {
  const rows = await db.notification.findMany({
    orderBy: { createdAt: 'desc' },
    // TODO: the feed is a demo artefact; a cap keeps it readable across rehearsals.
    take: 20,
  });
  return rows.map((n) => ({
    id: n.id,
    body: n.body,
    recipients: n.recipients,
    createdAt: n.createdAt.toISOString(),
  }));
}

export async function getDashboard(): Promise<DashboardDTO> {
  const [kpiPart, rooms, trucks, exceptions, notifications] = await Promise.all([
    dashboardKpis(),
    dashboardRooms(),
    dashboardTrucks(),
    dashboardExceptions(),
    dashboardNotifications(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    kpis: kpiPart.kpis,
    boxCounts: kpiPart.boxCounts,
    rooms,
    trucks,
    exceptions,
    notifications,
  };
}
