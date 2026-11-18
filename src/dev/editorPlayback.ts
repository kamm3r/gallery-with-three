import { useSyncExternalStore } from "react";

/** Shared editor clock; no saved game preference is changed by preview controls. */
let playing = false;
let paused = false;
let pendingSteps = 0;
let stepping = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
export function setEditorPlayback(active: boolean) {
  if (playing === active) return;
  playing = active;
  paused = false;
  pendingSteps = 0;
  stepping = false;
  notify();
}
export function setEditorPaused(active: boolean) {
  const next = playing && active;
  if (paused === next) return;
  paused = next;
  pendingSteps = 0;
  stepping = false;
  notify();
}
export function requestEditorStep() {
  if (playing && paused) pendingSteps = Math.min(8, pendingSteps + 1);
}
export function beginEditorFrame() {
  stepping = playing && paused && pendingSteps > 0;
  if (stepping) pendingSteps--;
  return stepping;
}
export function getEditorPlayback() {
  return playing;
}
export function getEditorPaused() {
  return paused;
}
export function isEditorStepFrame() {
  return stepping;
}
export function editorAnimationScale(delta: number, held: boolean) {
  if (held || (paused && !stepping)) return 0;
  return paused && stepping ? 1 / 60 / Math.max(delta, 1e-9) : 1;
}
export function editorFrameDelta(delta: number) {
  return paused ? (stepping ? 1 / 60 : 0) : delta;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useEditorPlayback() {
  return useSyncExternalStore(subscribe, getEditorPlayback, () => false);
}
export function useEditorPaused() {
  return useSyncExternalStore(subscribe, getEditorPaused, () => false);
}
