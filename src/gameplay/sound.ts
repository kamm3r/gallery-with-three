// Procedural sound design: zero-asset WebAudio engine.
//
// - Master chain: sfx bus + ambience bus -> master gain -> compressor.
// - One-shots are layered (noise transient + tonal body) with per-effect
//   throttles, alternating feet, and slight stereo placement so repeated
//   cues (footsteps) never machine-gun.
// - A generated-impulse reverb gives portals, landings, and slashes space.
// - Continuous ambience beds switch per scene via setMood().

export type SoundEffect =
  | "step"
  | "jump"
  | "land"
  | "slash"
  | "portal"
  | "roll"
  | "grab"
  | "ui"
  // Gallery puzzle cues.
  | "press"
  | "correct"
  | "wrong"
  | "deny"
  | "solve"
  | "rumble"
  | "sigil"
  | "secret"
  | "fall"
  // Ash Warden cues.
  | "bossWindup"
  | "bossSwing"
  | "bossImpact"
  | "bossHit"
  | "hurt"
  | "roar"
  | "bossDeath"
  // Halloween Hollow cues.
  | "shriek"
  | "hollowWin"
  | "heartbeat"
  | "thunder"
  | "whisper"
  // Hollow Lane cues.
  | "stomp"
  | "sting"
  | "sense"
  | "shift"
  | "stab"
  | "rummage"
  | "engine"
  | "dial"
  | "siren"
  | "creak"
  | "slam"
  | "latch"
  // Warp Room cues.
  | "spin"
  | "crate"
  | "fruit"
  | "boing"
  | "fuse"
  | "boom"
  | "checkpoint"
  | "mask"
  | "crystal"
  | "gem"
  | "whoa";

export type SoundMood = "meadow" | "grove" | "still" | "ash" | "museum";

/** Ambient layer laid over the mood bed, crossfaded as the player changes wing. */
export type SoundZone =
  | "halls"
  | "archive"
  | "mirrors"
  | "garden"
  | "crypt"
  | "observatory"
  | "vault";

/** What the feet land on; changes the footstep voice. */
export type FootstepSurface = "grass" | "stone";

export interface SoundOptions {
  /** 0..1, scales loudness and brightness of the cue. */
  intensity?: number;
  /** -1..1 stereo placement, for cues with a place in the world. */
  pan?: number;
}

interface Graph {
  context: AudioContext;
  master: GainNode;
  sfx: GainNode;
  ambience: GainNode;
  reverb: ConvolverNode;
  noise: AudioBuffer;
}

let graph: Graph | undefined;
let enabled = true;
let volume = 0.6;
let voices = 0;
let mood: SoundMood = "meadow";
let moodCleanup: (() => void) | undefined;
let stepAlternate = false;
let surface: FootstepSurface = "grass";
let zone: SoundZone | null = null;
let zoneLayer: { gain: GainNode; stop: () => void } | undefined;
const lastPlay = new Map<SoundEffect, number>();

const MIN_GAP: Partial<Record<SoundEffect, number>> = {
  spin: 0.2,
  crate: 0.03,
  fruit: 0.03,
  boing: 0.08,
  fuse: 0.25,
  boom: 0.08,
  checkpoint: 0.5,
  mask: 0.4,
  crystal: 1,
  gem: 1,
  whoa: 1,
  step: 0.08,
  jump: 0.15,
  land: 0.18,
  slash: 0.12,
  portal: 0.4,
  roll: 0.25,
  grab: 0.2,
  ui: 0.05,
  press: 0.08,
  correct: 0.05,
  wrong: 0.3,
  deny: 0.4,
  solve: 1,
  rumble: 1,
  sigil: 0.3,
  secret: 1,
  fall: 1,
  bossWindup: 0.3,
  bossSwing: 0.08,
  bossImpact: 0.15,
  bossHit: 0.08,
  hurt: 0.2,
  roar: 1.5,
  bossDeath: 3,
  shriek: 1.5,
  hollowWin: 3,
  heartbeat: 0.3,
  thunder: 1,
  whisper: 1.2,
  stomp: 0.3,
  sting: 2,
  sense: 3,
  shift: 2,
  stab: 0.4,
  rummage: 0.25,
  engine: 3,
  dial: 1,
  siren: 3,
  creak: 0.4,
  slam: 0.3,
  latch: 0.3,
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function makeNoiseBuffer(context: AudioContext): AudioBuffer {
  const length = context.sampleRate * 2;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function makeImpulse(context: AudioContext, seconds = 1.4, decay = 2.5): AudioBuffer {
  const rate = context.sampleRate;
  const length = Math.floor(rate * seconds);
  const impulse = context.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp((-decay * i) / length);
    }
  }
  return impulse;
}

function ensureGraph(): Graph | undefined {
  if (graph) return graph;
  try {
    const context = new AudioContext();
    const master = context.createGain();
    master.gain.value = enabled ? volume : 0;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 22;
    compressor.ratio.value = 8;
    master.connect(compressor);
    compressor.connect(context.destination);
    const sfx = context.createGain();
    sfx.gain.value = 1;
    sfx.connect(master);
    const ambience = context.createGain();
    ambience.gain.value = 1;
    ambience.connect(master);
    const reverb = context.createConvolver();
    reverb.buffer = makeImpulse(context);
    const wet = context.createGain();
    wet.gain.value = 0.3;
    reverb.connect(wet);
    wet.connect(master);
    graph = { context, master, sfx, ambience, reverb, noise: makeNoiseBuffer(context) };
    applyMood();
    applyZone();
    return graph;
  } catch {
    return undefined;
  }
}

export function configureSound(level: number, paused: boolean) {
  volume = Math.max(0, Math.min(1, level / 100));
  enabled = !paused;
  if (graph) {
    graph.master.gain.setTargetAtTime(enabled ? volume : 0, graph.context.currentTime, 0.015);
  }
}

export function unlockSound() {
  const active = ensureGraph();
  if (active && active.context.state === "suspended") {
    void active.context.resume().catch(() => {});
  }
}

export function setMood(next: SoundMood) {
  if (mood === next) return;
  mood = next;
  if (graph) {
    moodCleanup?.();
    moodCleanup = undefined;
    applyMood();
  }
}

let chase: { stop: () => void } | undefined;

/**
 * Chase music: a pulsing 7/8 ostinato in low octaves with a dissonant high
 * stab on each bar. Starts and stops with the killer's pursuit.
 */
export function setChase(active: boolean) {
  if (!active) {
    chase?.stop();
    chase = undefined;
    return;
  }
  const g = ensureGraph();
  if (chase || !g) return;
  const pattern = [0, 12, 0, 13, 0, 12, 7];
  const beat = 60 / 190;
  const bus = g.context.createGain();
  bus.gain.value = 0;
  bus.gain.setTargetAtTime(1, g.context.currentTime, 0.4);
  bus.connect(g.sfx);
  let step = 0;
  let next = g.context.currentTime + 0.05;
  const timer = window.setInterval(() => {
    while (next < g.context.currentTime + 0.25) {
      const note = pattern[step % pattern.length];
      const frequency = 110 * Math.pow(2, note / 12);
      for (const [type, ratio, peak] of [
        ["triangle", 1, 0.05],
        ["sine", 0.5, 0.05],
      ] as const) {
        const osc = g.context.createOscillator();
        osc.type = type;
        osc.frequency.value = frequency * ratio;
        const gain = g.context.createGain();
        gain.gain.setValueAtTime(0, next);
        gain.gain.linearRampToValueAtTime(peak, next + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, next + beat * 0.9);
        osc.connect(gain);
        gain.connect(bus);
        fireAndForget(osc, gain);
        osc.start(next);
        osc.stop(next + beat);
      }
      if (step % pattern.length === 0) {
        for (const semitone of [24, 25]) {
          const osc = g.context.createOscillator();
          osc.type = "sawtooth";
          osc.frequency.value = 110 * Math.pow(2, semitone / 12);
          const filter = g.context.createBiquadFilter();
          filter.type = "lowpass";
          filter.frequency.value = 1800;
          const gain = g.context.createGain();
          gain.gain.setValueAtTime(0, next);
          gain.gain.linearRampToValueAtTime(0.018, next + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, next + beat * 5);
          osc.connect(filter);
          filter.connect(gain);
          gain.connect(bus);
          gain.connect(g.reverb);
          fireAndForget(osc, filter, gain);
          osc.start(next);
          osc.stop(next + beat * 5);
        }
      }
      step++;
      next += beat;
    }
  }, 100);
  chase = {
    stop: () => {
      window.clearInterval(timer);
      bus.gain.setTargetAtTime(0, g.context.currentTime, 0.5);
      window.setTimeout(() => bus.disconnect(), 3000);
    },
  };
}

