"use client";

/**
 * Synthesized sound effects via Web Audio API.
 *
 * Browsers (Chrome, Safari, Firefox) refuse to start an AudioContext outside
 * of a user gesture — so the very first call from a non-gesture path (like a
 * `useEffect` reacting to a WebSocket message) silently fails.
 *
 * The fix: a one-time document-level listener on `pointerdown`/`keydown`/
 * `touchstart` calls `unlockAudio()`, which creates the context and resumes it.
 * After that, sounds play from any context (including async event handlers).
 *
 * Mount `<AudioUnlocker />` once at the app root to install the listener.
 */

let audioCtx: AudioContext | null = null;
let unlockAttempted = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) return audioCtx;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    audioCtx = new Ctor();
  } catch {
    return null;
  }
  return audioCtx;
}

/**
 * Call from inside a user-gesture event handler to prime audio playback.
 * Safe to call multiple times — the AudioContext caches itself.
 */
export function unlockAudio(): void {
  unlockAttempted = true;
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {
      /* user denied or browser policy */
    });
  }
}

export function isAudioUnlocked(): boolean {
  return !!audioCtx && audioCtx.state === "running";
}

interface ToneOptions {
  freq: number;
  duration: number;
  startTime?: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  release?: number;
}

function playTone(ctx: AudioContext, opts: ToneOptions) {
  const startAt = opts.startTime ?? ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.value = opts.freq;
  const attack = opts.attack ?? 0.01;
  const release = opts.release ?? 0.05;
  const peak = opts.gain ?? 0.2;
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(peak, startAt + attack);
  gain.gain.setValueAtTime(peak, startAt + opts.duration - release);
  gain.gain.linearRampToValueAtTime(0, startAt + opts.duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + opts.duration + 0.05);
}

/**
 * Internal: ensure the context is running, then invoke `play` with it.
 * If the context is suspended and we can't resume (no user gesture yet),
 * we drop the sound rather than throwing — log once per session.
 */
async function withCtx(play: (ctx: AudioContext) => void): Promise<void> {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      /* still locked */
    }
  }
  if (ctx.state !== "running") {
    if (!unlockAttempted) {
      console.warn(
        "[sound-effects] AudioContext is locked. Tap or click anywhere to enable sound."
      );
    }
    return;
  }
  play(ctx);
}

/** A bright cha-ching arpeggio: C6 → E6 → G6 → C7 ringing up. */
export function playChaChing(): void {
  void withCtx((ctx) => {
    const now = ctx.currentTime;
    const notes = [
      { freq: 1046.5, time: 0.0, dur: 0.18 }, // C6
      { freq: 1318.5, time: 0.07, dur: 0.18 }, // E6
      { freq: 1568.0, time: 0.14, dur: 0.22 }, // G6
      { freq: 2093.0, time: 0.21, dur: 0.42 }, // C7 (sustained)
    ];
    for (const n of notes) {
      playTone(ctx, {
        freq: n.freq,
        duration: n.dur,
        startTime: now + n.time,
        type: "triangle",
        gain: 0.22,
        attack: 0.005,
        release: 0.18,
      });
    }
    // Sparkle bell on top
    playTone(ctx, {
      freq: 4186.0, // C8
      duration: 0.3,
      startTime: now + 0.22,
      type: "sine",
      gain: 0.08,
      attack: 0.005,
      release: 0.25,
    });
  });
}

/** A short cheering whoosh — filtered noise burst that ramps down. */
export function playCheer(): void {
  void withCtx((ctx) => {
    const now = ctx.currentTime;
    const duration = 0.6;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1500;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
    gain.gain.linearRampToValueAtTime(0, now + duration);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(now);
    src.stop(now + duration);
  });
}

export function playPersonalWinFanfare(): void {
  playChaChing();
  setTimeout(() => playCheer(), 60);
}
