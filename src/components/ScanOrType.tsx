'use client';

import { useCallback, useState } from 'react';
import { Button, Card, TextField } from '@/components/ui';
import { feedback } from '@/lib/feedback';
import { CODE_LENGTH, normalizeCode } from '@/lib/scan-session';
import { Scanner } from './Scanner';

/**
 * Scanning as the field actually gets it: a camera when the device and the
 * connection allow one, and a numeric keypad that is always there (spec §1).
 * Both paths hand the parent the same normalized code.
 */
export function ScanOrType({ onCode, hint }: { onCode: (code: string) => void; hint?: string }) {
  const [cameraOk, setCameraOk] = useState(true);
  const [typed, setTyped] = useState('');
  const [typeError, setTypeError] = useState<string | null>(null);

  const onUnavailable = useCallback(() => setCameraOk(false), []);

  function submitTyped() {
    const code = normalizeCode(typed);
    if (!code) {
      feedback('error');
      setTypeError(`יש להזין מספר אריזה בן ${CODE_LENGTH} ספרות`);
      return;
    }
    setTyped('');
    setTypeError(null);
    onCode(code);
  }

  return (
    <Card className="flex flex-col gap-3">
      {hint && <p className="text-sm text-ink-muted">{hint}</p>}
      {cameraOk && <Scanner onCode={onCode} onUnavailable={onUnavailable} />}
      <TextField
        label="מספר אריזה"
        value={typed}
        onChange={(v) => {
          setTyped(v);
          setTypeError(null);
        }}
        inputMode="numeric"
        maxLength={CODE_LENGTH}
      />
      {typeError && <p className="text-sm text-danger">{typeError}</p>}
      <Button variant="secondary" size="md" onClick={submitTyped} disabled={typed.length === 0}>
        אישור מספר
      </Button>
    </Card>
  );
}
