<!-- Mobile sheet navigation. The parent controls desktop visibility. -->

<script lang="ts">
  import type { Attachment } from 'svelte/attachments';

  interface NavLink {
    href: string;
    label: string;
    blurb?: string;
  }

  interface Props {
    path: string;
    shopLinks: NavLink[];
    informationLinks: NavLink[];
    whatsappHref: string;
  }

  let { path, shopLinks, informationLinks, whatsappHref }: Props = $props();
  const dialogId = $props.id();

  let open = $state(false);
  let dialog: HTMLDialogElement | null = null;
  let toggleBtn: HTMLButtonElement | null = null;
  let restoreFocusTo: HTMLElement | null = null;
  let restoreFocusOnClose = true;

  const captureDialog: Attachment<HTMLDialogElement> = (element) => {
    dialog = element;
    return () => {
      if (dialog === element) dialog = null;
    };
  };

  const captureToggle: Attachment<HTMLButtonElement> = (element) => {
    toggleBtn = element;
    return () => {
      if (toggleBtn === element) toggleBtn = null;
    };
  };

  const isActive = (href: string) => {
    const currentPath = path.length > 1 ? path.replace(/\/$/, '') : path;
    const currentHref = href.length > 1 ? href.replace(/\/$/, '') : href;

    return currentPath === currentHref || (currentHref !== '/' && currentPath.startsWith(`${currentHref}/`));
  };

  function openMenu() {
    if (!dialog?.isConnected || dialog.open) return;

    restoreFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : toggleBtn;
    restoreFocusOnClose = true;
    dialog.showModal();
    open = true;
  }

  function handleDialogClose() {
    const target = restoreFocusTo ?? toggleBtn;
    const shouldRestoreFocus = restoreFocusOnClose;

    restoreFocusTo = null;
    restoreFocusOnClose = true;
    open = false;

    if (shouldRestoreFocus) queueMicrotask(() => target?.focus());
  }

  function closeDialog(shouldRestoreFocus: boolean) {
    restoreFocusOnClose = shouldRestoreFocus;

    if (dialog?.open) {
      open = false;
      dialog.close();
    } else {
      handleDialogClose();
    }
  }

  function close() {
    closeDialog(true);
  }

  function closeForResize() {
    closeDialog(false);
  }

  function onResize() {
    if (open && toggleBtn && getComputedStyle(toggleBtn).display === 'none') {
      closeForResize();
    }
  }

  $effect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  });
</script>

<svelte:window onresize={onResize} />

<button
  type="button"
  class="burger"
  onclick={openMenu}
  aria-expanded={open}
  aria-haspopup="dialog"
  aria-controls={dialogId}
  aria-label="Open the menu"
  {@attach captureToggle}
>
  <span class="burger-lines" aria-hidden="true">
    <span></span><span></span><span></span>
  </span>
</button>

<dialog
  id={dialogId}
  class="sheet"
  aria-modal="true"
  aria-label="Mobile menu"
  onclose={handleDialogClose}
  {@attach captureDialog}
