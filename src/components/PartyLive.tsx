'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { renderParty } from '@/islands/party';

type Row = { id: string; owner: string; data: any; player?: string };

// The DM's Players tab. Sheets update the moment a player changes theirs.
export function PartyLive({ campaignId, initial, races, names }: { campaignId: string; initial: Row[]; races: any[]; names: Record<string, string> }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [ask, setAsk] = useState('');
  const [live, setLive] = useState(false);

  useEffect(() => {
    const supabase = supabaseBrowser();
    let gone = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    // Realtime checks row-level security with the DM's own token, so the token has to
    // be in place before the channel joins.
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (gone) return;
      if (session) await supabase.realtime.setAuth(session.access_token);
      if (gone) return;
      channel = supabase
      .channel('party-' + campaignId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'characters', filter: 'campaign_id=eq.' + campaignId }, (payload: any) => {
        setRows((prev) => {
          if (payload.eventType === 'DELETE') return prev.filter((r) => r.id !== payload.old.id);
          const row = payload.new as Row;
          const next = prev.filter((r) => r.id !== row.id);
          next.push({ id: row.id, owner: row.owner, data: row.data });
          return next;
        });
      })
      // deletes carry only the id, so they are not matched by the campaign filter
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'characters' }, (payload: any) => {
        setRows((prev) => prev.filter((r) => r.id !== payload.old.id));
      })
      .subscribe((status: string) => setLive(status === 'SUBSCRIBED'));
    })();
    return () => { gone = true; if (channel) supabase.removeChannel(channel); };
  }, [campaignId]);

  const html = useMemo(() => renderParty(rows.map((r) => ({ ...r, player: names[r.owner] || r.player })), races, ask), [rows, races, ask, names]);

  async function onClick(e: React.MouseEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    const a = t.closest<HTMLElement>('[data-pask]'); if (a) { setAsk(a.dataset.pask!); return; }
    if (t.closest('[data-pkeep]')) { setAsk(''); return; }
    const rm = t.closest<HTMLElement>('[data-prm]');
    if (rm) {
      const id = rm.dataset.prm!;
      setAsk('');
      setRows((prev) => prev.filter((r) => r.id !== id));
      await supabaseBrowser().from('characters').delete().eq('id', id);
    }
  }

  return (
    <>
      <p className="who" id="pState" style={{ marginTop: 14 }}>{live ? 'Live: sheets update here as your players change them.' : 'Connecting to live updates…'}</p>
      <div id="party" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
