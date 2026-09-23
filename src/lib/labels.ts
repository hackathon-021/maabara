import type {
  ItemStatus, MappingStatus, PackingUnitStatus, PackingUnitType, Rank, Role, RoomStatus,
  TransportStatus, TransportType,
} from './contracts';

export const ROLE_LABELS: Record<Role, string> = {
  packer: 'אורז',
  transporter: 'מוביל',
  unloader: 'פורק',
  distributor: 'מפזר',
  commander: 'מפקד',
};

export const RANK_LABELS: Record<Rank, string> = {
  soldier: 'חייל',
  ramad: 'רמ"ד',
  raan: 'רע"נ',
  unit_commander: 'מפקד יחידה',
};

export const PACKING_UNIT_TYPE_LABELS: Record<PackingUnitType, string> = {
  professional_carton: 'קרטון מקצועי',
  personal_carton: 'קרטון אישי',
  pallet: 'משטח',
  trolley: 'דולב',
  loose: 'תפזורת',
};

export const PACKING_UNIT_STATUS_LABELS: Record<PackingUnitStatus, string> = {
  open: 'אריזה בתהליך',
  closed: 'אריזה נסגרה',
  in_transit: 'אריזה בדרך',
  received: 'אריזה התקבלה',
  missing: 'אריזה חסרה',
  distributed: 'אריזה פוזרה',
  distributed_short: 'אריזה פוזרה עם חוסר',
};

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  packed: 'פריט נארז',
  received: 'פריט התקבל',
  distributed: 'פריט פוזר',
  missing: 'פריט חסר',
  short: 'פריט בחוסר',
};

export const TRANSPORT_TYPE_LABELS: Record<TransportType, string> = {
  truck: 'משאית',
  other: 'אחר',
};

export const TRANSPORT_STATUS_LABELS: Record<TransportStatus, string> = {
  loading: 'בתהליך העמסה',
  in_transit: 'יחידת הובלה בדרך',
  released: 'יחידת הובלה שוחררה',
};

export const ROOM_STATUS_LABELS: Record<RoomStatus, string> = {
  waiting: 'ממתין למיפוי',
  inProgress: 'במיפוי',
  done: 'מופה',
  packing: 'באריזה',
  closed: 'חדר סגור',
  awaiting_disposal: 'ממתין לגריטה',
};

export const MAPPING_STATUS_LABELS: Record<MappingStatus, string> = {
  transfer: 'עובר',
  salvage: 'הנצלה',
  disposal: 'גריטה',
};

/** Hebrew label for a status string of a known entity type ('unloaded' is a transport pseudo-status). */
export function statusLabel(entityType: string, status: string | null): string {
  if (status === null) return '—';
  const maps: Record<string, Record<string, string>> = {
    packing_unit: PACKING_UNIT_STATUS_LABELS,
    packing_unit_item: ITEM_STATUS_LABELS,
    transport_unit: { ...TRANSPORT_STATUS_LABELS, unloaded: 'יחידת הובלה נפרקה במלואה' },
    room: ROOM_STATUS_LABELS,
  };
  return maps[entityType]?.[status] ?? status;
}
