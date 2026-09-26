import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EMPTY_COLLECTION, cashFragments, pull, rollNumber, rollRarity, type Collection } from "./skins.ts";

describe("gacha", () => {
  it("gives each number an equal tenth", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 10; i += 1) seen.add(rollNumber(() => i / 10));
    assert.equal(seen.size, 10);
  });

  it("follows the rarity bands", () => {
    assert.equal(rollRarity(() => 0), "N");
    assert.equal(rollRarity(() => 0.57), "N");
    assert.equal(rollRarity(() => 0.7), "R");
    assert.equal(rollRarity(() => 0.81), "R");
    assert.equal(rollRarity(() => 0.85), "SR");
    assert.equal(rollRarity(() => 0.93), "SR");
    assert.equal(rollRarity(() => 0.96), "SSR");
    assert.equal(rollRarity(() => 0.98), "SSR");
    assert.equal(rollRarity(() => 0.995), "UR");
  });

  it("spends a ticket and banks a duplicate as one fragment", () => {
    const start: Collection = { ...EMPTY_COLLECTION, tickets: 2, owned: ["4-N"] };
    const first = pull(start, () => 0.3);
    assert.equal(first.pull.number, 4);
    assert.equal(first.pull.rarity, "N");
    assert.equal(first.pull.duplicate, true);
    assert.equal(first.collection.tickets, 1);
    assert.equal(first.collection.fragments, 1);
    const second = pull({ ...first.collection, owned: [] }, () => 0);
    assert.equal(second.pull.duplicate, false);
    assert.equal(second.collection.owned.includes("1-N"), true);
  });

  it("turns ten fragments into two tickets", () => {
    const next = cashFragments({ ...EMPTY_COLLECTION, fragments: 10, tickets: 1 });
    assert.equal(next?.fragments, 0);
    assert.equal(next?.tickets, 3);
    assert.equal(cashFragments(EMPTY_COLLECTION), null);
  });
});
