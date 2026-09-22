import type { Role } from '@/lib/contracts';

export interface FieldAction {
  href: string;
  title: string;
  body: string;
}

/** The four links of the evacuation chain (spec §2), in chain order. */
export const FIELD_ACTIONS: FieldAction[] = [
  { href: '/field/pack', title: 'אריזת ציוד', body: 'פתיחת אריזה, בחירת פריטים והדפסת מדבקה' },
  { href: '/field/load', title: 'העמסה והובלה', body: 'פתיחת יחידת הובלה וסריקת אריזות' },
  { href: '/field/receive', title: 'קבלת ציוד', body: 'פריקת יחידת הובלה וסריקת האריזות שהגיעו' },
  { href: '/field/distribute', title: 'פיזור ציוד', body: 'סריקת אריזה ופיזור הפריטים בחדר היעד' },
];

const PRIMARY_BY_ROLE: Record<string, string> = {
  packer: '/field/pack',
  transporter: '/field/load',
  unloader: '/field/receive',
  distributor: '/field/distribute',
};

/**
 * Role decides what is put under the packer's thumb — never what they are allowed to do.
 * Demo mode: everyone can reach every action (spec §1).
 */
export function homeActions(role: Role | null): { primary: FieldAction | null; others: FieldAction[] } {
  const href = role ? PRIMARY_BY_ROLE[role] : undefined;
  const primary = FIELD_ACTIONS.find((a) => a.href === href) ?? null;
  return { primary, others: FIELD_ACTIONS.filter((a) => a !== primary) };
}
