'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Banner, Button, TextField, useAction } from '@/components/ui';
import { api } from '@/lib/api/client';

export function ApprovalRequestForm() {
  const router = useRouter();
  const [commanderId, setCommanderId] = useState('');
  const { busy, error, run } = useAction();

  function submit() {
    const id = Number(commanderId);
    if (!Number.isInteger(id) || id <= 0) return;
    void run(
      () => api.requestApproval({ commanderId: id }),
      () => {
        router.push('/approval/pending');
        router.refresh();
      },
    );
  }

  return (
    <main className="min-h-dvh p-4 bg-[#665FB3] flex items-center justify-center">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6">
        <h1 className="text-xl font-bold mb-2 text-center">בקשת הצטרפות</h1>
        <p className="mb-4 text-center text-sm text-gray-600">
          הזינו את מזהה המשתמש של המפקד הישיר שלכם. הבקשה תמתין לאישורו.
        </p>
        <TextField label="מזהה מפקד" value={commanderId} onChange={setCommanderId} inputMode="numeric" />
        <div className="mt-4">
          <Button onClick={submit} busy={busy} disabled={!commanderId}>
            שלח בקשה
          </Button>
        </div>
        {error && <Banner tone="danger">{error}</Banner>}
      </div>
    </main>
  );
}
