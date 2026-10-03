'use client';
import { useRouter } from 'next/navigation';
import { toggleChecklist } from '@/app/c/[slug]/actions';

// A content tab. The markup is rendered on the server from rows the viewer is allowed
// to read; this component only wires up the clicks the source sites handled in script.
export function GuideSection({ slug, html }: { slug: string; html: string }) {
  const router = useRouter();
  const base = '/c/' + slug;

  function onClick(e: React.MouseEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    const go = t.closest<HTMLElement>('[data-go]');
    if (go) { e.preventDefault(); router.push(`${base}/${go.dataset.go}`); return; }
    const chip = t.closest<HTMLElement>('.chip[data-race]');
    if (chip) {
      e.preventDefault();
      const id = chip.dataset.race!;
      const root = e.currentTarget;
      root.querySelectorAll<HTMLElement>('.chip[data-race]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.race === id)));
      root.querySelectorAll<HTMLElement>('[data-race-detail]').forEach((d) => { d.hidden = d.dataset.raceDetail !== id; });
      history.replaceState(null, '', '?race=' + encodeURIComponent(id));
      return;
    }
    const link = t.closest<HTMLAnchorElement>('a.plate.link');
    if (link && link.getAttribute('href')?.startsWith('/')) { e.preventDefault(); router.push(link.getAttribute('href')!); }
  }

  function onChange(e: React.ChangeEvent<HTMLDivElement>) {
    const box = e.target as unknown as HTMLInputElement;
    const list = box.closest<HTMLElement>('ul.check[data-row]');
    if (!list || box.dataset.i == null) return;
    toggleChecklist(slug, list.dataset.row!, Number(box.dataset.i), box.checked);
  }

  return <div className="wrap" onClick={onClick} onChange={onChange} dangerouslySetInnerHTML={{ __html: html }} />;
}
