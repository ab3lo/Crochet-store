/**
 * The response envelope, and nothing else.
 *
 * The panel's components unwrap `{ ok, data }` / `{ ok, error, fields }` in one
 * function (`lib/api.ts`) and deal in `AdminResult` everywhere else. One code
 * path for failures, and a per-field `fields` map that lets a form highlight
 * the input that was wrong instead of printing a sentence.
 *
 * Keeping that envelope is what allowed 2,600 lines of components to move
 * across from the deleted API unchanged. What did *not* survive is what the
 * envelope existed to serve in a hostile environment: CORS negotiation,
 * `clientIp`, rate limiting, status-code juggling for anonymous callers,
 * session guards. None of it applies to a loopback-only tool, so this file is a
 * fraction of the size of `apps/api/src/lib/http.ts` — which is the point of
 * the migration.
 */

import { json } from '@sveltejs/kit';
import type { ApiResult } from '@crochet/shared';
import { z } from 'zod';

export const ok = <T>(data: T, status = 200) =>
  json<ApiResult<T>>({ ok: true as const, data }, status);

export const fail = (
  error: string,
  status = 400,
  fields?: Record<string, string>,
) => json<ApiResult<never>>({ ok: false as const, error, ...(fields && { fields }) }, status);

/**
 * Parse a JSON body with a Zod schema, or return a ready-made 422.
 *
 * Identical to the deleted `parse` helper. The `fields` map is what makes the
 * product form able to say "Use lowercase words joined by dashes" under the
 * slug input rather than in a banner at the top of the page.
 */
export async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ data: T; response?: never } | { data?: never; response: Response }> {
  const body = await request.json().catch(() => null);
  const result = schema.safeParse(body);

  if (result.success) return { data: result.data };

  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }

  return { response: fail('Please fix the highlighted fields.', 422, fields) };
}

/**
 * An unexpected failure, without leaking the cause.
 *
 * The deleted version existed because a Postgres error string can contain
 * column and constraint names. A SQLite error string can too (`UNIQUE
 * constraint failed: products.slug`), so the same discipline applies — the
 * detail goes to the terminal, the browser gets a sentence.
 */
export function unexpected(err: unknown, where: string): Response {
  console.error(`[admin] ${where}:`, err);
  return fail('Something went wrong. The details are in the terminal running the panel.', 500);
}

/** True when the failure is a unique-constraint violation. */
export function isUniqueViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /UNIQUE constraint failed/i.test(message);
}
