/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireViewer } from '@/lib/auth';
import { getSystemEntities } from '@/lib/campaign';
import { Sheet5e } from '@/components/Sheet5e';
import { isSystem, systemName } from '@/config/systems';

// The sheet of a character that is not in a campaign. Only its owner can open it. A character
// that is in a campaign is shown in that campaign instead.
export default async function SoloCharacter({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, user } = await requireViewer();
  const { data: ch } = await supabase.from('characters').select('id, campaign_id, system, data').eq('id', id).eq('owner', user.id).maybeSingle();
  if (!ch) notFound();
  if (ch.campaign_id) {
    const { data: camp } = await supabase.from('campaigns').select('slug').eq('id', ch.campaign_id).maybeSingle();
    if (camp) redirect(`/c/${camp.slug}/sheet?c=${ch.id}`);
  }
  const system = isSystem(ch.system) ? ch.system : '2024';
  const d = (ch.data ?? {}) as any;
  // what this character already uses stays on its sheet
  const keep = [d.raceId, d.clsId, d.subId, d.bgId, ...(d.feats ?? []), ...(d.spells ?? [])].filter(Boolean) as string[];
  const entities = await getSystemEntities(supabase, system, undefined, { liteSpells: true, keep });
  return (
    <div className="cs-guide">
      <div className="wrap">
        <p className="who">{systemName(system)}. This character is not in a campaign. You can add it to one that uses the same system from <Link href="/characters">My characters</Link>.</p>
        <p className="row"><Link className="act sm" href={`/characters/${ch.id}/create`}>{d.built ? 'Change it in the character creator' : 'Continue in the character creator'}</Link></p>
        <Sheet5e key={ch.id} character={{ id: ch.id, data: ch.data }} entities={entities as any} />
      </div>
    </div>
  );
}
