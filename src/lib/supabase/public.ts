import { createClient } from '@supabase/supabase-js';

// Reads as a signed-out visitor, whoever is looking. Row-level security gives this
// client only what is public: SRD entries, live store products, and the demo campaign
// as a player sees it.
export const createPublicClient = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
