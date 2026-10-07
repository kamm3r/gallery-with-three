import { useLayoutEffect, useMemo } from "react";
import { createStateBinding } from "../gameplay/ecs/stateBinding";
import { runtimeWorld } from "../gameplay/ecs/world";

/** Lifecycle-owned ECS state, exposed as a ref adapter for the Three/Rapier views. */
export function useEcsRef<T>(domain: string, initialize: () => T) {
  // The factory follows useRef semantics: the initial value is captured once.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const binding = useMemo(() => createStateBinding(runtimeWorld, domain, initialize), []);
  useLayoutEffect(() => binding.mount(), [binding]);
  return binding;
}
