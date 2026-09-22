import {
  PACKABLE_ROOM_STATUSES,
  type PackableItemDTO, type PackingUnitDTO, type PackingUnitStatus, type PackingUnitSummaryDTO,
  type RoomStatus, type TransportStatus, type TransportUnitDTO,
} from '@/lib/contracts';
import { db, type Tx } from '@/lib/db';
import { Errors } from '@/lib/errors';
import { ROOM_STATUS_LABELS } from '@/lib/labels';
import {
  PACKING_UNIT_INCLUDE, PACKING_UNIT_SUMMARY_INCLUDE, TRANSPORT_UNIT_INCLUDE,
  normalizeCode, toPackingUnitDTO, toPackingUnitSummaryDTO, toTransportUnitDTO,
} from './dto';

export interface PackableReport {
  id: number;
  name: string;
  serial: string | null;
  status: 'transfer' | 'salvage';
  quantity: number;
  /** quantity minus everything already put into a box. */
  remaining: number;
}

/** A room still being mapped can't be packed; a room already finished can't be reopened. */
export function assertRoomPackable(room: { status: string }): void {
  if (room.status === 'waiting' || room.status === 'inProgress') throw Errors.roomNotMapped();
  if (!(PACKABLE_ROOM_STATUSES as readonly string[]).includes(room.status)) {
    throw Errors.illegalTransition(
      ROOM_STATUS_LABELS[room.status as RoomStatus] ?? room.status,
      ROOM_STATUS_LABELS.packing,
    );
  }
}

/**
 * Every transfer/salvage item of a room with how much is still unpacked.
 * Packed quantity is counted in ANY item status — equipment already in a box (even a missing
 * one) must never be offered for packing again. `excludePackingUnitId` leaves one box's own
 * rows out, which is what PUT /items needs when it replaces its contents.
 */
export async function packableReports(
  client: Tx,
  roomId: number,
  excludePackingUnitId?: number,
): Promise<PackableReport[]> {
  // TODO: remaining is read outside a lock — two concurrent PUT /items on one report can both
  // pass. Single-operator demo, so not worth SELECT FOR UPDATE here.
  const reports = await client.mappingReport.findMany({
    where: { roomId, isAvailable: true, status: { in: ['transfer', 'salvage'] } },
    include: { subCategory: true },
  });
  if (reports.length === 0) return [];

  const packed = await client.packingUnitItem.groupBy({
    by: ['mappingReportId'],
    where: {
      mappingReportId: { in: reports.map((r) => r.id) },
      ...(excludePackingUnitId === undefined ? {} : { packingUnitId: { not: excludePackingUnitId } }),
    },
    _sum: { quantity: true },
  });
  const consumed = new Map(packed.map((p) => [p.mappingReportId, p._sum.quantity ?? 0]));

  return reports
    .map((r) => ({
      id: r.id,
      name: r.subCategory.description,
      serial: r.serial,
      status: r.status as 'transfer' | 'salvage',
      quantity: r.quantity,
      remaining: r.quantity - (consumed.get(r.id) ?? 0),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

/** What the room check after a close needs: is anything left, and is anything awaiting disposal. */
export async function roomTotals(
  client: Tx,
  roomId: number,
): Promise<{ remaining: number; disposalRemaining: number }> {
  const reports = await packableReports(client, roomId);
  const disposal = await client.mappingReport.aggregate({
    where: { roomId, isAvailable: true, status: 'disposal' },
    _sum: { quantity: true },
  });
  return {
    remaining: reports.reduce((n, r) => n + r.remaining, 0),
    disposalRemaining: disposal._sum.quantity ?? 0,
  };
}

export async function listPackableItems(roomId: number): Promise<PackableItemDTO[]> {
  const room = await db.room.findUnique({ where: { id: roomId } });
  if (!room) throw Errors.notFound('חדר');
  assertRoomPackable(room);
  const reports = await packableReports(db, roomId);
  return reports
    .filter((r) => r.remaining > 0)
    .map((r) => ({
      mappingReportId: r.id,
      name: r.name,
      serial: r.serial,
      status: r.status,
      remaining: r.remaining,
    }));
}

export async function listPackingUnits(
  filter: { status?: PackingUnitStatus; roomId?: number } = {},
): Promise<PackingUnitSummaryDTO[]> {
  const rows = await db.packingUnit.findMany({
    where: {
      ...(filter.status === undefined ? {} : { status: filter.status }),
      ...(filter.roomId === undefined ? {} : { sourceRoomId: filter.roomId }),
    },
    include: PACKING_UNIT_SUMMARY_INCLUDE,
    orderBy: { id: 'asc' },
  });
  return rows.map(toPackingUnitSummaryDTO);
}

/** Reads a box back through the same client that just wrote it, so actions return fresh data. */
export async function loadPackingUnitDTO(client: Tx, id: number): Promise<PackingUnitDTO> {
  const row = await client.packingUnit.findUnique({ where: { id }, include: PACKING_UNIT_INCLUDE });
  if (!row) throw Errors.notFound('אריזה');
  return toPackingUnitDTO(row);
}

export async function getPackingUnit(id: number): Promise<PackingUnitDTO> {
  return loadPackingUnitDTO(db, id);
}

export async function getPackingUnitByCode(code: string): Promise<PackingUnitDTO> {
  const row = await db.packingUnit.findUnique({
    where: { code: normalizeCode(code) },
    include: PACKING_UNIT_INCLUDE,
  });
  if (!row) throw Errors.notFound(`אריזה ${normalizeCode(code)}`);
  return toPackingUnitDTO(row);
}

export async function loadTransportUnitDTO(client: Tx, id: number): Promise<TransportUnitDTO> {
  const row = await client.transportUnit.findUnique({ where: { id }, include: TRANSPORT_UNIT_INCLUDE });
  if (!row) throw Errors.notFound('יחידת הובלה');
  return toTransportUnitDTO(row);
}

export async function listTransportUnits(status?: TransportStatus): Promise<TransportUnitDTO[]> {
  const rows = await db.transportUnit.findMany({
    where: status === undefined ? {} : { status },
    include: TRANSPORT_UNIT_INCLUDE,
    orderBy: { id: 'desc' },
  });
  return rows.map(toTransportUnitDTO);
}
