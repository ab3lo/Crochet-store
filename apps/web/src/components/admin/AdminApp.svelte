<!--
  Admin shell.

  Three states, in order: still checking the session, not signed in, and
  the app itself. Auth lives entirely in the API — this only asks it who
  you are and then hides the controls.
-->

<script lang="ts">
  import type { AdminUser } from '@crochet/shared';
  import { getSession, signIn, signOut, isDemo } from '@/lib/auth';
  import Dashboard from './Dashboard.svelte';

  interface Props {
    hasApi: boolean;
    apiUrl: string;
  }

  let { hasApi, apiUrl }: Props = $props();

  // Never rendered in demo mode, but the type needs a value.
  const fallbackUser: AdminUser = {
    id: 'demo',
    name: 'Shop owner',
    email: 'owner@example.com',
    role: 'admin',
  };

  let user = $state<AdminUser | null>(null);
  let checking = $state(true);
  let authError = $state('');

  $effect(() => {
    void (async () => {
      user = await getSession();
      checking = false;
    })();
  });

  async function handleSignIn(event: SubmitEvent) {
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);

    authError = '';
    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');

    if (!email || !password) {
      authError = 'Enter your email and password.';
      return;
    }

    const { error } = await signIn({ email, password });
    if (error) {
      // Deliberately vague: never reveal whether an account exists.
      authError = 'That email and password did not match.';
      return;
    }

    user = await getSession();
  }

  async function handleSignOut() {
    await signOut();
    user = null;
  }
</script>

{#if checking}
  <div class="state">
    <p class="state-note">Checking who you are…</p>
  </div>
{:else if isDemo}
  <!--
    Demo mode: no API, no sign-in. Everything below is the real panel wired to
    in-memory data from the committed snapshot. The notice is deliberately
    loud — nobody should ever mistake this for a live shop.
  -->
  <div class="demo-wrap">
    <p class="demo-flag" role="status">
      <strong>Demo mode.</strong>
      No database or API is connected. The catalogue below is the committed
      snapshot, and anything you change is kept in this browser tab only.
      Reload to reset it.
    </p>
    <Dashboard user={user ?? fallbackUser} demo onSignOut={() => (user = null)} />
  </div>
{:else if !hasApi}
  <div class="state">
    <div class="card card--warn">
      <h1>The API is not connected</h1>
      <p>
        Set <code>PUBLIC_API_URL</code> in <code>.env</code>, then rebuild. The
        storefront works without it, but the admin panel cannot.
      </p>
      <p class="muted">Currently looking at <code>{apiUrl || 'nothing'}</code>.</p>
    </div>
  </div>
{:else if !user}
  <div class="state">
    <form class="card signin" onsubmit={handleSignIn}>
      <h1>Shop admin</h1>
      <p class="muted">For the shop owner. Not a customer account.</p>

      <label for="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        autocomplete="username"
        required
        aria-invalid={authError ? 'true' : undefined}
        aria-describedby={authError ? 'signin-error' : undefined}
      />

      <label for="password">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        autocomplete="current-password"
        required
        aria-invalid={authError ? 'true' : undefined}
        aria-describedby={authError ? 'signin-error' : undefined}
      />

      {#if authError}
        <p class="error" id="signin-error" role="alert">{authError}</p>
      {/if}

      <button type="submit" class="btn-stitch">Sign in</button>
    </form>
  </div>
{:else if user.role !== 'admin'}
  <div class="state">
    <div class="card card--warn">
      <h1>Not the owner account</h1>
      <p>
        You are signed in as <strong>{user.email}</strong>, but this account does not
        have admin rights. Sign in with the owner account.
      </p>
      <button type="button" class="btn-stitch btn-stitch--ghost" onclick={handleSignOut}>
        Sign out
      </button>
    </div>
  </div>
{:else}
  <Dashboard {user} onSignOut={handleSignOut} />
{/if}

<style>
  .state {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 2rem 1rem;
  }

  .card {
    width: min(100%, 24rem);
    display: grid;
    gap: 0.4rem;
    padding: 1.75rem;
    background: var(--color-paper);
    border: 1.5px solid color-mix(in oklab, var(--color-rose) 26%, transparent);
    border-radius: var(--radius-card);
    box-shadow: 3px 3px 0 color-mix(in oklab, var(--color-rose) 24%, transparent);
  }

  .card--warn { background: #fdf6ec; border-color: #e0c89a; box-shadow: 3px 3px 0 #e0c89a; }

  h1 {
    margin: 0;
    font-size: 1.5rem;
    font-variation-settings: 'SOFT' 45, 'WONK' 1, 'opsz' 40;
  }

  .muted { margin: 0 0 0.5rem; font-size: 0.85rem; color: var(--color-ink-faint); }

  label {
    margin-top: 0.5rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-ink-soft);
  }

  input {
    font: inherit;
    font-size: 0.92rem;
    padding: 0.6rem 0.8rem;
    border-radius: 0.5rem;
    border: 1.5px solid color-mix(in oklab, var(--color-ink) 18%, transparent);
    background: var(--color-paper);
    color: var(--color-ink);
  }

  input:focus {
    outline: none;
    border-color: var(--color-rose);
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-blush) 70%, transparent);
  }

  input[aria-invalid='true'] { border-color: #b4442f; }

  .error { margin: 0.4rem 0 0; font-size: 0.82rem; color: #a33a26; }

  .btn-stitch { margin-top: 1rem; justify-self: start; }

  .state-note { color: var(--color-ink-faint); font-size: 0.9rem; }

  /* ── Demo mode ──────────────────────────────────────────────────── */

  .demo-wrap { display: grid; }

  .demo-flag {
    margin: 0;
    padding: 0.7rem 1.25rem;
    background: #fdf1d8;
    border-bottom: 1.5px solid #e0c89a;
    color: #6b4d10;
    font-size: 0.85rem;
    line-height: 1.5;
  }

  .demo-flag strong { color: #4a3409; }

  code {
    font-family: ui-monospace, monospace;
    font-size: 0.85em;
    background: color-mix(in oklab, var(--color-blush) 60%, transparent);
    padding: 0.05rem 0.3rem;
    border-radius: 0.25rem;
  }
</style>
