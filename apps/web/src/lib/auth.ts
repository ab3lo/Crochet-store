/**
 * Better Auth client for the admin panel.
 *
 * Points at the API origin, not the storefront origin, because that is
 * where `/api/auth/*` is mounted. Credentials are included so the session
 * cookie rides along on every request.
 */

import { createAuthClient } from 'better-auth/svelte';
import type { AdminUser } from '@crochet/shared';
import { config, hasApi } from './config';
import { demoFetch, demoUser, isDemo } from './admin-demo';

export { isDemo };

export const authClient = createAuthClient({
  baseURL: hasApi ? config.apiUrl : config.authUrl || 'http://localhost:8787',
  basePath: '/api/auth',
  fetchOptions: { credentials: 'include' },
});

export const signIn = authClient.signIn.email;
export const signOut = authClient.signOut;

/**
 * Current session, or null. Resilient to the API being down: an admin
 * panel that throws a blank page because of a network error is useless.
 *
 * In demo mode there is no server to ask, so it reports the local owner.
 */
export async function getSession(): Promise<AdminUser | null> {
  if (isDemo) return demoUser;
  if (!hasApi) return null;
  try {
    const { data } = await authClient.getSession();
    if (!data?.user) return null;
    return {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      role: (data.user as { role?: string }).role === 'admin' ? 'admin' : 'user',
    };
  } catch {
    return null;
  }
}

/* ── Typed fetch wrapper for the admin API ───────────────────────────── */

export interface AdminResult<T> {
  data: T | null;
  error: string | null;
  fields: Record<string, string>;
  status: number;
}

/**
 * Every admin call goes through here, so the `{ ok, error, fields }`
 * envelope is unwrapped in exactly one place and components only ever deal
 * with a result object.
 */
export async function adminFetch<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<AdminResult<T>> {
  const blank: AdminResult<T> = { data: null, error: null, fields: {}, status: 0 };

  // Demo mode answers locally, so the panel is fully explorable with no
  // database. It cannot be enabled in a production build — see admin-demo.ts.
  if (isDemo) {
    const { json, ...rest } = init;
    const result = demoFetch(path, { ...rest, json });
    return {
      data: (result.data as T) ?? null,
      error: result.error ?? null,
      fields: result.fields ?? {},
      status: result.status,
    };
  }

  if (!hasApi) {
    return {
      ...blank,
      error:
        'No API is configured. Set PUBLIC_API_URL in .env and rebuild the admin panel.',
    };
  }

  const { json, ...rest } = init;

  try {
    const res = await fetch(`${config.apiUrl}${path}`, {
      ...rest,
      credentials: 'include',
      headers: {
        accept: 'application/json',
        ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(rest.headers ?? {}),
      },
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    });

    const body = await res.json().catch(() => null);

    if (!body || typeof body !== 'object' || !('ok' in body)) {
      return {
        ...blank,
        error: 'The server sent something unexpected. Check the API logs.',
        status: res.status,
      };
    }

    const result = body as
      | { ok: true; data: T }
      | { ok: false; error: string; fields?: Record<string, string> };

    if (!result.ok) {
      return {
        ...blank,
        error: result.error,
        fields: result.fields ?? {},
        status: res.status,
      };
    }

    return { data: result.data, error: null, fields: {}, status: res.status };
  } catch {
    return {
      ...blank,
      error: 'Could not reach the API. Check that it is running and reachable.',
    };
  }
}
