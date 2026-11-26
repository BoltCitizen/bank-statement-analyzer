<script lang="ts">
  import type { App } from '../lib/app.svelte';
  let { app, testBuild }: { app: App; testBuild: boolean } = $props();
</script>

<section class="box">
  <h2>Gerät</h2>
  <div class="row"><span>Name</span><span>{app.deviceName}</span></div>
  <div class="row"><span>Datei</span><span class="num">log/{app.device}.jsonl</span></div>
</section>
<section class="box">
  <h2>Datenordner</h2>
  <div class="row"><span>Ordner</span><span>{app.folderName}</span></div>
  {#if !testBuild}
    <button class="btn" onclick={() => app.pickFolder()}>Ordner wechseln</button>
  {/if}
</section>
<section class="box">
  <h2>App</h2>
  <div class="row"><span>Version</span><span class="num" data-testid="version">{__APP_VERSION__}</span></div>
  <div class="row"><span>Commit</span><span class="num">{__APP_COMMIT__}</span></div>
</section>
