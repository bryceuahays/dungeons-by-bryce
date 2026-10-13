'use client';
import { useState, useTransition } from 'react';
import { hasFeature, hubPage, type HubFeatureId } from '@/config/hub-features';
import { saveFeatures, type SwitchState } from './actions';
import './switches.css';

export type SwitchPage = { id: string; name: string; what: string; optional: boolean; features: { id: string; name: string; what?: string; needs?: string }[] };

// The page and feature switches on the Manage page (FeatureToggles.png). A default page has a
// lock and only its features can be switched; an optional page has a switch of its own.
// "Customize" opens a page's features. Nothing is saved until Save.
//
// `pages` is only the pages the viewer may see (each has its own feature flag). `off` is
// everything the campaign has switched off, including switches for pages not shown here, so
// saving keeps those as they were.
export function SwitchesForm({ slug, pages, off }: { slug: string; pages: SwitchPage[]; off: string[] }) {
  const [gone, setGone] = useState(off);
  const [open, setOpen] = useState('');
  const [msg, setMsg] = useState<SwitchState>(null);
  const [pending, start] = useTransition();
  const settings = { features: { off: gone } };
  const flip = (id: string, on: boolean) => { setMsg(null); setGone(on ? gone.filter((x) => x !== id) : [...gone.filter((x) => x !== id), id]); };
  const groups = [
    { title: 'Default pages · always included, features can be switched off', optional: false, list: pages.filter((p) => !p.optional) },
    { title: 'Optional pages', optional: true, list: pages.filter((p) => p.optional) },
  ].filter((g) => g.list.length);

  return (
    <div className="sw">
      {groups.map((g) => (
        <section key={g.title} aria-label={g.optional ? 'Optional pages' : 'Default pages'}>
          <h3 className={'sw-group' + (g.optional ? ' opt' : '')}>{g.title}</h3>
          {g.list.map((p) => {
            const pageOn = !p.optional || !gone.includes(p.id);
            const count = p.features.filter((f) => hasFeature(settings, (p.id + '.' + f.id) as HubFeatureId)).length;
            const isOpen = open === p.id;
            return (
              <div key={p.id} className={'sw-page' + (p.optional ? (pageOn ? ' on' : ' off') : '')}>
                <div className="sw-row">
                  {p.optional
                    ? <input id={'sw-' + p.id} className="sw-box" type="checkbox" checked={pageOn} onChange={(e) => flip(p.id, e.target.checked)} />
                    : <span className="sw-lock" title="Always on"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg><span className="sw-sr">Always on</span></span>}
                  <label className="sw-name" htmlFor={p.optional ? 'sw-' + p.id : undefined}><b>{p.name}</b> <span>· {p.what}</span></label>
                  <span className="sw-sum">{pageOn ? `${count} of ${p.features.length} features on` : 'Page off'}</span>
                  <button type="button" className="sw-btn" aria-expanded={isOpen} aria-controls={'sw-feats-' + p.id} onClick={() => setOpen(isOpen ? '' : p.id)}>{isOpen ? 'Done' : 'Customize'}<span className="sw-sr"> {p.name}</span></button>
                </div>
                {isOpen ? (
                  <div className="sw-feats" id={'sw-feats-' + p.id}>
                    {p.features.map((f) => {
                      const id = p.id + '.' + f.id, need = f.needs ? hubPage(f.needs) : null;
                      const needOff = !!need && gone.includes(need.id);
                      const note = need ? `Needs ${need.name}${needOff ? ', which is switched off' : ''}` : f.what;
                      return (
                        <div key={id} className="sw-feat">
                          <input id={'sw-' + id} type="checkbox" checked={!gone.includes(id)} onChange={(e) => flip(id, e.target.checked)} />
                          <label htmlFor={'sw-' + id}>{f.name}{note ? <span>{note}</span> : null}</label>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      ))}
      <p className="row sw-save">
        <button type="button" className="act" disabled={pending} onClick={() => start(async () => setMsg(await saveFeatures(slug, gone)))}>{pending ? 'Saving' : 'Save pages and features'}</button>
        {msg?.error ? <span className="err" role="alert">{msg.error}</span> : null}
        {msg?.note ? <span className="okmsg" role="status">{msg.note}</span> : null}
      </p>
    </div>
  );
}
