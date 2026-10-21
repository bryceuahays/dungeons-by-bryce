import 'server-only';
/* eslint-disable @typescript-eslint/no-explicit-any */
// Connect your AI, level 1: what a DM's own AI may do on the site. It may LOOK (their game systems,
// the official rules, their own homebrew), CREATE DRAFTS and CHANGE THOSE DRAFTS. It may not change
// anything the DM has finished, delete anything, touch campaigns, or show anything to players: a draft is only used once the DM opens it in the
// editor, checks it and saves it. Every call runs as the DM (src/features/connector/server.ts).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BREW_KINDS, PROMPTS, applyBase, basedOnOf, parseBrewImport, readAnswer } from '@/lib/brew-import';
import { setImportAbilities } from '@/lib/class-import';
import { loadSpellOptions } from '@/lib/class-spells';
import { loadSystem, mySystems } from '@/features/systems/data';
import { applyText, editorRules, importPreamble, presetOf, type Sys } from '@/features/systems/model';
import { balanceHint, effectPoints, entityPoints, type EntityType } from '@/lib/rules/engine';
import { TEXT_KEYS, missedMechanics, partsOf } from './mechanics';
import type { Caller } from './server';

const KINDS = BREW_KINDS.map(([k]) => k) as [string, ...string[]];
const KIND_LABEL = Object.fromEntries(BREW_KINDS) as Record<string, string>;
const DRAFTS_PER_HOUR = 30;
// links for the DM to open: the site's own address (the AI app may have connected through another,
// like a tunnel while testing); the address it connected to if none is set
const siteOf = (c: Caller) => (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '') || c.origin;
const isId = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f-]{36}$/.test(s);
const slugOf = (s: string) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'entry';
const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 1) }] });
const fail = (message: string) => ({ content: [{ type: 'text' as const, text: message }], isError: true });

// a game system by what the AI passes: '2014', '2024' (the ready-made rules), or the id of one of
// the DM's own systems. Anything else is the 2024 rules.
async function systemFor(c: Caller, which: string | undefined): Promise<{ tag: string; sys: Sys; own: boolean }> {
  if (isId(which)) {
    const s = await loadSystem(c.supabase as any, which);
    if (s && s.ownerId === c.userId) return { tag: s.id, sys: s, own: true };
  }
  const base = which === '2014' ? '2014' : '2024';
  return { tag: base, sys: presetOf(base), own: false };
}
const versionOf = (sys: Sys) => (sys.base === '2014' ? '5.1' : '5.2');

// rules the words describe that were left as words only, though the format has a way to track them
function mechanicsCheck(data: unknown) {
  const misses = missedMechanics(data);
  return misses.length ? {
    mechanicsLeftAsText: misses,
    doThisNext: 'The site tracks rules on the character sheet, and these look like rules that were only written as words. Before telling the DM it is done, call update_draft with the whole entry again, adding each one as the structured part named in "use" (keep the words too). If one really does not fit that type, leave it as words.',
  } : {};
}

