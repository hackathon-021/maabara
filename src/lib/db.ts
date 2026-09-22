import { PrismaClient, type Prisma } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Reuse one client across Next.js hot reloads.
export const db = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

export type Tx = Prisma.TransactionClient;

/** Wipes every table. Used by the seed (demo reset) and by tests. */
export const TRUNCATE_ALL_SQL = `TRUNCATE status_events, notifications, packing_unit_items, packing_units,
  transport_units, mapping_reports, rooms, sub_categories, categories, locations, groups, users
  RESTART IDENTITY CASCADE`;
