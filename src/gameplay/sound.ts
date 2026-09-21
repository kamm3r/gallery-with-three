export type SoundEffect = "step" | "jump" | "land" | "slash" | "portal";
let context: AudioContext | undefined;
let output: GainNode | undefined;
let noise: AudioBuffer | undefined;
let enabled = true;
let volume = 0.6;
let voices = 0;

export function configureSound(level: number, paused: boolean) {
  volume = Math.max(0, Math.min(1, level / 100));
  enabled = !paused;
  if (context && output)
    output.gain.setTargetAtTime(enabled ? volume : 0, context.currentTime, 0.015);
}

export function unlockSound() {
  try {
    if (!context) {
      context = new AudioContext();
      output = context.createGain();
      output.gain.value = enabled ? volume : 0;
      output.connect(context.destination);
      noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (context.state === "suspended") void context.resume().catch(() => {});
  } catch {
    /* Audio unavailable: gameplay remains usable. */
  }
}

export function playSound(effect: SoundEffect) {
  if (
    !context ||
    !output ||
    !noise ||
    context.state !== "running" ||
    !enabled ||
    !volume ||
    voices >= 12
  )
    return;
  const tone = effect === "jump" || effect === "portal";
  const duration =
    effect === "portal" ? 0.55 : effect === "slash" ? 0.22 : effect === "jump" ? 0.16 : 0.09;
  const gain = context.createGain();
  const filter = context.createBiquadFilter();
  const source = tone ? context.createOscillator() : context.createBufferSource();
  const now = context.currentTime;
  if (source instanceof OscillatorNode) {
    source.type = "sine";
    source.frequency.setValueAtTime(effect === "portal" ? 220 : 180, now);
    source.frequency.exponentialRampToValueAtTime(effect === "portal" ? 660 : 360, now + duration);
  } else {
    source.buffer = noise;
    source.playbackRate.value = 0.9 + Math.random() * 0.2;
  }
  filter.type = "lowpass";
  filter.frequency.value = effect === "slash" ? 2400 : tone ? 1800 : effect === "land" ? 450 : 800;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(effect === "step" ? 0.13 : 0.23, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(output);
  voices++;
  source.onended = () => {
    voices--;
    source.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
  source.start(now);
  source.stop(now + duration + 0.02);
}
