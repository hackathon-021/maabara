import { handle } from '@/lib/api/respond';
import { hasCommanderPermission } from '@/lib/command';
import type { MeDTO } from '@/lib/contracts';
import { countUserActions } from '@/lib/users';
import { requireActor } from '@/lib/session';

export async function GET() {
  return handle(async (): Promise<MeDTO> => {
    const { id, email, name, role, rank } = await requireActor();
    const actionCount = await countUserActions(id);
    return { id, email, name, role, actionCount, canBeCommander: hasCommanderPermission(rank) };
  });
}

