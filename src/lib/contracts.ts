// Frozen shared contracts. Owner: P1. Additive changes only, announced in team chat.

export const ROLES = ['packer', 'transporter', 'unloader', 'distributor', 'commander'] as const;
export type Role = (typeof ROLES)[number];

export const RANKS = ['soldier', 'ramad', 'raan', 'unit_commander'] as const;
export type Rank = (typeof RANKS)[number];

export const RANK_LEVEL: Record<Rank, number> = {
  soldier: 0,
  ramad: 1,
  raan: 2,
  unit_commander: 3,
};

export const PACKING_UNIT_TYPES = ['professional_carton', 'personal_carton', 'pallet', 'trolley', 'loose'] as const;
export type PackingUnitType = (typeof PACKING_UNIT_TYPES)[number];

export const PACKING_UNIT_STATUSES = [
  'open', 'closed', 'in_transit', 'received', 'missing', 'distributed', 'distributed_short',
] as const;
export type PackingUnitStatus = (typeof PACKING_UNIT_STATUSES)[number];

export const ITEM_STATUSES = ['packed', 'received', 'distributed', 'missing', 'short'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const TRANSPORT_TYPES = ['truck', 'other'] as const;
export type TransportType = (typeof TRANSPORT_TYPES)[number];

export const TRANSPORT_STATUSES = ['loading', 'in_transit', 'released'] as const;
export type TransportStatus = (typeof TRANSPORT_STATUSES)[number];

export const MAPPING_STATUSES = ['transfer', 'salvage', 'disposal'] as const;
export type MappingStatus = (typeof MAPPING_STATUSES)[number];

export const ROOM_STATUSES = ['waiting', 'inProgress', 'done', 'packing', 'closed', 'awaiting_disposal'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

/** Rooms in these statuses finished Phase A mapping and may be packed. */
export const PACKABLE_ROOM_STATUSES: readonly RoomStatus[] = ['done', 'packing'];

export const ENTITY_TYPES = ['packing_unit', 'packing_unit_item', 'transport_unit', 'room'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const BOX_CODE_RE = /^\d{5}$/;

export type ErrorCode =
  | 'ILLEGAL_TRANSITION'
  | 'NOT_ON_THIS_TRUCK'
  | 'QUANTITY_EXCEEDS_REMAINING'
  | 'ROOM_NOT_MAPPED'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'INTERNAL';

export interface ApiError {
  error: ErrorCode;
  messageHe: string;
}

// ---------- DTOs (all dates are ISO strings) ----------

export interface MeDTO {
  id: number;
  email: string;
  name: string;
  role: Role | null;
}

export interface GroupDTO {
  id: number;
  name: string;
}

export interface RoomDTO {
  id: number;
  groupId: number;
  description: string;
  status: RoomStatus;
  roomManager: string | null;
}

export interface PackableItemDTO {
  mappingReportId: number;
  name: string;
  serial: string | null;
  status: 'transfer' | 'salvage';
  remaining: number;
}

export interface PackingUnitItemDTO {
  id: number;
  mappingReportId: number;
  name: string;
  serial: string | null;
  quantity: number;
  distributedQuantity: number;
  itemStatus: ItemStatus;
}

export interface PackingUnitSummaryDTO {
  id: number;
  code: string | null;
  type: PackingUnitType;
  status: PackingUnitStatus;
  sourceRoomName: string;
  destBuilding: string | null;
  destFloor: string | null;
  destRoom: string | null;
}

export interface PackingUnitDTO extends PackingUnitSummaryDTO {
  sourceRoomId: number;
  groupName: string;
  roomManager: string | null;
  transportUnitId: number | null;
  packedByName: string;
  closedAt: string | null;
  items: PackingUnitItemDTO[];
}

export interface RoomCheckDTO {
  remaining: number;
  disposalRemaining: number;
  roomStatus: RoomStatus;
}

export interface ClosePackingUnitResult {
  unit: PackingUnitDTO;
  /** null for personal cartons (no room check). */
  roomCheck: RoomCheckDTO | null;
}

export interface TransportUnitDTO {
  id: number;
  type: TransportType;
  typeDetails: string | null;
  licensePlate: string;
  groupId: number;
  status: TransportStatus;
  createdAt: string;
  departedAt: string | null;
  releasedAt: string | null;
  boxes: PackingUnitSummaryDTO[];
}

export interface ReceiveResult {
  transportUnit: TransportUnitDTO;
  receivedCodes: string[];
  missingCodes: string[];
  surplusCodes: string[];
}

export interface TimelineEventDTO {
  id: number;
  at: string;
  entityType: EntityType;
  entityId: number;
  fromStatus: string | null;
  toStatus: string;
  /** Hebrew, human-readable, e.g. 'פריט "מחשב נייד": פריט נארז' */
  label: string;
  actorName: string;
  note: string | null;
}

export interface DashboardDTO {
  generatedAt: string;
  kpis: {
    totalMapped: number;
    packed: number;
    inTransit: number;
    received: number;
    distributed: number;
    missing: number;
    short: number;
  };
  boxCounts: Record<PackingUnitStatus, number>;
  rooms: {
    id: number;
    groupName: string;
    description: string;
    status: RoomStatus;
    mappedQty: number;
    packedQty: number;
  }[];
  trucks: {
    id: number;
    licensePlate: string;
    type: TransportType;
    status: TransportStatus;
    boxCount: number;
    departedAt: string | null;
  }[];
  exceptions: {
    kind: 'missing_box' | 'short_item';
    packingUnitId: number;
    packingUnitCode: string | null;
    description: string;
    lastActorName: string;
    at: string;
  }[];
  notifications: {
    id: number;
    body: string;
    recipients: string;
    createdAt: string;
  }[];
}

// ---------- Requests ----------

export interface OpenPackingUnitReq {
  sourceRoomId: number;
  type: PackingUnitType;
}
export interface SetItemsReq {
  items: { mappingReportId: number; quantity: number }[];
}
export interface ClosePackingUnitReq {
  destBuilding: string;
  destFloor: string;
  destRoom: string;
}
export interface CreateTransportReq {
  type: TransportType;
  typeDetails?: string;
  licensePlate: string;
  groupId: number;
}
export interface LoadReq {
  codes: string[];
}
export interface ReceiveReq {
  receivedCodes: string[];
  surplusCodes: string[];
}
export interface DistributeReq {
  items: { packingUnitItemId: number; quantity: number }[];
  atRoom: string;
}
export interface SetRoleReq {
  role: Role;
}

export interface SubordinateStatusDTO {
  id: number;
  name: string;
  email: string;
  rank: Rank;
  role: Role | null;
  commanderId: number | null;
  lastActivityAt: string | null;
  lastActivityLabel: string | null;
}

export interface AssignSubordinateReq {
  subordinateId: number;
}
export interface SetRankReq {
  userId: number;
  rank: Rank;
}