export function setFootstepSurface(next: FootstepSurface) {
  surface = next;
}

export function setZone(next: SoundZone | null) {
  if (zone === next) return;
  zone = next;
  if (graph) applyZone();
}

function track<T extends AudioNode>(node: T): T {
  voices++;
  return node;
}

function release(source: AudioScheduledSourceNode, ...nodes: AudioNode[]) {
  source.onended = () => {
    voices--;
    source.disconnect();
    for (const node of nodes) node.disconnect();
  };
}

/** Ambience one-shots clean up after themselves so long sessions stay lean. */
function fireAndForget(source: AudioScheduledSourceNode, ...nodes: AudioNode[]) {
  source.onended = () => {
    source.disconnect();
    for (const node of nodes) node.disconnect();
  };
}

interface VoiceOptions {
  /** Peak gain of this layer. */
  peak: number;
  /** Stereo placement, -1..1. Defaults to a slight random offset. */
  pan?: number;
  /** 0..1 amount routed to the reverb. */
  wet?: number;
  /** Seconds to wait before starting. */
  delay?: number;
}

function voiceTarget(options: VoiceOptions): {
  destination: AudioNode;
  at: number;
  extra: AudioNode[];
} {
  const active = graph!;
  const at = active.context.currentTime + (options.delay ?? 0);
  const panner = active.context.createStereoPanner();
  panner.pan.value = options.pan ?? rand(-0.12, 0.12);
  panner.connect(active.sfx);
  const extra: AudioNode[] = [panner];
  if (options.wet) {
    const send = active.context.createGain();
    send.gain.value = options.wet;
    panner.connect(send);
    send.connect(active.reverb);
    extra.push(send);
  }
  return { destination: panner, at, extra };
}

function burst(
  options: {
    duration: number;
    type: BiquadFilterType;
    frequency: number;
    frequencyEnd?: number;
    q?: number;
    rate?: number;
  } & VoiceOptions,
) {
  const active = graph!;
  const { destination, at, extra } = voiceTarget(options);
  const source = track(active.context.createBufferSource());
  source.buffer = active.noise;
  source.loop = true;
  source.playbackRate.value = options.rate ?? rand(0.9, 1.1);
  const filter = active.context.createBiquadFilter();
  filter.type = options.type;
  filter.frequency.setValueAtTime(options.frequency, at);
  if (options.frequencyEnd !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(40, options.frequencyEnd),
      at + options.duration,
    );
  }
  filter.Q.value = options.q ?? 0.9;
  const gain = active.context.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(options.peak, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, at + options.duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  release(source, filter, gain, ...extra);
  source.start(at);
  source.stop(at + options.duration + 0.05);
}

function tone(
  options: {
    type: OscillatorType;
    frequency: number;
    frequencyEnd?: number;
    duration: number;
    attack?: number;
  } & VoiceOptions,
) {
  const active = graph!;
  const { destination, at, extra } = voiceTarget(options);
  const source = track(active.context.createOscillator());
  source.type = options.type;
  source.frequency.setValueAtTime(Math.max(20, options.frequency), at);
  if (options.frequencyEnd !== undefined) {
    source.frequency.exponentialRampToValueAtTime(
      Math.max(20, options.frequencyEnd),
      at + options.duration,
    );
  }
  const gain = active.context.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(options.peak, at + (options.attack ?? 0.008));
  gain.gain.exponentialRampToValueAtTime(0.001, at + options.duration);
  source.connect(gain);
  gain.connect(destination);
  release(source, gain, ...extra);
  source.start(at);
  source.stop(at + options.duration + 0.05);
}

