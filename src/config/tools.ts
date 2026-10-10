import type { Feature } from './plans';

// The table tools, in the order they are listed. `feature` is the plan feature a tool
// needs (none means every plan has it).
export const TOOLS: { id: string; name: string; what: string; feature?: Feature; players: string }[] = [
  { id: 'npcs', name: 'NPCs', what: 'Everyone the party meets: where they are, what they want, and what the players know about them.', players: 'The people you have met.' },
  { id: 'initiative', name: 'Initiative', what: 'Run a fight: turn order, hit points, conditions and concentration, live for the whole table.', players: 'Whose turn it is, live.' },
  { id: 'timeline', name: 'Story timeline', what: 'The beats of your story: planned, key, hit and dropped. Players see what has happened so far.', feature: 'timeline', players: 'The story so far, and your own moments.' },
  { id: 'maps', name: 'Maps', what: 'Upload a map, cover what has not been found yet, and drop pins as the story moves.', players: 'The maps your DM has shared.' },
  { id: 'world', name: 'World state', what: 'What the party has changed, the clues to each secret, and what the factions are doing meanwhile.', feature: 'world', players: 'What your choices have changed.' },
  { id: 'zero', name: 'Session zero', what: 'Tone, lines and veils, table rules and house rules, with anonymous input from players.', players: 'What the table has agreed, and a way to tell your DM something without your name.' },
  { id: 'secrets', name: 'Secrets and notes', what: 'Secrets for one player at a time, and each player\'s own private notes.', players: 'Secrets from your DM, and notes only you can read.' },
  { id: 'log', name: 'Reveal log', what: 'Everything that has become visible to players, and the optional "newly revealed" feed.', players: 'What has opened up for you lately.' },
  { id: 'compendium', name: 'Compendium', what: 'The homebrew this campaign uses.', players: 'The homebrew this campaign uses.' },
];

// Which tools a campaign's hub has (settings.tools, a list of ids). A campaign with no list is
// one made before the choice existed: it keeps every tool.
export const hasTool = (settings: { tools?: unknown } | null | undefined, id: string) => !Array.isArray(settings?.tools) || settings.tools.includes(id);
export const toolsOf = (settings: { tools?: unknown } | null | undefined) => TOOLS.filter((t) => hasTool(settings, t.id));
export const cleanTools = (list: unknown[]): string[] => TOOLS.map((t) => t.id).filter((id) => list.map(String).includes(id));
