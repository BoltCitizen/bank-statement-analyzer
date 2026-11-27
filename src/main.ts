import { mount } from 'svelte';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import AppView from './App.svelte';
import { App, type Local } from './lib/app.svelte';
import { MemoryStore } from './lib/store/memory';
import { updates } from './lib/update.svelte';

const testBuild = import.meta.env.MODE === 'e2e';

function createApp(): App {
  if (!testBuild) return new App();
  // Browser tests: the file layer is an in-memory test double, seeded by the test.
  const seed = (window as unknown as { __BSA_SEED__?: Record<string, string> }).__BSA_SEED__ ?? {};
  let device: string | undefined = (window as unknown as { __BSA_DEVICE__?: string }).__BSA_DEVICE__;
  let seq: number | undefined;
  const store = new MemoryStore(seed);
  (window as unknown as { __BSA_STORE__: MemoryStore }).__BSA_STORE__ = store;
  const local: Local = {
    getFolder: async () => undefined,
    setFolder: async () => {},
    getDevice: async () => device,
    setDevice: async (id) => void (device = id),
    getSeq: async () => seq,
    setSeq: async (n) => void (seq = n),
  };
  return new App(local, { store, name: 'Testordner' });
}

const app = createApp();
mount(AppView, { target: document.getElementById('app')!, props: { app, testBuild } });
void app.start();
if (import.meta.env.PROD && !testBuild) void updates.start().catch(() => {});
