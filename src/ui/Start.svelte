<script lang="ts">
  import type { App } from '../lib/app.svelte';
  let { app }: { app: App } = $props();
  const count = $derived(app.folder?.state.tx.size ?? 0);
</script>

<section class="box">
  {#if count === 0}
    <p class="muted">Noch keine Umsätze.</p>
  {/if}
</section>

<style>
  p {
    margin: 0;
  }
</style>
