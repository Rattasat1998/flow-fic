import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type AuthenticatedUser = {
  id: string;
  email?: string;
};

function getPublicSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function getAuthenticatedUser(request: NextRequest): Promise<AuthenticatedUser | null> {
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
  return { id: user.id, email: user.email || undefined };
}

function getFinanceAdminIds() {
  return (process.env.FINANCE_ADMIN_USER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isFinanceAdmin(userId: string) {
  const adminIds = getFinanceAdminIds();
  if (adminIds.length === 0) return false;
  return adminIds.includes(userId);
}

export function normalizeReason(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (normalized.length < 8) return null;
  return normalized;
}

export function toSafeCorrelationId(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, 120);
}
