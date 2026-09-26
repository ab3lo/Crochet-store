/**
 * Better Auth instance.
 *
 * - Kysely adapter over a plain `pg` pool (Supabase Postgres).
 * - The `admin` plugin gives us `user.role` plus ban support, so route
 *   guards can check role without a second permissions table.
 * - Email/password only. No social providers, so no OAuth secrets to leak
 *   and no open redirect surface.
 */

import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins';
import { pool } from './db.ts';
import { env } from './env.ts';

export const auth = betterAuth({
  appName: 'Crochet & Co. Admin',
  secret: env.BETTER_AUTH_SECRET,

  baseURL: env.BETTER_AUTH_URL,
  basePath: '/api/auth',

  database: pool,

  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    requireEmailVerification: false,
  },

  user: {
    additionalFields: {
      role: { type: 'string', required: false, defaultValue: 'user', input: false },
    },
  },

  plugins: [admin()],

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      // 5 minutes of stateless reads. A revoked session stays valid for at
      // most this long, which is the intended trade-off.
      maxAge: 60 * 5,
    },
  },

  advanced: {
    // https everywhere, and never hand a session cookie to a cross-site fetch.
    useSecureCookies: env.isProd,
    defaultCookieAttributes: {
      sameSite: 'lax',
      httpOnly: true,
    },
    cookiePrefix: 'crochet',
  },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    customRules: {
      // Sign-in attempts are the thing worth throttling hard.
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 60 * 15, max: 5 },
    },
  },

  trustedOrigins: env.trustedOrigins,
});

export type Auth = typeof auth;
export type Session = Awaited<ReturnType<typeof auth.api.getSession>>;
