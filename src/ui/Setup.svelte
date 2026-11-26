<script lang="ts">
  import type { App } from '../lib/app.svelte';
  let { app }: { app: App } = $props();
  let name = $state('');
</script>

<main class="setup">
  <h1>Kontoauswertung</h1>
  {#if app.phase === 'loading'}
    <p class="muted" role="status">Lade Daten …</p>
  {:else if app.phase === 'unsupported'}
    <section class="box">
      <h2>Ordnerzugriff fehlt</h2>
      <p>Dieser Browser kann keinen Ordner öffnen. Nötig ist ein Chromium-Browser mit File System Access.</p>
    </section>
  {:else if app.phase === 'pick'}
    <section class="box">
      <h2>Datenordner</h2>
      <p>Alle Daten liegen als Dateien in einem Ordner, den du wählst.</p>
      <button class="btn filled" onclick={() => app.pickFolder()}>Ordner wählen</button>
    </section>
  {:else if app.phase === 'permission'}
    <section class="box">
      <h2>Datenordner</h2>
      <div class="row"><span>Ordner</span><span>{app.folderName}</span></div>
      <div class="btns">
        <button class="btn filled" onclick={() => app.allowAccess()}>Zugriff erlauben</button>
        <button class="btn" onclick={() => app.pickFolder()}>Ordner wechseln</button>
      </div>
    </section>
  {:else if app.phase === 'device'}
    {#if app.knownDevices.length}
      <section class="box">
        <h2>Weiter als</h2>
        <div class="btns">
          {#each app.knownDevices as d (d.id)}
            <button class="btn" disabled={app.busy} onclick={() => app.continueAs(d.id)}>{d.name}</button>
          {/each}
        </div>
      </section>
    {/if}
    <form
      class="box"
      onsubmit={(e) => {
        e.preventDefault();
        void app.createDevice(name);
      }}
    >
      <h2>Neues Gerät</h2>
      <label class="field">
        <span>Gerätename</span>
        <input bind:value={name} placeholder="Handy" autocomplete="off" />
      </label>
      <button class="btn filled" type="submit" disabled={app.busy || !name.trim()}>Weiter</button>
    </form>
  {/if}
</main>

<style>
  .setup {
    max-width: 560px;
    margin: 0 auto;
    padding: 24px 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  h1 {
    margin: 0 0 8px;
    font: var(--md-headline-small);
  }
  p {
    margin: 0;
  }
</style>
