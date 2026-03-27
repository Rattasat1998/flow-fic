import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { applyInMemoryRateLimit, getRequestIp } from '@/lib/server/request-rate-limit';

type SpellcheckFieldInput = {
  id?: unknown;
  label?: unknown;
  text?: unknown;
};

type SpellcheckRequestBody = {
  fields?: SpellcheckFieldInput[];
  language?: unknown;
};

type NormalizedField = {
  id: string;
  label: string;
  text: string;
};

type ServiceSpellcheckFieldIssue = {
  id?: unknown;
  label?: unknown;
  matches?: unknown;
  suggestions?: unknown;
  examples?: unknown;
};

type ServiceSpellcheckResponse = {
  checkedFields?: unknown;
  totalMatches?: unknown;
  fields?: unknown;
  error?: unknown;
};

type PublicSpellcheckFieldIssue = {
  id: string;
  label: string;
  matches: number;
  suggestions: string[];
  examples: string[];
};

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
};

const MAX_FIELDS = 120;
const MAX_TOTAL_TEXT_LENGTH = 60_000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;

const resolveServiceUrl = (): string | null => {
  const raw = process.env.SPELLCHECK_SERVICE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
};

const resolveTimeoutMs = (): number => {
  const raw = Number(process.env.SPELLCHECK_TIMEOUT_MS || '7000');
  if (!Number.isFinite(raw)) return 7000;
  return Math.max(1500, Math.min(20000, Math.floor(raw)));
};

function getPublicSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function getAuthenticatedUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;

  const accessToken = authHeader.slice('Bearer '.length).trim();
  if (!accessToken) return null;

  const supabase = getPublicSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) return null;
  return user;
}

const normalizeFields = (fields: unknown): NormalizedField[] => {
  if (!Array.isArray(fields)) return [];

  const normalized: NormalizedField[] = [];
  const seen = new Set<string>();
  let totalLength = 0;

  for (const item of fields.slice(0, MAX_FIELDS)) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as SpellcheckFieldInput;
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
    const text = typeof candidate.text === 'string' ? candidate.text.trim() : '';
    if (!id || !text || seen.has(id)) continue;

    totalLength += text.length;
    if (totalLength > MAX_TOTAL_TEXT_LENGTH) break;

    normalized.push({
      id,
      label: label || id,
      text: text.replace(/\r\n/g, '\n'),
    });
    seen.add(id);
  }

  return normalized;
};

const parseStringArray = (value: unknown, max: number): string[] => {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== 'string') continue;
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) continue;
    result.push(normalized);
    seen.add(normalized);
    if (result.length >= max) break;
  }

  return result;
};

const normalizeServiceFieldIssue = (value: ServiceSpellcheckFieldIssue): PublicSpellcheckFieldIssue | null => {
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  if (!id) return null;
  const label = typeof value.label === 'string' && value.label.trim().length > 0 ? value.label.trim() : id;
  const matchesRaw = Number(value.matches);
  const matches = Number.isFinite(matchesRaw) ? Math.max(0, Math.floor(matchesRaw)) : 0;
  if (matches <= 0) return null;

  return {
    id,
    label,
    matches,
    suggestions: parseStringArray(value.suggestions, 6),
    examples: parseStringArray(value.examples, 4),
  };
};

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const clientIp = getRequestIp(request.headers);
    const rateLimit = applyInMemoryRateLimit(
      `spellcheck:${user.id}:${clientIp}`,
      RATE_LIMIT_MAX_REQUESTS,
      RATE_LIMIT_WINDOW_MS,
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many spellcheck requests. Please wait and try again.' },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            'Retry-After': String(rateLimit.retryAfterSeconds),
          },
        },
      );
    }

    let body: SpellcheckRequestBody;
    try {
      body = (await request.json()) as SpellcheckRequestBody;
    } catch {
      return NextResponse.json({ error: 'Invalid spellcheck payload' }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const fields = normalizeFields(body.fields);
    if (fields.length === 0) {
      return NextResponse.json(
        {
          checkedFields: 0,
          totalMatches: 0,
          fields: [],
        },
        { status: 200, headers: NO_STORE_HEADERS },
      );
    }

    const serviceUrl = resolveServiceUrl();
    if (!serviceUrl) {
      return NextResponse.json(
        { error: 'Spellcheck service is not configured' },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }

    const timeoutMs = resolveTimeoutMs();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let upstreamResponse: Response;
    try {
      const serviceToken = process.env.SPELLCHECK_SERVICE_TOKEN?.trim();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (serviceToken) {
        headers['X-Spellcheck-Token'] = serviceToken;
      }

      upstreamResponse = await fetch(`${serviceUrl}/v1/spellcheck/chapter`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fields,
          language: 'th',
        }),
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch (error) {
      const isAbortError =
        error instanceof DOMException
          ? error.name === 'AbortError'
          : typeof error === 'object' && error !== null && 'name' in error && (error as { name?: string }).name === 'AbortError';
      const message = isAbortError
        ? 'Spellcheck service timeout. Please try again.'
        : 'Spellcheck service unavailable right now.';
      return NextResponse.json({ error: message }, { status: 503, headers: NO_STORE_HEADERS });
    } finally {
      clearTimeout(timeout);
    }

    let servicePayload: ServiceSpellcheckResponse | null = null;
    try {
      servicePayload = (await upstreamResponse.json()) as ServiceSpellcheckResponse;
    } catch {
      servicePayload = null;
    }

    if (!upstreamResponse.ok) {
      const upstreamMessage = typeof servicePayload?.error === 'string' ? servicePayload.error.trim() : '';
      return NextResponse.json(
        {
          error: upstreamMessage || `Spellcheck service request failed (${upstreamResponse.status})`,
        },
        {
          status: upstreamResponse.status >= 500 ? 502 : upstreamResponse.status,
          headers: NO_STORE_HEADERS,
        },
      );
    }

    const rawIssues = Array.isArray(servicePayload?.fields) ? (servicePayload?.fields as ServiceSpellcheckFieldIssue[]) : [];
    const normalizedIssues = rawIssues
      .map(normalizeServiceFieldIssue)
      .filter((issue): issue is PublicSpellcheckFieldIssue => issue !== null)
      .sort((a, b) => b.matches - a.matches);

    const rawCheckedFields = Number(servicePayload?.checkedFields);
    const checkedFields = Number.isFinite(rawCheckedFields)
      ? Math.max(0, Math.floor(rawCheckedFields))
      : fields.length;
    const rawTotalMatches = Number(servicePayload?.totalMatches);
    const fallbackTotal = normalizedIssues.reduce((sum, issue) => sum + issue.matches, 0);
    const totalMatches = Number.isFinite(rawTotalMatches)
      ? Math.max(0, Math.floor(rawTotalMatches))
      : fallbackTotal;

    return NextResponse.json(
      {
        checkedFields,
        totalMatches,
        fields: normalizedIssues,
      },
      {
        status: 200,
        headers: {
          ...NO_STORE_HEADERS,
          'X-RateLimit-Remaining': String(rateLimit.remaining),
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Spellcheck failed';
    return NextResponse.json({ error: message }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
