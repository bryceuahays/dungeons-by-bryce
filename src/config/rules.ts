// Which SRD a campaign draws on. 2014 rules are SRD 5.1; 2024 rules are SRD 5.2.
// No imports here.
export const RULES = {
  '2014': { label: '2014 rules (SRD 5.1)', versions: ['5.1'] },
  '2024': { label: '2024 rules (SRD 5.2)', versions: ['5.2'] },
  both: { label: 'Both, side by side', versions: ['5.1', '5.2'] },
} as const;
export type RulesChoice = keyof typeof RULES;
// A campaign with no setting is one that existed before the 2024 rules were added: it keeps the 2014 rules.
export const rulesOf = (settings: { rules?: unknown } | null | undefined): RulesChoice => (settings?.rules === '2024' || settings?.rules === 'both' ? settings.rules : '2014');
export const NEW_CAMPAIGN_RULES: RulesChoice = '2024';
export const yearOf = (srdVersion: string | null | undefined) => (srdVersion === '5.2' ? '2024' : srdVersion === '5.1' ? '2014' : '');
