import 'server-only';
import { getViewer } from './auth';
import { createPublicClient } from './supabase/public';

// The store is read as whoever is looking. Signed in: with their own login, so a listing
// made from a campaign they play in is not there for them. Signed out: as a guest, who is
// not shown listings whose source campaign has players at all (a guest could be one of them).
export async function storeReader() {
  const viewer = await getViewer();
  return { viewer, db: viewer ? viewer.supabase : createPublicClient() };
}
