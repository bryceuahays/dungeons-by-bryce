import Link from 'next/link';
import { FEATURES, FREE_LIMITS, type Feature } from '@/config/plans';

const LIMITS: Record<string, { name: string; what: string }> = {
  campaigns: { name: 'More than one campaign', what: `The free plan runs ${FREE_LIMITS.campaigns} campaign. Pro runs as many as you like.` },
  players: { name: 'More players', what: `A free campaign holds up to ${FREE_LIMITS.players} players. Pro has no limit.` },
  homebrew: { name: 'More homebrew entries', what: `The free plan keeps ${FREE_LIMITS.homebrew} homebrew entries. Pro has no limit, and adds the Guided and Advanced modes.` },
};

// Shown where a free DM reaches a limit: what the feature does, and where to upgrade.
// Players see a shorter line, since the plan is their DM's.
export function UpgradeHint({ feature, dm = true }: { feature: Feature | keyof typeof LIMITS | string; dm?: boolean }) {
  const f = (FEATURES as Record<string, { name: string; what: string }>)[feature] ?? LIMITS[feature] ?? { name: 'This', what: '' };
  return (
    <div className="upsell" role="note">
      <b>{f.name} {f.name.endsWith('s') && !f.name.startsWith('The') ? 'are' : 'is'} part of Pro.</b>
      <span>{f.what}</span>
      {dm ? <Link className="upsell-go" href="/upgrade">See what Pro adds</Link> : <span className="upsell-go">Your DM can turn this on by upgrading.</span>}
    </div>
  );
}