/** A buzzy voice through a formant band: throats, cackles, howls. */
function formant(
  options: {
    frequency: number;
    frequencyEnd?: number;
    duration: number;
    band: number;
    q?: number;
    attack?: number;
  } & VoiceOptions,
) {
  const active = graph!;
  const { destination, at, extra } = voiceTarget(options);
  const source = track(active.context.createOscillator());
  source.type = "sawtooth";
  source.frequency.setValueAtTime(options.frequency, at);
  if (options.frequencyEnd !== undefined)
    source.frequency.exponentialRampToValueAtTime(options.frequencyEnd, at + options.duration);
  const filter = active.context.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = options.band;
  filter.Q.value = options.q ?? 5;
  const gain = active.context.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(options.peak, at + (options.attack ?? 0.015));
  gain.gain.exponentialRampToValueAtTime(0.001, at + options.duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  release(source, filter, gain, ...extra);
  source.start(at);
  source.stop(at + options.duration + 0.05);
}

function ready(effect: SoundEffect): number | undefined {
  const active = ensureGraph();
  if (!active || active.context.state !== "running" || !enabled || !volume || voices >= 16) {
    return undefined;
  }
  const now = active.context.currentTime;
  const gap = MIN_GAP[effect] ?? 0.1;
  if (now - (lastPlay.get(effect) ?? -1) < gap) return undefined;
  lastPlay.set(effect, now);
  return now;
}

export function playSound(effect: SoundEffect, options: SoundOptions = {}) {
  if (ready(effect) === undefined) return;
  const intensity = Math.max(0, Math.min(1, options.intensity ?? 1));
  const placed = options.pan === undefined ? undefined : Math.max(-1, Math.min(1, options.pan));
  switch (effect) {
    case "step": {
      if (surface === "stone") {
        // Hard floor: a crisp heel click with a little room echo.
        stepAlternate = !stepAlternate;
        const side = stepAlternate ? -1 : 1;
        burst({
          duration: 0.05,
          type: "bandpass",
          frequency: rand(2600, 3300) * (stepAlternate ? 1 : 1.1),
          q: 2.2,
          peak: 0.07,
          pan: side * rand(0.1, 0.2),
          wet: 0.25,
        });
        tone({
          type: "sine",
          frequency: 150,
          frequencyEnd: 80,
          duration: 0.07,
          peak: 0.07,
          pan: side * 0.08,
          wet: 0.2,
        });
        break;
      }
      // Grass footfall: airy rustle transient plus a soft body thud.
      // Feet alternate in pitch and stereo placement.
      stepAlternate = !stepAlternate;
      const side = stepAlternate ? -1 : 1;
      burst({
        duration: 0.09,
        type: "bandpass",
        frequency: rand(1400, 2200) * (stepAlternate ? 1 : 1.12),
        q: 1.1,
        peak: 0.11,
        pan: side * rand(0.1, 0.2),
      });
      tone({
        type: "sine",
        frequency: 95,
        frequencyEnd: 55,
        duration: 0.08,
        peak: 0.06,
        pan: side * 0.08,
      });
      break;
    }
    case "jump": {
      // Rising cloth-and-air whoosh as the character leaves the ground.
      burst({
        duration: 0.18,
        type: "bandpass",
        frequency: 450,
        frequencyEnd: 1500,
        q: 1.4,
        peak: 0.1,
      });
      break;
    }
    case "land": {
      // Weighty thump scaled by fall speed, with a breath of turf noise.
      const weight = 0.4 + intensity * 0.6;
      tone({
        type: "sine",
        frequency: 75,
        frequencyEnd: 38,
        duration: 0.22,
        peak: 0.22 * weight,
        wet: 0.35,
      });
      burst({
        duration: 0.14,
        type: "lowpass",
        frequency: 500 + intensity * 500,
        peak: 0.1 * weight,
        wet: 0.2,
      });
      break;
    }
    case "slash": {
      // Sword whoosh that snaps: air sweep down plus a faint steel ring.
      burst({
        duration: 0.2,
        type: "bandpass",
        frequency: 3200,
        frequencyEnd: 600,
        q: 1.8,
        peak: 0.14,
        wet: 0.25,
      });
      tone({
        type: "triangle",
        frequency: rand(2400, 2900),
        frequencyEnd: 1700,
        duration: 0.12,
        peak: 0.03,
        delay: 0.05,
        wet: 0.5,
      });
      break;
    }
    case "portal": {
      // Magical shimmer: rising detuned voices, a sparkle arpeggio, long tail.
      for (const [index, ratio] of [1, 1.5, 2].entries()) {
        tone({
          type: "sine",
          frequency: 220 * ratio,
          frequencyEnd: 660 * ratio,
          duration: 0.55,
          attack: 0.03,
          peak: 0.06,
          delay: index * 0.04,
          wet: 0.8,
        });
      }
      for (const [index, semitone] of [0, 4, 7, 12].entries()) {
        tone({
          type: "triangle",
          frequency: 880 * Math.pow(2, semitone / 12),
          duration: 0.3,
          peak: 0.035,
          delay: 0.18 + index * 0.06,
          wet: 0.9,
        });
      }
      break;
    }
    case "roll": {
      // Low tumbling whoosh with a soft ground tap at the end.
      burst({
        duration: 0.3,
        type: "bandpass",
        frequency: 300,
        frequencyEnd: 900,
        q: 1.2,
        peak: 0.1,
      });
      burst({
        duration: 0.1,
        type: "lowpass",
        frequency: 400,
        peak: 0.08,
        delay: 0.22,
      });
      break;
    }
    case "grab": {
      // Ledge catch: muted impact plus a short fabric grip.
      tone({ type: "sine", frequency: 120, frequencyEnd: 60, duration: 0.12, peak: 0.12 });
      burst({ duration: 0.08, type: "highpass", frequency: 1200, peak: 0.05, delay: 0.02 });
      break;
    }
    case "ui": {
      // Quiet menu tick that stays out of the way of gameplay cues.
      tone({ type: "triangle", frequency: 660, frequencyEnd: 520, duration: 0.06, peak: 0.05 });
      break;
    }
    case "press": {
      // Stone button: a sharp latch click, then the cap bottoming out.
      burst({ duration: 0.03, type: "highpass", frequency: 2600, peak: 0.08 });
      tone({
        type: "sine",
        frequency: 190,
        frequencyEnd: 90,
        duration: 0.14,
        peak: 0.15,
        delay: 0.02,
        wet: 0.25,
      });
      burst({ duration: 0.1, type: "lowpass", frequency: 320, peak: 0.08, delay: 0.02 });
      break;
    }
    case "correct": {
      // A bell that climbs a pentatonic step with every correct plate.
      const semitones = [0, 2, 4, 7, 9, 12, 14];
      const frequency =
        523.25 * Math.pow(2, semitones[Math.round(intensity * (semitones.length - 1))] / 12);
      tone({ type: "sine", frequency, duration: 1.3, peak: 0.08, wet: 0.6, delay: 0.06 });
      tone({ type: "sine", frequency: frequency * 2.76, duration: 0.5, peak: 0.02, delay: 0.06 });
      tone({ type: "triangle", frequency: frequency * 2, duration: 0.3, peak: 0.02, delay: 0.06 });
      break;
    }
    case "wrong": {
      // Two notes a semitone apart over a dull thud: unmistakably "no".
      for (const frequency of [146.8, 155.6]) {
        tone({
          type: "triangle",
          frequency,
          frequencyEnd: frequency * 0.8,
          duration: 0.7,
          peak: 0.07,
          delay: 0.06,
          wet: 0.3,
        });
      }
      tone({
        type: "sine",
        frequency: 70,
        frequencyEnd: 36,
        duration: 0.4,
        peak: 0.18,
        delay: 0.04,
      });
      break;
    }
    case "deny": {
      // The plate is dead: a muffled knock and nothing more.
      tone({
        type: "sine",
        frequency: 150,
        frequencyEnd: 100,
        duration: 0.16,
        peak: 0.08,
        delay: 0.05,
      });
      tone({ type: "triangle", frequency: 220, duration: 0.1, peak: 0.02, delay: 0.05 });
      break;
    }
    case "solve": {
      // Resolution: a wide major chord blooming into the reverb, with sparkle.
      for (const [index, frequency] of [261.6, 329.6, 392, 523.3].entries()) {
        tone({
          type: "sine",
          frequency,
          duration: 2.8,
          attack: 0.08,
          peak: 0.05,
          delay: index * 0.07,
          wet: 0.9,
        });
      }
      for (const [index, semitone] of [0, 4, 7, 12].entries()) {
        tone({
          type: "triangle",
          frequency: 1046.5 * Math.pow(2, semitone / 12),
          duration: 0.5,
          peak: 0.025,
          delay: 0.35 + index * 0.09,
          wet: 0.9,
        });
      }
      tone({ type: "sine", frequency: 55, frequencyEnd: 40, duration: 1.6, peak: 0.14, wet: 0.4 });
      break;
    }
    case "rumble": {
      // Heavy stone slab dragging: low grind, a thin scrape, sub-bass weight.
      burst({
        duration: 2.6,
        type: "lowpass",
        frequency: 190,
        frequencyEnd: 90,
        peak: 0.16,
        rate: 0.5,
        wet: 0.4,
      });
      burst({
        duration: 2.2,
        type: "bandpass",
        frequency: 650,
        q: 3,
        peak: 0.03,
        rate: 0.7,
        delay: 0.1,
      });
      tone({ type: "sine", frequency: 45, duration: 2.6, attack: 0.3, peak: 0.08 });
      break;
    }
    case "sigil": {
      // Pickup: a rising arpeggio that brightens with each sigil found.
      const base = 660 * (1 + intensity * 0.25);
      for (const [index, semitone] of [0, 4, 7, 11, 14].entries()) {
        tone({
          type: "triangle",
          frequency: base * Math.pow(2, semitone / 12),
          duration: 0.6,
          peak: 0.04,
          delay: index * 0.07,
          wet: 0.8,
        });
      }
      tone({
        type: "sine",
        frequency: base / 2,
        duration: 1.4,
        attack: 0.04,
        peak: 0.06,
        wet: 0.7,
      });
      burst({ duration: 0.6, type: "highpass", frequency: 5000, peak: 0.03, wet: 0.8 });
      break;
    }
    case "secret": {
      // Something hidden gives way: a descending whole-tone hush.
      for (const [index, frequency] of [987.8, 880, 784, 698.5, 622.3].entries()) {
        tone({ type: "sine", frequency, duration: 1, peak: 0.035, delay: index * 0.12, wet: 0.95 });
      }
      tone({ type: "sine", frequency: 110, duration: 1.8, attack: 0.25, peak: 0.05, wet: 0.5 });
      break;
    }
    case "bossWindup": {
      // Armour creak and a rising ember hiss as the Warden draws back.
      burst({
        duration: 0.7,
        type: "bandpass",
        frequency: 380,
        frequencyEnd: 1400 + intensity * 1600,
        q: 2.4,
        peak: 0.05 + intensity * 0.05,
        rate: 0.6,
        wet: 0.35,
      });
      tone({
        type: "sawtooth",
        frequency: 62,
        frequencyEnd: 90 + intensity * 40,
        duration: 0.8,
        attack: 0.25,
        peak: 0.025 + intensity * 0.02,
        wet: 0.3,
      });
      break;
    }
    case "bossSwing": {
      // A greatsword moving a lot of air: low, wide and slow to decay.
      burst({
        duration: 0.32 + intensity * 0.12,
        type: "bandpass",
        frequency: 1400,
        frequencyEnd: 180,
        q: 1.1,
        peak: 0.12 + intensity * 0.08,
        rate: 0.55,
        wet: 0.3,
      });
      break;
    }
    case "bossImpact": {
      // Stone-splitting slam: noise crack, sub-bass boom, gravel tail.
      burst({
        duration: 0.18,
        type: "highpass",
        frequency: 1800,
        peak: 0.12 * intensity,
        wet: 0.5,
      });
      burst({
        duration: 0.9 + intensity * 0.6,
        type: "lowpass",
        frequency: 700,
        frequencyEnd: 70,
        peak: 0.2 + intensity * 0.1,
        rate: 0.45,
        wet: 0.6,
      });
      tone({
        type: "sine",
        frequency: 70,
        frequencyEnd: 32,
        duration: 1.1,
        peak: 0.24 * intensity,
        wet: 0.4,
      });
      burst({
        duration: 1.2,
        type: "bandpass",
        frequency: 2600,
        q: 0.8,
        peak: 0.025,
        rate: 1.4,
        delay: 0.12,
        wet: 0.5,
      });
      break;
    }
    case "bossHit": {
      // Sword biting armour: bright clank over a dull thud.
      tone({
        type: "square",
        frequency: rand(520, 620),
        frequencyEnd: 300,
        duration: 0.14,
        peak: 0.035,
        wet: 0.4,
      });
      tone({
        type: "triangle",
        frequency: rand(1900, 2300),
        duration: 0.35,
        peak: 0.03,
        delay: 0.01,
        wet: 0.7,
      });
      burst({ duration: 0.16, type: "lowpass", frequency: 500, peak: 0.16 });
      break;
    }
    case "hurt": {
      // Being struck: heavy body blow, short and dry so it cuts through.
      burst({ duration: 0.22, type: "lowpass", frequency: 900, frequencyEnd: 120, peak: 0.24 });
      tone({ type: "sine", frequency: 120, frequencyEnd: 55, duration: 0.3, peak: 0.16 });
      break;
    }
    case "roar": {
      // Phase change: a detuned, growling bellow swelling into the reverb.
      for (const detune of [0, 7, -9]) {
        tone({
          type: "sawtooth",
          frequency: 78 + detune,
          frequencyEnd: 52 + detune,
          duration: 1.9,
          attack: 0.35,
          peak: 0.05,
          wet: 0.7,
        });
      }
      burst({
        duration: 1.9,
        type: "bandpass",
        frequency: 420,
        frequencyEnd: 220,
        q: 1.4,
        peak: 0.16,
        rate: 0.35,
        delay: 0.05,
        wet: 0.7,
      });
      tone({ type: "sine", frequency: 40, duration: 2.2, attack: 0.4, peak: 0.18, wet: 0.3 });
      break;
    }
    case "bossDeath": {
      // The Warden falls: a long collapsing rumble under a fading choir.
      burst({
        duration: 3.2,
        type: "lowpass",
        frequency: 400,
        frequencyEnd: 60,
        peak: 0.2,
        rate: 0.4,
        wet: 0.6,
      });
      for (const [index, frequency] of [220, 277.2, 329.6, 440].entries()) {
        tone({
          type: "sine",
          frequency,
          duration: 3.5,
          attack: 0.8,
          peak: 0.03,
          delay: 0.6 + index * 0.1,
          wet: 0.95,
        });
      }
      break;
    }
    case "shriek": {
      // Caught: a detuned screech sliding down into a sub drop.
      for (const detune of [0, 23, -31]) {
        tone({
          type: "sawtooth",
          frequency: 1250 + detune * 4,
          frequencyEnd: 380 + detune,
          duration: 0.9,
          peak: 0.045,
          wet: 0.7,
        });
      }
      burst({
        duration: 0.8,
        type: "bandpass",
        frequency: 2800,
        frequencyEnd: 700,
        q: 3,
        peak: 0.12,
        wet: 0.6,
      });
      tone({ type: "sine", frequency: 90, frequencyEnd: 30, duration: 1.4, peak: 0.22, wet: 0.3 });
      break;
    }
    case "hollowWin": {
      // Every lantern burns: a spooky-sweet music-box run over a warm swell.
      for (const [index, semitone] of [0, 3, 7, 10, 12, 15, 19, 24].entries()) {
        tone({
          type: "triangle",
          frequency: 440 * Math.pow(2, semitone / 12),
          duration: 0.9,
          peak: 0.035,
          delay: index * 0.12,
          wet: 0.85,
        });
      }
      tone({ type: "sine", frequency: 110, duration: 3, attack: 0.6, peak: 0.08, wet: 0.6 });
      burst({ duration: 1.8, type: "lowpass", frequency: 600, peak: 0.08, rate: 0.5, wet: 0.5 });
      break;
    }
    case "heartbeat": {
      // Lub-dub, louder and heavier the closer they are.
      const weight = 0.35 + intensity * 0.65;
      tone({
        type: "sine",
        frequency: 62,
        frequencyEnd: 38,
        duration: 0.16,
        peak: 0.26 * weight,
        pan: 0,
      });
      tone({
        type: "sine",
        frequency: 55,
        frequencyEnd: 34,
        duration: 0.2,
        peak: 0.19 * weight,
        delay: 0.19,
        pan: 0,
      });
      burst({ duration: 0.08, type: "lowpass", frequency: 180, peak: 0.08 * weight, pan: 0 });
      break;
    }
    case "thunder": {
      // A crack overhead, then a long rolling rumble.
      burst({ duration: 0.3, type: "highpass", frequency: 900, peak: 0.14 * intensity, wet: 0.6 });
      burst({
        duration: 3.6,
        type: "lowpass",
        frequency: 480,
        frequencyEnd: 55,
        peak: 0.3 * intensity,
        rate: 0.3,
        delay: 0.05,
        wet: 0.7,
      });
      burst({
        duration: 2.4,
        type: "lowpass",
        frequency: 260,
        frequencyEnd: 60,
        peak: 0.18 * intensity,
        rate: 0.25,
        delay: 1.1,
        wet: 0.8,
      });
      break;
    }
    case "whisper": {
      // Hissed, wordless syllables on one side of your head.
      const pan = (Math.random() < 0.5 ? -1 : 1) * rand(0.5, 0.95);
      let delay = 0;
      for (let i = 0; i < 6; i++) {
        const duration = rand(0.08, 0.22);
        burst({
          duration,
          type: "bandpass",
          frequency: rand(1600, 4200),
          q: rand(4, 9),
          peak: 0.03 + intensity * 0.03,
          delay,
          pan,
          wet: 0.6,
        });
        delay += duration + rand(0.02, 0.12);
      }
      break;
    }
    case "stomp": {
      // His footfall: slow, heavy boots on wet ground, placed where he is.
      tone({
        type: "sine",
        frequency: 70,
        frequencyEnd: 40,
        duration: 0.2,
        peak: 0.2 * intensity,
        pan: placed,
      });
      burst({
        duration: 0.12,
        type: "lowpass",
        frequency: 700,
        frequencyEnd: 200,
        peak: 0.1 * intensity,
        pan: placed,
        wet: 0.3,
      });
      break;
    }
    case "sting": {
      // Spotted: a dissonant orchestral stab and a sub hit.
      for (const semitone of [0, 1, 6, 11, 13]) {
        formant({
          frequency: 220 * Math.pow(2, semitone / 12),
          duration: 1.2,
          band: 1600,
          q: 1.2,
          attack: 0.01,
          peak: 0.05,
          wet: 0.6,
        });
      }
      burst({ duration: 0.25, type: "highpass", frequency: 2500, peak: 0.08, wet: 0.5 });
      tone({ type: "sine", frequency: 65, frequencyEnd: 35, duration: 1.2, peak: 0.28, wet: 0.3 });
      break;
    }
    case "sense": {
      // He knows where you are: a reversed swell that snaps off into a hiss.
      tone({
        type: "sawtooth",
        frequency: 110,
        frequencyEnd: 220,
        duration: 1.6,
        attack: 1.5,
        peak: 0.05,
        wet: 0.8,
      });
      burst({
        duration: 1.6,
        type: "bandpass",
        frequency: 500,
        frequencyEnd: 6000,
        q: 2,
        peak: 0.07,
        wet: 0.7,
      });
      burst({ duration: 0.5, type: "highpass", frequency: 5000, peak: 0.06, delay: 1.5, wet: 0.9 });
      break;
    }
    case "shift": {
      // Unnatural speed: a warped rush of air that pitches past you.
      burst({
        duration: 0.9,
        type: "bandpass",
        frequency: 300,
        frequencyEnd: 3000,
        q: 1.5,
        peak: 0.16,
        rate: 0.5,
        pan: placed,
        wet: 0.6,
      });
      tone({
        type: "sawtooth",
        frequency: 90,
        frequencyEnd: 45,
        duration: 0.9,
        peak: 0.05,
        wet: 0.5,
      });
      break;
    }
    case "stab": {
      // The knife: a fast swish, then a dull, wet hit.
      burst({
        duration: 0.12,
        type: "bandpass",
        frequency: 4200,
        frequencyEnd: 1200,
        q: 2,
        peak: 0.12,
      });
      burst({
        duration: 0.25,
        type: "lowpass",
        frequency: 500,
        frequencyEnd: 150,
        peak: 0.26,
        delay: 0.08,
      });
      tone({
        type: "sine",
        frequency: 95,
        frequencyEnd: 50,
        duration: 0.3,
        peak: 0.2,
        delay: 0.08,
      });
      break;
    }
    case "rummage": {
      // Digging through a bin or a box: clatter and rustle.
      burst({
        duration: rand(0.08, 0.2),
        type: "bandpass",
        frequency: rand(1200, 3200),
        q: 2,
        peak: 0.06,
      });
      if (Math.random() < 0.5)
        tone({
          type: "triangle",
          frequency: rand(700, 1400),
          duration: 0.12,
          peak: 0.02,
          wet: 0.3,
        });
      break;
    }
    case "engine": {
      // The car: a struggling starter, then the engine catches and roars.
      for (let i = 0; i < 5; i++)
        burst({
          duration: 0.14,
          type: "lowpass",
          frequency: 600,
          peak: 0.12,
          rate: 0.6,
          delay: i * 0.18,
        });
      tone({
        type: "sawtooth",
        frequency: 38,
        frequencyEnd: 70,
        duration: 2.8,
        attack: 0.3,
        peak: 0.12,
        delay: 0.95,
        wet: 0.3,
      });
      burst({
        duration: 2.6,
        type: "lowpass",
        frequency: 300,
        frequencyEnd: 900,
        peak: 0.14,
        rate: 0.4,
        delay: 0.95,
      });
      break;
    }
    case "dial": {
      // Payphone: dial tone, a few keypad beeps, a distant ring.
      const digits = [
        [697, 1209],
        [697, 1209],
        [941, 1336],
      ];
      digits.forEach(([low, high], i) => {
        tone({ type: "sine", frequency: low, duration: 0.14, peak: 0.03, delay: i * 0.2 });
        tone({ type: "sine", frequency: high, duration: 0.14, peak: 0.03, delay: i * 0.2 });
      });
      tone({ type: "sine", frequency: 440, duration: 1, peak: 0.02, delay: 0.8 });
      tone({ type: "sine", frequency: 480, duration: 1, peak: 0.02, delay: 0.8 });
      break;
    }
    case "creak": {
      // An old door on dry hinges: a slow, rising, rasping squeal.
      formant({
        frequency: rand(160, 220),
        frequencyEnd: rand(380, 520),
        duration: 0.9,
        band: rand(1400, 2200),
        q: 8,
        attack: 0.15,
        peak: 0.04 * intensity,
        pan: placed,
        wet: 0.4,
      });
      break;
    }
    case "slam": {
      // A door banging shut against its frame.
      burst({
        duration: 0.18,
        type: "lowpass",
        frequency: 900,
        frequencyEnd: 200,
        peak: 0.2 * intensity,
        pan: placed,
        wet: 0.4,
      });
      tone({
        type: "sine",
        frequency: 110,
        frequencyEnd: 60,
        duration: 0.25,
        peak: 0.12 * intensity,
        pan: placed,
      });
      break;
    }
    case "latch": {
      // A deadbolt thrown: two crisp metal clicks.
      for (const delay of [0, 0.09])
        tone({
          type: "square",
          frequency: rand(1900, 2300),
          duration: 0.03,
          peak: 0.03,
          delay,
          wet: 0.2,
        });
      burst({ duration: 0.05, type: "highpass", frequency: 3000, peak: 0.04 });
      break;
    }
    case "siren": {
      // Police at last: a wailing siren sweeping up and down.
      for (let i = 0; i < 3; i++)
        tone({
          type: "square",
          frequency: 650,
          frequencyEnd: 1300,
          duration: 0.6,
          attack: 0.3,
          peak: 0.025,
          delay: i * 1.2,
          pan: placed,
          wet: 0.5,
        });
      break;
    }
    case "fall": {
      // Dropping into the abyss: a long falling whoosh.
      burst({
        duration: 1.1,
        type: "bandpass",
        frequency: 1400,
        frequencyEnd: 180,
        q: 1.2,
        peak: 0.12,
        wet: 0.3,
      });
      tone({ type: "sine", frequency: 420, frequencyEnd: 110, duration: 1, peak: 0.03, wet: 0.4 });
      break;
    }
    case "spin": {
      // Tornado spin: a whirring whoosh that wobbles as it turns.
      for (let i = 0; i < 3; i++) {
        burst({
          duration: 0.14,
          type: "bandpass",
          frequency: 700 + i * 350,
          frequencyEnd: 1600 + i * 300,
          q: 2,
          peak: 0.08,
          delay: i * 0.12,
          pan: i % 2 ? 0.3 : -0.3,
        });
      }
      break;
    }
    case "crate": {
      // Splintering pine box: a crack and some rattling slats.
      burst({ duration: 0.05, type: "highpass", frequency: 1800, peak: 0.12, pan: placed });
      burst({ duration: 0.18, type: "bandpass", frequency: 650, q: 1.6, peak: 0.14, pan: placed });
      for (let i = 0; i < 3; i++) {
        tone({
          type: "triangle",
          frequency: rand(260, 520),
          duration: 0.06,
          peak: 0.04,
          delay: 0.04 + i * rand(0.03, 0.06),
          pan: placed,
        });
      }
      break;
    }
    case "fruit": {
      // A bright little pop that climbs as a streak builds.
      const lift = Math.pow(2, Math.round(intensity * 7) / 12);
      tone({
        type: "sine",
        frequency: 880 * lift,
        frequencyEnd: 1320 * lift,
        duration: 0.09,
        peak: 0.07,
      });
      tone({ type: "triangle", frequency: 1760 * lift, duration: 0.05, peak: 0.02, delay: 0.02 });
      break;
    }
    case "boing": {
      tone({
        type: "sine",
        frequency: 180,
        frequencyEnd: 520,
        duration: 0.22,
        peak: 0.16,
        wet: 0.2,
      });
      tone({ type: "triangle", frequency: 360, frequencyEnd: 1040, duration: 0.16, peak: 0.04 });
      break;
    }
    case "fuse": {
      // Three countdown ticks over a hissing fuse.
      burst({ duration: 3, type: "highpass", frequency: 4200, peak: 0.03, pan: placed });
      for (let i = 0; i < 3; i++) {
        tone({
          type: "square",
          frequency: 990,
          duration: 0.07,
          peak: 0.035,
          delay: i,
          pan: placed,
        });
      }
      break;
    }
    case "boom": {
      burst({
        duration: 0.9,
        type: "lowpass",
        frequency: 900,
        frequencyEnd: 120,
        peak: 0.34,
        wet: 0.5,
        pan: placed,
      });
      tone({ type: "sine", frequency: 90, frequencyEnd: 28, duration: 0.9, peak: 0.4, wet: 0.3 });
      burst({ duration: 0.08, type: "highpass", frequency: 2400, peak: 0.12, pan: placed });
      break;
    }
    case "checkpoint": {
      for (const [index, frequency] of [659.3, 784, 1046.5].entries()) {
        tone({
          type: "triangle",
          frequency,
          duration: 0.3,
          peak: 0.06,
          delay: index * 0.08,
          wet: 0.4,
        });
      }
      break;
    }
    case "mask": {
      // A wooden mask blowing into place: a breathy chord.
      for (const frequency of [392, 493.9, 587.3]) {
        formant({ frequency, duration: 0.7, band: 1200, q: 3, peak: 0.03, attack: 0.08, wet: 0.6 });
      }
      burst({
        duration: 0.5,
        type: "bandpass",
        frequency: 900,
        frequencyEnd: 2200,
        q: 1,
        peak: 0.06,
      });
      break;
    }
    case "crystal": {
      // Power crystal: a shimmering rising arpeggio into a held chord.
      for (const [index, semitone] of [0, 4, 7, 11, 12, 16, 19].entries()) {
        tone({
          type: "sine",
          frequency: 523.25 * Math.pow(2, semitone / 12),
          duration: 1.6 - index * 0.1,
          peak: 0.05,
          delay: index * 0.07,
          wet: 0.8,
        });
      }
      break;
    }
    case "gem": {
      for (const [index, semitone] of [0, 7, 12, 19, 24].entries()) {
        tone({
          type: "triangle",
          frequency: 783.99 * Math.pow(2, semitone / 12),
          duration: 0.9,
          peak: 0.04,
          delay: index * 0.09,
          wet: 0.9,
        });
      }
      break;
    }
    case "whoa": {
      // The classic "whoa": a falling voice with a spinning wobble.
      formant({ frequency: 330, frequencyEnd: 150, duration: 0.8, band: 900, q: 4, peak: 0.07 });
      tone({
        type: "sine",
        frequency: 700,
        frequencyEnd: 180,
        duration: 0.7,
        peak: 0.04,
        wet: 0.4,
      });
      break;
    }
  }
}

// --- Ambience beds -------------------------------------------------------

function loopedNoise(
  active: Graph,
  filterType: BiquadFilterType,
  frequency: number,
  peak: number,
): { source: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } {
  const source = active.context.createBufferSource();
  source.buffer = active.noise;
  source.loop = true;
  source.playbackRate.value = rand(0.4, 0.6);
  const filter = active.context.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = frequency;
  const gain = active.context.createGain();
  gain.gain.value = peak;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(active.ambience);
  source.start();
  return { source, filter, gain };
}

function addSway(
  active: Graph,
  target: AudioParam,
  baseRate: number,
  depth: number,
  disposables: AudioNode[],
) {
  const lfo = active.context.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = baseRate;
  const scaler = active.context.createGain();
  scaler.gain.value = depth;
  lfo.connect(scaler);
  scaler.connect(target);
  lfo.start();
  disposables.push(lfo, scaler);
}

/** Schedules `callback` on a loose loop with a random delay between runs. */
function every(
  active: Graph,
  minSeconds: number,
  maxSeconds: number,
  callback: () => void,
  disposables: AudioNode[],
): { stop: () => void } {
  let stopped = false;
  let timer = 0;
  const tick = () => {
    if (stopped) return;
    try {
      callback();
    } catch {
      /* A failed chirp must not kill the bed. */
    }
    timer = window.setTimeout(tick, rand(minSeconds, maxSeconds) * 1000);
  };
  timer = window.setTimeout(tick, rand(0.2, 1.5) * 1000);
  const handle = {
    stop: () => {
      stopped = true;
      window.clearTimeout(timer);
    },
  };
  disposables.push({ disconnect: () => handle.stop() } as unknown as AudioNode);
  return handle;
}

function chirp(active: Graph, base: number, pan: number, syllables: number, peak: number) {
  const at = active.context.currentTime;
  for (let i = 0; i < syllables; i++) {
    const start = at + i * rand(0.09, 0.14);
    const osc = active.context.createOscillator();
    osc.type = "sine";
    const from = base * rand(0.95, 1.1);
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(from * rand(1.15, 1.4), start + 0.07);
    const gain = active.context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.09);
    const panner = active.context.createStereoPanner();
    panner.pan.value = pan;
    osc.connect(gain);
    gain.connect(panner);
    panner.connect(active.ambience);
    voices++;
    osc.onended = () => {
      voices--;
      osc.disconnect();
      gain.disconnect();
      panner.disconnect();
    };
    osc.start(start);
    osc.stop(start + 0.12);
  }
}

