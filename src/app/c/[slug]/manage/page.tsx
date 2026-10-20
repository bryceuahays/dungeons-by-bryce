import { redirect } from 'next/navigation';
import { getCampaign } from '@/lib/campaign';
import Link from 'next/link';
import { AddSectionForm, CampaignForm, DeleteCampaignForm, ImportPagesForm, InviteForm, SectionRow } from '@/components/DmForms';
import { BackgroundUploader } from '@/components/BackgroundUploader';
import { previewAs, removeMember, revokeInvite, setCampaignBackground, setPhase, stepStage } from '../actions';
import { RulesForm, SettingForm, StagesForm, ToolsForm } from '@/components/DmForms';
import { TOOLS, toolsOf } from '@/config/tools';
import { RULES, rulesOf } from '@/config/rules';
import { UpgradeHint } from '@/components/UpgradeHint';
import { ThemeEditor } from '@/components/ThemeEditor';
import { campaignCanMake } from '@/lib/entitlements';
import type { Section } from '@/lib/types';
import { FREE_LIMITS } from '@/config/plans';
import { CopyLink } from '@/components/CopyBox';
import { CampaignSystemForm } from '@/features/systems/CampaignSystemForm';
import { mySystems } from '@/features/systems/data';
import { PagesAndFeatures } from '@/features/hub/switches/PagesAndFeatures';
import { People, YourPermissions } from '@/features/hub/people/People';
import { flag } from '@/lib/flags';
import { SettingsLayout } from '@/features/hub/settings/SettingsLayout';
import { VisDefaultsForm } from '@/features/hub/settings/VisDefaultsForm';
import { visDefaults } from '@/features/hub/settings/defaults';
import { DiceRulesForm } from '@/features/dice/DicePanel';
import { diceRules } from '@/features/dice/model';
import { checkNames } from '@/features/dice/server';
import { PhoneBarForm } from '@/features/hub/shell/PhoneBar';
import { barPages } from '@/features/hub/shell/model';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const metadata = { title: 'Manage' };

