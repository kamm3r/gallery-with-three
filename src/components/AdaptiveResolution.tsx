import { useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { createResolutionBudget, stepResolutionBudget } from "../gameplay/adaptiveResolution";
import { useEcsRef } from "../hooks/useEcsRef";

export function AdaptiveResolution({
  maximum,
  enabled,
  suspended = false,
  onChange,
  targetFps = 60,
}: {
  maximum: number;
  enabled: boolean;
  suspended?: boolean;
  onChange: (scale: number) => void;
  targetFps?: number;
}) {
  const runtime = useEcsRef("graphics-resolution", () => ({
    budget: createResolutionBudget(maximum),
    previous: 0,
    applied: maximum,
  }));
  useEffect(() => {
    runtime.current = { budget: createResolutionBudget(maximum), previous: 0, applied: maximum };
    onChange(maximum);
  }, [maximum, enabled, onChange, targetFps, runtime]);
  useEffect(() => {
    // A menu or shader preparation pauses sampling without reallocating at maximum DPR.
    runtime.current.previous = 0;
  }, [suspended, runtime]);
  useFrame(() => {
    const state = runtime.current;
    const now = performance.now(),
      frameMs = now - state.previous;
    const first = state.previous === 0;
    state.previous = now;
    if (first || !enabled || suspended || document.visibilityState !== "visible") return;
    const scale = stepResolutionBudget(state.budget, frameMs, maximum, targetFps);
    if (scale !== state.applied) {
      state.applied = scale;
      onChange(scale);
    }
  }, -2);
  return null;
}
