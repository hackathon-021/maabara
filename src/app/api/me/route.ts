import { handle } from '@/lib/api/respond';
import type { MeDTO } from '@/lib/contracts';
import { countUserActions } from '@/lib/users';
import { requireActor } from '@/lib/session';

export async function GET() {
  return handle(async (): Promise<MeDTO> => {
    const { id, email, name, role } = await requireActor();
    const actionCount = await countUserActions(id);
    return { id, email, name, role, actionCount };
  });
}

