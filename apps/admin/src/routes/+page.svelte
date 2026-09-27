<!--
  The admin panel's only page.

  `client:only` in spirit: the panel is a tool that talks to a local database
  and a git process, so there is nothing to render on a server and nothing
  worth prerendering. `ssr = false` says that outright rather than leaving a
  `+page.server.ts` that returns nothing.

  The old version of this page had four states — checking the session, not
  signed in, the API missing, and the app — and three of them are gone. There
  is no session to check and no API to be missing.
-->

<script lang="ts">
  import Dashboard from '@/components/panel/Dashboard.svelte';
</script>

<svelte:head>
  <title>Shop admin — Crochet &amp; Co.</title>
  <meta name="robots" content="noindex, nofollow, noarchive" />
</svelte:head>

<Dashboard />
