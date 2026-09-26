import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Monster, PixelBack, PoisonDrop, RoleIcon } from "@/components/PixelMon";
import {
  DETAILS,
  EFFECTS,
  NAMES,
  RULES,
  SHOUTS,
  canNine,
  canSix,
  cpuDraft,
  cpuPlay,
  cpuStamp,
  drawOne,
  effectName,
  kingBoost,
  matchWinner,
  offerEffects,
  playCard,
  resolveTrick,
  sealMatch,
  shouldEnd,
  unusedCount,
  type CardPlay,
  type EffectId,
  type Trick,
} from "@/game/agefuda/logic";
import {
  EMPTY_COLLECTION,
  RARITIES,
  cashFragments,
  equip,
  pull,
  skinId,
  unequip,
  type Collection,
  type Pull,
  type Rarity,
} from "@/game/agefuda/skins";

type Phase = "title" | "draft" | "stamp" | "handoff" | "play" | "reveal" | "over" | "gacha" | "dex" | "deck" | "rules" | "cast";
type Mode = "ai" | "pvp";
type Pile = {
  bench: number | null;
  hand: number[];
  deck: number[];
  discard: CardPlay[];
  score: number;
  poison: boolean;
  effect: EffectId | null;
  stamp: number | null;
  mistUsed: boolean;
  wonLast: boolean;
  boost: number;
};
type Handoff = { title: string; body: string; next: string; go: "draft1" | "play0" | "play1" };
type Record = { v: 1; win: number; lose: number; draw: number; muted: boolean };

const RECORD_KEY = "numbers-v1";
const SKIN_KEY = "numbers-skins-v1";
const EquipCtx = createContext<Collection["equipped"]>({});
const EMPTY_RECORD: Record = { v: 1, win: 0, lose: 0, draw: 0, muted: false };
const press = "transition-transform duration-150 ease-out active:not-disabled:scale-[0.96]";
const btn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-2 text-base font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-40";

function emptyPile(): Pile {
  return { bench: null, hand: [], deck: [], discard: [], score: 0, poison: false, effect: null, stamp: null, mistUsed: false, wonLast: false, boost: 0 };
}

function drop(hand: number[], card: number): number[] {
  const index = hand.indexOf(card);
  if (index < 0) return hand;
  return hand.filter((_, i) => i !== index);
}

function cloneCollection(collection: Collection): Collection {
  return {
    tickets: collection.tickets || 0,
    fragments: collection.fragments || 0,
    owned: [...(collection.owned ?? [])],
    equipped: { ...(collection.equipped ?? {}) },
  };
}

function loadCollection(): Collection {
  try {
    const raw = localStorage.getItem(SKIN_KEY);
    if (!raw) return cloneCollection(EMPTY_COLLECTION);
    const parsed = JSON.parse(raw) as Collection;
    if (!parsed || !Array.isArray(parsed.owned)) return cloneCollection(EMPTY_COLLECTION);
    return cloneCollection(parsed);
  } catch {
    return cloneCollection(EMPTY_COLLECTION);
  }
}

function saveCollection(next: Collection): Collection {
  const previous = loadCollection();
  const dropped = previous.owned.some((id) => !next.owned.includes(id));
  if (dropped) return previous;
  const stored = cloneCollection(next);
  localStorage.setItem(SKIN_KEY, JSON.stringify(stored));
  return stored;
}

function loadRecord(): Record {
  try {
    const raw = localStorage.getItem(RECORD_KEY);
    if (!raw) return EMPTY_RECORD;
    const parsed = JSON.parse(raw) as Partial<Record>;
    if (parsed.v !== 1) return EMPTY_RECORD;
    return {
      v: 1,
      win: parsed.win ?? 0,
      lose: parsed.lose ?? 0,
      draw: parsed.draw ?? 0,
      muted: parsed.muted ?? false,
    };
  } catch {
    return EMPTY_RECORD;
  }
}

function saveRecord(record: Record) {
  localStorage.setItem(RECORD_KEY, JSON.stringify(record));
}

let audioCtx: AudioContext | null = null;

function tone(freq: number, dur: number, muted: boolean) {
  if (muted) return;
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + dur);
}

let bgmTimer: number | null = null;
let bgmLive = false;

