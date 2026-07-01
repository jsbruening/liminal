import "server-only";

// Thin client for the free, no-auth D&D 5e SRD API (https://www.dnd5eapi.co).
// SRD content is openly licensed (OGL) — this covers the ~330 generic
// monsters (Goblin, Orc, Adult Black Dragon, ...), not copyrighted
// Monster-Manual-exclusive named creatures.

const SRD_BASE = "https://www.dnd5eapi.co";

export interface SrdMonsterSummary {
  index: string;
  name: string;
}

export interface SrdStatBlock {
  name: string;
  size: string;
  type: string;
  alignment: string;
  armorClass: number | null;
  hitPoints: number | null;
  hitDice: string | null;
  speed: Record<string, string>;
  abilities: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  senses: Record<string, string | number>;
  languages: string | null;
  challengeRating: number | null;
  xp: number | null;
  specialAbilities: { name: string; desc: string }[];
  actions: { name: string; desc: string }[];
  legendaryActions: { name: string; desc: string }[];
  reactions: { name: string; desc: string }[];
}

// Monster list rarely changes; cache it for the life of the server process
// instead of refetching all 330+ entries on every keystroke.
let monsterListCache: SrdMonsterSummary[] | null = null;

async function getMonsterList(): Promise<SrdMonsterSummary[]> {
  if (monsterListCache) return monsterListCache;
  const res = await fetch(`${SRD_BASE}/api/2014/monsters`);
  if (!res.ok) throw new Error("SRD monster list request failed");
  const data = (await res.json()) as { results: SrdMonsterSummary[] };
  monsterListCache = data.results;
  return monsterListCache;
}

export async function searchSrdMonsters(query: string): Promise<SrdMonsterSummary[]> {
  const list = await getMonsterList();
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return list.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 20);
}

interface RawAction {
  name: string;
  desc: string;
}

interface RawSrdMonster {
  name: string;
  size: string;
  type: string;
  alignment: string;
  armor_class?: { value: number }[];
  hit_points?: number;
  hit_dice?: string;
  speed?: Record<string, string>;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  senses?: Record<string, string | number>;
  languages?: string;
  challenge_rating?: number;
  xp?: number;
  special_abilities?: RawAction[];
  actions?: RawAction[];
  legendary_actions?: RawAction[];
  reactions?: RawAction[];
  image?: string;
}

export async function importSrdMonster(
  index: string,
): Promise<{ statBlock: SrdStatBlock; avatarUrl: string | null; sightFt: number }> {
  const res = await fetch(`${SRD_BASE}/api/2014/monsters/${index}`);
  if (!res.ok) throw new Error("Monster not found");
  const m = (await res.json()) as RawSrdMonster;

  const statBlock: SrdStatBlock = {
    name: m.name,
    size: m.size,
    type: m.type,
    alignment: m.alignment,
    armorClass: m.armor_class?.[0]?.value ?? null,
    hitPoints: m.hit_points ?? null,
    hitDice: m.hit_dice ?? null,
    speed: m.speed ?? {},
    abilities: {
      str: m.strength,
      dex: m.dexterity,
      con: m.constitution,
      int: m.intelligence,
      wis: m.wisdom,
      cha: m.charisma,
    },
    senses: m.senses ?? {},
    languages: m.languages ?? null,
    challengeRating: m.challenge_rating ?? null,
    xp: m.xp ?? null,
    specialAbilities: (m.special_abilities ?? []).map((a) => ({ name: a.name, desc: a.desc })),
    actions: (m.actions ?? []).map((a) => ({ name: a.name, desc: a.desc })),
    legendaryActions: (m.legendary_actions ?? []).map((a) => ({ name: a.name, desc: a.desc })),
    reactions: (m.reactions ?? []).map((a) => ({ name: a.name, desc: a.desc })),
  };

  const darkvisionMatch = /(\d+)\s*ft/.exec(String(m.senses?.darkvision ?? ""));
  const sightFt = darkvisionMatch ? Number(darkvisionMatch[1]) : 30;

  return {
    statBlock,
    avatarUrl: m.image ? `${SRD_BASE}${m.image}` : null,
    sightFt,
  };
}
