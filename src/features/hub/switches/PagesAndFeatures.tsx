import { getViewer } from '@/lib/auth';
import { flag, myFlags } from '@/lib/flags';
import { HUB_PAGES, switchedOff, type HubPage } from '@/config/hub-features';
import { SwitchesForm } from './SwitchesForm';

// The "Pages and features" part of the Manage page. Behind its flag (hub_v2_switches): while
// that is off for the viewer, this renders nothing and sends nothing.
//
// A page is listed only when its own flag is on for the viewer, so a DM is never shown
// switches for a page that does not exist for them yet.
export async function PagesAndFeatures({ slug, settings, heading = true }: { slug: string; settings: { features?: unknown } | null | undefined; heading?: boolean }) {
  if (!(await flag('hub_v2_switches'))) return null;
  const [flags, viewer] = await Promise.all([myFlags(), getViewer()]);
  const pages = (HUB_PAGES as readonly HubPage[]).filter((p) => flags[p.flag]).map((p) => ({
    id: p.id, name: p.name, what: p.what, optional: p.optional,
    features: p.features.map((f) => ({ id: f.id, name: f.name, ...(f.what ? { what: f.what } : {}), ...(f.needs ? { needs: f.needs } : {}) })),
  }));
  if (!pages.length) return null;
  return (
    <>
      {heading ? <h2 id="pages">Pages and features</h2> : <span id="pages" />}
      <div className="plate">
        <p>The pages this campaign&apos;s hub has, and the features on each. Switching something off hides it for you and your players; nothing in it is deleted, and switching it back on brings it all back.</p>
        {viewer?.isHead ? <p className="who">You see every page here because you are the Head DM. Another DM sees a page&apos;s switches once you turn that page on under Head DM, Feature flags. A switch has nothing to hide until its page is built.</p> : null}
        <SwitchesForm slug={slug} pages={pages} off={[...switchedOff(settings)]} />
      </div>
    </>
  );
}