function ensureCtx(): AudioContext | null {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

function blip(freq: number, dur: number, type: OscillatorType, vol: number, when = 0) {
  const ctx = ensureCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + when);
  const start = ctx.currentTime + when;
  gain.gain.setValueAtTime(vol, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function burst(dur: number, vol: number, freq: number) {
  const ctx = ensureCtx();
  if (!ctx) return;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.value = vol;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  src.start();
}

const BGM_LEAD = [329.63, 392, 493.88, 392, 349.23, 440, 523.25, 440, 293.66, 349.23, 440, 349.23, 329.63, 415.3, 493.88, 392];
const BGM_BASS = [82.41, 0, 82.41, 0, 87.31, 0, 87.31, 0, 98, 0, 98, 0, 73.42, 0, 73.42, 0];

function startBgm() {
  if (bgmLive) return;
  if (!ensureCtx()) return;
  bgmLive = true;
  let step = 0;
  bgmTimer = window.setInterval(() => {
    if (!bgmLive) return;
    const index = step % BGM_LEAD.length;
    blip(BGM_LEAD[index]!, 0.11, "square", 0.016);
    if (BGM_BASS[index]) blip(BGM_BASS[index]!, 0.16, "triangle", 0.028);
    step += 1;
  }, 176);
}

function stopBgm() {
  bgmLive = false;
  if (bgmTimer != null) window.clearInterval(bgmTimer);
  bgmTimer = null;
}

function sfxPull() {
  blip(220, 0.08, "square", 0.045);
  blip(440, 0.1, "square", 0.04, 0.07);
  blip(660, 0.14, "square", 0.04, 0.14);
}

function sfxOpen() {
  burst(0.28, 0.06, 220);
  blip(90, 0.32, "sawtooth", 0.03);
  blip(150, 0.18, "triangle", 0.04, 0.1);
}

function sfxCut() {
  blip(880, 0.07, "square", 0.05);
  blip(1174, 0.09, "square", 0.05, 0.06);
  blip(1568, 0.16, "square", 0.045, 0.12);
}

function sfxBreak() {
  burst(0.22, 0.07, 980);
  blip(260, 0.12, "sawtooth", 0.04);
  blip(70, 0.3, "triangle", 0.05, 0.06);
}

const GLYPH: { [name: string]: string } = { 圧迫: "圧", 底力: "底", 毒霧: "霧", 吸収: "吸", 保険: "保" };

function Paper(props: {
  value: number;
  selected?: boolean;
  disabled?: boolean;
  badge?: string;
  open?: boolean;
  tight?: boolean;
  brief?: boolean;
  read?: boolean;
  display?: number;
  stock?: boolean;
  break?: boolean;
  onClick?: () => void;
}) {
  const shown = props.display ?? props.value;
  const equipped = useContext(EquipCtx);
  const className = `duel-card ${press} ${props.selected ? "is-pick" : ""} ${props.tight ? "is-tight" : ""} ${
    props.brief ? "is-brief" : ""
  } ${props.read ? "is-read" : ""} ${props.disabled ? "opacity-40" : ""}`;
  const body = (
    <>
      <span className="duel-num font-display">{shown}</span>
      {props.badge ? <span className="duel-seal">{GLYPH[props.badge] ?? props.badge}</span> : null}
      <span className={`duel-mon${props.break ? " is-break" : ""}`}>
        <Monster
          id={props.value}
          scale={props.tight ? 2 : 3}
          open={props.open}
          rarity={props.stock ? "N" : equipped[props.value]}
        />
      </span>
      <span className="duel-foot">
        <RoleIcon id={props.value} />
      </span>
      <span className="duel-rule">{RULES[props.value]}</span>
    </>
  );
  if (!props.onClick) {
    return (
      <div className={className} aria-hidden>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      aria-label={`${props.value} ${RULES[props.value]}`}
      className={className}
    >
      {body}
    </button>
  );
}

export function Agefuda() {
  const [phase, setPhase] = useState<Phase>("title");
  const [mode, setMode] = useState<Mode>("ai");
  const [seat, setSeat] = useState<0 | 1>(0);
  const [piles, setPiles] = useState<[Pile, Pile]>([emptyPile(), emptyPile()]);
  const [selected, setSelected] = useState<number | null>(null);
  const [asEight, setAsEight] = useState<boolean | null>(null);
  const [offer, setOffer] = useState<EffectId[]>([]);
  const [offers, setOffers] = useState<[EffectId[], EffectId[]]>([[], []]);
  const [focusEffect, setFocusEffect] = useState<EffectId | null>(null);
  const [offerShown, setOfferShown] = useState(false);
  const [chart, setChart] = useState(false);
  const [locked, setLocked] = useState<[number | null, number | null]>([null, null]);
  const [lockedMorph, setLockedMorph] = useState<[boolean, boolean]>([false, false]);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [dealtSeat, setDealtSeat] = useState<[boolean, boolean]>([false, false]);
  const [dealing, setDealing] = useState(false);
  const [dealCount, setDealCount] = useState(0);
  const [justDrawn, setJustDrawn] = useState<[number | null, number | null]>([null, null]);
  const [tricks, setTricks] = useState(0);
  const [pending, setPending] = useState<Trick | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [log, setLog] = useState<Trick[]>([]);
  const [record, setRecord] = useState<Record>(EMPTY_RECORD);
  const [collection, setCollection] = useState<Collection>(EMPTY_COLLECTION);
  const [ticketNote, setTicketNote] = useState(false);
  const [result, setResult] = useState<Pull | null>(null);
  const [beat, setBeat] = useState<"hold" | "door" | "cut" | "open" | "emerge" | "eyes" | "body">("hold");
  const [gate, setGate] = useState<"red" | "gold" | "black" | "void">("red");
  const [rise, setRise] = useState<"gold" | "void" | null>(null);
  const revealedRef = useRef(false);
  const savedRef = useRef(false);
  const pullTimers = useRef<number[]>([]);

  useEffect(() => {
    const sync = () => {
      setRecord(loadRecord());
      setCollection(loadCollection());
    };
    sync();
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  useEffect(() => {
    if (phase !== "draft") return;
    setOfferShown(false);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setOfferShown(true);
      return;
    }
    const id = window.setTimeout(() => setOfferShown(true), 1100);
    return () => window.clearTimeout(id);
  }, [phase, seat]);

  useEffect(() => {
    if (!dealing) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setDealCount(3);
      setDealing(false);
      return;
    }
    setDealCount(0);
    const steps = [720, 1180, 1640].map((ms, index) =>
      window.setTimeout(() => setDealCount(index + 1), ms),
    );
    const end = window.setTimeout(() => setDealing(false), 2000);
    return () => {
      steps.forEach((id) => window.clearTimeout(id));
      window.clearTimeout(end);
    };
  }, [dealing]);

  useEffect(() => {
    const battle = phase === "play" || phase === "reveal";
    if (battle && !record.muted) startBgm();
    else stopBgm();
  }, [phase, record.muted]);

  useEffect(() => () => stopBgm(), []);

  useEffect(() => {
    if (record.muted) return;
    if (beat === "open") sfxOpen();
    if (beat === "cut") sfxCut();
  }, [beat, record.muted]);

  function unlock() {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
  }

  function armReveal() {
    revealedRef.current = false;
    setRevealed(false);
  }

  function markRevealed() {
    if (revealedRef.current || !pending) return;
    revealedRef.current = true;
    setRevealed(true);
    const muted = record.muted;
    if (pending.winner === "you") tone(520, 0.16, muted);
    else if (pending.winner === "rival") tone(180, 0.18, muted);
    else tone(320, 0.12, muted);
    if (!muted && pending.winner !== "tie") sfxBreak();
  }

  function begin(next: Mode) {
    unlock();
    savedRef.current = false;
    setTicketNote(false);
    setMode(next);
    setSeat(0);
    setPiles([emptyPile(), emptyPile()]);
    setSelected(null);
    setAsEight(null);
    setFocusEffect(null);
    const dealt: [EffectId[], EffectId[]] = [offerEffects(), offerEffects()];
    setOffers(dealt);
    setOffer(dealt[0]);
    setLocked([null, null]);
    setLockedMorph([false, false]);
    setDealtSeat([false, false]);
    setDealing(false);
    setTricks(0);
    setPending(null);
    setLog([]);
    setJustDrawn([null, null]);
    armReveal();
    setPhase("draft");
  }

  function confirmEffect() {
    if (!focusEffect) return;
    const next = [{ ...piles[0] }, { ...piles[1] }] as [Pile, Pile];
    next[seat] = { ...next[seat], effect: focusEffect };
    setPiles(next);
    setSelected(null);
    setPhase("stamp");
  }

  function confirmStamp() {
    if (selected == null || selected === 9) return;
    const next = [{ ...piles[0] }, { ...piles[1] }] as [Pile, Pile];
    next[seat] = { ...next[seat], stamp: selected };
    if (mode === "ai") {
      const yours = sealMatch(selected);
      const cpuEffect = cpuDraft(offers[1]);
      const cpuCard = cpuStamp(cpuEffect);
      const theirs = sealMatch(cpuCard);
      setPiles([
        { ...emptyPile(), ...yours, effect: next[0].effect, stamp: selected },
        { ...emptyPile(), ...theirs, effect: cpuEffect, stamp: cpuCard },
      ]);
      setSelected(null);
      setFocusEffect(null);
      setDealtSeat([true, true]);
      setDealCount(0);
      setDealing(true);
      setPhase("play");
      return;
    }
    if (seat === 0) {
      setPiles(next);
      setSelected(null);
      setHandoff({
        title: "2Pに渡して",
        body: "1Pの効果は見えない。",
        next: "2Pが効果を選ぶ",
        go: "draft1",
      });
      setPhase("handoff");
      return;
    }
    const yours = sealMatch(next[0].stamp!);
    const theirs = sealMatch(selected);
    setPiles([
      { ...emptyPile(), ...yours, effect: next[0].effect, stamp: next[0].stamp },
      { ...emptyPile(), ...theirs, effect: next[1].effect, stamp: selected },
    ]);
    setSelected(null);
    setDealtSeat([false, false]);
    setHandoff({
      title: "1Pの番",
      body: "ベンチは両方とも伏せてある。2Pは画面を見ない。",
      next: "手札を見る",
      go: "play0",
    });
    setPhase("handoff");
  }

  function openSeat(who: 0 | 1) {
    setSeat(who);
    setSelected(null);
    setAsEight(null);
    if (!dealtSeat[who]) {
      setDealtSeat((prev) => {
        const next: [boolean, boolean] = [prev[0], prev[1]];
        next[who] = true;
        return next;
      });
      setDealCount(0);
      setDealing(true);
    }
    setPhase("play");
  }

  function acceptHandoff() {
    if (!handoff) return;
    if (handoff.go === "draft1") {
      setSeat(1);
      setOffer(offers[1]);
      setFocusEffect(null);
      setSelected(null);
      setPhase("draft");
      return;
    }
    if (handoff.go === "play0") openSeat(0);
    if (handoff.go === "play1") openSeat(1);
  }

  function resolvePair(youValue: number, youEight: boolean, rivalValue: number, rivalEight: boolean) {
    const you = piles[0];
    const rival = piles[1];
    const trick = resolveTrick({
      you: playCard(youValue, youEight, you.hand.length, you.deck.length, you.boost),
      rival: playCard(rivalValue, rivalEight, rival.hand.length, rival.deck.length, rival.boost),
      youNine: youValue === 9 && canNine(you.hand.length, you.deck.length),
      rivalNine: rivalValue === 9 && canNine(rival.hand.length, rival.deck.length),
      youPoison: you.poison,
      rivalPoison: rival.poison,
      youEffect: you.stamp === youValue ? you.effect : null,
      rivalEffect: rival.stamp === rivalValue ? rival.effect : null,
      youUnused: unusedCount(you.hand.length, you.deck.length),
      rivalUnused: unusedCount(rival.hand.length, rival.deck.length),
      youMistArmed: you.effect === "mist" && !you.mistUsed,
      rivalMistArmed: rival.effect === "mist" && !rival.mistUsed,
      early: tricks < 3,
    });
    setPiles([
      { ...you, hand: drop(you.hand, youValue) },
      { ...rival, hand: drop(rival.hand, rivalValue) },
    ]);
    setPending(trick);
    armReveal();
    setSelected(null);
    setAsEight(null);
    setPhase("reveal");
  }

  function commit() {
    const mine = piles[seat];
    if (selected == null || dealing || pending) return;
    if (!mine.hand.includes(selected)) return;
    const morphable = selected === 6 && canSix(mine.hand.length, mine.deck.length);
    if (morphable && asEight == null) return;
    const eight = morphable && asEight === true;
    if (mode === "ai") {
      const cpu = cpuPlay({
        hand: piles[1].hand,
        deck: piles[1].deck,
        seenOpp: piles[0].discard.map((card) => card.original),
      });
      resolvePair(selected, eight, cpu.original, cpu.asEight);
      return;
    }
    const nextLocked: [number | null, number | null] = [locked[0], locked[1]];
    const nextMorph: [boolean, boolean] = [lockedMorph[0], lockedMorph[1]];
    nextLocked[seat] = selected;
    nextMorph[seat] = eight;
    setLocked(nextLocked);
    setLockedMorph(nextMorph);
    setSelected(null);
    setAsEight(null);
    if (seat === 0) {
      setHandoff({
        title: "2Pの番",
        body: "1Pは画面を見ない。",
        next: "手札を見る",
        go: "play1",
      });
      setPhase("handoff");
      return;
    }
    const first = nextLocked[0];
    const second = nextLocked[1];
    if (first == null || second == null) return;
    resolvePair(first, nextMorph[0], second, nextMorph[1]);
    setLocked([null, null]);
    setLockedMorph([false, false]);
  }

  function advance() {
    if (!pending || !revealed) return;
    const trick = pending;
    const drawn: [number | null, number | null] = [null, null];
    const nextBoost: [number, number] = [
      kingBoost(piles[0].wonLast, trick.you.original, trick.youGain, trick.winner === "you"),
      kingBoost(piles[1].wonLast, trick.rival.original, trick.rivalGain, trick.winner === "rival"),
    ];
    const next = piles.map((pile, index) => {
      const gain = index === 0 ? trick.youGain : trick.rivalGain;
      const played = index === 0 ? trick.you : trick.rival;
      const refill = drawOne(pile.hand, pile.deck);
      drawn[index as 0 | 1] = refill.hand.find((value) => !pile.hand.includes(value)) ?? null;
      return {
        ...pile,
        score: pile.score + gain,
        poison: index === 0 ? trick.youPoison : trick.rivalPoison,
        mistUsed: pile.mistUsed || (index === 0 ? trick.youMistSpent : trick.rivalMistSpent),
        discard: [...pile.discard, played],
        hand: refill.hand,
        deck: refill.deck,
        wonLast: trick.winner === (index === 0 ? "you" : "rival"),
        boost: nextBoost[index as 0 | 1],
      };
    }) as [Pile, Pile];
    const done = tricks + 1;
    setPiles(next);
    setTricks(done);
    setLog((prev) => [...prev, trick]);
    setPending(null);
    setJustDrawn(drawn);
    if (shouldEnd(done, next[0].score, next[1].score)) {
      setPhase("over");
      if (mode === "ai" && !savedRef.current) {
        savedRef.current = true;
        const outcome = matchWinner({
          youScore: next[0].score,
          rivalScore: next[1].score,
          youCmp: trick.youCmp,
          rivalCmp: trick.rivalCmp,
          youBench: next[0].bench ?? 0,
          rivalBench: next[1].bench ?? 0,
        });
        const saved = loadRecord();
        if (outcome === "you") {
          saved.win += 1;
          const current = loadCollection();
          setCollection(
            saveCollection({ ...current, tickets: current.tickets + 1 }),
          );
          setTicketNote(true);
        } else if (outcome === "rival") saved.lose += 1;
        else saved.draw += 1;
        saved.muted = record.muted;
        saveRecord(saved);
        setRecord(saved);
      }
      return;
    }
    if (mode === "pvp") {
      setHandoff({ title: "1Pの番", body: "2Pは画面を見ない。", next: "手札を見る", go: "play0" });
      setPhase("handoff");
      return;
    }
    setPhase("play");
  }

  function toggleMute() {
    const next = { ...record, muted: !record.muted };
    setRecord(next);
    saveRecord(next);
  }

  const viewer = piles[seat];
  const youName = mode === "pvp" ? "1P" : "あなた";
  const rivalName = mode === "pvp" ? "2P" : "Numbersマスター";
  const morphable = phase === "play" && selected === 6 && canSix(viewer.hand.length, viewer.deck.length);
  const last = log[log.length - 1];
  const outcome =
    phase === "over" && last
      ? matchWinner({
          youScore: piles[0].score,
          rivalScore: piles[1].score,
          youCmp: last.youCmp,
          rivalCmp: last.rivalCmp,
          youBench: piles[0].bench ?? 0,
          rivalBench: piles[1].bench ?? 0,
        })
      : null;

  useEffect(() => {
    if (phase !== "play" && phase !== "reveal" && phase !== "stamp") return;
    function onKey(e: KeyboardEvent) {
      if (phase === "reveal") {
        if (e.key === "Enter" && revealed) advance();
        return;
      }
      if (phase === "stamp") {
        const n = e.key === "0" ? 10 : Number(e.key);
        if (n >= 1 && n <= 10) setSelected(n);
        if (e.key === "Enter") confirmStamp();
        return;
      }
      if (dealing) return;
      if (e.key === "Enter") {
        commit();
        return;
      }
      const n = e.key === "0" ? 10 : Number(e.key);
      if (viewer.hand.includes(n)) {
        setSelected(n);
        setAsEight(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <EquipCtx.Provider value={collection.equipped}>
    <div className="agefuda h-dvh overflow-y-auto bg-bg text-fg">
      {phase === "title" && (
        <main className="title-boot mx-auto flex min-h-dvh max-w-lg flex-col justify-between px-5 py-8">
          <p className="title-status">ONLINE</p>
          <h1 className="title-word">Numbers</h1>
          {(new Set(collection.owned).size >= 50 || record.win >= 100) && (
            <div className="title-hail">
              {new Set(collection.owned).size >= 50 && <p>【ナンバーズコレクター様おかえりなさい！！】</p>}
              {record.win >= 100 && <p>【ナンバーズマスター様おかえりなさい！！】</p>}
            </div>
          )}
          <div className="relative z-10 flex flex-col gap-3">
            <button type="button" className={`${btn} ${press} title-go`} onClick={() => begin("ai")}>
              Numbersマスターと対戦
            </button>
            <button
              type="button"
              className={`${btn} ${press} title-alt`}
              onClick={() => begin("pvp")}
            >
              2人で対戦
            </button>
            <p className="text-sm text-[#7d8b86]">
              戦績 {record.win}勝 {record.lose}敗 {record.draw}分
            </p>
            <p className="text-sm text-[#d7fff2]">
              チケット {collection.tickets}　カケラ {collection.fragments}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={`${btn} ${press} title-alt`} onClick={() => setPhase("cast")}>
                排出一覧
              </button>
              <button type="button" className={`${btn} ${press} title-alt`} onClick={() => setPhase("gacha")}>
                ガチャ
              </button>
              <button type="button" className={`${btn} ${press} title-alt`} onClick={() => setPhase("dex")}>
                図鑑
              </button>
              <button type="button" className={`${btn} ${press} title-alt`} onClick={() => setPhase("deck")}>
                デッキ
              </button>
              <button type="button" className={`${btn} ${press} title-alt`} onClick={() => setPhase("rules")}>
                ルール
              </button>
            </div>
          </div>
        </main>
      )}

      {phase === "rules" && (
        <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 px-4 py-5">
          <h2 className="font-display text-4xl leading-none">ルール</h2>
          <section className="border border-line bg-surface px-3 py-3">
            <h3 className="font-bold">勝負</h3>
            <ul className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-muted">
              <li>1〜10を1枚ずつ持つ。1枚はベンチで、その試合では使わない。</li>
              <li>残りを切って3枚を手札にする。2人同時に1枚出す。</li>
              <li>基本は数字が大きい方が勝つ。得点は出した数字の合計。</li>
              <li>1〜3トリックは、勝った得点だけ半分（切り捨て）。花の精霊の+6と保険の+2は半分にしない。</li>
              <li>7トリックで点差15、8トリックで点差10なら終了。なければ9トリック。</li>
              <li>同点なら最後の比較値、それでも同じならベンチの数字で決める。</li>
            </ul>
          </section>
          <section className="border border-line bg-surface px-3 py-3">
            <h3 className="font-bold">付与</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              それぞれ5種から2種配られ、1つを選んで好きな札に付ける。付けた札以外から1枚がベンチになる。
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {EFFECTS.map((effect) => (
                <li key={effect.id} className="text-sm leading-relaxed">
                  <span className="font-bold text-[#ffe14a]">{effect.name}</span>
                  <span className="text-muted">　{effect.blurb}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="font-bold">1〜10</h3>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
              <div key={value} className="flex items-center gap-3 border border-line bg-surface px-2 py-2">
                <Monster id={value} scale={3} />
                <div className="min-w-0">
                  <p className="font-bold">
                    {value} {NAMES[value]}
                  </p>
                  <p className="text-sm leading-relaxed text-muted">{DETAILS[value]}</p>
                </div>
              </div>
            ))}
          </section>
          <button type="button" className={`${btn} ${press} bg-gold text-bg`} onClick={() => setPhase("title")}>
            戻る
          </button>
        </main>
      )}

      {phase === "draft" && (
        <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 py-5">
          <p className="text-sm font-bold text-gold">{mode === "pvp" ? (seat === 0 ? "1Pの効果" : "2Pの効果") : "効果"}</p>
          <h2 className="mt-2 font-display text-4xl leading-none">1枚選択してください</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">5種から2種配られた。1つ選ぶ。</p>
          {!offerShown ? (
            <div className="mt-6 flex flex-col items-center gap-3">
              <p className="font-bold">5種を切っています</p>
              <div className="flex justify-center gap-2">
                {[0, 1, 2, 3, 4].map((index) => (
                  <div key={index} className="agefuda-shuffle" style={{ animationDelay: `${index * 70}ms` }}>
                    <PixelBack scale={2} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {offer.map((id) => {
                const info = EFFECTS.find((effect) => effect.id === id);
                if (!info) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFocusEffect(id)}
                    className={`agefuda-deal ${press} border border-line bg-surface px-4 py-4 text-left ${
                      focusEffect === id ? "outline-2 outline-offset-2 outline-gold" : ""
                    }`}
                  >
                    <span className="block font-display text-3xl leading-none text-[#ffe14a]">{info.name}</span>
                    <span className="mt-2 block text-sm leading-relaxed">{info.blurb}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="sticky bottom-0 mt-auto flex gap-2 bg-bg py-3">
            <button type="button" className={`${btn} ${press} border border-line bg-surface`} onClick={() => setChart(true)}>
              効果表
            </button>
            <button
              type="button"
              disabled={!offerShown || focusEffect == null}
              className={`${btn} ${press} flex-1 bg-gold text-bg`}
              onClick={confirmEffect}
            >
              {!offerShown ? "配っています" : focusEffect == null ? "効果を選ぶ" : `${effectName(focusEffect)}にする`}
            </button>
          </div>
        </main>
      )}

      {phase === "stamp" && (
        <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 py-5">
          <p className="text-sm font-bold text-gold">{effectName(piles[seat].effect)}</p>
          <h2 className="mt-2 font-display text-4xl leading-none">札に付ける</h2>
          <p className="mt-2 text-base leading-relaxed">{EFFECTS.find((effect) => effect.id === piles[seat].effect)?.blurb}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">この札以外から、1枚がベンチに行く。夜の女王には付けられない。</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
              <Paper
                key={value}
                value={value}
                read
                disabled={value === 9}
                selected={selected === value}
                onClick={() => {
                  if (value === 9) return;
                  setSelected(value);
                }}
              />
            ))}
          </div>
          <div className="sticky bottom-0 mt-auto flex gap-2 bg-bg py-3">
            <button type="button" className={`${btn} ${press} border border-line bg-surface`} onClick={() => setChart(true)}>
              効果表
            </button>
            <button
              type="button"
              disabled={selected == null}
              className={`${btn} ${press} flex-1 bg-gold text-bg`}
              onClick={confirmStamp}
            >
              {selected == null ? "札を選ぶ" : `${selected}に付ける`}
            </button>
          </div>
        </main>
      )}

      {phase === "handoff" && handoff && (
        <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-5 py-10">
          <p className="text-sm font-bold tracking-widest text-gold">2人対戦</p>
          <h2 className="font-display text-5xl leading-none">{handoff.title}</h2>
          <p className="max-w-sm text-base leading-relaxed">{handoff.body}</p>
          <button type="button" className={`${btn} ${press} bg-gold text-bg`} onClick={acceptHandoff}>
            {handoff.next}
          </button>
        </main>
      )}

      {phase === "play" && (
        <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pb-4 pt-24">
          <Scores
            leftName={youName}
            rightName={rivalName}
            left={piles[0]}
            right={piles[1]}
            muted={record.muted}
            onMute={toggleMute}
          />
          <p className="mt-1 text-center text-[11px] text-muted">1〜3試合目の得点は半分</p>
          <p className="mt-3 text-center text-sm font-bold">
            第{tricks + 1}トリック
            <span className="ml-3 text-muted">未使用 {unusedCount(viewer.hand.length, viewer.deck.length)}</span>
          </p>
          <DiscardRow youName={youName} rivalName={rivalName} you={piles[0].discard} rival={piles[1].discard} />
          <p className="mt-2 flex justify-center gap-4 text-center text-xs text-muted">
            <span>
              {youName} <span className="text-[#ffe14a]">{effectName(piles[0].effect)}</span>
            </span>
            <span>
              {rivalName} <span className="text-[#ffe14a]">{effectName(piles[1].effect)}</span>
            </span>
          </p>
          <section className="mt-3 rounded-2xl border border-line bg-surface px-3 py-3" aria-live="polite">
            {dealing && dealCount === 0 ? (
              <div className="flex flex-col items-center gap-2 py-2">
                <div className="agefuda-shuffle grid h-20 w-16 place-items-center border border-line bg-[#102033]">
                  <PixelBack scale={3} />
                </div>
                <p className="font-bold">シャッフル</p>
              </div>
            ) : selected == null ? (
              <p className="py-3 text-center font-bold">{dealing ? "配っています" : "出す札を選ぶ"}</p>
            ) : (
              <div className="text-center">
                <p className="font-display text-3xl leading-none">{SHOUTS[selected]}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{DETAILS[selected]}</p>
                {selected === viewer.stamp && (
                  <p className="mt-1 text-sm font-bold text-[#ffe14a]">{effectName(viewer.effect)}</p>
                )}
              </div>
            )}
            {morphable && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`${press} min-h-11 rounded-xl border text-sm font-bold ${
                    asEight === false ? "border-gold bg-bg text-coral" : "border-line"
                  }`}
                  onClick={() => setAsEight(false)}
                >
                  6のまま
                </button>
                <button
                  type="button"
                  className={`${press} min-h-11 rounded-xl border text-sm font-bold ${
                    asEight === true ? "border-gold bg-bg text-coral" : "border-line"
                  }`}
                  onClick={() => setAsEight(true)}
                >
                  8扱い
                </button>
              </div>
            )}
          </section>
          <div className="mt-3 grid grid-cols-3 items-stretch gap-2 pt-2">
            {(dealing ? viewer.hand.slice(0, dealCount) : viewer.hand).map((value) => (
              <div key={value} className={`h-full ${justDrawn[seat] === value || dealing ? "agefuda-deal" : ""}`}>
                <Paper
                  value={value}
                  badge={value === viewer.stamp ? effectName(viewer.effect) : undefined}
                  open={
                    (value === 6 && canSix(viewer.hand.length, viewer.deck.length)) ||
                    (value === 9 && canNine(viewer.hand.length, viewer.deck.length))
                  }
                  selected={selected === value}
                  disabled={dealing}
                  onClick={() => {
                    setSelected(value);
                    setAsEight(null);
                  }}
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-sm font-bold text-muted">
            山 {viewer.deck.length + (dealing ? Math.max(0, 3 - dealCount) : 0)}
          </p>
          <div className="sticky bottom-0 mt-auto flex gap-2 bg-bg py-3">
            <button type="button" className={`${btn} ${press} border border-line bg-surface`} onClick={() => setChart(true)}>
              効果表
            </button>
            <button
              type="button"
              disabled={dealing || selected == null || (morphable && asEight == null)}
              className={`${btn} ${press} flex-1 bg-gold text-bg`}
              onClick={commit}
            >
              {morphable && asEight === true
                ? "8扱いで出す"
                : morphable && asEight === false
                  ? "6のまま出す"
                  : "この札で出す"}
            </button>
          </div>
        </main>
      )}

      {phase === "reveal" && pending && (
        <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pb-4 pt-24">
          <Scores
            leftName={youName}
            rightName={rivalName}
            left={piles[0]}
            right={piles[1]}
            muted={record.muted}
            onMute={toggleMute}
          />
          <p className="mt-1 text-center text-[11px] text-muted">1〜3試合目の得点は半分</p>
          <p className="mt-3 text-center text-sm font-bold">第{tricks + 1}トリック</p>
          <section className="mt-4 rounded-2xl border border-line bg-surface px-3 py-4">
            <Reveal
              trick={pending}
              youName={youName}
              rivalName={rivalName}
              youMark={pending.you.original === piles[0].stamp ? effectName(piles[0].effect) : ""}
              rivalMark={pending.rival.original === piles[1].stamp ? effectName(piles[1].effect) : ""}
              stock={mode === "ai"}
              onOpen={markRevealed}
            />
          </section>
          <div className="sticky bottom-0 mt-auto flex gap-2 py-3">
            <button type="button" className={`${btn} ${press} border border-line bg-surface`} onClick={() => setChart(true)}>
              効果表
            </button>
            {revealed ? (
              <button type="button" className={`${btn} ${press} flex-1 bg-gold text-bg`} onClick={advance}>
                次へ
              </button>
            ) : (
              <p className="flex flex-1 items-center justify-center text-sm font-bold text-muted">めくっています</p>
            )}
          </div>
        </main>
      )}

      {phase === "over" && outcome && (
        <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 px-5 py-8">
          <p className="text-sm font-bold tracking-widest text-gold">
            {endLabel(tricks, piles[0].score, piles[1].score)}
          </p>
          <h2 className="font-display text-5xl leading-none">
            {outcome === "you" ? `${youName}の勝ち` : outcome === "rival" ? `${rivalName}の勝ち` : "引き分け"}
          </h2>
          {ticketNote ? <p className="text-base font-bold text-[#ffe14a]">チケット +1</p> : null}
          <p className="text-sm leading-relaxed text-muted">{tiebreakText(piles, last)}</p>
          <div className="grid grid-cols-2 gap-3">
            <BenchFace name={youName} value={piles[0].bench} />
            <BenchFace name={rivalName} value={piles[1].bench} />
          </div>
          <ol className="flex flex-col gap-2">
            {log.map((trick, index) => (
              <li key={index} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm">
                <p className="font-bold">
                  {labelOf(trick.you)} 対 {labelOf(trick.rival)}
                  <span className="ml-2 text-gold">
                    {trick.winner === "tie"
                      ? "引き分け"
                      : `${trick.winner === "you" ? youName : rivalName} +${trick.trickPoints}`}
                  </span>
                </p>
                {trick.notes.length > 0 && <p className="mt-1 text-xs text-muted">{trick.notes.join(" / ")}</p>}
              </li>
            ))}
          </ol>
          <div className="sticky bottom-0 mt-auto flex flex-col gap-2 bg-bg py-3">
            <button type="button" className={`${btn} ${press} bg-gold text-bg`} onClick={() => begin(mode)}>
              もう一度
            </button>
            <button type="button" className={`${btn} ${press} text-muted`} onClick={() => setPhase("title")}>
              タイトルへ
            </button>
          </div>
        </main>
      )}
      {phase === "cast" && (
        <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-4 px-4 py-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-4xl leading-none">排出一覧</h2>
              <p className="mt-2 text-sm text-muted">ガチャに入っている 10種 × 5レア。強さは全部同じ。</p>
            </div>
            <button type="button" className={`${btn} ${press} border border-line bg-surface`} onClick={() => setPhase("title")}>
              タイトルへ
            </button>
          </div>
          {([1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const).map((number) => (
            <section key={number} className="border border-line bg-surface px-3 py-3">
              <h3 className="font-bold">
                {number} {NAMES[number]}
              </h3>
              <div className="cast-row mt-3">
                {RARITIES.map((rarity) => (
                  <div key={rarity} className={`cast-cell gacha-frame rarity-${rarity}`}>
                    <Monster id={number} scale={4} rarity={rarity} />
                    <p>{rarity}</p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </main>
      )}
      {phase === "gacha" && (
        <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 py-5">
          <p className="text-sm">
            チケット {collection.tickets}　カケラ {collection.fragments}
          </p>
          <h2 className="mt-2 font-display text-4xl leading-none">ガチャ</h2>
          <button type="button" className={`${btn} ${press} mt-3 border border-line bg-surface`} onClick={() => setPhase("cast")}>
            排出一覧を見る
          </button>
          <div className="relative mt-6 grid min-h-72 place-items-center">
            <GateShow beat={beat} gate={gate} rise={rise} result={result} />
          </div>
          <div className="sticky bottom-0 mt-auto flex flex-col gap-2 bg-bg py-3">
            <button
              type="button"
              disabled={collection.tickets < 1 || beat !== "hold"}
              className={`${btn} ${press} bg-gold text-bg`}
              onClick={() => {
                const current = loadCollection();
                if (current.tickets < 1) return;
                if (!record.muted) sfxPull();
                pullTimers.current.forEach((id) => window.clearTimeout(id));
                pullTimers.current = [];
                const rolled = pull(current);
                const stored = saveCollection(rolled.collection);
                setCollection(stored);
                setResult(rolled.pull);
                const rarity = rolled.pull.rarity;
                const base = rarity === "UR" ? "black" : rarity === "SSR" ? "gold" : "red";
                const bumped = base === "red" && Math.random() < 0.01 ? (Math.random() < 0.5 ? "gold" : "void") : null;
                setGate(base);
                setRise(bumped);
                const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                const later = (ms: number, next: "hold" | "door" | "cut" | "open" | "emerge" | "eyes" | "body") => {
                  pullTimers.current.push(window.setTimeout(() => setBeat(next), ms));
                };
                if (reduced) {
                  setBeat("hold");
                  return;
                }
                setBeat("door");
                if (bumped) {
                  later(700, "cut");
                  later(1300, "open");
                  later(2000, "emerge");
                  later(2800, "hold");
                } else if (rarity === "UR") {
                  later(900, "open");
                  later(1700, "emerge");
                  later(2100, "eyes");
                  later(2700, "body");
                  later(3400, "hold");
                } else if (rarity === "SSR") {
                  later(800, "open");
                  later(1600, "emerge");
                  later(2400, "hold");
                } else {
                  later(700, "open");
                  later(1400, "emerge");
                  later(2200, "hold");
                }
              }}
            >
              引く
            </button>
            <button
              type="button"
              disabled={collection.fragments < 10}
              className={`${btn} ${press} border border-line bg-surface`}
              onClick={() => {
                const next = cashFragments(loadCollection());
                if (!next) return;
                setCollection(saveCollection(next));
              }}
            >
              カケラ10でチケット2枚
            </button>
            <button type="button" className={`${btn} ${press} text-muted`} onClick={() => setPhase("title")}>
              戻る
            </button>
          </div>
        </main>
      )}

      {phase === "dex" && (
        <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 px-4 py-5">
          <h2 className="font-display text-4xl leading-none">図鑑</h2>
          {([1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const).map((number) => (
            <section key={number} className="border border-line bg-surface px-2 py-2">
              <p className="font-bold">
                {number} {NAMES[number]}
              </p>
              <p className="text-sm leading-relaxed">{RULES[number]}</p>
              <div className="dex-skins mt-2">
                {RARITIES.map((rarity) => {
                  const owned = collection.owned.includes(skinId(number, rarity));
                  return (
                    <div key={rarity} className={`gacha-frame rarity-${rarity} grid place-items-center gap-1`}>
                      <Monster id={number} scale={3} rarity={owned ? rarity : "ghost"} />
                      <span className="text-[10px]">{rarity}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          <button type="button" className={`${btn} ${press} bg-gold text-bg`} onClick={() => setPhase("title")}>
            戻る
          </button>
        </main>
      )}

      {phase === "deck" && (
        <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-3 px-4 py-5">
          <h2 className="font-display text-4xl leading-none">デッキ</h2>
          <p className="text-sm text-muted">数字ごとに、持っているスキンを1つ装備する。</p>
          {([1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const).map((number) => {
            const owned = RARITIES.filter((rarity) => collection.owned.includes(skinId(number, rarity)));
            const current = collection.equipped[number];
            return (
              <section key={number} className="flex items-center gap-3 border border-line bg-surface px-2 py-2">
                <Monster id={number} scale={3} rarity={current ?? "N"} />
                <div className="flex flex-1 flex-wrap gap-1">
                  <span className="w-full text-sm font-bold">{number}</span>
                  {owned.length === 0 ? <span className="text-xs text-muted">未所持</span> : null}
                  {owned.map((rarity) => (
                    <button
                      key={rarity}
                      type="button"
                      className={`${press} min-h-11 border px-2 text-sm font-bold ${
                        current === rarity ? "border-[#ffe14a] text-[#ffe14a]" : "border-line"
                      }`}
                      onClick={() => {
                        setCollection(saveCollection(equip(loadCollection(), number, rarity)));
                      }}
                    >
                      {rarity}
                    </button>
                  ))}
                  {current ? (
                    <button
                      type="button"
                      className={`${press} min-h-11 border border-line px-2 text-sm`}
                      onClick={() => {
                        setCollection(saveCollection(unequip(loadCollection(), number)));
                      }}
                    >
                      外す
                    </button>
                  ) : null}
                </div>
              </section>
            );
          })}
          <button type="button" className={`${btn} ${press} bg-gold text-bg`} onClick={() => setPhase("title")}>
            戻る
          </button>
        </main>
      )}

      {chart && <RuleChart onClose={() => setChart(false)} />}
    </div>
    </EquipCtx.Provider>
  );
}

function Scores(props: {
  leftName: string;
  rightName: string;
  left: Pile;
  right: Pile;
  muted: boolean;
  onMute: () => void;
}) {
  return (
    <header className="flex items-center gap-3">
      <Score name={props.leftName} pile={props.left} />
      <Score name={props.rightName} pile={props.right} />
      <button
        type="button"
        className={`${press} ml-auto grid h-11 w-11 place-items-center rounded-full border border-line bg-surface`}
        aria-label={props.muted ? "音を出す" : "音を消す"}
        onClick={props.onMute}
      >
        {props.muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
      </button>
    </header>
  );
}

function Score(props: { name: string; pile: Pile }) {
  return (
    <p className="min-w-16">
      <span className="inline-flex items-center gap-1 text-xs font-bold text-muted">
        {props.name}
        {props.pile.poison ? <PoisonDrop /> : null}
      </span>
      <span className="font-display text-3xl leading-none tabular-nums">{props.pile.score}</span>
    </p>
  );
}

function DiscardRow(props: { youName: string; rivalName: string; you: CardPlay[]; rival: CardPlay[] }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
      <p className="text-muted">
        {props.youName} {props.you.length === 0 ? "—" : props.you.map(labelOf).join(" ")}
      </p>
      <p className="text-right text-muted">
        {props.rivalName} {props.rival.length === 0 ? "—" : props.rival.map(labelOf).join(" ")}
      </p>
    </div>
  );
}

function labelOf(card: CardPlay): string {
  return card.display === card.original ? String(card.original) : `${card.original}→${card.display}`;
}

function BenchFace(props: { name: string; value: number | null }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-3 text-center">
      <p className="text-xs font-bold text-muted">{props.name}のベンチ</p>
      <p className="font-display text-4xl leading-none">{props.value}</p>
    </div>
  );
}

function endLabel(tricks: number, you: number, rival: number): string {
  const diff = Math.abs(you - rival);
  if (tricks >= 9) return "9トリック終了";
  if (tricks === 8 && diff >= 10) return "8トリック、点差10以上";
  if (tricks === 7 && diff >= 15) return "7トリック、点差15以上";
  return `${tricks}トリック`;
}

function tiebreakText(piles: [Pile, Pile], last: Trick | undefined): string {
  if (!last) return "";
  if (piles[0].score !== piles[1].score) return `${piles[0].score} 対 ${piles[1].score}`;
  if (last.youCmp !== last.rivalCmp) return "同点。最終トリックの比較値で決めた。";
  if (piles[0].bench !== piles[1].bench) return "同点。ベンチの数字で決めた。";
  return "同点。ベンチも同じで、引き分け。";
}

function Reveal(props: {
  trick: Trick;
  youName: string;
  rivalName: string;
  youMark: string;
  rivalMark: string;
  stock?: boolean;
  onOpen: () => void;
}) {
  const [step, setStep] = useState(0);
  const onOpen = useRef(props.onOpen);
  onOpen.current = props.onOpen;
  const trick = props.trick;

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setStep(3);
      onOpen.current();
      return;
    }
    setStep(0);
    const timers = [
      window.setTimeout(() => setStep(1), 280),
      window.setTimeout(() => setStep(2), 900),
      window.setTimeout(() => {
        setStep(3);
        onOpen.current();
      }, 1500),
    ];
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [trick]);

  const bonus =
    trick.winner === "you" && trick.rivalGain > 0
      ? `　${props.rivalName} +${trick.rivalGain}`
      : trick.winner === "rival" && trick.youGain > 0
        ? `　${props.youName} +${trick.youGain}`
        : "";
  const banner =
    trick.winner === "tie"
      ? "引き分け"
      : `${trick.winner === "you" ? props.youName : props.rivalName} +${trick.trickPoints}${bonus}`;

  return (
    <div className="w-full">
      <div className="grid grid-cols-2 gap-3">
        <FlipCard
          up={step >= 1}
          front={<Face name={props.youName} card={trick.you} mark={props.youMark} win={step >= 3 && trick.winner === "you"} break={step >= 3 && trick.winner === "rival"} />}
        />
        <FlipCard
          up={step >= 2}
          front={
            <Face
              name={props.rivalName}
              card={trick.rival}
              mark={props.rivalMark}
              win={step >= 3 && trick.winner === "rival"}
              stock={props.stock}
              break={step >= 3 && trick.winner === "you"}
            />
          }
        />
      </div>
      <p className="mt-3 min-h-6 text-center font-display text-4xl leading-none">
        {step >= 3 ? banner : step === 2 ? `${SHOUTS[trick.you.original]}　${SHOUTS[trick.rival.original]}` : step === 1 ? SHOUTS[trick.you.original] : "裏からめくる"}
      </p>
      {step >= 3 && trick.notes.length > 0 && (
        <p className="mt-1 text-center text-sm leading-relaxed text-muted">
          {trick.notes.map((note, index) => (
            <span key={`${note}-${index}`} className={isStampNote(note) ? "text-[#ffe14a]" : undefined}>
              {index > 0 ? " / " : ""}
              {note}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

function FlipCard(props: { up: boolean; front: ReactNode }) {
  return (
    <div className="flip-scene">
      <div className={`flip-card ${props.up ? "is-up" : ""}`}>
        <div className="flip-face grid place-items-center overflow-hidden border border-line bg-[#102033]">
          <PixelBack />
        </div>
        <div className="flip-face flip-front overflow-hidden">{props.front}</div>
      </div>
    </div>
  );
}

function isStampNote(note: string): boolean {
  return note.startsWith("圧迫") || note.startsWith("底力") || note.startsWith("毒霧") || note.startsWith("吸収") || note.startsWith("保険");
}

function RuleChart(props: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-[#0c1424] px-4 py-5">
      <div className="mx-auto flex max-w-lg flex-col gap-3 pb-8">
        <h2 className="font-display text-4xl leading-none">効果表</h2>
        <section className="border border-line bg-surface px-3 py-3">
          <h3 className="font-bold">付与</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {EFFECTS.map((effect) => (
              <li key={effect.id} className="text-sm leading-relaxed">
                <span className="font-bold text-[#ffe14a]">{effect.name}</span>
                <span className="text-muted">　{effect.blurb}</span>
              </li>
            ))}
          </ul>
        </section>
        <h3 className="font-bold">1〜10</h3>
        <ol className="flex flex-col gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
            <li key={value} className="flex items-center gap-3 border border-line bg-surface px-2 py-2">
              <Monster id={value} scale={3} />
              <div>
                <p className="font-bold">
                  {value} {NAMES[value]}
                </p>
                <p className="text-sm leading-relaxed text-muted">{RULES[value]}</p>
              </div>
            </li>
          ))}
        </ol>
        <button type="button" className={`${btn} ${press} bg-gold text-bg`} onClick={props.onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}

function Face(props: { name: string; card: CardPlay; mark: string; win: boolean; stock?: boolean; break?: boolean }) {
  const open = props.card.original === 6 && props.card.display === 8;
  return (
    <div className={`flex h-full flex-col ${props.win ? "outline-2 outline-offset-2 outline-gold" : ""}`}>
      <p className="sr-only">{props.name}</p>
      <Paper
        value={props.card.original}
        display={props.card.display}
        badge={props.mark || undefined}
        open={open}
        stock={props.stock}
        break={props.break}
      />
    </div>
  );
}

function GateShow(props: {
  beat: "hold" | "door" | "cut" | "open" | "emerge" | "eyes" | "body";
  gate: "red" | "gold" | "black" | "void";
  rise: "gold" | "void" | null;
  result: Pull | null;
}) {
  const color = props.beat === "door" ? props.gate : (props.rise ?? props.gate);
  const open = props.beat === "open" || props.beat === "emerge" || props.beat === "eyes" || props.beat === "body" || (props.beat === "hold" && props.result != null);
  const arrived = props.result && (props.beat === "emerge" || props.beat === "eyes" || props.beat === "body" || props.beat === "hold");
  if (props.beat === "hold" && !props.result) return <p className="text-sm text-muted">チケット1枚で、スキン1枚。</p>;
  return (
    <div className={`gate-stage gate-${color}${open ? " is-open" : ""}${props.beat === "cut" ? " is-cut" : ""}`}>
      <div className="gate-arch" aria-hidden />
      <div className="gate" aria-hidden>
        <span className="gate-leaf is-left">
          <span className="gate-band" />
          <span className="gate-band is-low" />
          <span className="gate-stud" />
          <span className="gate-seal" />
        </span>
        <span className="gate-leaf is-right">
          <span className="gate-band" />
          <span className="gate-band is-low" />
          <span className="gate-stud is-right" />
        </span>
      </div>
      <div className="gate-sill" aria-hidden />
      {props.beat === "cut" && <p className="cut-in">CUT IN</p>}
      {arrived && props.result && (
        <div className="gate-monster">
          <Monster
            id={props.result.number}
            scale={4}
            rarity={props.result.rarity}
            eyes={props.result.rarity === "UR" && props.beat === "eyes"}
          />
          <p className="gate-plate">
            {props.result.number} {NAMES[props.result.number]} {props.result.rarity}
            {props.result.duplicate ? "　カケラ +1" : ""}
          </p>
        </div>
      )}
    </div>
  );
}
