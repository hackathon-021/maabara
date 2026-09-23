import type {
  ApiError, ClosePackingUnitReq, ClosePackingUnitResult, CreateTransportReq, DashboardDTO,
  DistributeReq, ErrorCode, GroupDTO,
  LeaderboardEntryDTO,
  LoadReq, MeDTO, OpenPackingUnitReq, PackableItemDTO,
  PackingUnitDTO, PackingUnitStatus, PackingUnitSummaryDTO, PendingApprovalDTO, ReceiveReq, ReceiveResult,
  RequestApprovalReq, Role, RoomDTO, SetItemsReq, SetRankReq, SubordinateStatusDTO, TeamPackingStatDTO,
  TimelineEventDTO, TransportStatus, TransportUnitDTO
} from '@/lib/contracts';

export class ApiClientError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly messageHe: string,
    public readonly status: number,
  ) {
    super(messageHe);
  }
}

async function call<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const fallback: ApiError = { error: 'INTERNAL', messageHe: 'אין תקשורת עם השרת' };
  const data: unknown = await res.json().catch(() => fallback);
  if (!res.ok) {
    const err = data as ApiError;
    throw new ApiClientError(err.error, err.messageHe, res.status);
  }
  return data as T;
}

function qs(params: Record<string, string | number | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
}

export const api = {
  me: () => call<MeDTO>('GET', '/api/me'),
  setRole: (role: Role) => call<MeDTO>('POST', '/api/me/role', { role }),

  groups: () => call<GroupDTO[]>('GET', '/api/groups'),
  rooms: (groupId: number) => call<RoomDTO[]>('GET', `/api/rooms${qs({ groupId })}`),
  packableItems: (roomId: number) => call<PackableItemDTO[]>('GET', `/api/rooms/${roomId}/packable-items`),

  packingUnits: (filter: { status?: PackingUnitStatus; roomId?: number } = {}) =>
    call<PackingUnitSummaryDTO[]>('GET', `/api/packing-units${qs(filter)}`),
  packingUnitByCode: (code: string) =>
    call<PackingUnitDTO>('GET', `/api/packing-units/by-code/${encodeURIComponent(code)}`),
  openPackingUnit: (req: OpenPackingUnitReq) => call<PackingUnitDTO>('POST', '/api/packing-units', req),
  setPackingUnitItems: (id: number, req: SetItemsReq) =>
    call<PackingUnitDTO>('PUT', `/api/packing-units/${id}/items`, req),
  closePackingUnit: (id: number, req: ClosePackingUnitReq) =>
    call<ClosePackingUnitResult>('POST', `/api/packing-units/${id}/close`, req),
  distributePackingUnit: (id: number, req: DistributeReq) =>
    call<PackingUnitDTO>('POST', `/api/packing-units/${id}/distribute`, req),

  transportUnits: (status?: TransportStatus) =>
    call<TransportUnitDTO[]>('GET', `/api/transport-units${qs({ status })}`),
  createTransportUnit: (req: CreateTransportReq) => call<TransportUnitDTO>('POST', '/api/transport-units', req),
  loadTransportUnit: (id: number, req: LoadReq) =>
    call<TransportUnitDTO>('POST', `/api/transport-units/${id}/load`, req),
  receiveTransportUnit: (id: number, req: ReceiveReq) =>
    call<ReceiveResult>('POST', `/api/transport-units/${id}/receive`, req),

  timeline: (packingUnitId: number) =>
    call<TimelineEventDTO[]>('GET', `/api/packing-units/${packingUnitId}/timeline`),
  dashboard: () => call<DashboardDTO>('GET', '/api/dashboard'),

  setRank: (req: SetRankReq) => call<{ ok: true }>('PATCH', '/api/command/rank', req),
  subtree: () => call<SubordinateStatusDTO[]>('GET', '/api/command/subtree'),
  teamStats: () => call<TeamPackingStatDTO[]>('GET', '/api/command/team-stats'),

  requestApproval: (req: RequestApprovalReq) => call<{ ok: true }>('POST', '/api/approval/request', req),
  pendingApprovals: () => call<PendingApprovalDTO[]>('GET', '/api/command/approval-requests'),
  approveRequest: (id: number) => call<{ ok: true }>('POST', `/api/command/approval-requests/${id}/approve`),
  rejectRequest: (id: number) => call<{ ok: true }>('POST', `/api/command/approval-requests/${id}/reject`),

  leaderboard: () => call<LeaderboardEntryDTO[]>('GET', '/api/leaderboard'),
};
