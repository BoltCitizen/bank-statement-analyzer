<script lang="ts">
  import Header from './ui/Header.svelte';
  import Setup from './ui/Setup.svelte';
  import Start from './ui/Start.svelte';
  import Settings from './ui/Settings.svelte';
  import Bottom from './ui/Bottom.svelte';
  import type { App } from './lib/app.svelte';

  let { app, testBuild = false }: { app: App; testBuild?: boolean } = $props();

  $effect(() => {
    // The back gesture closes the settings page instead of leaving the app.
    const onPop = () => (app.view = 'start');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  });
</script>

{#if app.phase === 'ready'}
  <Header {app} />
  <main>
    {#if app.view === 'settings'}
      <Settings {app} {testBuild} />
    {:else}
      <Start {app} />
    {/if}
  </main>
{:else}
  <Setup {app} />
{/if}
<Bottom {app} />

<style>
  main {
    max-width: 720px;
    margin: 0 auto;
    padding: 8px 16px 160px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
</style>
