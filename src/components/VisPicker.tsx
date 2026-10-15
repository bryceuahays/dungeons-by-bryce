'use client';
import { useVisMode } from '@/features/hub/visibility/VisMode';
import { WhoSees } from '@/features/hub/visibility/WhoSees';
import { triggerWords } from '@/features/hub/reveals/triggers';

// "Who sees it": the one control for visibility, used on blocks, homebrew, NPCs, beats,
// regions, pins, clocks and everything else that has it.
//
// Where the page has switched on the hub version 2 picker (the hub_v2_visibility flag, handed
// down by <VisMode>), a DM's control is "Who sees this?" instead (src/features/hub/visibility):
// every kind of content gets every choice, and who and when can be combined. Otherwise it is
// the control below, exactly as it was.
export type Vis = { vis: string; vis_players: string[]; vis_stage: string | null; vis_entry?: string | null };
export type Stage = { id: string; label: string };
export type Member = { user_id: string; display_name: string };

const LABEL: Record<string, string> = { all: 'Everyone at the table', dm: 'DM only', players: 'Only the players I name', stage: 'Everyone, from a stage onward', entry: 'Everyone, once a story beat happens',
  players_stage: 'Only the players I name, from a stage onward', players_entry: 'Only the players I name, once a story beat happens',
  when: 'Everyone, once something happens', players_when: 'Only the players I name, once something happens' };

export function VisPicker({ value, onChange, stages = [], members = [], beats: givenBeats, allow = ['all', 'dm', 'players', 'stage'], canName = true, disabled }: {
  value: Vis; onChange: (v: Vis) => void; stages?: Stage[]; members?: Member[]; beats?: { id: string; title: string }[]; allow?: string[]; canName?: boolean; disabled?: boolean;
}) {
  const mode = useVisMode();
  const named = value.vis === 'players' || value.vis === 'players_stage' || value.vis === 'players_entry' || value.vis === 'players_when' || (value.vis === 'dm' && (value.vis_players ?? []).length > 0);
  if (!mode.defaults.named && !named) members = [];
  // A control that offers "DM only" is a DM's. The few that do not (a beat being logged) keep the short list.
  if (mode.on && allow.includes('dm')) return <WhoSees value={value} onChange={onChange} stages={stages} members={members} beats={givenBeats ?? mode.beats} canName={canName} disabled={disabled} nextSession={mode.nextSession} named={mode.defaults.named || named} />;
  const beats = givenBeats ?? [];
  const options = allow.filter((o) => (o !== 'stage' || stages.length > 0) && (o !== 'entry' || beats.length > 0) && (o !== 'players' || members.length > 0));
  const set = (patch: Partial<Vis>) => onChange({ ...value, ...patch });
  return (
    <span className="vis">
      <label className="vis-l">Who sees it
        <select value={value.vis} disabled={disabled} onChange={(e) => set({ vis: e.target.value })}>
          {options.map((o) => <option key={o} value={o} disabled={o === 'players' && !canName}>{LABEL[o]}{o === 'players' && !canName ? ' (Pro)' : ''}</option>)}
          {options.includes(value.vis) ? null : <option value={value.vis}>{LABEL[value.vis] ?? value.vis}</option>}
        </select>
      </label>
      {value.vis === 'stage' || value.vis === 'players_stage' ? (
        <label className="vis-l">From
          <select value={value.vis_stage ?? ''} disabled={disabled} onChange={(e) => set({ vis_stage: e.target.value || null })}>
            <option value="">Choose a stage</option>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      ) : null}
      {value.vis === 'entry' || value.vis === 'players_entry' ? (
        <label className="vis-l">When
          <select value={value.vis_entry ?? ''} disabled={disabled} onChange={(e) => set({ vis_entry: e.target.value || null })}>
            <option value="">Choose a beat</option>
            {beats.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
        </label>
      ) : null}
      {value.vis === 'players' || value.vis === 'players_stage' || value.vis === 'players_entry' || value.vis === 'players_when' ? (
        <span className="vis-who">
          {members.map((m) => (
            <label key={m.user_id} className="vis-ck">
              <input type="checkbox" disabled={disabled} checked={value.vis_players.includes(m.user_id)}
                onChange={(e) => set({ vis_players: e.target.checked ? [...value.vis_players, m.user_id] : value.vis_players.filter((id) => id !== m.user_id) })} />
              {m.display_name || 'Unnamed'}
            </label>
          ))}
        </span>
      ) : null}
    </span>
  );
}

export const visLabel = (v: Vis, stages: Stage[] = [], members: Member[] = [], beats: { id: string; title: string }[] = []): string =>
  v.vis === 'all' ? 'Everyone' : v.vis === 'dm' ? 'DM only'
    : v.vis === 'stage' ? `From ${stages.find((s) => s.id === v.vis_stage)?.label ?? 'a stage'}`
    : v.vis === 'entry' ? `After "${beats.find((b) => b.id === v.vis_entry)?.title ?? 'a beat'}"`
    : v.vis === 'players_stage' ? `${visLabel({ ...v, vis: 'players' }, stages, members)}, from ${stages.find((s) => s.id === v.vis_stage)?.label ?? 'a stage'}`
    : v.vis === 'players_entry' ? `${visLabel({ ...v, vis: 'players' }, stages, members)}, after "${beats.find((b) => b.id === v.vis_entry)?.title ?? 'a beat'}"`
    : v.vis === 'when' ? `Once ${triggerWords(v.vis_stage, { chapters: stages, beats: beats.map((b) => ({ id: b.id, label: b.title })) })}`
    : v.vis === 'players_when' ? `${visLabel({ ...v, vis: 'players' }, stages, members)}, once ${triggerWords(v.vis_stage, { chapters: stages, beats: beats.map((b) => ({ id: b.id, label: b.title })) })}`
    : `Only ${v.vis_players.map((id) => members.find((m) => m.user_id === id)?.display_name ?? 'a player').join(', ') || 'named players'}`;
