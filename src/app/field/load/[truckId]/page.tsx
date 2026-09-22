import { LoadTruck } from './LoadTruck';

export const dynamic = 'force-dynamic';

export default async function LoadTruckPage({ params }: { params: Promise<{ truckId: string }> }) {
  const { truckId } = await params;
  return <LoadTruck truckId={Number(truckId)} />;
}
