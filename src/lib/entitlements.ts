import 'server-only';
import { cache } from 'react';
import { FEATURES, FREE_LIMITS, type Feature } from '@/config/plans';
import { requireViewer } from './auth';

// The one place that answers "can this user do X".
//
// Two kinds of question:
//   * about the signed-in account (how many campaigns, how many homebrew entries):
//       const plan = await getPlan();  can(plan, 'homebrew_full')
//   * about a campaign, which goes by the plan of the DM who owns it, so players get
//     whatever their DM has:
//       campaignCan(ctx.access, 'timeline')
//
// Pages use these to decide what to show. The database enforces the same rules itself
// (is_pro, campaign_feature, and the limit triggers), so skipping a page check gains nothing.
//
// Limits can be switched off altogether (ENFORCE_PLANS in src/config/plans.ts). The database
// then answers `pro: true` for every account, so nothing here holds anything back; `paid`
// still says what plan the account really has, for wording and for subscriber prices.

export type Plan = {
  pro: boolean;          // nothing is held back: Pro, Founder, full access, or limits are switched off
  paid: boolean;         // really on Pro, Founder or full access (for wording and prices)
  comp: boolean;         // full access without paying (the Head DM, grandfathered friends)
  plan: 'pro_monthly' | 'pro_yearly' | 'founder' | null;
  status: string | null;
  until: string | null;
  gift_until?: string | null;   // Pro months that came with a commissioned campaign
  campaigns: number;
  homebrew: number;
};
// pro: the campaign has every tool (its DM is on Pro, or it was bought or handed over, so what came with it works).
// creator: its DM is on Pro, so NEW things of a Pro-only kind can be made in it.
export type CampaignAccess = { pro: boolean; creator: boolean; writable: boolean; paid?: boolean };

export const getPlan = cache(async (): Promise<Plan> => {
  const { supabase } = await requireViewer();
  const { data } = await supabase.rpc('my_plan');
  return { pro: false, comp: false, plan: null, status: null, until: null, campaigns: 0, homebrew: 0, ...(data ?? {}), paid: !!(data?.paid ?? data?.pro) } as Plan;
});

export const can = (plan: Pick<Plan, 'pro'>, feature: Feature) => plan.pro || !FEATURES[feature].pro;
// may this campaign USE a feature (open the tool, see and edit what is there)?
export const campaignCan = (access: CampaignAccess | null | undefined, feature: Feature) => !!access?.pro || !FEATURES[feature].pro;
// may NEW things of this kind be made in it? A bought campaign on the free plan can use
// everything it came with, but making more of a Pro-only kind needs Pro.
export const campaignCanMake = (access: CampaignAccess | null | undefined, feature: Feature) => !!access?.creator || !FEATURES[feature].pro;

// How many more of something a free account may make (Infinity on Pro).
export function remaining(plan: Plan, what: 'campaigns' | 'homebrew'): number {
  if (plan.pro) return Infinity;
  return Math.max(0, FREE_LIMITS[what] - plan[what]);
}

// The database refuses a gated action with a message that starts "upgrade:<feature>".
// This turns that into the feature (or limit) it was about, for the prompt.
export function upgradeNeeded(message: string | undefined | null): string | null {
  const m = /upgrade:([a-z_]+)/.exec(message || '');
  return m ? m[1] : null;
}
