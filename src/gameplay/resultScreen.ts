let active = false;
export const isResultScreenActive = () => active;
export function setResultScreenActive(next: boolean) {
  active = next;
  // Set before releasing so pointerlockchange does not open Pause.
  if (next && document.pointerLockElement) document.exitPointerLock();
}
