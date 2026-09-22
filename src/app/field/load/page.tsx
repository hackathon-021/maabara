import { LoadStart } from './LoadStart';

export const dynamic = 'force-dynamic';

// Next.js 15: searchParams is async.
export default async function LoadPage({ searchParams }: { searchParams: Promise<{ groupId?: string }> }) {
  const { groupId } = await searchParams;
  const parsed = Number(groupId);
  return <LoadStart initialGroupId={Number.isInteger(parsed) && parsed > 0 ? parsed : null} />;
}
