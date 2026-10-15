// The hub shell's own settings (hub version 2, item 8). Pure, so tests load this file directly.
//
// settings.shell.bar: the two pages a DM puts on the phone's bottom bar, between Home and
// Character. Tab addresses (slugs) of this campaign. A campaign with none gets its second and
// third tabs.

export type ShellSettings = { bar: string[] };

export function shellOf(settings: { shell?: unknown } | null | undefined): ShellSettings {
  const s = (settings?.shell && typeof settings.shell === 'object' && !Array.isArray(settings.shell) ? settings.shell : {}) as Record<string, unknown>;
  return { bar: Array.isArray(s.bar) ? [...new Set(s.bar.filter((x): x is string => typeof x === 'string' && /^[a-z0-9-]{1,60}$/.test(x)))].slice(0, 2) : [] };
}

// Only the campaign's own tabs (not the first, which is Home), two at most.
export function cleanShell(input: unknown, tabs: string[]): ShellSettings {
  const home = tabs[0];
  return { bar: shellOf({ shell: input }).bar.filter((s) => tabs.includes(s) && s !== home) };
}

// The two pages on the bottom bar for this viewer: the DM's choice where the viewer can see
// those tabs, filled up from the next tabs in order.
export function barPages(settings: { shell?: unknown } | null | undefined, tabs: string[]): string[] {
  const home = tabs[0];
  const chosen = shellOf(settings).bar.filter((s) => tabs.includes(s) && s !== home);
  for (const t of tabs.slice(1)) { if (chosen.length >= 2) break; if (!chosen.includes(t)) chosen.push(t); }
  return chosen.slice(0, 2);
}

// A score's modifier, written with its sign.
export const signed = (n: number) => (n >= 0 ? '+' : '') + n;
