<script lang="ts">
  import type { App } from '../lib/app.svelte';
  import { updates } from '../lib/update.svelte';
  let { app }: { app: App } = $props();
</script>

<div class="bottom">
  {#if updates.waiting}
    <section class="box update" aria-live="polite">
      <div class="row">
        <h2>Neue Version</h2>
        <span class="num">{updates.waiting.version} · {updates.waiting.commit}</span>
      </div>
      {#if updates.waiting.changes.length}
        <ul>
          {#each updates.waiting.changes as c, i (i)}<li>{c}</li>{/each}
        </ul>
      {/if}
      <button class="btn filled" onclick={() => updates.apply()}>Aktualisieren</button>
    </section>
  {/if}
  {#each app.errors as err, i (i)}
    <div class="error" role="alert">
      <span>{err}</span>
      <button class="icon-btn" aria-label="Schließen" onclick={() => app.dismissError(i)}>✕</button>
    </div>
  {/each}
</div>

<style>
  .bottom {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
    pointer-events: none;
  }
  .bottom > * {
    pointer-events: auto;
    max-width: 720px;
    width: 100%;
    margin: 0 auto;
  }
  .update {
    background: var(--md-surface-container-high);
  }
  ul {
    margin: 0;
    padding-left: 20px;
  }
  .error {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 4px 4px 16px;
    border-radius: var(--md-shape-chip);
    background: var(--md-error-container);
    color: var(--md-on-error-container);
  }
  .error span {
    flex: 1;
  }
</style>
