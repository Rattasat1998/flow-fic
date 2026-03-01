import { createClient } from '@supabase/supabase-js';

// Use fallback empty strings to prevent build/prerender crashes 
// when environment variables are not immediately available.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
