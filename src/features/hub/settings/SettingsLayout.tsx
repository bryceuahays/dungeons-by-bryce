import type { ReactNode } from 'react';
import './settings.css';

// Campaign settings (Settings.png): the Manage page, grouped into sections with a list of
// them down the side (along the top on a phone). A section with nothing in it is left out.
export const SETTINGS_SECTIONS = [
  { id: 'general', title: 'General' },
  { id: 'pages', title: 'Pages and features' },
  { id: 'privacy', title: 'Visibility defaults' },
  { id: 'dice', title: 'Dice' },
  { id: 'people', title: 'People and permissions' },
  { id: 'discord', title: 'Discord' },
  { id: 'danger', title: 'Archive or delete' },
] as const;
export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id'];

export function SettingsLayout({ title, lede, intro, sections }: { title: string; lede: ReactNode; intro?: ReactNode; sections: Partial<Record<SettingsSectionId, ReactNode>> }) {
  const shown = SETTINGS_SECTIONS.filter((s) => sections[s.id]);
  return (
    <div className="set">
      <nav className="set-nav" aria-label="Campaign settings">
        {shown.map((s) => <a key={s.id} href={'#set-' + s.id}>{s.title}</a>)}
      </nav>
      <div className="set-main">
        <h2>{title}</h2>
        <p className="lede">{lede}</p>
        {intro}
        {shown.map((s) => (
          <section key={s.id} id={'set-' + s.id} className={'set-sec' + (s.id === 'danger' ? ' danger' : '')} aria-labelledby={'set-h-' + s.id}>
            <h2 id={'set-h-' + s.id} className="set-h">{s.title}</h2>
            {sections[s.id]}
          </section>
        ))}
      </div>
    </div>
  );
}
