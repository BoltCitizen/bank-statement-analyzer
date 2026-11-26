<script lang="ts">
  import Icon from './Icon.svelte';
  import type { App } from '../lib/app.svelte';
  let { app }: { app: App } = $props();
  const title = $derived(app.view === 'settings' ? 'Einstellungen' : 'Umsätze');
</script>

<header>
  {#if app.view === 'settings'}
    <button class="icon-btn" aria-label="Zurück" onclick={() => history.back()}><Icon name="back" /></button>
  {/if}
  <h1>{title}</h1>
  <button class="icon-btn" aria-label="Rückgängig" title="Rückgängig" disabled={!app.canUndo || app.busy} onclick={() => app.undo()}>
    <Icon name="undo" />
  </button>
  <button
    class="icon-btn"
    aria-label="Einstellungen"
    title="Einstellungen"
    disabled={app.view === 'settings'}
    onclick={() => {
      history.pushState({ view: 'settings' }, '');
      app.view = 'settings';
    }}
  >
    <Icon name="settings" />
  </button>
</header>

<style>
  header {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 64px;
    padding: 0 4px 0 16px;
    background: var(--md-surface);
  }
  header:has(> .icon-btn:first-child) {
    padding-left: 4px;
  }
  h1 {
    flex: 1;
    margin: 0;
    font: var(--md-title-large);
    white-space: nowrap;
  }
</style>
