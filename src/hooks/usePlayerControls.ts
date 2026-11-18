import { useEffect, useRef } from "react";
import { useGame } from "./useGame";
import { heldControls, mountPlayerControls, type PlayerControls } from "../runtime/playerInput";

export {
  heldControls,
  pressPlayerAttack,
  pressParry,
  pressLockOn,
  setControlsPaused,
  setPlayerControl,
} from "../runtime/playerInput";
export type { ControlName, PlayerControls } from "../runtime/playerInput";

export function usePlayerControls(mouseAttack = false) {
  const controls = useRef<PlayerControls>({ ...heldControls() });
  const { settings } = useGame();
  useEffect(
    () => mountPlayerControls(settings, mouseAttack, controls),
    [mouseAttack, settings.bindings, settings.sprintKey],
  );
  return controls;
}
