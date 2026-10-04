'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TOOLS: [string, string][] = [['npcs', 'NPCs'], ['timeline', 'Timeline'], ['maps', 'Maps'], ['world', 'World state'], ['zero', 'Session zero']];

export function DemoTabs({ tabs }: { tabs: { slug: string; title: string }[] }) {
  const path = usePathname();
  const rest = path.replace(/^\/demo\/?/, '').split('/').filter(Boolean);
  const current = rest[0] === 'tools' ? 'tools/' + rest[1] : rest[0] || tabs[0]?.slug;
  return (
    <div className="cs-guide tabwrap">
      <nav className="tabs" aria-label="Sections">
        <div className="tabrow" role="tablist">
          {tabs.map((t) => <Link key={t.slug} className="tab" role="tab" aria-selected={current === t.slug} href={'/demo/' + t.slug}>{t.title}</Link>)}
          {TOOLS.map(([id, name]) => <Link key={id} className="tab" role="tab" aria-selected={current === 'tools/' + id} href={'/demo/tools/' + id}>{name}</Link>)}
        </div>
      </nav>
    </div>
  );
}
