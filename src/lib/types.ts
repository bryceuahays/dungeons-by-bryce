// 'head' is the site owner. Everyone else is 'player' at the account level, and is the DM
// of whatever campaigns they own.
export type Role = 'head' | 'player';
export type Background = { wide?: boolean; tall?: boolean; v?: number };

export type Profile = { id: string; display_name: string; email: string; role: Role; hub_bg: Background };

export type Theme = {
  colors?: Record<string, string>;
  fonts?: { display?: string; body?: string; href?: string };
  goldHi?: string;
  goldLo?: string;
  starfield?: boolean;
  preset?: string;
  layout?: { radius?: string; wrap?: string };
  hero?: number;
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
  owner_id: string | null;
  background: Background;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settings?: Record<string, any>;
};

export type Section = {
  id: string;
  slug: string;
  title: string;
  sort: number;
  audience: 'all' | 'dm' | 'player';
  kind: 'content' | 'sheet' | 'combat' | 'sessions' | 'players';
  phase: string | null;
  from_stage?: string | null;
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
  from_stage?: string | null;
  only_players?: string[] | null;
  // set for the DM only: the phase in which players see this row (for the label)
  _phase?: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RuleRow = { kind: string; key: string; sort: number; data: any; phase: string | null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CharacterRow = { id: string; owner: string; campaign_id: string; data: any; builder: any; updated_at: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SessionRow = { id: string; campaign_id: string; number: number; title: string; summary: string; meta: string; status: string; content: any; state: any };
