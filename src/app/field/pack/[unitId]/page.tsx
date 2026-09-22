import { PackUnit } from './PackUnit';

export const dynamic = 'force-dynamic';

export default async function PackUnitPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  return <PackUnit unitId={Number(unitId)} />;
}
