/**
 * The panel's only route to the server.
 *
 * ## Why this file is nearly identical to the deleted one
 *
 * `apps/web/src/lib/auth.ts` held `adminFetch` alongside the Better Auth
 * client. Stripping the auth left `adminFetch` — the one function every
 * component used to talk to the server — so it was carried over rather than
 * redesigned, and that is what allowed 2,600 lines of components to move
 * across unchanged.
 *
 * ## What is gone
 *
 * `baseURL`, `authUrl`, `credentials: 'include'`, and the `isDemo` branch.
 * There is no API on another origin and no session cookie, because there is no
 * API and no session. Requests are same-origin to the loopback dev server,
 * which is also why there is no CORS handling anywhere in this app.
 *
 * ## What is new
 *
 * `uploadImage` and `publishShop`. Both used to be inline `fetch` calls against
 * a configured `apiUrl`; both are here now so that no component reaches for
 * `fetch` directly, and the two ways of talking to the server stay in one file.
 */

import type { ApiResult } from '@crochet/shared';

export interface AdminResult<T> {
  data: T | null;
  error: string | null;
  fields: Record<string, string>;
  status: number;
}

const BLANK = (): AdminResult<never> => ({ data: null, error: null, fields: {}, status: 0 });

/**
 * Every admin call goes through here, so the `{ ok, error, fields }` envelope
 * is unwrapped in exactly one place and components only ever deal with a
 * result object.
 */
export async function adminFetch<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<AdminResult<T>> {
  const { json, ...rest } = init;

  try {
    const res = await fetch(path, {
      ...rest,
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
        ...BLANK(),
        error: 'The server sent something unexpected. Check the terminal running the panel.',
        status: res.status,
      };
    }

    const result = body as
      | { ok: true; data: T }
      | { ok: false; error: string; fields?: Record<string, string> };

    if (!result.ok) {
      return {
        ...BLANK(),
        error: result.error,
        fields: result.fields ?? {},
        status: res.status,
      };
    }

    return { data: result.data, error: null, fields: {}, status: res.status };
  } catch {
    return {
      ...BLANK(),
      error: 'Could not reach the panel server. Is it still running?',
    };
  }
}

/* ── Uploads ──────────────────────────────────────────────────────────── */

export interface UploadedImage {
  url: string;
  repoPath: string;
  bytes: number;
}

/**
 * Write a product photo into the repository.
 *
 * `multipart` is set rather than a JSON body, and the `Content-Type` header is
 * deliberately left unset — the browser has to add the multipart boundary
 * itself, and setting the header by hand without it produces a body the server
 * cannot parse.
 */
export async function uploadImage(
  file: File,
  slug: string,
): Promise<AdminResult<UploadedImage>> {
  const form = new FormData();
  form.append('file', file);
  form.append('slug', slug);

  try {
    const res = await fetch('/api/admin/upload', { method: 'POST', body: form });
    const body = (await res.json().catch(() => null)) as ApiResult<UploadedImage> | null;

    if (!body) {
      return { ...BLANK(), error: 'The upload returned nothing readable.', status: res.status };
    }
    if (!body.ok) {
      return { ...BLANK(), error: body.error, fields: body.fields ?? {}, status: res.status };
    }
    return { data: body.data, error: null, fields: {}, status: res.status };
  } catch {
    return { ...BLANK(), error: 'The upload could not be sent.' };
  }
}
