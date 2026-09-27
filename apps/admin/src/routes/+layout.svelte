<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';

  let { children } = $props();

  /**
   * The one guardrail this app has.
   *
   * The server binds to 127.0.0.1, so there is no network path here in the
   * first place. This is belt and braces against the day someone adds
   * `--host` to the Vite config or puts a tunnel in front of it: a panel that
   * can drive `git push` to production should be unmistakably local, and
   * saying so on screen is the cheapest possible reminder of that.
   *
   * Deliberately a warning rather than a block. A block would be a control
   * that looks like security and is not — if the process is reachable from
   * another machine, the check below is already too late.
   */
  let remote = $state(false);

  onMount(() => {
    remote = window.location.hostname !== '127.0.0.1' && window.location.hostname !== 'localhost';
  });
</script>

{#if remote}
  <p class="remote-warning" role="alert">
    <strong>This panel is meant to run on this computer only.</strong>
    It is currently being served at <code>{typeof location === 'undefined' ? '' : location.hostname}</code>,
    which means something other than <code>127.0.0.1</code> can reach it. There is no login here.
  </p>
{/if}

{@render children()}

<style>
  .remote-warning {
    margin: 0;
    padding: 0.8rem 1.25rem;
    background: #fdf0ed;
    border-bottom: 2px solid #e3b5aa;
    color: #8c3322;
    font-size: 0.85rem;
    line-height: 1.5;
  }

  .remote-warning strong { color: #6d2415; }

  .remote-warning code {
    font-family: ui-monospace, monospace;
    background: rgba(255, 255, 255, 0.6);
    padding: 0.05rem 0.3rem;
    border-radius: 0.25rem;
  }
</style>
