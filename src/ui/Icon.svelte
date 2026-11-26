<script lang="ts">
  import { icons } from './icons';
  let { name }: { name: keyof typeof icons } = $props();
</script>

<svg viewBox="0 -960 960 960" aria-hidden="true"><path d={icons[name]} /></svg>
