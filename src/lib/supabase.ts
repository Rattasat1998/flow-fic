"use client";

import { createClient } from '@supabase/supabase-js';

// Use dummy values to prevent build/prerender crashes 
// when environment variables are not immediately available (e.g. during Vercel build phase).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy_key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);  
