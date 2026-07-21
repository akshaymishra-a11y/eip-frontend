import { supabase } from './supabase';

// Phase 3 (docs/NODEJS_BACKEND_MIGRATION_PLAN.md): the web app's data layer
// (lib/api.ts) now talks to the NestJS backend instead of Supabase directly.
// Supabase Auth stays infra — login/signup/session management (auth-context.tsx,
// pages/auth/*) are untouched; this wrapper only forwards the current
// session's access token as a Bearer header, mirroring exactly what
// SupabaseService.forToken() on the backend expects.
const API_URL = import.meta.env.VITE_API_URL;
if (!API_URL) {
  throw new Error('Missing VITE_API_URL in .env');
}

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return token;
}

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: QueryParams;
};

// Shaped like a Supabase/PostgREST error object ({ message, code, hint }) on
// purpose — web/src/lib/errors.ts's describeSupabaseError() already knows
// how to turn that shape into a user-facing message (including the
// PROJECT_LIMIT_REACHED: special case), and NestJS's default HttpException
// response body (`{ statusCode, message, error }`) preserves the exact
// message text a backend service throws, so that matching keeps working
// unmodified.
export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = await getAccessToken();
  const url = new URL(`${API_URL}${path}`);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }

  const hasBody = options.body !== undefined;
  const res = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    },
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const message = payload && typeof payload === 'object' && 'message' in payload ? String((payload as { message: unknown }).message) : res.statusText;
    throw new ApiError(res.status, message);
  }

  return payload as T;
}

// For multipart file uploads (e.g. requirement-document upload-file) — deliberately
// does NOT set Content-Type itself, since the browser must set it (including the
// multipart boundary) when the body is a FormData instance.
export async function apiFetchForm<T>(path: string, formData: FormData): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const contentType = res.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const message = payload && typeof payload === 'object' && 'message' in payload ? String((payload as { message: unknown }).message) : res.statusText;
    throw new ApiError(res.status, message);
  }

  return payload as T;
}

// For downloading a binary response (e.g. the original requirement-document
// file) as a Blob instead of parsing it as JSON.
export async function apiFetchBlob(path: string): Promise<Blob> {
  const token = await getAccessToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  return res.blob();
}