function cricketTrain(active: Graph) {
  const at = active.context.currentTime;
  const pulses = 3 + Math.floor(Math.random() * 4);
  const frequency = rand(4000, 4600);
  const pan = rand(-0.7, 0.7);
  for (let i = 0; i < pulses; i++) {
    const start = at + i * 0.07;
    const osc = active.context.createOscillator();
    osc.type = "sine";
    osc.frequency.value = frequency;
    const gain = active.context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.012, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.05);
    const panner = active.context.createStereoPanner();
    panner.pan.value = pan;
    osc.connect(gain);
    gain.connect(panner);
    panner.connect(active.ambience);
    fireAndForget(osc, gain, panner);
    osc.start(start);
    osc.stop(start + 0.07);
  }
}

function stopNodes(nodes: AudioNode[]) {
  for (const node of nodes) {
    try {
      if (node instanceof AudioScheduledSourceNode) node.stop();
      else node.disconnect();
    } catch {
      /* Already stopped: teardown is best-effort. */
    }
  }
}

function meadowBed(active: Graph): () => void {
  const disposables: AudioNode[] = [];
  const wind = loopedNoise(active, "lowpass", 420, 0.045);
  disposables.push(wind.source, wind.filter, wind.gain);
  addSway(active, wind.gain.gain, 0.07, 0.025, disposables);
  addSway(active, wind.filter.frequency, 0.05, 150, disposables);
  const leaves = loopedNoise(active, "highpass", 3500, 0.008);
  disposables.push(leaves.source, leaves.filter, leaves.gain);
  addSway(active, leaves.gain.gain, 0.11, 0.005, disposables);
  every(
    active,
    2,
    7,
    () => chirp(active, rand(2200, 3400), rand(-0.7, 0.7), 2 + Math.floor(Math.random() * 3), 0.03),
    disposables,
  );
  return () => stopNodes(disposables);
}

