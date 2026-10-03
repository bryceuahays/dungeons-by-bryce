import 'server-only';
import { createClient } from '@supabase/supabase-js';

// Service-role client. Server only. Used for one thing: signing short-lived media
// URLs after the caller's role and the campaign phase have been checked.
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
