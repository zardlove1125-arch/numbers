import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canNine,
  canSix,
  compare,
  cpuDraft,
  cpuPlay,
  hiddenOpening,
  matchWinner,
  offerEffects,
  playCard,
  resolveTrick,
  kingBoost,
  sealMatch,
  shouldEnd,
  type CardPlay,
} from "./logic.ts";

function face(original: number, display = original): CardPlay {
  return { original, display };
}

function trick(
  you: CardPlay,
  rival: CardPlay,
  extra: {
    youNine?: boolean;
    rivalNine?: boolean;
    youPoison?: boolean;
    rivalPoison?: boolean;
    youEffect?: "pressure" | "guts" | "mist" | "absorb" | "insurance";
    youUnused?: number;
    youMistArmed?: boolean;
    early?: boolean;
  } = {},
) {
  return resolveTrick({
    you,
    rival,
    youNine: extra.youNine ?? false,
    rivalNine: extra.rivalNine ?? false,
    youPoison: extra.youPoison ?? false,
    rivalPoison: extra.rivalPoison ?? false,
    youEffect: extra.youEffect,
    youUnused: extra.youUnused,
    youMistArmed: extra.youMistArmed,
    early: extra.early,
  });
}

describe("acceptance", () => {
  it("1 beats 10 for 11 and does not mark the next win", () => {
    const t = trick(face(1), face(10));
    assert.equal(t.winner, "you");
    assert.equal(t.youGain, 11);
    assert.equal(t.rivalGain, 0);
    assert.equal(t.youPoison, false);
    assert.equal(t.rivalPoison, false);
  });

  it("7 pierces 4 for 14", () => {
    const t = trick(face(7), face(4));
    assert.equal(t.winner, "you");
    assert.equal(t.youGain, 14);
    assert.equal(t.notes.includes("盾"), false);
  });

  it("10 into 4 scores 0", () => {
    const t = trick(face(10), face(4));
    assert.equal(t.winner, "you");
    assert.equal(t.youGain, 0);
  });

  it("8 against 5 scores 12", () => {
    const t = trick(face(8), face(5));
    assert.equal(t.winner, "you");
    assert.equal(t.youGain, 12);
  });

  it("a losing 3 still gains 6", () => {
    const t = trick(face(6), face(3));
    assert.equal(t.winner, "you");
    assert.equal(t.youGain, 9);
    assert.equal(t.rivalGain, 6);
  });

  it("poison reduces the next win by 2 and clears", () => {
    const t = trick(face(8), face(3), { youPoison: true });
    assert.equal(t.winner, "you");
    assert.equal(t.youGain, 11);
    assert.equal(t.youPoison, false);
    assert.equal(t.rivalGain, 6);
  });

  it("refuses an 8-face when five cards remain", () => {
    assert.equal(canSix(3, 2), false);
    assert.equal(playCard(6, true, 3, 2).display, 6);
  });

  it("plays 6 as 8 without the castle bonus", () => {
    assert.equal(canSix(3, 1), true);
    const card = playCard(6, true, 3, 1);
    assert.equal(card.display, 8);
    assert.equal(compare(card, 7, false), 8);
    const t = trick(card, face(7));
    assert.equal(t.winner, "you");
    assert.equal(t.youCmp, 8);
    assert.equal(t.youGain, 15);
    assert.equal(t.notes.includes("城+2"), false);
  });

  it("buffs 9 when three cards remain and scores only the opponent", () => {
    assert.equal(canNine(3, 0), true);
    const card = face(9);
    assert.equal(compare(card, 8, true), 11);
    const t = trick(card, face(7), { youNine: true });
    assert.equal(t.winner, "you");
    assert.equal(t.youCmp, 11);
    assert.equal(t.youGain, 7);
  });
});

