/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { buildInfo } from './build/version.ts';
import { serviceWorker } from './build/sw-plugin.ts';

export default defineConfig(({ mode }) => {
  const info = buildInfo();
  return {
    base: './',
    plugins: [svelte(), ...(mode === 'e2e' ? [] : [serviceWorker(info)])],
    define: {
      __APP_VERSION__: JSON.stringify(info.version),
      __APP_COMMIT__: JSON.stringify(info.commit),
    },
    build: {
      target: 'es2022',
      assetsInlineLimit: 0,
      modulePreload: { polyfill: false },
      sourcemap: false,
    },
    test: {
      include: ['tests/unit/**/*.test.ts'],
      environment: 'node',
    },
  };
});
