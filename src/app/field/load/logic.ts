import type { CreateTransportReq, TransportType } from '@/lib/contracts';

export interface TransportDraft {
  type: TransportType | null;
  typeDetails: string;
  licensePlate: string;
  groupId: number | null;
}

/** The form's request, or null while it is not complete enough to send. */
export function transportRequest(draft: TransportDraft): CreateTransportReq | null {
  if (draft.type === null || draft.groupId === null) return null;

  const licensePlate = draft.licensePlate.trim();
  if (!licensePlate) return null;

  const typeDetails = draft.typeDetails.trim();
  // flows/transporting_flow.md note Zn: "אחר" is only meaningful with a description.
  if (draft.type === 'other' && !typeDetails) return null;

  return {
    type: draft.type,
    licensePlate,
    groupId: draft.groupId,
    ...(draft.type === 'other' ? { typeDetails } : {}),
  };
}
