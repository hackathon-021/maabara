'use client';

import { useEffect, useRef, useState } from 'react';
import { Banner } from '@/components/ui';
import { normalizeCode, shouldAcceptDecode } from '@/lib/scan-session';

const ELEMENT_ID = 'qr-reader';

/**
 * The camera half of scanning. Hands the parent normalized 5-digit codes only —
 * anything else the camera decodes is discarded here, silently, because a passing
 * sticker on a wall is not an error the unloader needs to hear about.
 */
export function Scanner({
  onCode,
  onUnavailable,
}: {
  onCode: (code: string) => void;
  onUnavailable: () => void;
}) {
  // Kept in refs so a re-render of the parent never restarts the camera.
  const onCodeRef = useRef(onCode);
  const onUnavailableRef = useRef(onUnavailable);
  onCodeRef.current = onCode;
  onUnavailableRef.current = onUnavailable;

  const lastRef = useRef<{ code: string; at: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let stop: (() => Promise<void>) | null = null;

    void (async () => {
      try {
        // Dynamic on purpose — see tests/field/scan/scanner-import.test.ts.
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;
        const scanner = new Html5Qrcode(ELEMENT_ID);
        stop = async () => {
          await scanner.stop();
          scanner.clear();
        };
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 240 },
          (decoded) => {
            const now = Date.now();
            if (!shouldAcceptDecode(lastRef.current, decoded, now)) return;
            lastRef.current = { code: decoded, at: now };
            const code = normalizeCode(decoded);
            if (code) onCodeRef.current(code);
          },
          () => {
            // A frame with no QR in it. Normal, and constant. Ignore.
          },
        );
      } catch {
        if (cancelled) return;
        setFailed(true);
        onUnavailableRef.current();
      }
    })();

    return () => {
      cancelled = true;
      void stop?.().catch(() => {
        // The camera is going away with the page anyway.
      });
    };
  }, []);

  if (failed) {
    return <Banner tone="warn">המצלמה אינה זמינה. אפשר להקליד את מספר האריזה.</Banner>;
  }

  return <div id={ELEMENT_ID} className="overflow-hidden rounded-card bg-black" />;
}
