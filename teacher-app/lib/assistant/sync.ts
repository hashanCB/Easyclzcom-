import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAssistantStore } from './store';
import { useOutboxStore } from './outbox';

// ─── App-wide assistant auto-sync ───────────────────────────────────────────
//
// The outbox is store-and-forward: writes are saved locally and replayed
// automatically when a connection is available. For that "automatic" promise to
// hold on *every* screen (home, queue, scanning), the replay loop has to live
// above them all — so we mount it once in the assistant layout.
//
// It drains the queue:
//   • right away on mount,
//   • the moment connectivity returns (NetInfo, when present in the build),
//   • whenever the app is brought back to the foreground,
//   • and on a light timer as a catch-all.
// The flush itself is single-flight and a no-op when the queue is empty, so
// overlapping triggers are harmless.

const FLUSH_INTERVAL_MS = 15000;

// NetInfo is a native module that only exists once compiled into the dev build.
// Load it softly so the app still runs (falling back to the timer) without it.
type NetInfoModule = typeof import('@react-native-community/netinfo').default;
let NetInfo: NetInfoModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  NetInfo = require('@react-native-community/netinfo').default as NetInfoModule;
} catch {
  /* native module not in this build — degrade to the timer */
}

/** Mount once (in the assistant layout) to keep queued writes uploading. */
export function useAssistantAutoSync(): void {
  const ensureFreshToken = useAssistantStore((s) => s.ensureFreshToken);
  const status = useAssistantStore((s) => s.status);
  const flush = useOutboxStore((s) => s.flush);

  useEffect(() => {
    if (status !== 'authenticated') return;

    // Load anything left queued from a previous launch.
    useOutboxStore.getState().hydrate();

    const sync = async () => {
      const token = await ensureFreshToken();
      if (token) await flush(token);
    };
    void sync();

    const timer = setInterval(() => { void sync(); }, FLUSH_INTERVAL_MS);
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void sync();
    });

    // Reconcile only on the offline → online transition, not on every NetInfo
    // event (it emits repeatedly while connected).
    let netSub: (() => void) | undefined;
    try {
      let wasConnected = true;
      netSub = NetInfo?.addEventListener((state) => {
        const connected = state.isConnected !== false;
        if (connected && !wasConnected) void sync();
        wasConnected = connected;
      });
    } catch {
      netSub = undefined;
    }

    return () => {
      clearInterval(timer);
      appStateSub.remove();
      netSub?.();
    };
  }, [status, ensureFreshToken, flush]);
}
