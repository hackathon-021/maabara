import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { ensureUser, setUserRole } from '@/lib/users';
import { resetDb } from '../helpers/db';

describe('users', () => {
  beforeEach(resetDb);

  it('ensureUser is idempotent per email and starts without a role', async () => {
    const a = await ensureUser('a@gmail.com', 'A');
    const b = await ensureUser('a@gmail.com', 'A again');
    expect(b.id).toBe(a.id);
    expect(a.role).toBeNull();
    expect(await db.user.count()).toBe(1);
  });

  it('setUserRole sets a valid role', async () => {
    const u = await ensureUser('a@gmail.com', 'A');
    expect(await setUserRole(u.id, 'unloader')).toEqual({ id: u.id, email: 'a@gmail.com', name: 'A', role: 'unloader' });
  });

  it('setUserRole rejects an unknown role', async () => {
    const u = await ensureUser('a@gmail.com', 'A');
    await expect(setUserRole(u.id, 'admin')).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});
