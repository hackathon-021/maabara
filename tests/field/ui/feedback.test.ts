import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeOscillator {
  type = '';
  frequency = { value: 0 };
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeGain {
  gain = { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  connect = vi.fn();
}

class FakeAudioContext {
  static last: FakeAudioContext | null = null;
  currentTime = 0;
  destination = {};
  oscillators: FakeOscillator[] = [];
  constructor() {
    FakeAudioContext.last = this;
  }
  createOscillator() {
    const o = new FakeOscillator();
    this.oscillators.push(o);
    return o;
  }
  createGain() {
    return new FakeGain();
  }
}

const vibrate = vi.fn();

beforeEach(() => {
  vi.resetModules();
  FakeAudioContext.last = null;
  vibrate.mockClear();
  // The module reads window/navigator lazily, so a node-environment stub is enough.
  vi.stubGlobal('window', { AudioContext: FakeAudioContext });
  vi.stubGlobal('navigator', { vibrate });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('feedback', () => {
  it('plays a high short tone and a single buzz on success', async () => {
    const { feedback } = await import('@/lib/feedback');
    feedback('success');
    expect(FakeAudioContext.last?.oscillators[0].frequency.value).toBe(880);
    expect(vibrate).toHaveBeenCalledWith([40]);
  });

  it('plays a low long tone and a double buzz on error', async () => {
    const { feedback } = await import('@/lib/feedback');
    feedback('error');
    expect(FakeAudioContext.last?.oscillators[0].frequency.value).toBe(220);
    expect(vibrate).toHaveBeenCalledWith([80, 60, 80]);
  });

  it('reuses one AudioContext across calls', async () => {
    const { feedback } = await import('@/lib/feedback');
    feedback('success');
    const first = FakeAudioContext.last;
    feedback('error');
    expect(FakeAudioContext.last).toBe(first);
    expect(first?.oscillators).toHaveLength(2);
  });

  it('stays silent instead of throwing when the device has no vibration (iOS)', async () => {
    vi.stubGlobal('navigator', {});
    const { feedback } = await import('@/lib/feedback');
    expect(() => feedback('success')).not.toThrow();
    expect(FakeAudioContext.last?.oscillators).toHaveLength(1);
  });

  it('stays silent instead of throwing when audio is blocked', async () => {
    vi.stubGlobal('window', {
      AudioContext: class {
        constructor() {
          throw new Error('not allowed');
        }
      },
    });
    const { feedback } = await import('@/lib/feedback');
    expect(() => feedback('error')).not.toThrow();
    expect(vibrate).toHaveBeenCalledWith([80, 60, 80]);
  });

  it('does nothing at all on the server', async () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('navigator', undefined);
    const { feedback } = await import('@/lib/feedback');
    expect(() => feedback('success')).not.toThrow();
  });
});
