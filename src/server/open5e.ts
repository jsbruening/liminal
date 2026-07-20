import "server-only";

// Thin client for the free, no-auth open5e.com API (https://open5e.com).
// Used only for spell *mechanics* (damage dice, save type, attack-roll
// flag) — a real, documented, versioned public API, unlike D&D Beyond's
// unofficial character endpoint. "Which spells a character knows" still
// comes from D&D Beyond; this only answers "how does that spell work."
// document__key=srd-2014 scopes to the classic 5e SRD (OGL-licensed),
// matching the same edition/licensing precedent as the SRD monster
// importer (src/server/srd.ts -> dnd5eapi.co).

const SPELLS_URL = "https://api.open5e.com/v2/spells/?document__key=srd-2014&limit=100";

export interface SpellMechanics {
  damageRoll: string | null;
  damageType: string | null;
  savingThrowAbility: string | null;
  attackRoll: boolean;
  higherLevelDamage: { slotLevel: number; damageRoll: string }[];
}

interface RawOpen5eSpell {
  name: string;
  damage_roll: string | null;
  damage_types: string[] | null;
  saving_throw_ability: string | null;
  attack_roll: boolean;
  casting_options: { type: string; damage_roll: string | null }[] | null;
}

interface RawOpen5eSpellPage {
  next: string | null;
  results: RawOpen5eSpell[];
}

// The SRD spell list (319 entries) rarely changes; cache it for the life of
// the server process instead of refetching on every character import.
let spellListCache: Map<string, SpellMechanics> | null = null;

function mapSpell(s: RawOpen5eSpell): SpellMechanics {
  const higherLevelDamage = (s.casting_options ?? [])
    .map((opt) => {
      const match = /^slot_level_(\d+)$/.exec(opt.type);
      if (!match || !opt.damage_roll) return null;
      return { slotLevel: Number(match[1]), damageRoll: opt.damage_roll };
    })
    .filter((x): x is { slotLevel: number; damageRoll: string } => x !== null);

  return {
    damageRoll: s.damage_roll ?? null,
    damageType: s.damage_types?.[0] ?? null,
    savingThrowAbility: s.saving_throw_ability === "" ? null : s.saving_throw_ability,
    attackRoll: s.attack_roll,
    higherLevelDamage,
  };
}

async function loadSpellList(): Promise<Map<string, SpellMechanics>> {
  if (spellListCache) return spellListCache;

  const byName = new Map<string, SpellMechanics>();
  let url: string | null = SPELLS_URL;
  while (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("open5e spell list request failed");
    const page = (await res.json()) as RawOpen5eSpellPage;
    for (const spell of page.results) {
      const key = spell.name.toLowerCase();
      if (!byName.has(key)) byName.set(key, mapSpell(spell));
    }
    url = page.next;
  }

  spellListCache = byName;
  return byName;
}

// Returns null on no match (homebrew/renamed spells) rather than throwing —
// callers should show the spell name with no mechanics rather than fail.
export async function lookupSpellMechanics(name: string): Promise<SpellMechanics | null> {
  const list = await loadSpellList();
  return list.get(name.trim().toLowerCase()) ?? null;
}
