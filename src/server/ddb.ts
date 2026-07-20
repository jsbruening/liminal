import "server-only";
import { lookupSpellMechanics } from "~/server/open5e";

// Thin client for D&D Beyond's unofficial character-data endpoint. There is
// no supported/documented DDB API — this is the same endpoint community
// tools (Beyond20, Avrae) have relied on for years, but it can change or be
// blocked without notice, and only works for characters shared as "Public".
//
// The shapes below (Raw* interfaces, mapDdbCharacter) were verified against
// two real public characters' live responses (a level 11 Rogue with no real
// spellcasting, and a level 13 Paladin with real prepared spells) — not a
// spec. Known gaps, deliberately deferred for v1: weapon proficiency is
// assumed for anything equipped (not cross-checked against the character's
// actual weapon-category proficiencies, since that needs a static
// simple/martial weapon table); a multiclass character's spellcasting only
// uses the first spellcasting class found, not stacked across classes;
// Warlock pact magic slots aren't tracked (only regular spellSlots), so
// Warlocks will show missing/wrong slot counts; ritual casting and
// concentration aren't flagged; some exotic feat interactions aren't
// modeled. Spell *mechanics* (damage/save/attack-roll) come from open5e's
// SRD spell list (src/server/open5e.ts), looked up by name — see that
// file's header for why DDB's own spell-effect fields aren't used instead.

const CHARACTER_SERVICE_BASE = "https://character-service.dndbeyond.com";
const ALLOWED_HOSTS = new Set(["dndbeyond.com", "www.dndbeyond.com"]);
const FETCH_TIMEOUT_MS = 8000;

export class DdbUrlError extends Error {}
export class DdbNotPublicError extends Error {}

