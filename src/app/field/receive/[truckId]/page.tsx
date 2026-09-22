import { ReceiveTruck } from './ReceiveTruck';

export const dynamic = 'force-dynamic';

export default async function ReceiveTruckPage({ params }: { params: Promise<{ truckId: string }> }) {
  const { truckId } = await params;
  return <ReceiveTruck truckId={Number(truckId)} />;
}
