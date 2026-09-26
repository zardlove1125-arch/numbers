export type Rarity = "N" | "R" | "SR" | "SSR" | "UR";

export const RARITIES: Rarity[] = ["N", "R", "SR", "SSR", "UR"];

export type SkinId = `${number}-${Rarity}`;

export type Collection = {
  tickets: number;
  fragments: number;
  owned: SkinId[];
  equipped: Partial<Record<number, Rarity>>;
};

export const EMPTY_COLLECTION: Collection = {
  tickets: 0,
  fragments: 0,
  owned: [],
  equipped: {},
};

export function skinId(number: number, rarity: Rarity): SkinId {
  return `${number}-${rarity}`;
}

export function parseSkin(id: SkinId): { number: number; rarity: Rarity } {
  const [number, rarity] = id.split("-");
  return { number: Number(number), rarity: rarity as Rarity };
}

export function rollRarity(rng: () => number): Rarity {
  const roll = Math.min(99, Math.floor(rng() * 100 + 1e-6));
  if (roll < 58) return "N";
  if (roll < 82) return "R";
  if (roll < 94) return "SR";
  if (roll < 99) return "SSR";
  return "UR";
}

export function rollNumber(rng: () => number): number {
  return 1 + Math.floor(rng() * 10);
}

export type Pull = { number: number; rarity: Rarity; duplicate: boolean };

export function pull(collection: Collection, rng: () => number = Math.random): { collection: Collection; pull: Pull } {
  const number = rollNumber(rng);
  const rarity = rollRarity(rng);
  const id = skinId(number, rarity);
  const duplicate = collection.owned.includes(id);
  const next: Collection = {
    tickets: collection.tickets - 1,
    fragments: collection.fragments + (duplicate ? 1 : 0),
    owned: duplicate ? collection.owned : [...collection.owned, id],
    equipped: collection.equipped,
  };
  return { collection: next, pull: { number, rarity, duplicate } };
}

export function cashFragments(collection: Collection): Collection | null {
  if (collection.fragments < 10) return null;
  return {
    ...collection,
    fragments: collection.fragments - 10,
    tickets: collection.tickets + 2,
  };
}

export function unequip(collection: Collection, number: number): Collection {
  const equipped = { ...collection.equipped };
  delete equipped[number];
  return { ...collection, equipped };
}

export function equip(collection: Collection, number: number, rarity: Rarity): Collection {
  if (!collection.owned.includes(skinId(number, rarity))) return collection;
  return { ...collection, equipped: { ...collection.equipped, [number]: rarity } };
}