function groveBed(active: Graph): () => void {
  // Night hollow: cold wind, a detuned minor drone that breathes, crickets
  // that fall silent now and then, a far-off bell, owls and branch creaks.
  const disposables: AudioNode[] = [];
  const wind = loopedNoise(active, "lowpass", 300, 0.04);
  disposables.push(wind.source, wind.filter, wind.gain);
  addSway(active, wind.gain.gain, 0.06, 0.025, disposables);
  addSway(active, wind.filter.frequency, 0.04, 120, disposables);
  const droneGain = active.context.createGain();
  droneGain.gain.value = 0.022;
  const droneFilter = active.context.createBiquadFilter();
  droneFilter.type = "lowpass";
  droneFilter.frequency.value = 380;
  for (const [frequency, detune] of [
    [55, 0],
    [65.4, 9],
    [82.4, -7],
  ]) {
    const osc = active.context.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = frequency;
    osc.detune.value = detune;
    osc.connect(droneFilter);
    osc.start();
    disposables.push(osc);
  }
  droneFilter.connect(droneGain);
  droneGain.connect(active.ambience);
  disposables.push(droneFilter, droneGain);
  addSway(active, droneGain.gain, 0.05, 0.012, disposables);
  addSway(active, droneFilter.frequency, 0.03, 160, disposables);
  every(active, 1.5, 4.5, () => Math.random() < 0.8 && cricketTrain(active), disposables);
  every(
    active,
    18,
    40,
    () => {
      // Distant church bell: inharmonic partials with a long reverb tail.
      const at = active.context.currentTime;
      for (const ratio of [1, 2.4, 2.98, 4.2]) {
        const osc = active.context.createOscillator();
        osc.type = "sine";
        osc.frequency.value = 196 * ratio;
        const gain = active.context.createGain();
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.012 / ratio, at + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0005, at + 4);
        osc.connect(gain);
        gain.connect(active.reverb);
        gain.connect(active.ambience);
        fireAndForget(osc, gain);
        osc.start(at);
        osc.stop(at + 4.1);
      }
    },
    disposables,
  );
  every(
    active,
    6,
    14,
    () => {
      // Branch creak: a slow, rough filtered sweep.
      const at = active.context.currentTime;
      const duration = rand(0.6, 1.4);
      const osc = active.context.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(rand(70, 110), at);
      osc.frequency.linearRampToValueAtTime(rand(120, 190), at + duration);
      const filter = active.context.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = rand(700, 1300);
      filter.Q.value = 6;
      const gain = active.context.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.018, at + duration * 0.3);
      gain.gain.linearRampToValueAtTime(0, at + duration);
      const panner = active.context.createStereoPanner();
      panner.pan.value = rand(-0.9, 0.9);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(panner);
      panner.connect(active.ambience);
      panner.connect(active.reverb);
      fireAndForget(osc, filter, gain, panner);
      osc.start(at);
      osc.stop(at + duration + 0.05);
    },
    disposables,
  );
  every(
    active,
    14,
    30,
    () => {
      const at = active.context.currentTime;
      for (const [index, frequency] of [340, 300].entries()) {
        const osc = active.context.createOscillator();
        osc.type = "sine";
        osc.frequency.value = frequency;
        const gain = active.context.createGain();
        const start = at + index * 0.35;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.02, start + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
        osc.connect(gain);
        gain.connect(active.ambience);
        fireAndForget(osc, gain);
        osc.start(start);
        osc.stop(start + 0.35);
      }
    },
    disposables,
  );
  every(active, 26, 55, () => wolfHowl(active), disposables);
  every(active, 40, 80, () => musicBox(active), disposables);
  every(active, 16, 34, () => playSound("whisper", { intensity: 0.3 }), disposables);
  return () => stopNodes(disposables);
}

