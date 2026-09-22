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
    orderBy: [{ groupId: 'asc' }, { description: 'asc' }],
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
    orderBy: { createdAt: 'desc' },
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
