/**
 * App updates: the service worker downloads a new version, but it only takes
 * over after the user taps "Aktualisieren". Until then the old version runs.
 */
export interface VersionInfo {
  version: string;
  commit: string;
  changes: string[];
}

class Updates {
  waiting = $state<VersionInfo | null>(null);
  private worker: ServiceWorker | null = null;

  async start(): Promise<void> {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
    let controller = navigator.serviceWorker.controller;
    const watch = (w: ServiceWorker | null) => {
      if (!w) return;
      const check = () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) void this.offer(w);
      };
      w.addEventListener('statechange', check);
      check();
    };
    watch(reg.waiting);
    reg.addEventListener('updatefound', () => watch(reg.installing));
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // The first install takes control without a reload; a later version reloads once after "Aktualisieren".
      const previous = controller;
      controller = navigator.serviceWorker.controller;
      if (!previous || reloading) return;
      reloading = true;
      location.reload();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void reg.update().catch(() => {});
    });
  }

  private async offer(w: ServiceWorker): Promise<void> {
    this.worker = w;
    this.waiting = await new Promise<VersionInfo>((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = (e) => resolve(e.data as VersionInfo);
      w.postMessage('info', [ch.port2]);
    });
  }

  apply(): void {
    this.worker?.postMessage('activate');
  }
}

export const updates = new Updates();
