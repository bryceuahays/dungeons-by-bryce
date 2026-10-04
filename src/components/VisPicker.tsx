'use client';

// "Who sees it": the one control for visibility, used on blocks, homebrew, NPCs, beats,
// regions, pins, clocks and everything else that has it.
export type Vis = { vis: string; vis_players: string[]; vis_stage: string | null; vis_entry?: string | null };
export type Stage = { id: string; label: string };
export type Member = { user_id: string; display_name: string };

const LABEL: Record<string, string> = { all: 'Everyone at the table', dm: 'DM only', players: 'Only the players I name', stage: 'Everyone, from a stage onward', entry: 'Everyone, once a story beat happens' };

export function VisPicker({ value, onChange, stages = [], members = [], beats = [], allow = ['all', 'dm', 'players', 'stage'], canName = true, disabled }: {
  value: Vis; onChange: (v: Vis) => void; stages?: Stage[]; members?: Member[]; beats?: { id: string; title: string }[]; allow?: string[]; canName?: boolean; disabled?: boolean;
}) {
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
      {value.vis === 'stage' ? (
        <label className="vis-l">From
          <select value={value.vis_stage ?? ''} disabled={disabled} onChange={(e) => set({ vis_stage: e.target.value || null })}>
            <option value="">Choose a stage</option>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      ) : null}
      {value.vis === 'entry' ? (
        <label className="vis-l">When
          <select value={value.vis_entry ?? ''} disabled={disabled} onChange={(e) => set({ vis_entry: e.target.value || null })}>
            <option value="">Choose a beat</option>
            {beats.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
        </label>
      ) : null}
      {value.vis === 'players' ? (
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

export const visLabel = (v: Vis, stages: Stage[] = [], members: Member[] = [], beats: { id: string; title: string }[] = []) =>
  v.vis === 'all' ? 'Everyone' : v.vis === 'dm' ? 'DM only'
    : v.vis === 'stage' ? `From ${stages.find((s) => s.id === v.vis_stage)?.label ?? 'a stage'}`
    : v.vis === 'entry' ? `After "${beats.find((b) => b.id === v.vis_entry)?.title ?? 'a beat'}"`
    : `Only ${v.vis_players.map((id) => members.find((m) => m.user_id === id)?.display_name ?? 'a player').join(', ') || 'named players'}`;