describe("edges", () => {
  it("does not heal a 3 on a tie", () => {
    const t = trick(face(4), face(4));
    assert.equal(t.winner, "tie");
    assert.equal(t.youGain, 0);
    assert.equal(t.rivalGain, 0);
  });

  it("lets 2 steal a trick within two pips, then still takes the shield", () => {
    const t = trick(face(2), face(4));
    assert.equal(t.winner, "you");
    assert.equal(t.youGain, 0);
  });

  it("ties when both sides are 2", () => {
    const t = trick(face(2), face(2));
    assert.equal(t.winner, "tie");
  });

  it("cuts a losing castle after the king takes only the castle", () => {
    const t = trick(face(10), face(8));
    assert.equal(t.youGain, 5);
  });

  it("does not mark a tie, but a losing 1 does", () => {
    const tied = trick(face(1), face(1));
    assert.equal(tied.winner, "tie");
    assert.equal(tied.youPoison, false);
    assert.equal(tied.rivalPoison, false);
    const lost = trick(face(1), face(8));
    assert.equal(lost.winner, "rival");
    assert.equal(lost.rivalPoison, true);
    assert.equal(lost.youPoison, false);
  });

  it("ends only on the written margins", () => {
    assert.equal(shouldEnd(6, 40, 0), false);
    assert.equal(shouldEnd(7, 20, 5), true);
    assert.equal(shouldEnd(7, 20, 6), false);
    assert.equal(shouldEnd(8, 10, 0), true);
    assert.equal(shouldEnd(8, 10, 1), false);
    assert.equal(shouldEnd(9, 1, 1), true);
  });

  it("breaks a drawn match by comparison, then bench", () => {
    assert.equal(
      matchWinner({ youScore: 10, rivalScore: 10, youCmp: 8, rivalCmp: 6, youBench: 1, rivalBench: 9 }),
      "you",
    );
    assert.equal(
      matchWinner({ youScore: 10, rivalScore: 10, youCmp: 4, rivalCmp: 4, youBench: 3, rivalBench: 8 }),
      "rival",
    );
    assert.equal(
      matchWinner({ youScore: 4, rivalScore: 4, youCmp: 2, rivalCmp: 2, youBench: 5, rivalBench: 5 }),
      "tie",
    );
  });

  it("benches a card that never enters the hand or deck", () => {
    const dealt = hiddenOpening(() => 0);
    const cards = [dealt.bench, ...dealt.hand, ...dealt.deck];
    assert.equal(new Set(cards).size, 10);
    assert.equal(dealt.hand.length, 3);
    assert.equal(dealt.deck.length, 6);
    assert.equal(dealt.hand.includes(dealt.bench), false);
    assert.equal(dealt.deck.includes(dealt.bench), false);
  });

  it("follows the cpu habits", () => {
    const rng = () => 0;
    assert.equal(cpuPlay({ hand: [9, 3, 4], deck: [1, 2, 5], seenOpp: [], rng }).original, 4);
    assert.equal(cpuPlay({ hand: [9, 2], deck: [1], seenOpp: [], rng }).original, 9);
    const six = cpuPlay({ hand: [6, 1], deck: [2], seenOpp: [], rng });
    assert.equal(six.original, 6);
    assert.equal(six.asEight, true);
    assert.equal(cpuPlay({ hand: [1, 5], deck: [2, 3], seenOpp: [], rng }).original, 5);
    assert.equal(cpuPlay({ hand: [10, 3], deck: [2], seenOpp: [], rng }).original, 3);
    assert.equal(cpuPlay({ hand: [7, 2], deck: [3], seenOpp: [], rng }).original, 7);
  });

  it("keeps the stamped card out of the bench", () => {
    const dealt = sealMatch(7, () => 0);
    const cards = [dealt.bench, ...dealt.hand, ...dealt.deck];
    assert.equal(dealt.bench === 7, false);
    assert.equal(new Set(cards).size, 10);
    assert.equal([...dealt.hand, ...dealt.deck].includes(7), true);
  });

  it("deals two different effects", () => {
    const [a, b] = offerEffects(() => 0);
    assert.notEqual(a, b);
  });

  it("applies pressure, guts, absorb, insurance, and mist", () => {
    const pressed = trick(face(5), face(6), { youEffect: "pressure" });
    assert.equal(pressed.rivalCmp, 4);
    assert.equal(pressed.winner, "you");

    const late = trick(face(4), face(5), { youEffect: "guts", youUnused: 3 });
    assert.equal(late.youCmp, 6);
    assert.equal(late.winner, "you");
    const early = trick(face(4), face(5), { youEffect: "guts", youUnused: 4 });
    assert.equal(early.winner, "rival");

    const soaked = trick(face(6), face(3), { youEffect: "absorb" });
    assert.equal(soaked.youGain, 12);
    assert.equal(soaked.rivalGain, 6);
    const high = trick(face(8), face(3), { youEffect: "absorb" });
    assert.equal(high.youGain, 14);
    const shielded = trick(face(10), face(4), { youEffect: "absorb" });
    assert.equal(shielded.youGain, 0);

    const insured = trick(face(3), face(6), { youEffect: "insurance" });
    assert.equal(insured.winner, "rival");
    assert.equal(insured.youGain, 8);
    assert.equal(insured.rivalGain, 9);
    const tied = trick(face(4), face(4), { youEffect: "insurance" });
    assert.equal(tied.youGain, 0);

    const mist = trick(face(2), face(8), { youEffect: "mist" });
    assert.equal(mist.winner, "rival");
    assert.equal(mist.rivalPoison, true);
    assert.equal(mist.youMistSpent, true);
    const won = trick(face(8), face(2), { youEffect: "mist" });
    assert.equal(won.winner, "you");
    assert.equal(won.rivalPoison, true);
    const plain = trick(face(2), face(8));
    assert.equal(plain.rivalPoison, false);
    const withThorn = trick(face(1), face(8), { youEffect: "mist" });
    assert.equal(withThorn.rivalPoison, true);
  });

  it("halves the first three tricks but not the flower or the insurance", () => {
    const t = trick(face(8), face(3), { early: true });
    assert.equal(t.youGain, 6);
    assert.equal(t.rivalGain, 6);
    const insured = trick(face(3), face(6), { youEffect: "insurance", early: true });
    assert.equal(insured.winner, "rival");
    assert.equal(insured.rivalGain, 4);
    assert.equal(insured.youGain, 8);
  });

  it("adds the frog boost to the next number, never to 9", () => {
    assert.equal(playCard(8, false, 3, 3, 3).display, 11);
    assert.equal(playCard(9, false, 3, 0, 3).display, 9);
    assert.equal(kingBoost(true, 10, 4, true), 3);
    assert.equal(kingBoost(true, 10, 0, true), 0);
    assert.equal(kingBoost(false, 10, 4, true), 0);
    const shadowed = trick(face(2), face(6), { youEffect: "pressure" });
    assert.equal(shadowed.winner, "you");
  });

  it("drafts the stronger offered effect", () => {
    assert.equal(cpuDraft(["mist", "absorb"]), "absorb");
    assert.equal(cpuDraft(["insurance", "pressure"]), "pressure");
  });
});
