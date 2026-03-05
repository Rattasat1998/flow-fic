import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let adminClient: SupabaseClient | null = null;

function assertServiceRoleKey(serviceRoleKey: string) {
  if (serviceRoleKey.startsWith('sb_publishable_')) {
    throw new Error(
      'Invalid SUPABASE_SERVICE_ROLE_KEY: got publishable key. Use service role/secret key from Supabase project settings.'
    );
  }

  if (serviceRoleKey.startsWith('sb_secret_')) {
    return;
  }

  if (serviceRoleKey.startsWith('eyJ')) {
    try {
      const [, payload = ''] = serviceRoleKey.split('.');
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { role?: string };
      if (parsed.role !== 'service_role') {
        throw new Error('JWT role is not service_role');
      }
      return;
    } catch {
      throw new Error('Invalid SUPABASE_SERVICE_ROLE_KEY: JWT key is malformed or not service_role');
    }
  }
}

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY');
  }
  assertServiceRoleKey(serviceRoleKey);

  adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return adminClient;
}
