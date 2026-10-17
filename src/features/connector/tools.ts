import 'server-only';
/* eslint-disable @typescript-eslint/no-explicit-any */
// Connect your AI, level 1: what a DM's own AI may do on the site. It may LOOK (their game systems,
// the official rules, their own homebrew) and CREATE DRAFTS. It may not change or delete anything,
// touch campaigns, or show anything to players: a draft is only used once the DM opens it in the
// editor, checks it and saves it. Every call runs as the DM (src/features/connector/server.ts).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BREW_KINDS, PROMPTS, applyBase, basedOnOf, parseBrewImport, readAnswer } from '@/lib/brew-import';
import { setImportAbilities } from '@/lib/class-import';
import { loadSpellOptions } from '@/lib/class-spells';
import { loadSystem, mySystems } from '@/features/systems/data';
import { applyText, editorRules, importPreamble, presetOf, type Sys } from '@/features/systems/model';
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

export function connectorServer(c: Caller) {
  const server = new McpServer({ name: 'Dungeons by Bryce', version: '1.0.0' }, {
    instructions: 'Dungeons by Bryce is a site for running fifth edition tabletop campaigns. You can read the DM\'s game systems, the official 2014 and 2024 rules (the SRD) and their homebrew, and create homebrew as DRAFTS for them to review. Before creating something: call list_my_systems and get_system for the system it is for, call get_format for its kind, then create_draft with a JSON object in that format. Use the system\'s ability keys and names. Tell the DM to open each draft (the link create_draft returns), check it, and press Save to finish it.',
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

    const { tag, sys, own } = await systemFor(c, system);
    const answer = typeof entry === 'string' ? entry : JSON.stringify(entry);
    const spells = await loadSpellOptions(c.supabase, c.userId);
    // read it the way Import homebrew does, understanding the system's own abilities
    // (nothing awaits between setting and reading them, so another request cannot get in between)
    setImportAbilities(own ? editorRules(sys).card : null);
    const r = parseBrewImport(kind, answer, spells);
    setImportAbilities(null);
    if (!r.ok) return fail(r.error);
    let made = { name: r.name, data: r.data, notes: r.notes };

    // a reskin starts from that entry: the DM's own by that exact name, else the official one
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

    // one of a name: this connector cannot change an entry, so a second try would only make a copy
    const { data: same } = await c.supabase.from('entities').select('id').eq('owner_id', c.userId).neq('source', 'srd').eq('type', kind).ilike('name', made.name.trim().replace(/[%_]/g, '')).limit(1);
    if (same?.[0]) return fail(`The DM already has a ${KIND_LABEL[kind].toLowerCase()} called "${made.name}" (${siteOf(c)}/homebrew/${same[0].id}). This connector cannot change existing entries, so it will not make a copy. Ask the DM to change that one in the editor, or delete it first, or give this one another name.`);

    // saved as a draft for that system, marked as made by an AI; the plan decides the depth (the
    // database refuses the full builder on the free plan, and still counts the free plan's limit)
    const { data: plan } = await c.supabase.rpc('my_plan');
    const row = {
      type: kind, name: made.name.slice(0, 120), status: 'draft', depth: plan?.pro ? 'advanced' : 'quick', source: 'homebrew',
      data: { ...made.data, system: tag, madeWith: 'ai' }, owner_id: c.userId,
    };
    for (let n = 1; n < 30; n++) {
      const { data, error } = await c.supabase.from('entities').insert({ ...row, slug: slugOf(row.name) + (n > 1 ? '-' + n : '') }).select('id').single();
      if (data) return text({ created: true, kind: KIND_LABEL[kind], name: row.name, status: 'draft', system: own ? sys.name : 'Fifth Edition (' + sys.base + ')', link: siteOf(c) + '/homebrew/' + data.id, notes: made.notes, next: 'Tell the DM to open the link, check it, and press Save to finish it.' });
      if (/upgrade:/i.test(error?.message ?? '')) return fail('The DM\'s free plan has used all its homebrew entries. They can upgrade to Pro, or delete an entry, to make more.');
      if (!/duplicate|unique/i.test(error?.message ?? '')) return fail('The draft could not be saved: ' + (error?.message ?? 'unknown error'));
    }
    return fail('The draft could not be saved (too many entries with that name).');
  });

  return server;
}
