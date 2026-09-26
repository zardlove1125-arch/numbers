export type EffectId = "pressure" | "guts" | "mist" | "absorb" | "insurance";

export const EFFECTS: { id: EffectId; name: string; blurb: string }[] = [
  { id: "pressure", name: "圧迫", blurb: "この札を出したとき、相手の比較 −2" },
  { id: "guts", name: "底力", blurb: "この札を出したとき、未使用3以下なら比較 +2" },
  { id: "mist", name: "毒霧", blurb: "この札を出したとき、相手の次の勝ち-2" },
  { id: "absorb", name: "吸収", blurb: "この札で勝つと、6以下は +3、7以上は +1" },
  { id: "insurance", name: "保険", blurb: "この札で負けたとき、自分 +2" },
];

export function effectName(id: EffectId | null): string {
  return EFFECTS.find((effect) => effect.id === id)?.name ?? "";
}

export type Side = "you" | "rival";

export type CardPlay = { original: number; display: number };

export type Trick = {
  you: CardPlay;
  rival: CardPlay;
  youCmp: number;
  rivalCmp: number;
  winner: Side | "tie";
  trickPoints: number;
  youGain: number;
  rivalGain: number;
  youPoison: boolean;
  rivalPoison: boolean;
  youMistSpent: boolean;
  rivalMistSpent: boolean;
  notes: string[];
};

export const NAMES: Record<number, string> = {
  1: "ポイズンワーム",
  2: "シャドー",
  3: "花の精霊",
  4: "ダイヤモンドクラブ",
  5: "フローフロー",
  6: "魔導士ピエロン",
  7: "リザードマン",
  8: "キャッスルタートル",
  9: "夜の女王",
  10: "オオガエル",
};

export const ROLES: Record<number, string> = {
  1: "棘",
  2: "影",
  3: "芽",
  4: "盾",
  5: "秤",
  6: "面",
  7: "刃",
  8: "城",
  9: "月",
  10: "王",
};

export const SHOUTS: Record<number, string> = {
  1: "ポイズンワーム",
  2: "シャドー",
  3: "花の精霊",
  4: "ダイヤモンドクラブ",
  5: "フローフロー",
  6: "魔導士ピエロン",
  7: "リザードマン",
  8: "キャッスルタートル",
  9: "夜の女王",
  10: "オオガエル",
};

export const RULES: Record<number, string> = {
  1: "10に勝つ。負けると相手の次の勝ち-2",
  2: "差が2以下なら勝つ（変化後の数字で判定）",
  3: "負けると自分+6",
  4: "負けても相手0点（7以外）",
  5: "点は小さい方×2",
  6: "残り4枚以下なら8になれる",
  7: "奇数に+2。4の効果を無視して+3点",
  8: "勝ち+2。負けた時、相手-3",
  9: "残り3枚以下なら+2、点は相手のみ。効果不可",
  10: "点は相手のみ。1に負ける。連勝中の10が点を取ると次+3",
};

export const DETAILS: Record<number, string> = {
  1: "10に勝つ。負けると相手の次の勝ち得点に-2",
  2: "数字の差が2以下なら勝つ（追加効果にも付与される）",
  3: "負けると自分の得点に+6",
  4: "負けても相手の得点0（7以外）",
  5: "この勝負の得点は、出た2枚のうち小さい方の数字×2",
  6: "残り4枚以下なら自身の数字を8に変身できる",
  7: "奇数と勝負するときに+2。4には効果を無視して得点に追加+3",
  8: "勝つと追加+2。負けた時は相手の得点に-3",
  9: "残り3枚以下なら自身の数字を＋2するが、得点は相手の数字のみ。効果カードを付与できない。オオガエルの「次+3」も乗らない。",
  10: "得点は相手の数字のみ。1には負ける。2連勝目にこの10が点を取ると、次に出すナンバーズの自身の数字を+3する。直前の勝負に勝っていて、この10でも1点以上取ったときだけ。4の盾で0点なら不発。9には乗らない。",
};

export function shuffle<T>(list: T[], rng: () => number = Math.random): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = a[i];
    a[i] = a[j]!;
    a[j] = swap!;
  }
  return a;
}

export function unusedCount(hand: number, deck: number): number {
  return hand + deck;
}

export function canSix(hand: number, deck: number): boolean {
  return unusedCount(hand, deck) <= 4;
}

export function canNine(hand: number, deck: number): boolean {
  return unusedCount(hand, deck) <= 3;
}

export function playCard(original: number, asEight: boolean, hand: number, deck: number, boost = 0): CardPlay {
  const morphed = original === 6 && asEight && canSix(hand, deck);
  let display = morphed ? 8 : original;
  if (boost > 0 && original !== 9) display += boost;
  return { original, display };
}

export function kingBoost(wonLast: boolean, card: number, points: number, won: boolean): number {
  return wonLast && won && card === 10 && points >= 1 ? 3 : 0;
}

export function compare(card: CardPlay, oppDisplay: number, nine: boolean): number {
  let value = card.display;
  if (card.original === 7 && oppDisplay % 2 === 1) value += 2;
  if (card.original === 9 && nine) value += 2;
  return value;
}

