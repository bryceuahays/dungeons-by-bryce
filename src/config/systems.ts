// The game systems a campaign can use. For now these are the fifth edition rule sets the
// site has; a campaign's system is its rules setting (settings.rules). No server imports.
import { rulesOf, type RulesChoice } from './rules';

export const SYSTEMS: { id: RulesChoice; name: string; what: string }[] = [
  { id: '2024', name: 'Fifth edition, 2024 rules', what: 'The revised rules (SRD 5.2).' },
  { id: '2014', name: 'Fifth edition, 2014 rules', what: 'The original rules (SRD 5.1).' },
  { id: 'both', name: 'Fifth edition, both sets of rules', what: 'Players choose from either. Anything that is in both asks which version they want.' },
];
export const isSystem = (v: unknown): v is RulesChoice => SYSTEMS.some((s) => s.id === v);
// a campaign's system, from its settings (a campaign from before the setting existed plays the 2014 rules)
export const systemOf = rulesOf;
export const systemName = (id: string | null | undefined) => SYSTEMS.find((s) => s.id === id)?.name ?? 'Fifth edition';
