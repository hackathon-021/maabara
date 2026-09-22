/**
 * Field feedback: a short tone plus a vibration, so a packer holding a box knows
 * an action landed without reading the screen (spec §5.5).
 * Every call is best-effort — audio and vibration are both routinely unavailable
 * on a real phone, and neither may ever break the screen that called it.
 */

export type FeedbackKind = 'success' | 'error';

export const FEEDBACK_PATTERNS: Record<FeedbackKind, { hz: number; ms: number; vibrate: number[] }> = {
  success: { hz: 880, ms: 120, vibrate: [40] },
  error: { hz: 220, ms: 320, vibrate: [80, 60, 80] },
};

type AudioCtor = new () => AudioContext;

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  const Ctor = (window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor });
  const Impl = Ctor.AudioContext ?? Ctor.webkitAudioContext;
  if (!Impl) return null;
  try {
    ctx = new Impl();
  } catch {
    // Audio is blocked (no user gesture yet, or a locked-down browser) — vibration still works.
    ctx = null;
  }
  return ctx;
}

function tone(hz: number, ms: number): void {
  const ac = audioContext();
  if (!ac) return;
  try {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = hz;
    gain.gain.value = 0.18;
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + ms / 1000);
  } catch {
    // Ignore: a silent phone is a nuisance, a thrown error is a broken screen.
  }
}

function buzz(pattern: number[]): void {
  if (typeof navigator === 'undefined') return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Ignore: iOS Safari has no vibration API at all.
  }
}

export function feedback(kind: FeedbackKind): void {
  const p = FEEDBACK_PATTERNS[kind];
  buzz(p.vibrate);
  tone(p.hz, p.ms);
}
