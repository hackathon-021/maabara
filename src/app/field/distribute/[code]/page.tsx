import { DistributeBox } from './DistributeBox';

export const dynamic = 'force-dynamic';

export default async function DistributeBoxPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <DistributeBox code={code} />;
}
