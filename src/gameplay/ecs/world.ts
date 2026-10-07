import { createWorld } from "koota";
import {
  PlayerInput,
  ResultScreen,
  InventoryState,
  CameraRig,
  SprintGate,
  ControlStatus,
  HeldItems,
} from "./gameplayTraits.ts";
import { PlayerPosition, SimulationTime, VisibilityStats } from "./traits.ts";

export function createRuntimeWorld() {
  return createWorld(
    PlayerPosition,
    SimulationTime,
    VisibilityStats,
    PlayerInput,
    ResultScreen,
    InventoryState,
    CameraRig,
    SprintGate,
    ControlStatus,
    HeldItems,
  );
}

// One active game canvas. View effects own entity creation and teardown.
export const runtimeWorld = createRuntimeWorld();
