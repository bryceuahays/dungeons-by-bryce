'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { mountSheet, mountCombat } from '@/islands/sheet';
import { mountBuilder } from '@/islands/builder.gen';
import { BUILDER_HTML } from '@/islands/builder.html';
import { mountRunSheet } from '@/islands/runsheet.gen';
import { blank, mergeImport, normalize } from '@/islands/character';

// The interactive pages keep the source sites' own scripts. Each one is mounted on a
// fresh element so its listeners go away when the page changes.
function useIsland(html: string, mount: (el: HTMLElement) => void | (() => void), key: string) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = document.createElement('div');
    el.innerHTML = html;
    host.current!.replaceChildren(el);
    const off = mount(el);
    return () => { if (typeof off === 'function') off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return host;
}

async function saveData(id: string, data: any) {
  const { error } = await supabaseBrowser().from('characters').update({ data }).eq('id', id);
  if (error) throw error;
}

export function SheetIsland({ html, character, races, divine }: { html: string; character: { id: string; data: any }; races: any[]; divine: any }) {
  const host = useIsland(html, (el) => mountSheet(el, { character: character.data, races, divine, save: (C: any) => saveData(character.id, C) }), character.id);
  return <div ref={host} />;
}

const COMBAT_HTML = '<section id="combat"><div class="cgrid"><aside class="cleft" id="cLeft"></aside><div id="cRight"></div></div></section>';

export function CombatIsland({ character, races, sheetHref }: { character: { id: string; data: any }; races: any[]; sheetHref: string }) {
  const host = useIsland(COMBAT_HTML, (el) => mountCombat(el, { character: character.data, races, sheetHref, save: (C: any) => saveData(character.id, C) }), character.id);
  return <div ref={host} />;
}

export function BuilderIsland(props: {
  campaignId: string; userId: string; playerName: string; slug: string; phase: string; phaseConfig: any; rules: any;
  character: { id: string; data: any; builder: any } | null;
}) {
  const host = useIsland(BUILDER_HTML, (el) => {
    const supabase = supabaseBrowser();
    let id = props.character?.id ?? null;
    let current = props.character?.data ?? null;
    let creating: Promise<string> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let latest: any = null;
    const stateEl = () => el.querySelector('#saveState');
    const say = (t: string) => { const s = stateEl(); if (s) s.textContent = t; };

    // The row is created the first time there is something to save.
    const ensure = (S: any): Promise<string> => {
      if (id) return Promise.resolve(id);
      if (!creating) {
        creating = (async () => {
          const data = { ...blank(), name: S.name || '', player: S.player || props.playerName };
          const { data: row, error } = await supabase.from('characters').insert({ owner: props.userId, campaign_id: props.campaignId, data, builder: S }).select('id').single();
          if (error || !row) { creating = null; throw error || new Error('no row'); }
          id = row.id as string; current = data;
          history.replaceState(null, '', `/c/${props.slug}/builder?c=${id}`);
          return id;
        })();
      }
      return creating;
    };
    const flush = async () => {
      timer = null;
      const S = latest; if (!S) return;
      try {
        const cid = await ensure(S);
        const { error } = await supabase.from('characters').update({ builder: S }).eq('id', cid);
        if (error) throw error;
        say('Progress saved to your account.');
      } catch { say('Progress is not saving right now. Check your connection.'); }
    };
    const state = props.character?.builder ?? null;
    const off = mountBuilder(el, {
      rules: props.rules,
      phase: props.phase,
      phaseConfig: props.phaseConfig,
      media: `/c/${props.slug}/media`,
      sheetHref: `/c/${props.slug}/sheet`,
      state: state ? state : { player: props.playerName },
      persist: (S: any) => { latest = JSON.parse(JSON.stringify(S)); say('Saving…'); if (timer) clearTimeout(timer); timer = setTimeout(flush, 1200); },
      finish: async (C: any, S: any) => {
        if (timer) { clearTimeout(timer); timer = null; }
        const cid = await ensure(S);
        const data = mergeImport(normalize(current || {}), C);
        const { error } = await supabase.from('characters').update({ data, builder: S }).eq('id', cid);
        if (error) throw error;
        current = data;
        const link = el.querySelector<HTMLAnchorElement>('#saveMsg a');
        if (link) link.href = `/c/${props.slug}/sheet?c=${cid}`;
        say('Saved to your account.');
        setTimeout(() => { const a = el.querySelector<HTMLAnchorElement>('#saveMsg a'); if (a) a.href = `/c/${props.slug}/sheet?c=${cid}`; }, 0);
      },
    });
    return () => { if (timer) { clearTimeout(timer); flush(); } off?.(); };
  }, props.character?.id ?? 'new');
  return <div ref={host} />;
}

export function RunSheetIsland({ sessionId, html, content, state }: { sessionId: string; html: string; content: any; state: any }) {
  const host = useIsland(html, (el) => {
    const supabase = supabaseBrowser();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let latest: any = null;
    const flush = () => { timer = null; if (latest) supabase.from('sessions').update({ state: latest }).eq('id', sessionId).then(() => {}); };
    mountRunSheet(el, { content, state, save: (s: any) => { latest = JSON.parse(JSON.stringify(s)); if (timer) clearTimeout(timer); timer = setTimeout(flush, 600); } });
    return () => { if (timer) { clearTimeout(timer); flush(); } };
  }, sessionId);
  return <div ref={host} />;
}
