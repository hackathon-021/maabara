import { PackStart } from './PackStart';

export const dynamic = 'force-dynamic';

// Next.js 15: searchParams is async.
export default async function PackPage({
  searchParams,
}: {
  searchParams: Promise<{ roomId?: string }>;
}) {
  const { roomId } = await searchParams;
  const parsed = Number(roomId);
  return <PackStart initialRoomId={Number.isInteger(parsed) && parsed > 0 ? parsed : null} />;
}