>
  <div class="sheet-head">
    <span class="sheet-title">Menu</span>
    <button type="button" class="sheet-close" onclick={close} aria-label="Close the menu">
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <path
          d="M5 5l10 10M15 5L5 15"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"></path>
      </svg>
    </button>
  </div>

  <nav class="sheet-nav" aria-label="Shop by category">
    {#each shopLinks as link (link.href)}
      <a
        href={link.href}
        class="sheet-link"
        aria-current={isActive(link.href) ? 'page' : undefined}
        onclick={close}
      >
        {link.label}
        {#if link.blurb}
          <span class="sheet-blurb">{link.blurb}</span>
        {/if}
      </a>
    {/each}
  </nav>

  <div class="chain-rule" aria-hidden="true"></div>

  <nav class="sheet-meta" aria-label="Information">
    {#each informationLinks as link (link.href)}
      <a href={link.href} aria-current={isActive(link.href) ? 'page' : undefined} onclick={close}>
        {link.label}
      </a>
    {/each}
    <a href={whatsappHref} target="_blank" rel="noopener noreferrer" onclick={close}>
      Message on WhatsApp
    </a>
  </nav>
</dialog>

<style>
  .burger {
    display: grid;
    place-items: center;
    width: 2.75rem;
    min-width: 44px;
    height: 2.75rem;
    min-height: 44px;
    margin-left: auto;
    border-radius: 0.5rem;
    border: 1.5px solid color-mix(in oklab, var(--color-ink) 15%, transparent);
    background: var(--color-paper);
    color: var(--color-ink);
    cursor: pointer;
  }

  .burger-lines {
    display: grid;
    gap: 4px;
  }

  .burger-lines span {
    display: block;
    width: 16px;
    height: 1.8px;
    border-radius: 2px;
    background: currentColor;
  }

  dialog.sheet {
    position: fixed;
    inset: 0 auto 0 0;
    width: 22rem;
    width: min(22rem, 100vw);
    max-width: 100%;
    height: 100vh;
    height: 100dvh;
    min-height: 100vh;
    min-height: 100dvh;
    max-height: 100vh;
    max-height: 100dvh;
    margin: 0;
    box-sizing: border-box;
    padding: 0;
    padding-top: env(safe-area-inset-top);
    padding-right: env(safe-area-inset-right);
    padding-bottom: env(safe-area-inset-bottom);
    padding-left: env(safe-area-inset-left);
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    color: var(--color-ink);
    background: var(--color-paper);
    border: 0;
    border-right: 1.5px solid color-mix(in oklab, var(--color-rose) 28%, transparent);
    box-shadow: 5px 0 0 -3px color-mix(in oklab, var(--color-rose) 18%, transparent);
    animation: sheet-in 200ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  dialog.sheet:not([open]) {
    display: none;
  }

  dialog.sheet[open] {
    display: flex;
    flex-direction: column;
  }

  .sheet::backdrop {
    background: color-mix(in oklab, var(--color-ink) 40%, transparent);
  }

  @media (prefers-reduced-motion: reduce) {
    .sheet { animation: none; }
  }

  @keyframes sheet-in {
    from { transform: translateX(-100%); }
    to   { transform: none; }
  }

  .sheet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.1rem;
    border-bottom: 1.5px solid color-mix(in oklab, var(--color-rose) 18%, transparent);
  }

  .sheet-title {
    font-family: var(--font-display);
    font-variation-settings: 'SOFT' 35, 'WONK' 1, 'opsz' 24;
    font-size: 1.15rem;
    font-weight: 600;
  }

  .sheet-close {
    display: grid;
    place-items: center;
    width: 2.75rem;
    min-width: 44px;
    height: 2.75rem;
    min-height: 44px;
    border-radius: 999px;
    border: 1.5px solid color-mix(in oklab, var(--color-ink) 18%, transparent);
    background: transparent;
    color: var(--color-ink);
    cursor: pointer;
  }

  .sheet-close:hover { background: var(--color-blush); }

  .sheet-nav {
    display: grid;
    padding: 0.5rem 0;
  }

  .sheet-link {
    display: grid;
    gap: 0.1rem;
    min-height: 44px;
    align-content: center;
    padding: 0.7rem 1.1rem;
    color: var(--color-ink);
    text-decoration: none;
  }

  .sheet-link:hover { background: color-mix(in oklab, var(--color-blush) 45%, transparent); }

  .sheet-link[aria-current='page'] {
    background: color-mix(in oklab, var(--color-blush) 70%, transparent);
    font-weight: 600;
  }

  .sheet-blurb {
    font-size: 0.78rem;
    line-height: 1.35;
    color: var(--color-ink-faint);
  }

  .chain-rule { margin-inline: 1.1rem; }

  .sheet-meta {
    display: grid;
    gap: 0.6rem;
    padding: 1.1rem;
  }

  .sheet-meta a {
    display: flex;
    align-items: center;
    min-height: 44px;
    font-size: 0.88rem;
    color: var(--color-ink-soft);
    text-decoration: none;
  }

  .sheet-meta a:hover {
    color: var(--color-rose-deep);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
