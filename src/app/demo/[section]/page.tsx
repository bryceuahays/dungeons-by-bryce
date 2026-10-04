import { notFound } from 'next/navigation';
import { getDemo } from '@/lib/demo';
import { getContent, getLore } from '@/lib/campaign';
import { renderSection, esc } from '@/lib/render';
import { cleanContent } from '@/lib/sanitize';
import { embedVideos } from '@/lib/video';
import { HomeExtras } from '@/components/HomeExtras';

export const revalidate = 120;

export default async function DemoSection({ params }: { params: Promise<{ section: string }> }) {
  const { section: slug } = await params;
  const ctx = await getDemo();
  const section = ctx?.sections.find((s) => s.slug === slug);
  if (!ctx || !section) notFound();
  const [rows, lore] = await Promise.all([getContent(ctx, { section: section.slug }), getLore(ctx)]);
  const html = embedVideos(cleanContent(renderSection(rows, lore, { base: '/demo' })));
  return (
    <div className="cs-guide">
      {ctx.sections[0]?.id === section.id ? <HomeExtras ctx={ctx} /> : null}
      <div className="wrap" dangerouslySetInnerHTML={{ __html: html || `<h2>${esc(section.title)}</h2><p class="lede">Nothing here yet.</p>` }} />
    </div>
  );
}
