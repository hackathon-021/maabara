import type { GroupDTO, RoomDTO, RoomStatus } from '@/lib/contracts';
import { db } from '@/lib/db';

export async function listGroups(): Promise<GroupDTO[]> {
  return db.group.findMany({
    where: { isAvailable: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
}

export async function listRooms(groupId: number): Promise<RoomDTO[]> {
  const rooms = await db.room.findMany({
    where: { groupId, isAvailable: true },
    orderBy: { description: 'asc' },
  });
  return rooms.map((r) => ({
    id: r.id,
    groupId: r.groupId,
    description: r.description,
    status: r.status as RoomStatus,
    roomManager: r.roomManager,
  }));
}
