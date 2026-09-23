/** Badge ranks based on total actions (StatusEvent rows) performed by a user.
 *  Themed around a military relocation operation — the more you move, the higher you rise.
 */

export interface Badge {
  /** Internal key */
  key: string;
  /** Hebrew rank title shown to the user */
  title: string;
  /** Flavour description */
  description: string;
  /** Emoji/icon displayed next to the badge */
  icon: string;
  /** Tailwind-compatible colour token (used as a CSS variable suffix) */
  color: string;
  /** Minimum number of actions required for this rank */
  minActions: number;
}

/** Ordered from lowest to highest threshold. */
export const BADGES: Badge[] = [
  {
    key: 'rookie',
    title: 'חייל מעברה',
    description: 'רק התחלת את הדרך — כל מעברה גדולה מתחילה בצעד אחד.',
    icon: '🪖',
    color: '#8B8B8B',
    minActions: 0,
  },
  {
    key: 'packer',
    title: 'אורז מיומן',
    description: 'כבר יודע לארוז. הקרטונים רועדים בהערכה.',
    icon: '📦',
    color: '#6B8E5E',
    minActions: 5,
  },
  {
    key: 'carrier',
    title: 'נושא המשא',
    description: 'על כתפיך נישאת המעברה — פריט אחר פריט.',
    icon: '🚛',
    color: '#5F42FF',
    minActions: 15,
  },
  {
    key: 'logistics',
    title: 'מפקד לוגיסטי',
    description: 'ראית את כל שלבי המעברה. הציוד עובר — בזכותך.',
    icon: '📋',
    color: '#005DF5',
    minActions: 30,
  },
  {
    key: 'veteran',
    title: 'ותיק המעברה',
    description: 'אגדה חיה. כל חייל שואל — מה היית עושה?',
    icon: '⭐',
    color: '#B26A00',
    minActions: 60,
  },
  {
    key: 'legend',
    title: 'מק פורק',
    description: 'יש אנשים שמדברים על מעברות. ואתה — אתה מק פורק. הדרגה הסודית שרובם לעולם לא יגיעו אליה. האם אתה מוכן?',
    icon: '🏅',
    color: '#C62828',
    minActions: 100,
  },
];

/** Returns the highest badge the user has earned based on their action count. */
export function getBadge(actionCount: number): Badge {
  let earned = BADGES[0];
  for (const badge of BADGES) {
    if (actionCount >= badge.minActions) {
      earned = badge;
    }
  }
  return earned;
}

/** Returns the next badge after the current one, or null if at max rank. */
export function getNextBadge(currentBadge: Badge): Badge | null {
  const idx = BADGES.findIndex((b) => b.key === currentBadge.key);
  return idx >= 0 && idx < BADGES.length - 1 ? BADGES[idx + 1] : null;
}
