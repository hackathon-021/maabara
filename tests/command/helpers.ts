import { db } from '@/lib/db';
import type { ItemStatus, PackingUnitStatus, PackingUnitType, TransportStatus } from '@/lib/contracts';
import type { Fixture } from '../helpers/db';

export interface BoxSpec {
  roomId: number;
  status: PackingUnitStatus;
  code?: string | null;
  type?: PackingUnitType;
  transportUnitId?: number | null;
  closedAt?: Date | null;
  items?: {
    mappingReportId: number;
    quantity: number;
    distributedQuantity?: number;
    itemStatus?: ItemStatus;
  }[];
}

/** A packing unit with its items, written straight in. Returns the new box id. */
export async function makeBox(fx: Fixture, spec: BoxSpec): Promise<number> {
  const unit = await db.packingUnit.create({
    data: {
      sourceRoomId: spec.roomId,
      packedById: fx.userId,
      status: spec.status,
      code: spec.code === undefined ? null : spec.code,
      type: spec.type ?? 'professional_carton',
      transportUnitId: spec.transportUnitId ?? null,
      closedAt: spec.closedAt ?? null,
      destBuilding: 'בניין 7',
      destFloor: 'קומה 2',
      destRoom: 'חדר 214',
    },
  });
  for (const i of spec.items ?? []) {
    await db.packingUnitItem.create({
      data: {
        packingUnitId: unit.id,
        mappingReportId: i.mappingReportId,
        quantity: i.quantity,
        distributedQuantity: i.distributedQuantity ?? 0,
        itemStatus: i.itemStatus ?? 'packed',
      },
    });
  }
  return unit.id;
}

export interface TruckSpec {
  status: TransportStatus;
  licensePlate?: string;
  type?: 'truck' | 'other';
  departedAt?: Date | null;
}

export async function makeTruck(fx: Fixture, spec: TruckSpec): Promise<number> {
  const truck = await db.transportUnit.create({
    data: {
      groupId: fx.groupId,
      createdById: fx.userId,
      status: spec.status,
      licensePlate: spec.licensePlate ?? '12-345-67',
      type: spec.type ?? 'truck',
      departedAt: spec.departedAt ?? null,
    },
  });
  return truck.id;
}

export async function makeEvent(spec: {
  entityType: string;
  entityId: number;
  fromStatus?: string | null;
  toStatus: string;
  actorId: number;
  at?: Date;
  note?: string | null;
}): Promise<void> {
  await db.statusEvent.create({
    data: {
      entityType: spec.entityType,
      entityId: spec.entityId,
      fromStatus: spec.fromStatus ?? null,
      toStatus: spec.toStatus,
      actorId: spec.actorId,
      at: spec.at ?? new Date(),
      note: spec.note ?? null,
    },
  });
}

export async function makeNotification(body: string, at?: Date): Promise<void> {
  await db.notification.create({
    data: {
      body,
      recipients: 'מנהלת המעברים',
      entityType: 'transport_unit',
      entityId: 1,
      createdAt: at ?? new Date(),
    },
  });
}