function wolfHowl(active: Graph) {
  // Far off: a rising, wavering howl that sags away.
  const at = active.context.currentTime;
  const osc = active.context.createOscillator();
  osc.type = "sawtooth";
  const base = rand(280, 340);
  osc.frequency.setValueAtTime(base, at);
  osc.frequency.linearRampToValueAtTime(base * 1.7, at + 0.7);
  osc.frequency.setValueAtTime(base * 1.7, at + 1.6);
  osc.frequency.linearRampToValueAtTime(base * 1.15, at + 3);
  const vibrato = active.context.createOscillator();
  vibrato.frequency.value = 5.5;
  const depth = active.context.createGain();
  depth.gain.value = 7;
  vibrato.connect(depth);
  depth.connect(osc.frequency);
  const filter = active.context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  const gain = active.context.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.012, at + 0.5);
  gain.gain.setValueAtTime(0.012, at + 2);
  gain.gain.linearRampToValueAtTime(0, at + 3.1);
  const panner = active.context.createStereoPanner();
  panner.pan.value = rand(-0.9, 0.9);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(panner);
  panner.connect(active.ambience);
  panner.connect(active.reverb);
  fireAndForget(osc, filter, gain, panner, vibrato, depth);
  vibrato.start(at);
  vibrato.stop(at + 3.2);
  osc.start(at);
  osc.stop(at + 3.2);
}

