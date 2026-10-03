export type Role = 'dm' | 'player';

export type Profile = { id: string; display_name: string; email: string; role: Role };

export type Theme = {
  colors?: Record<string, string>;
  fonts?: { display?: string; body?: string; href?: string };
  goldHi?: string;
  goldLo?: string;
  starfield?: boolean;
};

export type Campaign = {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  status: string;
  phase: string;
  phases: { id: string; label: string }[];
  theme: Theme;
};

export type Section = {
  id: string;
  slug: string;
  title: string;
  sort: number;
  audience: 'all' | 'dm' | 'player';
  kind: 'content' | 'sheet' | 'combat' | 'sessions' | 'players';
};

export type ContentRow = {
  id: string;
  campaign_id: string;
  section: string;
  kind: string;
  key: string;
  sort: number;
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  visibility: 'player' | 'dm';
  phase: string | null;
  hidden: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RuleRow = { kind: string; key: string; sort: number; data: any; phase: string | null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CharacterRow = { id: string; owner: string; campaign_id: string; data: any; builder: any; updated_at: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SessionRow = { id: string; campaign_id: string; number: number; title: string; summary: string; meta: string; status: string; content: any; state: any };
