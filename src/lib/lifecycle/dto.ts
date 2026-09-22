import type { Prisma } from '@prisma/client';
import type {
  ItemStatus, PackingUnitDTO, PackingUnitItemDTO, PackingUnitStatus, PackingUnitSummaryDTO,
  PackingUnitType, TransportStatus, TransportType, TransportUnitDTO,
} from '@/lib/contracts';

export const PACKING_UNIT_SUMMARY_INCLUDE = { sourceRoom: true } satisfies Prisma.PackingUnitInclude;

export const PACKING_UNIT_INCLUDE = {
  sourceRoom: { include: { group: true } },
  packedBy: true,
  items: { include: { mappingReport: { include: { subCategory: true } } } },
} satisfies Prisma.PackingUnitInclude;

export const TRANSPORT_UNIT_INCLUDE = {
  packingUnits: { include: PACKING_UNIT_SUMMARY_INCLUDE },
} satisfies Prisma.TransportUnitInclude;

export type PackingUnitSummaryRow = Prisma.PackingUnitGetPayload<{ include: typeof PACKING_UNIT_SUMMARY_INCLUDE }>;
export type PackingUnitRow = Prisma.PackingUnitGetPayload<{ include: typeof PACKING_UNIT_INCLUDE }>;
export type TransportUnitRow = Prisma.TransportUnitGetPayload<{ include: typeof TRANSPORT_UNIT_INCLUDE }>;

/** Postgres CHAR(5) pads on read and scanners add whitespace. Codes are compared normalized. */
export function normalizeCode(code: string): string {
  return code.trim();
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'he');

export function toPackingUnitSummaryDTO(u: PackingUnitSummaryRow): PackingUnitSummaryDTO {
  return {
    id: u.id,
    code: u.code === null ? null : normalizeCode(u.code),
    type: u.type as PackingUnitType,
    status: u.status as PackingUnitStatus,
    sourceRoomName: u.sourceRoom.description,
    destBuilding: u.destBuilding,
    destFloor: u.destFloor,
    destRoom: u.destRoom,
  };
}

export function toPackingUnitDTO(u: PackingUnitRow): PackingUnitDTO {
  const items: PackingUnitItemDTO[] = u.items
    .map((i) => ({
      id: i.id,
      mappingReportId: i.mappingReportId,
      name: i.mappingReport.subCategory.description,
      serial: i.mappingReport.serial,
      quantity: i.quantity,
      distributedQuantity: i.distributedQuantity,
      itemStatus: i.itemStatus as ItemStatus,
    }))
    .sort(byName);

  return {
    ...toPackingUnitSummaryDTO(u),
    sourceRoomId: u.sourceRoomId,
    groupName: u.sourceRoom.group.name,
    roomManager: u.sourceRoom.roomManager,
    transportUnitId: u.transportUnitId,
    packedByName: u.packedBy.name,
    closedAt: u.closedAt?.toISOString() ?? null,
    items,
  };
}

export function toTransportUnitDTO(t: TransportUnitRow): TransportUnitDTO {
  return {
    id: t.id,
    type: t.type as TransportType,
    typeDetails: t.typeDetails,
    licensePlate: t.licensePlate,
    groupId: t.groupId,
    status: t.status as TransportStatus,
    createdAt: t.createdAt.toISOString(),
    departedAt: t.departedAt?.toISOString() ?? null,
    releasedAt: t.releasedAt?.toISOString() ?? null,
    boxes: t.packingUnits
      .map(toPackingUnitSummaryDTO)
      .sort((a, b) => (a.code ?? '').localeCompare(b.code ?? '')),
  };
}
