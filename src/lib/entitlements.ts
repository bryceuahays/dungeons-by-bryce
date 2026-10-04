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

export type Plan = {
  pro: boolean;          // Pro, Founder, or an account given full access
  comp: boolean;         // full access without paying (the Head DM, grandfathered friends)
  plan: 'pro_monthly' | 'pro_yearly' | 'founder' | null;
  status: string | null;
  until: string | null;
  campaigns: number;
  homebrew: number;
};
export type CampaignAccess = { pro: boolean; writable: boolean };

export const getPlan = cache(async (): Promise<Plan> => {
  const { supabase } = await requireViewer();
  const { data } = await supabase.rpc('my_plan');
  return { pro: false, comp: false, plan: null, status: null, until: null, campaigns: 0, homebrew: 0, ...(data ?? {}) } as Plan;
});

export const can = (plan: Pick<Plan, 'pro'>, feature: Feature) => plan.pro || !FEATURES[feature].pro;
export const campaignCan = (access: CampaignAccess | null | undefined, feature: Feature) => !!access?.pro || !FEATURES[feature].pro;

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