function decide(you: CardPlay, rival: CardPlay, youCmp: number, rivalCmp: number): Side | "tie" {
  if (you.original === 1 && rival.original === 10) return "you";
  if (rival.original === 1 && you.original === 10) return "rival";
  const diff = Math.abs(youCmp - rivalCmp);
  const youShadow = you.original === 2 && diff <= 2;
  const rivalShadow = rival.original === 2 && diff <= 2;
  if (youShadow && rivalShadow) return "tie";
  if (youShadow) return "you";
  if (rivalShadow) return "rival";
  if (youCmp > rivalCmp) return "you";
  if (rivalCmp > youCmp) return "rival";
  return "tie";
}

export function resolveTrick(args: {
  you: CardPlay;
  rival: CardPlay;
  youNine: boolean;
  rivalNine: boolean;
  youPoison: boolean;
  rivalPoison: boolean;
  youEffect?: EffectId | null;
  rivalEffect?: EffectId | null;
  youUnused?: number;
  rivalUnused?: number;
  youMistArmed?: boolean;
  rivalMistArmed?: boolean;
  early?: boolean;
}): Trick {
  const youEffect = args.youEffect ?? null;
  const rivalEffect = args.rivalEffect ?? null;
  let youCmp = compare(args.you, args.rival.display, args.youNine);
  let rivalCmp = compare(args.rival, args.you.display, args.rivalNine);
  const notes: string[] = [];
  if (youEffect === "guts" && (args.youUnused ?? 9) <= 3) {
    youCmp += 2;
    notes.push("底力+2");
  }
  if (rivalEffect === "guts" && (args.rivalUnused ?? 9) <= 3) {
    rivalCmp += 2;
    notes.push("底力+2");
  }
  if (rivalEffect === "pressure") {
    youCmp -= 2;
    notes.push("圧迫");
  }
  if (youEffect === "pressure") {
    rivalCmp -= 2;
    notes.push("圧迫");
  }
  const winner = decide(args.you, args.rival, youCmp, rivalCmp);
  if (args.you.original === 1 && args.rival.original === 10) notes.push("10に勝つ");
  if (args.rival.original === 1 && args.you.original === 10) notes.push("10に勝つ");
  const shown = Math.abs(youCmp - rivalCmp);
  if ((args.you.original === 2 || args.rival.original === 2) && shown <= 2 && winner !== "tie") {
    notes.push("影");
  }
  if (args.you.original === 7 && args.rival.display % 2 === 1) notes.push("刃+2");
  if (args.rival.original === 7 && args.you.display % 2 === 1) notes.push("刃+2");
  if (args.you.original === 9 && args.youNine) notes.push("月+2");
  if (args.rival.original === 9 && args.rivalNine) notes.push("月+2");

  let points = 0;
  let youGain = 0;
  let rivalGain = 0;
  let youPoison = args.youPoison;
  let rivalPoison = args.rivalPoison;

  if (winner !== "tie") {
    const winCard = winner === "you" ? args.you : args.rival;
    const loseCard = winner === "you" ? args.rival : args.you;
    const winNine = winner === "you" ? args.youNine : args.rivalNine;
    points = winCard.display + loseCard.display;
    if (winCard.original === 10) {
      points = loseCard.display;
      notes.push("王：相手だけ");
    }
    if (winCard.original === 9 && winNine) {
      points = loseCard.display;
      notes.push("月：相手だけ");
    }
    if (winCard.original === 5 || loseCard.original === 5) {
      points = Math.min(winCard.display, loseCard.display) * 2;
      notes.push("秤");
    }
    if (winCard.original === 8) {
      points += 2;
      notes.push("城+2");
    }
    if (loseCard.original === 8) {
      points = Math.max(0, points - 3);
      notes.push("城−3");
    }
    if (winCard.original === 7 && loseCard.original === 4) {
      points += 3;
      notes.push("貫通 +3");
    }
    const winEffect = winner === "you" ? youEffect : rivalEffect;
    if (winEffect === "absorb") {
      const bonus = winCard.original <= 6 ? 3 : 1;
      points += bonus;
      notes.push(bonus === 3 ? "吸収+3" : "吸収+1");
    }
    if (loseCard.original === 4 && winCard.original !== 7) {
      points = 0;
      notes.push("0点");
    }
    if (winner === "you" && youPoison) {
      points = Math.max(0, points - 2);
      youPoison = false;
      notes.push("-2");
    }
    if (winner === "rival" && rivalPoison) {
      points = Math.max(0, points - 2);
      rivalPoison = false;
      notes.push("-2");
    }
    if (args.early) {
      points = Math.floor(points / 2);
      notes.push("半分");
    }
    if (winner === "you") youGain = points;
    else rivalGain = points;
    if (loseCard.original === 3) {
      if (winner === "you") rivalGain += 6;
      else youGain += 6;
      notes.push("芽+6");
    }
    const loseEffect = winner === "you" ? rivalEffect : youEffect;
    if (loseEffect === "insurance") {
      if (winner === "you") rivalGain += 2;
      else youGain += 2;
      notes.push("保険+2");
    }
  }

  let youMistSpent = false;
  let rivalMistSpent = false;
  if (winner === "rival" && args.you.original === 1) {
    rivalPoison = true;
    notes.push("次の勝ち-2");
  }
  if (winner === "you" && args.rival.original === 1) {
    youPoison = true;
    notes.push("次の勝ち-2");
  }
  if (youEffect === "mist") {
    rivalPoison = true;
    youMistSpent = true;
    notes.push("次の勝ち-2");
  }
  if (rivalEffect === "mist") {
    youPoison = true;
    rivalMistSpent = true;
    notes.push("次の勝ち-2");
  }

  return {
    you: args.you,
    rival: args.rival,
    youCmp,
    rivalCmp,
    winner,
    trickPoints: points,
    youGain,
    rivalGain,
    youPoison,
    rivalPoison,
    youMistSpent,
    rivalMistSpent,
    notes,
  };
}

