import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import type { BuildInfo } from './version.ts';

/**
 * Emits sw.js next to index.html. It precaches every file of this build and
 * carries the version and its changes, so the page can show them before the
 * user taps "Aktualisieren".
 */
export function serviceWorker(info: BuildInfo): Plugin {
  return {
    name: 'bsa-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = ['./', ...Object.keys(bundle).map((f) => `./${f}`)].sort();
      const template = readFileSync(fileURLToPath(new URL('./sw-template.js', import.meta.url)), 'utf8');
      const source = template
        .replace('__SW_VERSION__', JSON.stringify(info.version))
        .replace('__SW_COMMIT__', JSON.stringify(info.commit))
        .replace('__SW_CHANGES__', JSON.stringify(info.changes))
        .replace('__SW_ASSETS__', JSON.stringify(assets));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}
