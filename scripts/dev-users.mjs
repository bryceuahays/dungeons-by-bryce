// Local testing only: makes (or removes) two throwaway accounts so the pages can be
// looked at in a browser on localhost without using a real person's login.
//   node scripts/dev-users.mjs create   -> writes .env.test.local (gitignored)
//   node scripts/dev-users.mjs delete

import fs from 'node:fs';
import path from 'node:path';
import { admin, campaign, cleanup, invite, makeUser, ROOT } from '../tests/helpers.mjs';

const file = path.join(ROOT, '.env.test.local');
if (process.argv[2] === 'delete') {
  await cleanup();
  if (fs.existsSync(file)) fs.unlinkSync(file);
  console.log('test accounts removed');
} else {
  const c = await campaign();
  const dm = await makeUser('dm', { dmOf: c.id });
  const player = await makeUser('player');
  const code = await invite(c.id);
  await player.client.rpc('join_campaign', { p_code: code });
  fs.writeFileSync(file, `TEST_DM_EMAIL=${dm.email}\nTEST_DM_PASSWORD=${dm.password}\nTEST_PLAYER_EMAIL=${player.email}\nTEST_PLAYER_PASSWORD=${player.password}\n`);
  const { count } = await admin.from('memberships').select('*', { count: 'exact', head: true }).eq('user_id', player.id);
  console.log('created a test DM and a test player (member of', count, 'campaign). Credentials are in .env.test.local');
}