// Extracts ONLY the numeric character ID from a pasted URL. The user's raw
// string is never passed to fetch() — we validate the host against an
// allowlist, pull out the ID via regex, then build our own fixed request URL
// from that ID. This is the only path from user input to a network request,
// so there's no way a pasted URL can point the server at an arbitrary host.
export function parseCharacterId(pastedUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(pastedUrl.trim());
  } catch {
    throw new DdbUrlError("That doesn't look like a valid URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new DdbUrlError("The URL must use https.");
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new DdbUrlError("The URL must be a dndbeyond.com character sheet link.");
  }
  const match = /\/characters\/(\d+)/.exec(parsed.pathname);
  if (!match?.[1]) {
    throw new DdbUrlError("Couldn't find a character ID in that URL.");
  }
  return match[1];
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        // DDB rejects requests without these as "Unauthorized Access
        // Attempt" even though the endpoint needs no real auth for public
        // characters — verified empirically, not documented anywhere.
        Origin: "https://www.dndbeyond.com",
        Referer: "https://www.dndbeyond.com/",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

interface RawDdbStat {
  id: number; // 1=str, 2=dex, 3=con, 4=int, 5=wis, 6=cha
  value: number | null;
}

interface RawDdbModifier {
  type: string; // "bonus" | "proficiency" | "expertise" | "set" | "sense" | "advantage" | ...
  subType: string; // e.g. "strength-score", "strength-saving-throws", "acrobatics", "armor-class"
  value: number | null;
  isGranted: boolean;
  componentId: number;
  friendlySubtypeName: string; // e.g. "Sleight of Hand" — matched against resolved choice labels
}

interface RawDdbChoiceEntry {
  componentId: number;
  optionValue: number | null;
}

interface RawDdbChoiceDefinition {
  options: { id: number; label: string }[];
}

interface RawDdbChoices {
  race?: RawDdbChoiceEntry[];
  class?: RawDdbChoiceEntry[];
  background?: RawDdbChoiceEntry[];
  item?: RawDdbChoiceEntry[];
  feat?: RawDdbChoiceEntry[];
  choiceDefinitions?: RawDdbChoiceDefinition[];
}

interface RawDdbClass {
  level: number;
  definition: {
    name: string;
    spellCastingAbilityId?: number | null;
    spellRules?: { levelSpellSlots?: number[][] | null } | null;
  };
}

interface RawDdbSpellDefinition {
  name: string;
  level: number;
}

interface RawDdbSpellEntry {
  definition: RawDdbSpellDefinition;
  prepared: boolean;
  alwaysPrepared?: boolean;
}

interface RawDdbClassSpells {
  characterClassId: number;
  spells: RawDdbSpellEntry[];
}

interface RawDdbSpellSlot {
  level: number;
  used: number;
  available: number;
}

interface RawDdbInventoryItem {
  equipped?: boolean;
  definition?: {
    name?: string;
    filterType?: string | null; // "Weapon" | "Armor" | "Shield" | ...
    armorClass?: number | null; // base value, magic bonuses live in grantedModifiers instead
    armorTypeId?: number | null; // 1=Light, 2=Medium, 3=Heavy — verified against real data
    damage?: { diceString?: string } | null;
    properties?: { name?: string }[] | null;
    grantedModifiers?: RawDdbModifier[] | null; // e.g. a weapon's own "+1 to hit and damage"
  };
}

interface RawDdbCharacterData {
  name: string;
  race?: {
    fullName?: string;
    baseName?: string;
    weightSpeeds?: { normal?: { walk?: number } } | null;
  } | null;
  classes?: RawDdbClass[] | null;
  background?: { definition?: { name?: string } } | null;
  stats?: RawDdbStat[] | null;
  bonusStats?: RawDdbStat[] | null;
  overrideStats?: RawDdbStat[] | null;
  baseHitPoints?: number | null;
  bonusHitPoints?: number | null;
  overrideHitPoints?: number | null;
  removedHitPoints?: number | null;
  temporaryHitPoints?: number | null;
  modifiers?: Record<string, RawDdbModifier[]> | null; // keyed "race"|"class"|"background"|"feat"|"item"|"condition"
  inventory?: RawDdbInventoryItem[] | null;
  choices?: RawDdbChoices | null;
  spells?: Record<string, RawDdbSpellEntry[] | null> | null; // keyed "race"|"class"|"background"|"feat"|"item"
  classSpells?: RawDdbClassSpells[] | null;
  spellSlots?: RawDdbSpellSlot[] | null;
}

export async function fetchDdbCharacter(characterId: string): Promise<RawDdbCharacterData> {
  const res = await fetchWithTimeout(`${CHARACTER_SERVICE_BASE}/character/v5/character/${characterId}`);
  if (!res.ok) {
    throw new Error(`D&D Beyond request failed with status ${res.status}`);
  }
  const body = (await res.json()) as {
    success: boolean;
    message?: string;
    data?: RawDdbCharacterData;
  };
  if (!body.success || !body.data) {
    throw new DdbNotPublicError(body.message ?? "Character is not public.");
  }
  return body.data;
}

const ABILITY_IDS = ["str", "dex", "con", "int", "wis", "cha"] as const;
type AbilityKey = (typeof ABILITY_IDS)[number];
const ABILITY_ID_TO_KEY: Record<number, AbilityKey> = { 1: "str", 2: "dex", 3: "con", 4: "int", 5: "wis", 6: "cha" };
const ABILITY_FULL_NAME: Record<AbilityKey, string> = {
  str: "strength",
  dex: "dexterity",
  con: "constitution",
  int: "intelligence",
  wis: "wisdom",
  cha: "charisma",
};

const SKILLS: { name: string; ability: AbilityKey; subType: string }[] = [
  { name: "Acrobatics", ability: "dex", subType: "acrobatics" },
  { name: "Animal Handling", ability: "wis", subType: "animal-handling" },
  { name: "Arcana", ability: "int", subType: "arcana" },
  { name: "Athletics", ability: "str", subType: "athletics" },
  { name: "Deception", ability: "cha", subType: "deception" },
  { name: "History", ability: "int", subType: "history" },
  { name: "Insight", ability: "wis", subType: "insight" },
  { name: "Intimidation", ability: "cha", subType: "intimidation" },
  { name: "Investigation", ability: "int", subType: "investigation" },
  { name: "Medicine", ability: "wis", subType: "medicine" },
  { name: "Nature", ability: "int", subType: "nature" },
  { name: "Perception", ability: "wis", subType: "perception" },
  { name: "Performance", ability: "cha", subType: "performance" },
  { name: "Persuasion", ability: "cha", subType: "persuasion" },
  { name: "Religion", ability: "int", subType: "religion" },
  { name: "Sleight of Hand", ability: "dex", subType: "sleight-of-hand" },
  { name: "Stealth", ability: "dex", subType: "stealth" },
  { name: "Survival", ability: "wis", subType: "survival" },
];

function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function proficiencyBonusForLevel(totalLevel: number): number {
  if (totalLevel >= 17) return 6;
  if (totalLevel >= 13) return 5;
  if (totalLevel >= 9) return 4;
  if (totalLevel >= 5) return 3;
  return 2;
}

// The character-level buckets (race/class/background/feat/item/condition).
// Verified against real data: equipped items' own granted modifiers (e.g. a
// "+1 armor"'s AC bonus) are already mirrored into the "item" bucket here —
// merging inventory[].definition.grantedModifiers on top would double-count
// them. Per-weapon to-hit/damage bonuses in computeAttacks read
// grantedModifiers directly off that one weapon instead, which is a
// separate, unrelated computation with no overlap risk.
function allModifiers(raw: RawDdbCharacterData): RawDdbModifier[] {
  return Object.values(raw.modifiers ?? {}).flat();
}

function resolveChoiceLabel(raw: RawDdbCharacterData, optionValue: number | null): string | null {
  if (optionValue == null) return null;
  for (const def of raw.choices?.choiceDefinitions ?? []) {
    const opt = def.options.find((o) => o.id === optionValue);
    if (opt) return opt.label;
  }
  return null;
}

const CHOICE_CATEGORIES = ["race", "class", "background", "item", "feat"] as const;

function chosenLabelsForComponent(raw: RawDdbCharacterData, componentId: number): Set<string> {
  const labels = new Set<string>();
  for (const cat of CHOICE_CATEGORIES) {
    for (const entry of raw.choices?.[cat] ?? []) {
      if (entry.componentId !== componentId) continue;
      const label = resolveChoiceLabel(raw, entry.optionValue);
      if (label) labels.add(label.toLowerCase());
    }
  }
  return labels;
}

// A modifier counts if it was directly granted, OR if it's one of several
// options offered by a choice-driven feature (isGranted: false — e.g. Rogue
// "choose 2 skills for Expertise") AND the player's actual pick (resolved
// via choices -> choiceDefinitions) matches this specific modifier's skill.
function isModifierActive(raw: RawDdbCharacterData, m: RawDdbModifier): boolean {
  if (m.isGranted) return true;
  return chosenLabelsForComponent(raw, m.componentId).has(m.friendlySubtypeName.toLowerCase());
}

function hasActiveModifier(raw: RawDdbCharacterData, mods: RawDdbModifier[], type: string, subType: string): boolean {
  return mods.some((m) => m.type === type && m.subType === subType && isModifierActive(raw, m));
}

function activeFlatBonus(raw: RawDdbCharacterData, mods: RawDdbModifier[], subType: string): number {
  return mods
    .filter((m) => m.type === "bonus" && m.subType === subType && isModifierActive(raw, m))
    .reduce((sum, m) => sum + (m.value ?? 0), 0);
}

function computeAbilityScores(raw: RawDdbCharacterData): Record<AbilityKey, { score: number; modifier: number }> {
  const base: Record<number, number> = {};
  const bonus: Record<number, number> = {};
  const override: Record<number, number> = {};
  for (const s of raw.stats ?? []) base[s.id] = s.value ?? 10;
  for (const s of raw.bonusStats ?? []) if (s.value != null) bonus[s.id] = s.value;
  for (const s of raw.overrideStats ?? []) if (s.value != null) override[s.id] = s.value;

  const result = {} as Record<AbilityKey, { score: number; modifier: number }>;
  for (const [idStr, key] of Object.entries(ABILITY_ID_TO_KEY)) {
    const id = Number(idStr);
    const score = override[id] ?? (base[id] ?? 10) + (bonus[id] ?? 0);
    result[key] = { score, modifier: abilityModifier(score) };
  }
  return result;
}

function computeSavingThrows(
  raw: RawDdbCharacterData,
  mods: RawDdbModifier[],
  abilities: Record<AbilityKey, { score: number; modifier: number }>,
  proficiencyBonus: number,
): Record<AbilityKey, { modifier: number; proficient: boolean }> {
  const result = {} as Record<AbilityKey, { modifier: number; proficient: boolean }>;
  for (const key of ABILITY_IDS) {
    const subType = `${ABILITY_FULL_NAME[key]}-saving-throws`;
    const proficient = hasActiveModifier(raw, mods, "proficiency", subType);
    const modifier =
      abilities[key].modifier + (proficient ? proficiencyBonus : 0) + activeFlatBonus(raw, mods, subType);
    result[key] = { modifier, proficient };
  }
  return result;
}

function computeSkills(
  raw: RawDdbCharacterData,
  mods: RawDdbModifier[],
  abilities: Record<AbilityKey, { score: number; modifier: number }>,
  proficiencyBonus: number,
) {
  return SKILLS.map(({ name, ability, subType }) => {
    const proficient = hasActiveModifier(raw, mods, "proficiency", subType);
    const expertise = hasActiveModifier(raw, mods, "expertise", subType);
    const profMultiplier = expertise ? 2 : proficient ? 1 : 0;
    const modifier =
      abilities[ability].modifier + proficiencyBonus * profMultiplier + activeFlatBonus(raw, mods, subType);
    return { name, ability, modifier, proficient, expertise };
  });
}

// Base 10 + Dex mod if unarmored, or the equipped armor's own base AC plus
// however much Dex that armor category allows (light: full, medium: capped
// at +2, heavy: none — armorTypeId verified against real data), plus shield
// and any active flat armor-class bonuses (a "+1 armor" magic bonus shows up
// this way, via the item's own grantedModifiers merged in by allModifiers).
function computeArmorClass(raw: RawDdbCharacterData, mods: RawDdbModifier[], dexModifier: number): number {
  const equippedArmor = (raw.inventory ?? []).find(
    (i) => i.equipped && i.definition?.filterType === "Armor" && i.definition.armorClass != null,
  );
  let base: number;
  if (equippedArmor) {
    const armorTypeId = equippedArmor.definition?.armorTypeId;
    const dexContribution = armorTypeId === 3 ? 0 : armorTypeId === 2 ? Math.min(dexModifier, 2) : dexModifier;
    base = (equippedArmor.definition?.armorClass ?? 10) + dexContribution;
  } else {
    base = 10 + dexModifier;
  }
  const hasShield = (raw.inventory ?? []).some((i) => i.equipped && i.definition?.filterType === "Shield");
  return base + (hasShield ? 2 : 0) + activeFlatBonus(raw, mods, "armor-class");
}

// Weapon proficiency is assumed for anything equipped (not cross-checked
// against the character's actual weapon-category proficiencies — see file
// header). Ability used follows 5e RAW: Ammunition property -> always Dex,
// Finesse -> higher of Str/Dex, otherwise Str. Magic weapon bonuses (e.g. a
// "+1 Dagger") come from the item's own grantedModifiers.
function computeAttacks(
  raw: RawDdbCharacterData,
  abilities: Record<AbilityKey, { score: number; modifier: number }>,
  proficiencyBonus: number,
): { name: string; toHit: number | null; damage: string | null }[] {
  const weapons = (raw.inventory ?? []).filter((i) => i.equipped && i.definition?.filterType === "Weapon");
  return weapons.map((w) => {
    const properties = w.definition?.properties ?? [];
    const isRanged = properties.some((p) => p.name === "Ammunition");
    const isFinesse = properties.some((p) => p.name === "Finesse");
    const abilityMod = isRanged
      ? abilities.dex.modifier
      : isFinesse
        ? Math.max(abilities.str.modifier, abilities.dex.modifier)
        : abilities.str.modifier;

    const magicBonus = (w.definition?.grantedModifiers ?? [])
      .filter((m) => m.isGranted && m.type === "bonus" && (m.subType === "magic" || m.subType === "to-hit-damage-rolls"))
      .reduce((sum, m) => sum + (m.value ?? 0), 0);

    const damageDice = w.definition?.damage?.diceString ?? null;
    const damageMod = abilityMod + magicBonus;

    return {
      name: w.definition?.name ?? "Weapon",
      toHit: abilityMod + proficiencyBonus + magicBonus,
      damage: damageDice ? `${damageDice}${damageMod !== 0 ? ` ${damageMod >= 0 ? "+" : ""}${damageMod}` : ""}` : null,
    };
  });
}

// Known/active spells come from raw.spells.* (race/class/background/item/
// feat-granted, always available) plus raw.classSpells. The latter needs
// NO filtering by prepared/alwaysPrepared/countsAsKnownSpell — DDB already
// curates that array down to just the character's real active spells.
// Verified against two very differently-shaped real casters: a Paladin
// (prepares daily) had exactly 9 entries, all prepared:true; an Arcane
// Trickster Rogue (permanently knows a fixed list, never prepares) had 11
// entries, all prepared:false but countsAsKnownSpell:true. An earlier
// version of this function filtered on prepared/alwaysPrepared, which
// happened to work for the Paladin but wrongly excluded every one of the
// Rogue's actually-known spells (confirmed against their real D&D Beyond
// sheet, which does show Disguise Self/Find Familiar/Shield/etc.).
function collectKnownSpells(raw: RawDdbCharacterData): { name: string; level: number }[] {
  const byName = new Map<string, number>();
  for (const cat of ["race", "class", "background", "item", "feat"] as const) {
    for (const entry of raw.spells?.[cat] ?? []) {
      byName.set(entry.definition.name, entry.definition.level);
    }
  }
  for (const cs of raw.classSpells ?? []) {
    for (const entry of cs.spells) {
      byName.set(entry.definition.name, entry.definition.level);
    }
  }
  return [...byName.entries()].map(([name, level]) => ({ name, level }));
}

// A multiclass character could have more than one spellcasting class; v1
// uses the first one found rather than stacking them (see file header).
function findSpellcastingClass(raw: RawDdbCharacterData): RawDdbClass | null {
  return (raw.classes ?? []).find((c) => c.definition.spellCastingAbilityId != null) ?? null;
}

// levelSpellSlots is indexed by character level directly (not level - 1) —
// verified against a real Paladin 13, whose table[13] = [4,3,3,1,0,...],
// matching the real 5e Paladin slot table at level 13. Each array position
// is one spell level (index 0 = 1st-level slots). Only raw.spellSlots is
// used, not pactMagic (Warlock pact slots) — see file header gap note.
function computeSpellSlots(
  raw: RawDdbCharacterData,
  spellcastingClass: RawDdbClass | null,
): { level: number; available: number; used: number }[] {
  const maxTable = spellcastingClass?.definition.spellRules?.levelSpellSlots?.[spellcastingClass.level] ?? [];
  const usedByLevel = new Map<number, number>();
  for (const slot of raw.spellSlots ?? []) usedByLevel.set(slot.level, slot.used);

  const slots: { level: number; available: number; used: number }[] = [];
  maxTable.forEach((max, idx) => {
    if (max <= 0) return;
    const level = idx + 1;
    const used = usedByLevel.get(level) ?? 0;
    slots.push({ level, available: Math.max(0, max - used), used });
  });
  return slots;
}

export interface DdbCharacterSheet {
  name: string;
  race: string;
  classes: { name: string; level: number }[];
  background: string | null;
  armorClass: number;
  hitPoints: { current: number; max: number; temp: number };
  speed: number;
  initiative: number;
  proficiencyBonus: number;
  abilities: Record<AbilityKey, { score: number; modifier: number }>;
  savingThrows: Record<AbilityKey, { modifier: number; proficient: boolean }>;
  skills: { name: string; ability: string; modifier: number; proficient: boolean; expertise: boolean }[];
  passivePerception: number;
  attacks: { name: string; toHit: number | null; damage: string | null }[];
  spellcastingAbility: AbilityKey | null;
  spellSaveDc: number | null;
  spellAttackBonus: number | null;
  spellSlots: { level: number; available: number; used: number }[];
  spells: {
    name: string;
    level: number;
    damageRoll: string | null;
    damageType: string | null;
    savingThrowAbility: string | null;
    attackRoll: boolean;
    higherLevelDamage: { slotLevel: number; damageRoll: string }[];
  }[];
}

export async function mapDdbCharacter(raw: RawDdbCharacterData): Promise<DdbCharacterSheet> {
  const classes = (raw.classes ?? []).map((c) => ({ name: c.definition.name, level: c.level }));
  const totalLevel = classes.reduce((sum, c) => sum + c.level, 0) || 1;
  const proficiencyBonus = proficiencyBonusForLevel(totalLevel);
  const mods = allModifiers(raw);

  const abilities = computeAbilityScores(raw);
  const savingThrows = computeSavingThrows(raw, mods, abilities, proficiencyBonus);
  const skills = computeSkills(raw, mods, abilities, proficiencyBonus);
  const armorClass = computeArmorClass(raw, mods, abilities.dex.modifier);
  const attacks = computeAttacks(raw, abilities, proficiencyBonus);

  const maxHp = (raw.overrideHitPoints ?? (raw.baseHitPoints ?? 0) + (raw.bonusHitPoints ?? 0)) || 1;
  const currentHp = Math.max(0, maxHp - (raw.removedHitPoints ?? 0));

  const perceptionSkill = skills.find((s) => s.name === "Perception");
  const passivePerception = 10 + (perceptionSkill?.modifier ?? abilities.wis.modifier);

  const spellcastingClass = findSpellcastingClass(raw);
  const spellcastingAbility = spellcastingClass
    ? ABILITY_ID_TO_KEY[spellcastingClass.definition.spellCastingAbilityId!] ?? null
    : null;
  const spellSaveDc = spellcastingAbility
    ? 8 + proficiencyBonus + abilities[spellcastingAbility].modifier
    : null;
  const spellAttackBonus = spellcastingAbility
    ? proficiencyBonus + abilities[spellcastingAbility].modifier
    : null;
  const spellSlots = computeSpellSlots(raw, spellcastingClass);

  const knownSpells = collectKnownSpells(raw);
  const spells = (
    await Promise.all(
      knownSpells.map(async ({ name, level }) => {
        const mechanics = await lookupSpellMechanics(name);
        return {
          name,
          level,
          damageRoll: mechanics?.damageRoll ?? null,
          damageType: mechanics?.damageType ?? null,
          savingThrowAbility: mechanics?.savingThrowAbility ?? null,
          attackRoll: mechanics?.attackRoll ?? false,
          higherLevelDamage: mechanics?.higherLevelDamage ?? [],
        };
      }),
    )
  ).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  return {
    name: raw.name,
    race: raw.race?.fullName ?? raw.race?.baseName ?? "Unknown",
    classes,
    background: raw.background?.definition?.name ?? null,
    armorClass,
    hitPoints: { current: currentHp, max: maxHp, temp: raw.temporaryHitPoints ?? 0 },
    speed: raw.race?.weightSpeeds?.normal?.walk ?? 30,
    initiative: abilities.dex.modifier + activeFlatBonus(raw, mods, "initiative"),
    proficiencyBonus,
    abilities,
    savingThrows,
    skills,
    passivePerception,
    attacks,
    spellcastingAbility,
    spellSaveDc,
    spellAttackBonus,
    spellSlots,
    spells,
  };
}