export default async function Manage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ imported?: string }> }) {
  const { slug } = await params;
  const { imported } = await searchParams;
  const ctx = await getCampaign(slug);
  // the DM, and a co-DM who manages players without seeing what is hidden
  if (!ctx.realDm && !(ctx.coDm && ctx.perms.players)) redirect('/c/' + slug);
  const { supabase, campaign } = ctx;
  const [{ data: invites }, { data: members }, { data: profiles }, { data: allSections }, { data: chars }, { data: faces }] = await Promise.all([
    supabase.from('invites').select('*').eq('campaign_id', campaign.id).order('created_at', { ascending: false }),
    supabase.rpc('campaign_members', { c: campaign.id }),
    Promise.resolve({ data: null }),
    supabase.from('sections').select('*').eq('campaign_id', campaign.id).order('sort'),
    supabase.from('characters').select('owner').eq('campaign_id', campaign.id),
    supabase.from('campaign_faces').select('phase, slug, title, tagline').eq('campaign_id', campaign.id),
  ]);
  const realTitle = (faces ?? []).find((f) => f.phase === '')?.title ?? campaign.title;
  void profiles;
  const memberList = (members ?? []) as { user_id: string; display_name: string; joined_at: string; role: string }[];
  const isOwner = campaign.owner_id === ctx.user.id;
  const stageAt = campaign.phases.findIndex((p) => p.id === campaign.phase);
  const hasBg = !!(campaign.background?.wide && campaign.background?.tall);
  const [newTabs, newBlocks] = (imported ?? '').split('-').map((n) => parseInt(n, 10) || 0);
  const sections = (allSections ?? []) as Section[];
  const now = Date.now();
  const live = (i: { revoked: boolean; expires_at: string | null; uses_left: number | null }) =>
    !i.revoked && (!i.expires_at || new Date(i.expires_at).getTime() > now) && (i.uses_left == null || i.uses_left > 0);

  const intro = (
    <>
      <p className="lede">{ctx.coDm ? 'You are a co-DM of this campaign.' : 'Only you see this page. You are the DM of this campaign.'}</p>
      {ctx.coDm ? <YourPermissions perms={ctx.perms} /> : null}
      {imported ? <p className="okmsg" role="status">Your campaign was created, with {newBlocks} block{newBlocks === 1 ? '' : 's'} in {newTabs} tab{newTabs === 1 ? '' : 's'} from the text you pasted. Open a tab and choose Edit this page to change anything.</p> : null}
    </>
  );
  // hub version 2 reveals (issue 117): stages are called chapters
  const chapters = await flag('hub_v2_visibility');
  const st = (stage: string, chapter: string) => (chapters ? chapter : stage);
  const stagesPart = (
    <>
      <h2>{st('Reveal stages', 'Chapters')}</h2>
      <div className="plate">
        {chapters ? (
          <p>Chapters are the big turning points of your story. Moving to the next chapter can change what players can reach: the campaign&apos;s title and web address, which tabs and blocks exist for them, and what the table tools show. Anything held for a later chapter is held back by the database itself, not just hidden on the page. For smaller reveals, give a block or an entry its own trigger instead: when a session starts or is played, or when a story beat happens.</p>
        ) : <p>A stage sets what players can reach: the campaign&apos;s title and web address, which tabs and blocks exist for them, and what the table tools show. Anything held for another stage is held back by the database itself, not just hidden on the page.</p>}
        {campaign.phases.length ? (
          <>
            <div className="chips">
              {campaign.phases.map((p) => (
                <form key={p.id} action={setPhase.bind(null, slug, p.id)}>
                  <button className="fchip" aria-pressed={campaign.phase === p.id} type="submit">{p.label}</button>
                </form>
              ))}
            </div>
            <p className="row" style={{ marginTop: 10 }}>
              <form action={stepStage.bind(null, slug, -1)}><button className="act sm" type="submit" disabled={stageAt <= 0}>{st('Roll back one stage', 'Back one chapter')}</button></form>
              <form action={stepStage.bind(null, slug, 1)}><button className="act" type="submit" disabled={stageAt < 0 || stageAt >= campaign.phases.length - 1}>{st('Advance to the next stage', 'Start the next chapter')}</button></form>
            </p>
            <p className="who">Now: {campaign.phases.find((p) => p.id === campaign.phase)?.label ?? 'not set'}. Players see this campaign as &quot;{campaign.title}&quot; at /c/{campaign.slug}.</p>
          </>
        ) : <p className="who">{st('This campaign has no stages yet, so everything players can see is shown from the start. Add two below for a before-and-after reveal.', 'This campaign has no chapters yet. You do not need any: blocks and entries can be revealed by hand or when a session starts. Add chapters below if your story has big turning points.')}</p>}
        <details style={{ marginTop: 10 }} open={!campaign.phases.length}>
          <summary className="muted" style={{ cursor: 'pointer' }}>{st('Add, rename, reorder or remove stages', 'Add, rename, reorder or remove chapters')}</summary>
          <StagesForm slug={slug} stages={campaign.phases} pro={campaignCanMake(ctx.access, 'stages')} chapters={chapters} />
          {campaignCanMake(ctx.access, 'stages') ? null : <UpgradeHint feature="stages" />}
        </details>
      </div>
    </>
  );
  const previewPart = (
    <>
      <h2>Preview</h2>
      <div className="plate">
        <p>See every page exactly as a player receives it. DM-only content is left out on the server, not just hidden. Choose a player to check what only they can see, and {st('a stage', 'a chapter')} to check what the table will see later.</p>
        <form action={previewAs.bind(null, slug)} className="row">
          <label className="f">As<select name="player" defaultValue=""><option value="">Any player</option>{memberList.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name || 'Unnamed'}</option>)}</select></label>
          {campaign.phases.length ? <label className="f">At<select name="stage" defaultValue=""><option value="">{st('The current stage', 'The current chapter')}</option>{campaign.phases.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label> : null}
          <button className="act" type="submit">View as</button>
        </form>
      </div>
    </>
  );
  const invitesPart = (
    <>
      <h2>Invite codes</h2>
      <div className="plate">
        <p>Send a player the link. It takes them through making an account and straight into this campaign. (The code on its own also works: they enter it under Campaigns.)</p>
        {ctx.access.pro ? null : <p className="who">The free plan holds up to {FREE_LIMITS.players} players in a campaign. {memberList.length} have joined.</p>}
        <InviteForm slug={slug} />
        <div style={{ marginTop: 14 }}>
          {(invites ?? []).length ? (invites ?? []).map((i) => (
            <div className="orow" key={i.id}>
              <span>
                <code className="code">{i.code}</code>{' '}
                {live(i) ? <><CopyLink path={'/join/' + i.code} />{' '}</> : null}
                <small>
                  {live(i) ? 'active' : i.revoked ? 'revoked' : 'used up or expired'}
                  {i.uses_left != null ? `, ${i.uses_left} use${i.uses_left === 1 ? '' : 's'} left` : ', no limit'}
                  {i.expires_at ? `, expires ${new Date(i.expires_at).toLocaleDateString('en-US')}` : ''}
                </small>
              </span>
              {live(i) ? <form action={revokeInvite.bind(null, slug, i.id)}><button className="act sm" type="submit">Revoke</button></form> : null}
            </div>
          )) : <p className="who">No invite codes yet.</p>}
        </div>
      </div>
    </>
  );
  const membersPart = (
    <>
      <h2>Members</h2>
      <div className="plate">
        {memberList.length ? memberList.map((m) => {
          const n = (chars ?? []).filter((c) => c.owner === m.user_id).length;
          return (
            <div className="orow" key={m.user_id}>
              <span><b>{m.display_name || 'Unnamed'}</b> <small>joined {new Date(m.joined_at).toLocaleDateString('en-US')} · {n} character{n === 1 ? '' : 's'}</small></span>
              <form action={removeMember.bind(null, slug, m.user_id)}><button className="act sm danger" type="submit">Remove</button></form>
            </div>
          );
        }) : <p className="who">Nobody has joined yet.</p>}
        <p className="who" style={{ marginTop: 10 }}>Removing a member takes away their access. Their characters stay on your Players tab until you remove them there.</p>
      </div>
    </>
  );
  const tabsPart = (
    <>
      <h2>Tabs</h2>
      <div className="plate">
        <p>The tabs across the top of this campaign. To change what is on a tab, open it and choose Edit this page.</p>
        {sections.map((s, i) => <SectionRow key={s.id + (s.phase ?? '')} slug={slug} section={s} first={i === 0} last={i === sections.length - 1} phases={campaign.phases} />)}
        <div style={{ marginTop: 14 }}><AddSectionForm slug={slug} /></div>
      </div>
    </>
  );
  const pastePart = (
    <>
      <h2>Paste pages</h2>
      <div className="plate">
        <p>Paste text and the site turns it into tabs, headings, cards, tables, and DM-only secrets, added to what is already here. <Link href="/help/campaign-format" target="_blank">How to format it</Link> (opens in a new tab).</p>
        <ImportPagesForm slug={slug} />
      </div>
    </>
  );
  const rulesPart = (
    <>
      <h2>Rules</h2>
      <div className="plate">
        <p>Which open rules this campaign uses. It decides which races or species, classes, spells and creatures your players and you can pick from. Characters keep whatever they already chose. Your own homebrew is always available whichever you choose.</p>
        <RulesForm slug={slug} value={rulesOf(campaign.settings)} options={Object.entries(RULES).map(([k, v]) => [k, v.label])} />
        {isOwner ? <CampaignSystemForm slug={slug} value={String(campaign.settings?.system ?? '')} systems={(await mySystems(supabase, ctx.user.id)).filter((s) => s.base === rulesOf(campaign.settings) || s.id === campaign.settings?.system)} /> : null}
      </div>
    </>
  );
  const toolsPart = (
    <>
      <h2 id="tools">Table tools</h2>
      <div className="plate">
        <p>The tools this campaign&apos;s hub has. Switching one off hides it for you and your players; nothing in it is deleted, and switching it back on brings it all back.</p>
        <ToolsForm slug={slug} tools={TOOLS.map(({ id, name, what }) => ({ id, name, what }))} on={toolsOf(campaign.settings).map((t) => t.id)} />
      </div>
    </>
  );
  const themePart = (
    <>
      <h2>Theme</h2>
      <div className="plate">
        <p>The colours, fonts and layout of every page in this campaign.</p>
        <ThemeEditor initial={campaign.theme as any} pro={campaignCanMake(ctx.access, 'themes')} slug={slug} campaignId={campaign.id} />
      </div>
    </>
  );
  const homePart = (
    <>
      <h2>Campaign home</h2>
      <div className="plate">
        <p>A featured video at the top of your first tab: a trailer before the campaign, or a recap between sessions. Paste a YouTube or Vimeo link. Leave it empty for none.</p>
        <SettingForm slug={slug} name="video" label="Featured video link" value={String(campaign.settings?.video ?? '')} />
      </div>
    </>
  );
  const bgPart = (
    <>
      <h2>Background picture</h2>
      <div className="plate">
        <p>A picture behind every page of this campaign, for you and your players. {hasBg ? 'This campaign has its own background.' : 'This campaign has no background picture yet.'}</p>
        <BackgroundUploader folder={`campaign/${campaign.id}`} has={hasBg} save={setCampaignBackground.bind(null, slug)} />
      </div>
    </>
  );
  const campaignPart = (
    <>
      <h2>Campaign settings</h2>
      <div className="plate"><CampaignForm slug={slug} campaign={campaign} faces={faces ?? []} /></div>
    </>
  );
  const shellOn = await flag('hub_v2_shell');
  const phonePart = shellOn ? (
    <>
      <h2 id="phone">Phone bar</h2>
      <div className="plate"><PhoneBarForm slug={slug} tabs={sections.filter((s, i, all) => all.findIndex((x) => x.slug === s.slug) === i).map((s) => ({ slug: s.slug, title: s.title }))} value={barPages(campaign.settings, [...new Set(sections.map((s) => s.slug))])} /></div>
    </>
  ) : null;
  const deletePart = isOwner ? (
      <>
        <h2>Delete this campaign</h2>
        <div className="plate">
          <p>This removes the campaign for good: every page, every invite, every session, and every character your players made in it. It cannot be undone.</p>
          <DeleteCampaignForm slug={slug} title={realTitle} characters={(chars ?? []).length} members={memberList.length} />
        </div>
      </>
  ) : null;

  // Hub version 2: the same parts, grouped as Campaign settings (Settings.png). Without the
  // flag, the page is laid out exactly as it was.
  if (await flag('hub_v2_settings')) {
    const dice = (await flag('hub_v2_dice')) ? await checkNames(ctx) : null;
    return (
      <div className="cs-guide">
        <div className="wrap">
          <SettingsLayout title="Campaign settings" lede={<>{realTitle}. {ctx.coDm ? 'You are a co-DM of this campaign.' : 'Only DMs and co-DMs with permission can change these.'}</>}
            intro={<>{ctx.coDm ? <YourPermissions perms={ctx.perms} /> : null}{imported ? <p className="okmsg" role="status">Your campaign was created, with {newBlocks} block{newBlocks === 1 ? '' : 's'} in {newTabs} tab{newTabs === 1 ? '' : 's'} from the text you pasted. Open a tab and choose Edit this page to change anything.</p> : null}</>} sections={{
            general: <>{campaignPart}{rulesPart}{themePart}{bgPart}{homePart}{tabsPart}{phonePart}{pastePart}{toolsPart}{previewPart}</>,
            pages: <PagesAndFeatures slug={slug} settings={campaign.settings} heading={false} />,
            privacy: <><VisDefaultsForm slug={slug} value={visDefaults(campaign.settings)} />{stagesPart}</>,
            dice: dice ? <div className="dice one"><DiceRulesForm slug={slug} rules={diceRules(campaign.settings)} checkNames={dice} heading={false} /></div> : null,
            people: <><People slug={slug} campaignId={campaign.id} isOwner={ctx.isOwner} members={memberList} heading={false} />{invitesPart}{membersPart}</>,
            discord: <p className="muted">Posting reveals and session reminders to a Discord channel is not built yet. When it is, it is set up here.</p>,
            danger: <><p className="muted">Archiving keeps everything readable. It is not built yet.</p>{deletePart}</>,
          }} />
        </div>
      </div>
    );
  }

  return (
    <div className="cs-guide">
      <div className="wrap">
        <h2>Manage {realTitle}</h2>
        {intro}

        {stagesPart}
        {previewPart}
        {invitesPart}
        {membersPart}

        <People slug={slug} campaignId={campaign.id} isOwner={ctx.isOwner} members={memberList} />

        {tabsPart}
        {phonePart}
        {pastePart}
        {rulesPart}
        {toolsPart}

        <PagesAndFeatures slug={slug} settings={campaign.settings} />

        {themePart}
        {homePart}
        {bgPart}
        {campaignPart}
        {deletePart}
      </div>
    </div>
  );
}