export function connectorServer(c: Caller) {
  const server = new McpServer({ name: 'Dungeons by Bryce', version: '1.0.0' }, {
    instructions: 'Dungeons by Bryce is a site for running fifth edition tabletop campaigns. You can read the DM\'s game systems, the official 2014 and 2024 rules (the SRD) and their homebrew, and create homebrew as DRAFTS for them to review. Before creating something: call list_my_systems and get_system for the system it is for, call get_format for its kind, then create_draft with a JSON object in that format. Use the system\'s ability keys and names. Mechanics first: the site tracks rules on the character sheet, so every rule that has a structured way in the format (gives, grows, chooses, resources, limits) goes there, with the words kept in the description; only a rule with no matching type stays as words alone. If create_draft or update_draft answers with mechanicsLeftAsText, fix those with update_draft before telling the DM it is done. Build only what the format describes, the way it describes it: the DM must be able to see and change everything you make in the site\'s own editor, so never invent tables, columns or links between entries to stand in for something. If the format has no way to do something, put it in the description and tell the DM. To change a draft, call update_draft with its id and the whole entry again with the changes; never create a second copy. Entries that are not drafts cannot be changed here. To change only the words of a draft (flavour, appearance, history, clearer wording) without touching its rules, use update_words. To check an entry, use review_balance (the same balance hint the DM sees in the editor); to see what is missing across the DM\'s homebrew, use find_gaps. Both only report: suggest, and change nothing until the DM agrees. Tell the DM to open each draft (the link returned), check it, and press Save to finish it.',
  });

  server.registerTool('list_my_systems', {
    title: 'List my game systems',
    description: 'The DM\'s own game systems (customized fifth edition rules) and the two ready-made ones. Pass a system\'s id to get_system, search_official and create_draft.',
    annotations: { readOnlyHint: true },
  }, async () => {
    const mine = await mySystems(c.supabase as any, c.userId);
    return text({ ready_made: [{ id: '2024', name: 'Fifth Edition (2024)' }, { id: '2014', name: 'Fifth Edition (2014)' }], yours: mine.map((s) => ({ id: s.id, name: s.name, built_on: 'Fifth Edition (' + s.base + ')' })) });
  });

  server.registerTool('get_system', {
    title: 'Read a game system',
    description: 'Everything homebrew for a system must follow: its abilities (with the keys to use), skills, conditions, damage types, what it calls species, classes and so on, whether it has magic, and its trackers.',
    inputSchema: { system: z.string().describe('"2024", "2014", or the id of one of the DM\'s systems') },
    annotations: { readOnlyHint: true },
  }, async ({ system }) => {
    const { sys, own } = await systemFor(c, system);
    return text({
      name: sys.name, built_on: 'Fifth Edition (' + sys.base + ')', yours: own,
      abilities: sys.abilities.list.map((a) => ({ key: a.id, name: a.name, short: a.abbr })),
      skills: sys.skills.list.map((s) => ({ name: s.name, ability: s.ab })),
      conditions: sys.combat.conditions.map((x) => x.name), damage_types: sys.combat.damage,
      names: sys.names, magic: sys.magic.on, trackers: sys.trackers.list.map((t) => t.name),
      words_renamed_in_text: sys.text.replace.map((r) => ({ from: r.from, to: r.to })),
      summary: own ? importPreamble(sys).trim() : 'The ready-made rules as published.',
    });
  });

  server.registerTool('search_official', {
    title: 'Search the official rules',
    description: 'Search the official fifth edition entries (the SRD) of one kind by name, for ideas, to check a name is free, or to find something to base a reskin on. Returns ids for get_entry.',
    inputSchema: {
      kind: z.enum(KINDS).describe('class, subclass, race (species), background, feat, spell, item, monster or resource'),
      name: z.string().max(80).optional().describe('part of the name; leave out to list them'),
      system: z.string().optional().describe('which rules: "2024" (default), "2014", or one of the DM\'s systems (its base rules are used)'),
    },
    annotations: { readOnlyHint: true },
  }, async ({ kind, name, system }) => {
    const { sys } = await systemFor(c, system);
    let q = c.supabase.from('entities').select('id, name').eq('source', 'srd').eq('srd_version', versionOf(sys)).eq('type', kind).order('name').limit(40);
    if (name?.trim()) q = q.ilike('name', `%${name.trim().replace(/[%_]/g, '')}%`);
    const { data } = await q;
    return text({ rules: 'Fifth Edition (' + sys.base + ')', kind: KIND_LABEL[kind], results: data ?? [] });
  });

  server.registerTool('get_entry', {
    title: 'Read an entry',
    description: 'One entry in full (an official one, or the DM\'s own homebrew): all its structured data. Pass a system to see an official entry with that system\'s renamed words.',
    inputSchema: { id: z.string().describe('the entry\'s id'), system: z.string().optional() },
    annotations: { readOnlyHint: true },
  }, async ({ id, system }) => {
    if (!isId(id)) return fail('That is not an entry id. Use search_official or list_my_homebrew to find one.');
    const { data: e } = await c.supabase.from('entities').select('id, type, name, source, srd_version, status, data').eq('id', id).maybeSingle();
    if (!e) return fail('No entry with that id that you can see.');
    const { sys, own } = await systemFor(c, system);
    const [shown] = own ? applyText([e as any], sys) : [e];
    return text({ id: e.id, kind: e.type, name: e.name, official: e.source === 'srd', rules: e.srd_version === '5.1' ? '2014' : e.srd_version === '5.2' ? '2024' : undefined, status: e.status, data: (shown as any).data });
  });

  server.registerTool('list_my_homebrew', {
    title: 'List my homebrew',
    description: 'The DM\'s own homebrew entries, optionally of one kind or made for one system.',
    inputSchema: { kind: z.enum(KINDS).optional(), system: z.string().optional().describe('"2024", "2014", or one of the DM\'s systems') },
    annotations: { readOnlyHint: true },
  }, async ({ kind, system }) => {
    let q = c.supabase.from('entities').select('id, type, name, status, system:data->>system').eq('owner_id', c.userId).neq('source', 'srd').order('updated_at', { ascending: false }).limit(100);
    if (kind) q = q.eq('type', kind);
    const { data } = await q;
    const rows = ((data ?? []) as any[]).map((r) => ({ id: r.id, kind: r.type, name: r.name, status: r.status, system: r.system || '2024', link: siteOf(c) + '/homebrew/' + r.id }));
    return text(system ? rows.filter((r) => r.system === system) : rows);
  });

  server.registerTool('get_format', {
    title: 'Get the format for a kind of homebrew',
    description: 'The exact JSON format create_draft expects for one kind, with what every field means. Read it before creating that kind.',
    inputSchema: { kind: z.enum(KINDS) },
    annotations: { readOnlyHint: true },
  }, async ({ kind }) => text(PROMPTS[kind]));

  server.registerTool('create_draft', {
    title: 'Create a homebrew draft',
    description: 'Create one homebrew entry for the DM as a DRAFT (players never see drafts). The entry is a JSON object in the format from get_format for that kind. A reskin of an existing entry can say "basedOn": "<its name>" and only give what differs. Returns a link: tell the DM to open it, check it and press Save to finish it.',
    inputSchema: {
      kind: z.enum(KINDS),
      entry: z.union([z.string(), z.record(z.string(), z.any())]).describe('the entry, as JSON in the format from get_format'),
      system: z.string().optional().describe('which system it is for: "2024" (default), "2014", or one of the DM\'s systems'),
    },
  }, async ({ kind, entry, system }) => {
    // at most so many drafts an hour, so a runaway AI cannot flood someone's homebrew
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await c.supabase.from('entities').select('id', { count: 'exact', head: true }).eq('owner_id', c.userId).eq('data->>madeWith', 'ai').gte('created_at', since);
    if ((count ?? 0) >= DRAFTS_PER_HOUR) return fail(`That is ${DRAFTS_PER_HOUR} drafts in the last hour, the most allowed. Ask the DM to review those first.`);

    const b = await build(kind, entry, system);
    if ('error' in b) return fail(b.error as string);
    const { made, tag, sys, own } = b;

    // one of a name and kind: a change to an existing draft goes through update_draft, not a copy
    const same = await sameName(kind, made.name);
    if (same) return fail(same.status === 'draft'
      ? `The DM already has a draft ${KIND_LABEL[kind].toLowerCase()} called "${made.name}" (id ${same.id}). To change it, use update_draft with that id instead of making a copy.`
      : `The DM already has a ${KIND_LABEL[kind].toLowerCase()} called "${made.name}" that is finished (${same.status}), so it cannot be changed from here. Ask the DM to change it in the editor, or give this one another name.`);

    // saved as a draft for that system, marked as made by an AI; the plan decides the depth (the
    // database refuses the full builder on the free plan, and still counts the free plan's limit)
    const { data: plan } = await c.supabase.rpc('my_plan');
    const row = {
      type: kind, name: made.name.slice(0, 120), status: 'draft', depth: plan?.pro ? 'advanced' : 'quick', source: 'homebrew',
      data: { ...made.data, system: tag, madeWith: 'ai' }, owner_id: c.userId,
    };
    for (let n = 1; n < 30; n++) {
      const { data, error } = await c.supabase.from('entities').insert({ ...row, slug: slugOf(row.name) + (n > 1 ? '-' + n : '') }).select('id').single();
      if (data) return text({ created: true, id: data.id, kind: KIND_LABEL[kind], name: row.name, status: 'draft', system: own ? sys.name : 'Fifth Edition (' + sys.base + ')', link: siteOf(c) + '/homebrew/' + data.id, notes: made.notes, ...mechanicsCheck(made.data), next: 'Tell the DM to open the link, check it, and press Save to finish it. To change it later, use update_draft with its id.' });
      if (/upgrade:/i.test(error?.message ?? '')) return fail('The DM\'s free plan has used all its homebrew entries. They can upgrade to Pro, or delete an entry, to make more.');
      if (!/duplicate|unique/i.test(error?.message ?? '')) return fail('The draft could not be saved: ' + (error?.message ?? 'unknown error'));
    }
    return fail('The draft could not be saved (too many entries with that name).');
  });

  server.registerTool('update_draft', {
    title: 'Change a homebrew draft',
    description: 'Change one of the DM\'s DRAFT entries in place (no copy). Give the whole entry again, in the format from get_format, with the changes made (get_entry shows what it has now). Only drafts can be changed: once the DM sets an entry live, it is theirs to change in the editor.',
    inputSchema: {
      id: z.string().describe('the draft\'s id (from create_draft or list_my_homebrew)'),
      entry: z.union([z.string(), z.record(z.string(), z.any())]).describe('the whole entry with its changes, as JSON in the format from get_format'),
      system: z.string().optional().describe('only to move it to another system; leave out to keep its system'),
    },
  }, async ({ id, entry, system }) => {
    if (!isId(id)) return fail('That is not an entry id. Use list_my_homebrew to find it.');
    const { data: cur } = await c.supabase.from('entities').select('id, type, name, status, data').eq('id', id).eq('owner_id', c.userId).neq('source', 'srd').maybeSingle();
    if (!cur) return fail('None of the DM\'s homebrew has that id.');
    if (cur.status !== 'draft') return fail(`"${cur.name}" is not a draft (it is ${cur.status}), so it cannot be changed from here. The DM can change it in the editor, or set it back to draft.`);
    const kind = cur.type as string;
    const b = await build(kind, entry, system ?? (cur.data?.system as string | undefined));
    if ('error' in b) return fail(b.error as string);
    const { made, tag, sys, own } = b;
    const same = made.name.trim().toLowerCase() !== String(cur.name).trim().toLowerCase() ? await sameName(kind, made.name) : null;
    if (same) return fail(`The DM already has another ${KIND_LABEL[kind].toLowerCase()} called "${made.name}". Keep this one's name, or pick another.`);
    const { error } = await c.supabase.from('entities').update({ name: made.name.slice(0, 120), data: { ...made.data, system: tag, madeWith: 'ai' } }).eq('id', id).eq('owner_id', c.userId).eq('status', 'draft');
    if (error) return fail('The change could not be saved: ' + error.message);
    return text({ updated: true, id, kind: KIND_LABEL[kind], name: made.name, status: 'draft', system: own ? sys.name : 'Fifth Edition (' + sys.base + ')', link: siteOf(c) + '/homebrew/' + id, notes: made.notes, ...mechanicsCheck(made.data), next: 'Tell the DM to reopen the link to see the changes, check it, and press Save to finish it.' });
  });

  server.registerTool('review_balance', {
    title: 'Review the balance of an entry',
    description: 'The site\'s balance hint for one entry, the same one the DM sees in the editor: how its rules add up against the official entries of its kind, the official ones closest to it, which of its parts weigh the most, and rules still written only as words (the hint cannot count those). Use it to explain and suggest changes. It is a hint, never a rule: change a draft only after the DM agrees, with update_draft.',
    inputSchema: { id: z.string().describe('the entry\'s id (from list_my_homebrew, or an official one\'s)') },
    annotations: { readOnlyHint: true },
  }, async ({ id }) => {
    if (!isId(id)) return fail('That is not an entry id. Use list_my_homebrew to find one.');
    const { data: e } = await c.supabase.from('entities').select('id, type, name, status, source, data').eq('id', id).maybeSingle();
    if (!e) return fail('No entry with that id that you can see.');
    const { data: srd } = await c.supabase.from('entities').select('type, name, srd_version, data').eq('source', 'srd').eq('type', e.type).limit(700);
    const peers = (srd ?? []) as { type: string; name: string; srd_version: string; data: any }[];
    const hint = balanceHint(e.type as EntityType, e.data, peers);
    const r1 = (n: number) => Math.round(n * 10) / 10;
    // what each part weighs: its mechanics, or a flat amount for a part that is only words
    const parts = partsOf(e.data).filter((p) => Array.isArray(p.effects) || 'level' in p)
      .map((p) => ({ name: p.name, ...(p.level ? { level: p.level } : {}), points: r1(p.effects?.length ? p.effects.reduce((n: number, x: any) => n + effectPoints(x), 0) : 0.75) }));
    const counted = e.type !== 'class' && e.type !== 'spell' && e.type !== 'monster' && e.type !== 'item';
    const mine = counted ? r1(entityPoints(e.data)) : null;
    const closest = counted ? peers.map((p) => ({ name: p.name, rules: p.srd_version === '5.1' ? '2014' : '2024', points: r1(entityPoints(p.data)) }))
      .sort((a, b) => Math.abs(a.points - mine!) - Math.abs(b.points - mine!)).slice(0, 5) : [];
    return text({
      name: e.name, kind: KIND_LABEL[e.type] ?? e.type, status: e.status,
      verdict: hint.verdict === 'no baseline' ? 'nothing official to compare with' : hint.verdict === 'in line' ? 'in line with the official ones' : hint.verdict + ' the official ones',
      reasons: hint.reasons, ...(mine !== null ? { points: mine, closest_official: closest } : {}),
      heaviest_parts: [...parts].sort((a, b) => b.points - a.points).slice(0, 6),
      rules_left_as_words: missedMechanics(e.data),
      how_to_use: 'Points are a rough weight per mechanic, for comparing; a part that is only words counts a little, whatever it does. Explain the verdict to the DM in plain words, suggest specific changes, and change the draft (update_draft) only if the DM agrees. Finished entries can only be changed by the DM in the editor.',
    });
  });

  server.registerTool('find_gaps', {
    title: 'Find gaps in my homebrew',
    description: 'Looks over all of the DM\'s homebrew for what is missing or unfinished: classes with no subclasses, subclasses whose class does not exist, spells something gives that do not exist, rules still written only as words, entries and parts with no description, and drafts waiting for the DM. Optionally only entries of one kind.',
    inputSchema: { kind: z.enum(KINDS).optional() },
    annotations: { readOnlyHint: true },
  }, async ({ kind }) => {
    const [{ data: mineRaw }, { data: srdRaw }] = await Promise.all([
      c.supabase.from('entities').select('id, type, name, status, data').eq('owner_id', c.userId).neq('source', 'srd').limit(500),
      c.supabase.from('entities').select('type, name').eq('source', 'srd').in('type', ['class', 'spell']).limit(3000),
    ]);
    const mine = (mineRaw ?? []) as { id: string; type: string; name: string; status: string; data: any }[];
    const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();
    const officialClasses = new Set((srdRaw ?? []).filter((x: any) => x.type === 'class').map((x: any) => norm(x.name)));
    const spells = new Set([...(srdRaw ?? []).filter((x: any) => x.type === 'spell').map((x: any) => norm(x.name)), ...mine.filter((x) => x.type === 'spell').map((x) => norm(x.name))]);
    const classes = mine.filter((x) => x.type === 'class');
    const subs = mine.filter((x) => x.type === 'subclass');
    const of = (cl: { id: string; name: string }) => (s: { data: any }) => s.data?.parentClassId === cl.id || norm(s.data?.parent) === norm(cl.name);
    const look = kind ? mine.filter((x) => x.type === kind) : mine;
    const at = (x: { id: string; name: string; type: string }) => ({ id: x.id, name: x.name, kind: KIND_LABEL[x.type] ?? x.type, link: siteOf(c) + '/homebrew/' + x.id });
    const missingSpells: { entry: string; part: string; spell: string }[] = [];
    for (const x of look) {
      const where: [string, any[]][] = [['', x.data?.effects ?? []], ...partsOf(x.data).map((p) => [p.name, p.effects ?? []] as [string, any[]])];
      for (const [part, fx] of where) for (const g of fx) if (g?.t === 'spell' && g.name && !spells.has(norm(g.name))) missingSpells.push({ entry: x.name, part, spell: g.name });
    }
    return text({
      looked_at: look.length + ' entries' + (kind ? ' (' + KIND_LABEL[kind] + ')' : ''),
      classes_without_subclasses: (!kind || kind === 'class' || kind === 'subclass') ? classes.filter((cl) => !subs.some(of(cl))).map(at) : undefined,
      subclasses_without_their_class: (!kind || kind === 'subclass') ? subs.filter((s) => !classes.some((cl) => of(cl)(s)) && !officialClasses.has(norm(s.data?.parent))).map((s) => ({ ...at(s), class_named: s.data?.parent ?? '(none)' })) : undefined,
      spells_that_do_not_exist: missingSpells.slice(0, 40),
      rules_left_as_words: look.map((x) => ({ ...at(x), found: missedMechanics(x.data).slice(0, 5) })).filter((x) => x.found.length),
      no_description: look.filter((x) => x.type !== 'monster' && !String(x.data?.desc ?? '').trim()).map(at),
      parts_with_no_words: look.flatMap((x) => partsOf(x.data).filter((p) => !TEXT_KEYS.some((k) => String(p[k] ?? '').trim())).map((p) => ({ entry: x.name, part: p.name }))).slice(0, 40),
      drafts_waiting: look.filter((x) => x.status === 'draft').map(at),
      how_to_use: 'Tell the DM what is missing, most useful first, and offer to fill it: a new draft (create_draft), a change to a draft (update_draft), or words only (update_words). Make nothing until the DM says which.',
    });
  });

  server.registerTool('update_words', {
    title: 'Change only the words of a draft',
    description: 'Change only the words of one of the DM\'s DRAFTS: its description, and the descriptions of its features, traits or benefits (found by name). Every rule stays exactly as it is (what each part gives, grows, chooses or uses). For flavour, appearance, history and clearer wording. Not for spells: a spell\'s words are its rules, so change a spell with update_draft.',
    inputSchema: {
      id: z.string().describe('the draft\'s id'),
      description: z.string().max(6000).optional().describe('the new description of the whole entry'),
      parts: z.array(z.object({ name: z.string(), description: z.string().max(4000) })).max(60).optional().describe('features, traits or benefits by their exact name, with their new descriptions'),
    },
  }, async ({ id, description, parts }) => {
    if (!isId(id)) return fail('That is not an entry id. Use list_my_homebrew to find it.');
    const { data: cur } = await c.supabase.from('entities').select('id, type, name, status, data').eq('id', id).eq('owner_id', c.userId).neq('source', 'srd').maybeSingle();
    if (!cur) return fail('None of the DM\'s homebrew has that id.');
    if (cur.status !== 'draft') return fail(`"${cur.name}" is not a draft (it is ${cur.status}), so it cannot be changed from here. The DM can change it in the editor, or set it back to draft.`);
    if (cur.type === 'spell') return fail('A spell\'s words are its rules. Change a spell with update_draft instead.');
    if (description === undefined && !parts?.length) return fail('Give a new description, parts with new descriptions, or both.');
    const data = structuredClone(cur.data ?? {});
    const changed: string[] = [];
    if (description !== undefined) { data.desc = description; changed.push('description'); }
    const all = partsOf(data);
    const notFound: string[] = [];
    for (const p of parts ?? []) {
      const hit = all.find((x) => String(x.name).trim().toLowerCase() === p.name.trim().toLowerCase());
      if (!hit) { notFound.push(p.name); continue; }
      hit[TEXT_KEYS.find((k) => typeof hit[k] === 'string') ?? 'text'] = p.description;
      changed.push(hit.name);
    }
    if (!changed.length) return fail('None of those parts were found. Its parts are: ' + all.map((x) => x.name).join(', '));
    const { error } = await c.supabase.from('entities').update({ data }).eq('id', id).eq('owner_id', c.userId).eq('status', 'draft');
    if (error) return fail('The change could not be saved: ' + error.message);
    return text({ updated: true, id, name: cur.name, changed, ...(notFound.length ? { not_found: notFound, its_parts: all.map((x) => x.name) } : {}), link: siteOf(c) + '/homebrew/' + id, ...mechanicsCheck(data),
      next: 'Only the words changed; every rule is as it was. Tell the DM to reopen the link to read it.' });
  });

  return server;

  // an entry in the get_format format, read the way Import homebrew reads it: the system's own
  // abilities understood, and a reskin ("basedOn") started from the entry it is based on
  async function build(kind: string, entry: unknown, system: string | undefined) {
    const { tag, sys, own } = await systemFor(c, system);
    const answer = typeof entry === 'string' ? entry : JSON.stringify(entry);
    const spells = await loadSpellOptions(c.supabase, c.userId);
    // (nothing awaits between setting and reading the abilities, so another request cannot get in between)
    setImportAbilities(own ? editorRules(sys).card : null);
    const r = parseBrewImport(kind, answer, spells);
    setImportAbilities(null);
    if (!r.ok) return { error: r.error };
    let made = { name: r.name, data: r.data, notes: r.notes };
    const { name: basedOn } = basedOnOf(answer);
    if (basedOn) {
      const said = basedOn.trim().replace(/^(the|a|an) /i, '').replace(/[%_]/g, '');
      const { data: mine } = await c.supabase.from('entities').select('id, name, source, data').eq('owner_id', c.userId).neq('source', 'srd').eq('type', kind).ilike('name', said).limit(1);
      let base = mine?.[0] ?? null;
      for (const pattern of [said, `${said} %`, `% ${said}`, `%${said}%`]) {
        if (base) break;
        const { data: srd } = await c.supabase.from('entities').select('id, name, source, data').eq('source', 'srd').eq('srd_version', versionOf(sys)).eq('type', kind).ilike('name', pattern).order('name').limit(1);
        base = srd?.[0] ?? null;
      }
      if (base) {
        setImportAbilities(own ? editorRules(sys).card : null);
        made = applyBase(kind, base as any, made, readAnswer(answer), spells);
        setImportAbilities(null);
      } else made.notes = [`It says it is based on "${basedOn}", but there is no ${KIND_LABEL[kind].toLowerCase()} by that name, so only what was given is filled in.`, ...made.notes];
    }
    return { made, tag, sys, own };
  }

  // the DM's own entry of this kind with this name, if there is one
  async function sameName(kind: string, name: string) {
    const { data } = await c.supabase.from('entities').select('id, status').eq('owner_id', c.userId).neq('source', 'srd').eq('type', kind).ilike('name', name.trim().replace(/[%_]/g, '')).limit(1);
    return (data?.[0] as { id: string; status: string } | undefined) ?? null;
  }
}
