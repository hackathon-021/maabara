import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  assignSubordinate, getSubordinateStatuses, getSubtreeIds, hasCommanderPermission,
  isAncestor, removeSubordinate, setRank,
} from '@/lib/command';
import type { Rank } from '@/lib/contracts';
import { resetDb } from '../helpers/db';

async function makeUser(email: string, rank: Rank, commanderId: number | null = null): Promise<number> {
  const u = await db.user.create({ data: { email, name: email, rank, commanderId } });
  return u.id;
}

describe('hasCommanderPermission', () => {
  it('is false only for soldier', () => {
    expect(hasCommanderPermission('soldier')).toBe(false);
    expect(hasCommanderPermission('ramad')).toBe(true);
    expect(hasCommanderPermission('raan')).toBe(true);
    expect(hasCommanderPermission('unit_commander')).toBe(true);
  });
});

describe('command hierarchy', () => {
  beforeEach(resetDb);

  it('a new user defaults to soldier', async () => {
    const u = await db.user.create({ data: { email: 'a@x.local', name: 'A' } });
    expect(u.rank).toBe('soldier');
    expect(u.commanderId).toBeNull();
  });

  describe('isAncestor', () => {
    it('finds a grandparent in the chain', async () => {
      const commander = await makeUser('c@x.local', 'unit_commander');
      const middle = await makeUser('m@x.local', 'raan', commander);
      const leaf = await makeUser('l@x.local', 'soldier', middle);
      expect(await isAncestor(commander, leaf)).toBe(true);
      expect(await isAncestor(middle, leaf)).toBe(true);
      expect(await isAncestor(leaf, commander)).toBe(false);
    });

    it('is false with no chain at all', async () => {
      const a = await makeUser('a@x.local', 'soldier');
      const b = await makeUser('b@x.local', 'soldier');
      expect(await isAncestor(a, b)).toBe(false);
    });
  });

  describe('assignSubordinate', () => {
    it('sets the direct link when the actor has commander permission', async () => {
      const commander = await makeUser('c@x.local', 'ramad');
      const soldier = await makeUser('s@x.local', 'soldier');
      await assignSubordinate(commander, soldier);
      expect((await db.user.findUniqueOrThrow({ where: { id: soldier } })).commanderId).toBe(commander);
    });

    it('rejects a soldier acting as commander', async () => {
      const soldier = await makeUser('s@x.local', 'soldier');
      const target = await makeUser('t@x.local', 'soldier');
      await expect(assignSubordinate(soldier, target)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('rejects self-assignment', async () => {
      const commander = await makeUser('c@x.local', 'ramad');
      await expect(assignSubordinate(commander, commander)).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('rejects a cycle (assigning your own ancestor as your subordinate)', async () => {
      const top = await makeUser('top@x.local', 'unit_commander');
      const middle = await makeUser('mid@x.local', 'raan', top);
      await expect(assignSubordinate(middle, top)).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    // Review Focus 3.
    it('reassigns a subordinate who already has a different commander', async () => {
      const commanderA = await makeUser('a@x.local', 'ramad');
      const commanderB = await makeUser('b@x.local', 'ramad');
      const soldier = await makeUser('s@x.local', 'soldier', commanderA);
      await assignSubordinate(commanderB, soldier);
      expect((await db.user.findUniqueOrThrow({ where: { id: soldier } })).commanderId).toBe(commanderB);
    });
  });

  describe('removeSubordinate', () => {
    it('removes a direct link', async () => {
      const commander = await makeUser('c@x.local', 'ramad');
      const soldier = await makeUser('s@x.local', 'soldier', commander);
      await removeSubordinate(commander, soldier);
      expect((await db.user.findUniqueOrThrow({ where: { id: soldier } })).commanderId).toBeNull();
    });

    // Review Focus 2.
    it('rejects removing a grandchild (not a direct report)', async () => {
      const top = await makeUser('top@x.local', 'raan');
      const middle = await makeUser('mid@x.local', 'ramad', top);
      const leaf = await makeUser('leaf@x.local', 'soldier', middle);
      await expect(removeSubordinate(top, leaf)).rejects.toMatchObject({ code: 'VALIDATION' });
      expect((await db.user.findUniqueOrThrow({ where: { id: leaf } })).commanderId).toBe(middle);
    });
  });

  describe('setRank', () => {
    it('promotes a descendant to a strictly lower rank than the actor', async () => {
      const top = await makeUser('top@x.local', 'unit_commander');
      const soldier = await makeUser('s@x.local', 'soldier', top);
      await setRank(top, soldier, 'ramad');
      expect((await db.user.findUniqueOrThrow({ where: { id: soldier } })).rank).toBe('ramad');
    });

    it('rejects a soldier acting as commander', async () => {
      const soldier = await makeUser('s@x.local', 'soldier');
      const target = await makeUser('t@x.local', 'soldier', soldier);
      await expect(setRank(soldier, target, 'ramad')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('rejects a target outside the actor subtree', async () => {
      const commander = await makeUser('c@x.local', 'raan');
      const stranger = await makeUser('x@x.local', 'soldier');
      await expect(setRank(commander, stranger, 'ramad')).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    // Review Focus 1.
    it('rejects promoting to the actor own exact rank', async () => {
      const top = await makeUser('top@x.local', 'raan');
      const mid = await makeUser('m@x.local', 'ramad', top);
      await expect(setRank(top, mid, 'raan')).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('rejects promoting above the actor own rank', async () => {
      const top = await makeUser('top@x.local', 'ramad');
      const soldier = await makeUser('s@x.local', 'soldier', top);
      await expect(setRank(top, soldier, 'unit_commander')).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('cascades: demoting to soldier orphans that user own direct subordinates', async () => {
      const top = await makeUser('top@x.local', 'unit_commander');
      const middle = await makeUser('mid@x.local', 'raan', top);
      const leaf = await makeUser('leaf@x.local', 'soldier', middle);
      await setRank(top, middle, 'soldier');
      expect((await db.user.findUniqueOrThrow({ where: { id: middle } })).rank).toBe('soldier');
      expect((await db.user.findUniqueOrThrow({ where: { id: leaf } })).commanderId).toBeNull();
    });

    // Review Focus 4.
    it('demoting someone with no subordinates does not throw', async () => {
      const top = await makeUser('top@x.local', 'unit_commander');
      const ramad = await makeUser('r@x.local', 'ramad', top);
      await expect(setRank(top, ramad, 'soldier')).resolves.toBeUndefined();
    });
  });

  describe('getSubtreeIds', () => {
    it('is empty for a leaf with nobody assigned', async () => {
      const leaf = await makeUser('l@x.local', 'ramad');
      expect(await getSubtreeIds(leaf)).toEqual([]);
    });

    // Review Focus / decision #4: recursive visibility down the whole chain.
    it('is recursive: a raan sees their ramads own soldiers too', async () => {
      const top = await makeUser('top@x.local', 'raan');
      const ramadA = await makeUser('ra@x.local', 'ramad', top);
      const ramadB = await makeUser('rb@x.local', 'ramad', top);
      const soldier1 = await makeUser('s1@x.local', 'soldier', ramadA);
      const soldier2 = await makeUser('s2@x.local', 'soldier', ramadB);
      const ids = await getSubtreeIds(top);
      expect(ids.sort((a, b) => a - b)).toEqual([ramadA, ramadB, soldier1, soldier2].sort((a, b) => a - b));
    });
  });

  describe('getSubordinateStatuses', () => {
    it('rejects a soldier actor', async () => {
      const soldier = await makeUser('s@x.local', 'soldier');
      await expect(getSubordinateStatuses(soldier)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    // Review Focus 5.
    it('returns an empty array for a commander with nobody assigned yet', async () => {
      const commander = await makeUser('c@x.local', 'ramad');
      expect(await getSubordinateStatuses(commander)).toEqual([]);
    });

    it('reports rank, role and null activity for a subordinate with no events', async () => {
      const commander = await makeUser('c@x.local', 'ramad');
      const soldier = await db.user.create({
        data: { email: 's@x.local', name: 'חייל אחד', rank: 'soldier', commanderId: commander, role: 'packer' },
      });
      const [row] = await getSubordinateStatuses(commander);
      expect(row).toMatchObject({
        id: soldier.id, name: 'חייל אחד', email: 's@x.local', rank: 'soldier', role: 'packer',
        lastActivityAt: null, lastActivityLabel: null,
      });
    });

    it('reports the latest status event as last activity', async () => {
      const commander = await makeUser('c@x.local', 'ramad');
      const soldier = await makeUser('s@x.local', 'soldier', commander);
      await db.statusEvent.create({
        data: { entityType: 'room', entityId: 1, toStatus: 'done', actorId: soldier, at: new Date(2026, 8, 20) },
      });
      await db.statusEvent.create({
        data: { entityType: 'room', entityId: 1, toStatus: 'packing', actorId: soldier, at: new Date(2026, 8, 22) },
      });
      const [row] = await getSubordinateStatuses(commander);
      expect(row.lastActivityAt).toBe(new Date(2026, 8, 22).toISOString());
      expect(row.lastActivityLabel).toBeTruthy();
    });
  });
});
