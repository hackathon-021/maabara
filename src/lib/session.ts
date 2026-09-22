import type { Role } from '@/lib/contracts';
import { db } from '@/lib/db';

export interface Actor {
  id: number;
  name: string;
  email: string;
  role: Role | null;
}

export const DEV_EMAIL = 'dev@maabara.local';

export async function devActor(): Promise<Actor> {
  const u = await db.user.upsert({
    where: { email: DEV_EMAIL },
    update: {},
    create: { email: DEV_EMAIL, name: 'משתמש פיתוח', role: 'commander' },
  });
  return { id: u.id, name: u.name, email: u.email, role: u.role as Role | null };
}

// TODO(P1 Task 5): replace with the Auth.js session. Until then every request is the dev user.
export async function requireActor(): Promise<Actor> {
  return devActor();
}

export async function requirePageActor(): Promise<Actor> {
  return devActor();
}
