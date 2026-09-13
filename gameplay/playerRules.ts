export interface PortalEntryState {
  distance: number;
  grounded: boolean;
  feetHeight: number;
}

export function canEnterPortal({
  distance,
  grounded,
  feetHeight,
}: PortalEntryState) {
  return distance < 1.15 && !grounded && feetHeight > 0.08;
}

export function getGravityScale(verticalSpeed: number, jumpHeld: boolean) {
  if (verticalSpeed < 0) return 1;
  return jumpHeld ? 22 / 30 : 38 / 30;
}
