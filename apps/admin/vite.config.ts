import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],

  server: {
    /**
     * Loopback only, and the only access control this tool has.
     *
     * There is no password, no session and no token. That is not an omission
     * — it is the point. A password on a loopback port protects nothing that
     * the absence of a network path does not already protect, and it would add
     * a stored secret to keep, rotate and leak. Binding to 127.0.0.1 means
     * there is no route in at all, so CSRF, session theft and credential
     * stuffing are structurally impossible rather than defended against.
     *
     * If this ever needs to be reachable from another device, do NOT add a
     * tunnel. Put a real login in front of it, or use a real auth product.
     */
    host: '127.0.0.1',
    port: 4322,
    strictPort: true,
  },

  preview: { host: '127.0.0.1', port: 4322, strictPort: true },

});