// A minor lullaby on a music box that is slowly going out of tune.
const LULLABY = [69, 72, 76, 74, 72, 71, 68, 69, 64, 69];

function musicBox(active: Graph) {
  const at = active.context.currentTime;
  const sag = rand(0.97, 0.99);
  LULLABY.forEach((note, i) => {
    const start = at + i * 0.5 + (i === LULLABY.length - 1 ? 0.5 : 0);
    const frequency = 440 * Math.pow(2, (note - 69) / 12) * Math.pow(sag, i / LULLABY.length);
    for (const [ratio, peak] of [
      [1, 0.014],
      [2.01, 0.005],
    ]) {
      const osc = active.context.createOscillator();
      osc.type = ratio === 1 ? "triangle" : "sine";
      osc.frequency.value = frequency * ratio;
      const gain = active.context.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(peak, start + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0005, start + 1.2);
      osc.connect(gain);
      gain.connect(active.ambience);
      gain.connect(active.reverb);
      fireAndForget(osc, gain);
      osc.start(start);
      osc.stop(start + 1.25);
    }
  });
}

function stillBed(active: Graph): () => void {
  // Quiet interior: faint air tone and nothing that demands attention.
  const disposables: AudioNode[] = [];
  const air = loopedNoise(active, "lowpass", 180, 0.018);
  disposables.push(air.source, air.filter, air.gain);
  addSway(active, air.gain.gain, 0.05, 0.006, disposables);
  return () => stopNodes(disposables);
}

function ashBed(active: Graph): () => void {
  // Boss arena: low embers-and-ash drone with random crackle.
  const disposables: AudioNode[] = [];
  const droneGain = active.context.createGain();
  droneGain.gain.value = 0.05;
  const filter = active.context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 220;
  const first = active.context.createOscillator();
  first.type = "sine";
  first.frequency.value = 55;
  const second = active.context.createOscillator();
  second.type = "sine";
  second.frequency.value = 82.5;
  second.detune.value = 6;
  first.connect(filter);
  second.connect(filter);
  filter.connect(droneGain);
  droneGain.connect(active.ambience);
  first.start();
  second.start();
  disposables.push(first, second, filter, droneGain);
  addSway(active, droneGain.gain, 0.08, 0.015, disposables);
  every(
    active,
    0.3,
    1.6,
    () => {
      const at = active.context.currentTime;
      const source = active.context.createBufferSource();
      source.buffer = active.noise;
      source.playbackRate.value = rand(1.2, 1.8);
      const crackleFilter = active.context.createBiquadFilter();
      crackleFilter.type = "highpass";
      crackleFilter.frequency.value = rand(2500, 5000);
      const gain = active.context.createGain();
      gain.gain.setValueAtTime(rand(0.008, 0.03), at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + rand(0.02, 0.06));
      const panner = active.context.createStereoPanner();
      panner.pan.value = rand(-0.8, 0.8);
      source.connect(crackleFilter);
      crackleFilter.connect(gain);
      gain.connect(panner);
      panner.connect(active.ambience);
      fireAndForget(source, crackleFilter, gain, panner);
      source.start(at);
      source.stop(at + 0.08);
    },
    disposables,
  );
  return () => stopNodes(disposables);
}

function applyMood() {
  const active = graph;
  if (!active) return;
  switch (mood) {
    case "meadow":
      moodCleanup = meadowBed(active);
      break;
    case "grove":
      moodCleanup = groveBed(active);
      break;
    case "still":
      moodCleanup = stillBed(active);
      break;
    case "ash":
      moodCleanup = ashBed(active);
      break;
    case "museum":
      moodCleanup = museumBed(active);
      break;
  }
}

// --- Museum bed and wing zones --------------------------------------------

