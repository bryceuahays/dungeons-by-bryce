// The ready-made worlds every account can start a campaign in. Safe to run again: each is
// matched by its key and updated in place.
//
//   node scripts/seed-worlds.mjs
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (from .env.local).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Fill in NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.'); process.exit(1); }
const admin = createClient(url, key, { auth: { persistSession: false } });

const WORLDS = [
  {
    key: 'srd-2024',
    name: 'Classic Fantasy',
    tagline: 'The 2024 rules as the System Reference Document has them: nothing changed, nothing added.',
    system: 'dnd5e',
    rules: '2024',
    data: { desc: 'Every race, class, subclass, background, feat, spell, item and monster in the System Reference Document 5.2 (the 2024 rules), exactly as published. Start a campaign here to play the standard fifth edition rules, or make your own copy of this world and add your homebrew to it.\n\nThe SRD 5.2 is by Wizards of the Coast, under the Creative Commons Attribution 4.0 licence.' },
  },
];

for (const w of WORLDS) {
  const { error } = await admin.from('worlds').upsert({ ...w, official: true, owner_id: null }, { onConflict: 'key' });
  console.log(error ? `${w.name}: ${error.message}` : `${w.name}: ready`);
}
