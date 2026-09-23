import { beforeEach, describe, expect, it } from 'vitest';
import { approveRequest, getPendingApprovalRequests, rejectRequest, submitApprovalRequest } from '@/lib/approval';
import { db } from '@/lib/db';
import type { Rank } from '@/lib/contracts';
import { resetDb } from '../helpers/db';

async function makeUser(
  email: string, rank: Rank, opts: { commanderId?: number | null; approvalStatus?: string } = {},
): Promise<number> {
  const u = await db.user.create({
    data: { email, name: email, rank, commanderId: opts.commanderId ?? null, approvalStatus: opts.approvalStatus },
  });
  return u.id;
}

describe('approval', () => {
  beforeEach(resetDb);

  describe('submitApprovalRequest', () => {
    it('sets requestedCommanderId when the target is a commander', async () => {
      const commander = await makeUser('c@x.local', 'ramad');
      const applicant = await makeUser('a@x.local', 'soldier');
      await submitApprovalRequest(applicant, commander);
      const row = await db.user.findUniqueOrThrow({ where: { id: applicant } });
      expect(row.requestedCommanderId).toBe(commander);
      expect(row.approvalStatus).toBe('pending');
      expect(row.commanderId).toBeNull();
    });

    it('rejects requesting a soldier as commander', async () => {
      const applicant = await makeUser('a@x.local', 'soldier');
      const otherSoldier = await makeUser('s@x.local', 'soldier');
      await expect(submitApprovalRequest(applicant, otherSoldier)).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('rejects requesting oneself', async () => {
      const applicant = await makeUser('a@x.local', 'soldier');
      await expect(submitApprovalRequest(applicant, applicant)).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('rejects a nonexistent commander id with NOT_FOUND', async () => {
      const applicant = await makeUser('a@x.local', 'soldier');
      await expect(submitApprovalRequest(applicant, 999999)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('rejects a user who is already approved', async () => {
      const commander = await makeUser('c@x.local', 'ramad');
      const applicant = await makeUser('a@x.local', 'soldier', { approvalStatus: 'approved' });
      await expect(submitApprovalRequest(applicant, commander)).rejects.toMatchObject({ code: 'VALIDATION' });
    });
  });

  describe('getPendingApprovalRequests', () => {
    it('lists only requests aimed at this commander', async () => {
      const commanderA = await makeUser('a@x.local', 'ramad');
      const commanderB = await makeUser('b@x.local', 'ramad');
      const applicant = await makeUser('applicant@x.local', 'soldier');
      await submitApprovalRequest(applicant, commanderA);
      expect(await getPendingApprovalRequests(commanderA)).toMatchObject([{ id: applicant }]);
      expect(await getPendingApprovalRequests(commanderB)).toEqual([]);
    });
  });

  describe('approveRequest', () => {
    it('sets commanderId and marks approved', async () => {
      const commander = await makeUser('c@x.local', 'ramad');
      const applicant = await makeUser('a@x.local', 'soldier');
      await submitApprovalRequest(applicant, commander);
      await approveRequest(commander, applicant);
      const row = await db.user.findUniqueOrThrow({ where: { id: applicant } });
      expect(row.commanderId).toBe(commander);
      expect(row.approvalStatus).toBe('approved');
    });

    it('rejects a commander approving a request not aimed at them', async () => {
      const commanderA = await makeUser('a@x.local', 'ramad');
      const commanderB = await makeUser('b@x.local', 'ramad');
      const applicant = await makeUser('applicant@x.local', 'soldier');
      await submitApprovalRequest(applicant, commanderA);
      await expect(approveRequest(commanderB, applicant)).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('rejects approving a peer of equal rank', async () => {
      const commander = await makeUser('c@x.local', 'ramad');
      const peer = await makeUser('p@x.local', 'ramad');
      await submitApprovalRequest(peer, commander);
      await expect(approveRequest(commander, peer)).rejects.toMatchObject({ code: 'VALIDATION' });
    });
  });

  describe('rejectRequest', () => {
    it('clears requestedCommanderId, leaving the user pending', async () => {
      const commander = await makeUser('c@x.local', 'ramad');
      const applicant = await makeUser('a@x.local', 'soldier');
      await submitApprovalRequest(applicant, commander);
      await rejectRequest(commander, applicant);
      const row = await db.user.findUniqueOrThrow({ where: { id: applicant } });
      expect(row.requestedCommanderId).toBeNull();
      expect(row.approvalStatus).toBe('pending');
      expect(row.commanderId).toBeNull();
    });
  });

  describe('locked after approval', () => {
    it('a second approval attempt from a different commander is rejected', async () => {
      const commanderA = await makeUser('a@x.local', 'ramad');
      const commanderB = await makeUser('b@x.local', 'ramad');
      const applicant = await makeUser('applicant@x.local', 'soldier');
      await submitApprovalRequest(applicant, commanderA);
      await approveRequest(commanderA, applicant);
      await expect(approveRequest(commanderB, applicant)).rejects.toMatchObject({ code: 'VALIDATION' });
      expect((await db.user.findUniqueOrThrow({ where: { id: applicant } })).commanderId).toBe(commanderA);
    });
  });
});
