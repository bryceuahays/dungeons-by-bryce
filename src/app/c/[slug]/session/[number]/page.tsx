/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCampaign } from '@/lib/campaign';
import { esc } from '@/lib/render';
import { RunSheetIsland } from '@/components/Islands';
import { SessionEditForm } from '@/components/DmForms';
import { BeatEditor, SessionNotes } from '@/components/Editor';
import type { SessionRow } from '@/lib/types';

// A session's run sheet. DM only: the sessions table has no policy for players at all.
export default async function SessionPage({ params, searchParams }: { params: Promise<{ slug: string; number: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { slug, number } = await params;
  const { edit } = await searchParams;
  const ctx = await getCampaign(slug);
  if (!ctx.isDm) notFound();
  const { data } = await ctx.supabase.from('sessions').select('*').eq('campaign_id', ctx.campaign.id).eq('number', Number(number)).maybeSingle();
  const s = data as SessionRow | null;
  if (!s) notFound();
  const c = s.content || {};
  const back = `/c/${slug}/sessions`;

  if (!Array.isArray(c.beats)) {
    return (
      <div className="cs-guide">
        <div className="wrap">
          <h2>{s.title}</h2>
          <p className="lede">{s.meta}</p>
          <p>{s.summary}</p>
          <h2>Notes</h2>
          <SessionNotes slug={slug} sessionId={s.id} notes={c.notes ?? ''} />
          <h2>Details</h2>
          <div className="plate"><SessionEditForm slug={slug} session={s} /></div>
          <p style={{ marginTop: 20 }}><Link href={back}>Back to sessions</Link></p>
        </div>
      </div>
    );
  }

  if (edit) {
    return (
      <div className="cs-guide">
        <div className="wrap">
          <h2>Edit: {s.title}</h2>
          <p className="lede">Change the text of any beat. The trackers and buttons keep working as long as you leave them in place.</p>
          <p><Link className="act" href={`/c/${slug}/session/${s.number}`}>Done editing</Link></p>
          {c.beats.map((b: any) => {
            const step = (c.steps || []).find((x: any) => x.id === b.id);
            return <BeatEditor key={b.id} slug={slug} sessionId={s.id} beatId={b.id} label={step ? `${step.num ? step.num + '. ' : ''}${step.label}` : b.id} html={b.html} />;
          })}
          <h2>Details</h2>
          <div className="plate"><SessionEditForm slug={slug} session={s} /></div>
        </div>
      </div>
    );
  }

  const t = c.trackers || {};
  const html = `<div class="bar">
  <div class="barin">
    <div class="name">${esc(c.name)}<small>${esc(c.sub)}</small></div>
    <div class="host">
      <span class="lab">${esc(c.hostLabel)}</span>
      <button class="k" data-host="-10" aria-label="Host minus 10">−10</button>
      <button class="k" data-host="-1" aria-label="Host minus 1">−1</button>
      <input id="host" type="number" min="0" max="999" value="${esc(t.host)}" aria-label="Rebels alive">
      <button class="k" data-host="1" aria-label="Host plus 1">+1</button>
    </div>
  </div>
  <div class="steps" role="tablist" aria-label="Session beats">
    ${(c.steps || []).map((x: any) => `<button class="step ${esc(x.cls)}" role="tab" data-p="${esc(x.id)}">${x.num ? `<b>${esc(x.num)}</b>` : ''}${esc(x.label)}</button>`).join('')}
  </div>
</div>
<div class="wrap">
${c.beats.map((b: any) => `<section id="${esc(b.id)}" role="tabpanel" hidden>${b.html}</section>`).join('\n')}
<div class="navrow"><button class="k" id="prev">Back</button><button class="k" id="next">Next</button></div>
<p style="margin-top:26px"><a class="k" href="${back}">All sessions</a> <a class="k" href="/c/${esc(slug)}/session/${s.number}?edit=1">Edit this run sheet</a></p>
</div>
<template id="tHost">${c.templates?.host ?? ''}</template>
<template id="tDrop">${c.templates?.drop ?? ''}</template>`;

  return (
    <div className="cs-run">
      <RunSheetIsland sessionId={s.id} html={html} content={{ order: c.order, trackers: t }} state={s.state || {}} />
    </div>
  );
}
