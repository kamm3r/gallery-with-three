// Worlds with stamina (Hollow Lane) switch sprinting off while the survivor
// is winded. The player controller reads this every frame.
let allowed = true;
export const isSprintAllowed = () => allowed;
export function setSprintAllowed(next: boolean) {
  allowed = next;
}