export function shouldEnd(tricks: number, youScore: number, rivalScore: number): boolean {
  if (tricks < 6) return false;
  if (tricks >= 9) return true;
  const diff = Math.abs(youScore - rivalScore);
  if (tricks === 7 && diff >= 15) return true;
  if (tricks === 8 && diff >= 10) return true;
  return false;
}

export function matchWinner(args: {
  youScore: number;
  rivalScore: number;
  youCmp: number;
  rivalCmp: number;
  youBench: number;
  rivalBench: number;
}): Side | "tie" {
  if (args.youScore !== args.rivalScore) return args.youScore > args.rivalScore ? "you" : "rival";
  if (args.youCmp !== args.rivalCmp) return args.youCmp > args.rivalCmp ? "you" : "rival";
  if (args.youBench !== args.rivalBench) return args.youBench > args.rivalBench ? "you" : "rival";
  return "tie";
}

export function offerEffects(rng: () => number = Math.random): [EffectId, EffectId] {
  const deck = shuffle(
    EFFECTS.map((effect) => effect.id),
    rng,
  );
  return [deck[0]!, deck[1]!];
}

export function sealMatch(
  stamp: number,
  rng: () => number = Math.random,
): { bench: number; hand: number[]; deck: number[] } {
  const others = shuffle(
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((n) => n !== stamp),
    rng,
  );
  const bench = others.pop()!;
  const pool = shuffle([stamp, ...others], rng);
  const hand = [pool.pop()!, pool.pop()!, pool.pop()!];
  return { bench, hand, deck: pool };
}

const EFFECT_RANK: Record<EffectId, number> = {
  pressure: 5,
  absorb: 4,
  guts: 3,
  insurance: 2,
  mist: 1,
};

const STAMP_FIT: Record<EffectId, number[]> = {
  pressure: [7, 8, 9],
  guts: [9, 6],
  mist: [1, 2, 4],
  absorb: [6, 5],
  insurance: [1, 3, 4],
};

export function cpuDraft(offered: EffectId[]): EffectId {
  return [...offered].sort((a, b) => EFFECT_RANK[b] - EFFECT_RANK[a])[0]!;
}

export function cpuStamp(effect: EffectId, rng: () => number = Math.random): number {
  const picks = STAMP_FIT[effect];
  return picks[Math.floor(rng() * picks.length)]!;
}

export function hiddenOpening(rng: () => number = Math.random): {
  bench: number;
  hand: number[];
  deck: number[];
} {
  const deck = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], rng);
  const bench = deck.pop()!;
  const hand = [deck.pop()!, deck.pop()!, deck.pop()!];
  return { bench, hand, deck };
}

export function drawOne(hand: number[], deck: number[]): { hand: number[]; deck: number[] } {
  if (deck.length === 0) return { hand: [...hand], deck: [] };
  const next = [...deck];
  return { hand: [...hand, next.pop()!], deck: next };
}

export function cpuPlay(args: {
  hand: number[];
  deck: number[];
  seenOpp: number[];
  rng?: () => number;
}): { original: number; asEight: boolean } {
  const unseen = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (const n of args.seenOpp) unseen.delete(n);
  const has = (n: number) => unseen.has(n);
  const left = unusedCount(args.hand.length, args.deck.length);
  const rng = args.rng ?? Math.random;
  let best = args.hand[0]!;
  let bestScore = -Infinity;
  for (const card of args.hand) {
    let score = card * 0.4 + rng() * 0.3;
    if (card === 9 && left > 3) score -= 30;
    if (card === 9 && left <= 3) score += 18;
    if (card === 1 && has(10)) score -= 24;
    if (card === 1 && !has(10)) score += 4;
    if (card === 10 && has(1)) score -= 20;
    if (card === 10 && !has(1)) score += 10;
    if (card === 4 && (has(8) || has(9) || has(10))) score += 16;
    if (card === 7 && has(4)) score += 16;
    if (card === 6 && left <= 4) score += 12;
    if (score > bestScore) {
      bestScore = score;
      best = card;
    }
  }
  return { original: best, asEight: best === 6 && left <= 4 };
}
