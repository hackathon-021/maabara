import { handle } from '@/lib/api/respond';
import { requestApprovalSchema } from '@/lib/api/schemas';
import { submitApprovalRequest } from '@/lib/approval';
import { requireActor } from '@/lib/session';

export async function POST(req: Request) {
  return handle(async () => {
    const actor = await requireActor();
    const { commanderId } = requestApprovalSchema.parse(await req.json());
    await submitApprovalRequest(actor.id, commanderId);
    return { ok: true };
  });
}