/** A single soft note, part dry and part sent into the reverb. */
function ambientPing(
  active: Graph,
  destination: AudioNode,
  options: {
    type?: OscillatorType;
    frequency: number;
    frequencyEnd?: number;
    duration: number;
    peak: number;
    wet?: number;
    pan?: number;
  },
) {
  const at = active.context.currentTime;
  const osc = active.context.createOscillator();
  osc.type = options.type ?? "sine";
  osc.frequency.setValueAtTime(options.frequency, at);
  if (options.frequencyEnd) {
    osc.frequency.exponentialRampToValueAtTime(options.frequencyEnd, at + options.duration);
  }
  const gain = active.context.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(options.peak, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0005, at + options.duration);
  const panner = active.context.createStereoPanner();
  panner.pan.value = options.pan ?? rand(-0.7, 0.7);
  osc.connect(gain);
  gain.connect(panner);
  panner.connect(destination);
  const send = active.context.createGain();
  send.gain.value = options.wet ?? 0.6;
  panner.connect(send);
  send.connect(active.reverb);
  fireAndForget(osc, gain, panner, send);
  osc.start(at);
  osc.stop(at + options.duration + 0.05);
}

/** A short filtered noise tick (clock, crackle, page, drip). */
function ambientTick(
  active: Graph,
  destination: AudioNode,
  options: {
    type: BiquadFilterType;
    frequency: number;
    duration: number;
    peak: number;
    q?: number;
    pan?: number;
  },
) {
  const at = active.context.currentTime;
  const source = active.context.createBufferSource();
  source.buffer = active.noise;
  source.playbackRate.value = rand(0.9, 1.3);
  const filter = active.context.createBiquadFilter();
  filter.type = options.type;
  filter.frequency.value = options.frequency;
  filter.Q.value = options.q ?? 1;
  const gain = active.context.createGain();
  gain.gain.setValueAtTime(options.peak, at);
  gain.gain.exponentialRampToValueAtTime(0.0005, at + options.duration);
  const panner = active.context.createStereoPanner();
  panner.pan.value = options.pan ?? rand(-0.6, 0.6);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(panner);
  panner.connect(destination);
  fireAndForget(source, filter, gain, panner);
  source.start(at);
  source.stop(at + options.duration + 0.05);
}

/** Sustained sine pad voices with a slow breathing sway. */
function pad(
  active: Graph,
  destination: AudioNode,
  frequencies: number[],
  peak: number,
  disposables: AudioNode[],
) {
  const gain = active.context.createGain();
  gain.gain.value = peak;
  gain.connect(destination);
  disposables.push(gain);
  addSway(active, gain.gain, 0.06, peak * 0.4, disposables);
  for (const [index, frequency] of frequencies.entries()) {
    const osc = active.context.createOscillator();
    osc.type = "sine";
    osc.frequency.value = frequency;
    osc.detune.value = index % 2 ? 5 : -5;
    osc.connect(gain);
    osc.start();
    disposables.push(osc);
  }
}

function museumBed(active: Graph): () => void {
  // Large stone interior: air handling, a faint electrical hum, and the odd
  // distant creak rolling around the halls.
  const disposables: AudioNode[] = [];
  const air = loopedNoise(active, "lowpass", 170, 0.022);
  disposables.push(air.source, air.filter, air.gain);
  addSway(active, air.gain.gain, 0.04, 0.008, disposables);
  pad(active, active.ambience, [58, 116.5], 0.006, disposables);
  every(
    active,
    7,
    16,
    () =>
      ambientPing(active, active.ambience, {
        frequency: rand(700, 1300),
        frequencyEnd: rand(450, 650),
        duration: rand(0.25, 0.5),
        peak: 0.01,
        wet: 0.9,
      }),
    disposables,
  );
  return () => stopNodes(disposables);
}

function zoneBed(active: Graph, which: SoundZone, out: GainNode): AudioNode[] {
  const disposables: AudioNode[] = [];
  switch (which) {
    case "halls":
      break;
    case "archive": {
      // A slow clock somewhere in the stacks and the odd turning page.
      let tock = false;
      every(
        active,
        1,
        1,
        () => {
          tock = !tock;
          ambientTick(active, out, {
            type: "bandpass",
            frequency: tock ? 1800 : 2300,
            q: 6,
            duration: 0.04,
            peak: 0.05,
            pan: -0.35,
          });
        },
        disposables,
      );
      every(
        active,
        5,
        12,
        () =>
          ambientTick(active, out, {
            type: "bandpass",
            frequency: 3200,
            q: 0.8,
            duration: 0.35,
            peak: 0.02,
          }),
        disposables,
      );
      break;
    }
    case "mirrors": {
      // Cold glass: a thin open-fifth drone and high shimmering pings.
      pad(active, out, [220, 330.5], 0.008, disposables);
      every(
        active,
        1.5,
        4,
        () =>
          ambientPing(active, out, {
            type: "triangle",
            frequency: rand(2000, 4200),
            duration: rand(0.8, 1.6),
            peak: 0.012,
            wet: 0.95,
          }),
        disposables,
      );
      break;
    }
    case "garden": {
      // Breeze through leaves, birds, and water dripping into the drop.
      const wind = loopedNoise(active, "lowpass", 520, 0.03);
      wind.gain.disconnect();
      wind.gain.connect(out);
      disposables.push(wind.source, wind.filter, wind.gain);
      addSway(active, wind.gain.gain, 0.08, 0.015, disposables);
      every(
        active,
        2,
        6,
        () =>
          chirp(
            active,
            rand(2400, 3600),
            rand(-0.7, 0.7),
            2 + Math.floor(Math.random() * 3),
            0.025,
          ),
        disposables,
      );
      every(
        active,
        0.8,
        2.5,
        () =>
          ambientPing(active, out, {
            frequency: rand(900, 1300),
            frequencyEnd: rand(1800, 2600),
            duration: 0.08,
            peak: 0.02,
            wet: 0.7,
          }),
        disposables,
      );
      break;
    }
    case "crypt": {
      // Embers: a low throat of a drone, constant crackle, deep settling booms.
      pad(active, out, [55, 82.5], 0.03, disposables);
      every(
        active,
        0.15,
        0.9,
        () =>
          ambientTick(active, out, {
            type: "highpass",
            frequency: rand(2500, 5000),
            duration: rand(0.02, 0.06),
            peak: rand(0.01, 0.035),
            pan: rand(-0.8, 0.8),
          }),
        disposables,
      );
      every(
        active,
        8,
        18,
        () =>
          ambientPing(active, out, {
            frequency: 60,
            frequencyEnd: 32,
            duration: 1.4,
            peak: 0.07,
            wet: 0.5,
          }),
        disposables,
      );
      break;
    }
    case "observatory": {
      // Celestial: a suspended chord and slow twinkles high in the dome.
      pad(active, out, [196, 293.7, 392, 587.3], 0.006, disposables);
      every(
        active,
        0.8,
        2.4,
        () =>
          ambientPing(active, out, {
            type: "triangle",
            frequency: 1567.98 * Math.pow(2, [0, 2, 4, 7, 9][Math.floor(Math.random() * 5)] / 12),
            duration: 1.2,
            peak: 0.012,
            wet: 0.95,
          }),
        disposables,
      );
      break;
    }
    case "vault": {
      // Warm, reverent choir-like pad.
      pad(active, out, [130.8, 196, 261.6, 329.6], 0.007, disposables);
      break;
    }
  }
  return disposables;
}

function applyZone() {
  const active = graph;
  if (!active) return;
  const now = active.context.currentTime;
  const previous = zoneLayer;
  if (previous) {
    previous.gain.gain.setTargetAtTime(0, now, 0.5);
    window.setTimeout(previous.stop, 3000);
  }
  zoneLayer = undefined;
  if (!zone) return;
  const gain = active.context.createGain();
  gain.gain.value = 0;
  gain.connect(active.ambience);
  gain.gain.setTargetAtTime(1, now, 0.8);
  const disposables = zoneBed(active, zone, gain);
  zoneLayer = {
    gain,
    stop: () => {
      stopNodes(disposables);
      gain.disconnect();
    },
  };
}
