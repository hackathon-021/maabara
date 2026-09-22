import { z } from 'zod';
import { BOX_CODE_RE, PACKING_UNIT_STATUSES, PACKING_UNIT_TYPES, TRANSPORT_STATUSES, TRANSPORT_TYPES } from '@/lib/contracts';

/**
 * Membership check written as a refinement rather than z.enum, so it takes the frozen
 * `readonly` tuples from contracts.ts unchanged and behaves the same on zod 3 and 4.
 */
export function oneOf<T extends string>(values: readonly T[], messageHe: string) {
  return z.string().refine((v): v is T => (values as readonly string[]).includes(v), messageHe);
}

export const idParamSchema = z.coerce.number().int().positive();
export const boxCodeSchema = z.string().trim().regex(BOX_CODE_RE, 'מספר אריזה חייב להיות 5 ספרות');
export const quantitySchema = z.number().int().min(0);
export const shortTextSchema = z.string().trim().min(1).max(60);

export const listPackingUnitsQuery = z.object({
  status: oneOf(PACKING_UNIT_STATUSES, 'סטטוס אריזה לא חוקי').optional(),
  roomId: idParamSchema.optional(),
});

export const transportStatusQuery = oneOf(TRANSPORT_STATUSES, 'סטטוס הובלה לא חוקי').optional();

export const openPackingUnitSchema = z.object({
  sourceRoomId: idParamSchema,
  type: oneOf(PACKING_UNIT_TYPES, 'סוג יחידת אריזה לא חוקי'),
});

export const setItemsSchema = z.object({
  items: z.array(z.object({ mappingReportId: idParamSchema, quantity: z.number().int().min(1) })),
});

export const closePackingUnitSchema = z.object({
  destBuilding: shortTextSchema,
  destFloor: shortTextSchema,
  destRoom: shortTextSchema,
});

export const createTransportSchema = z.object({
  type: oneOf(TRANSPORT_TYPES, 'סוג יחידת הובלה לא חוקי'),
  typeDetails: z.string().trim().max(60).optional(),
  licensePlate: shortTextSchema,
  groupId: idParamSchema,
});

export const loadSchema = z.object({ codes: z.array(boxCodeSchema).min(1, 'לא נבחרו אריזות') });

export const receiveSchema = z.object({
  receivedCodes: z.array(boxCodeSchema),
  surplusCodes: z.array(boxCodeSchema),
});

export const distributeSchema = z.object({
  items: z.array(z.object({ packingUnitItemId: idParamSchema, quantity: quantitySchema })),
  atRoom: shortTextSchema,
});
