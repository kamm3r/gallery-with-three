import { useCallback, useSyncExternalStore, type SetStateAction, type Dispatch } from "react";
import { useEcsRef } from "./useEcsRef";

/** Reactive view of ECS state for puzzle/checkpoint transitions. */
export function useEcsState<T>(
  domain: string,
  initialize: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const binding = useEcsRef(domain, () =>
    typeof initialize === "function" ? (initialize as () => T)() : initialize,
  );
  const value = useSyncExternalStore(binding.subscribe, () => binding.current);
  const set = useCallback(
    (next: SetStateAction<T>) => {
      binding.current =
        typeof next === "function" ? (next as (previous: T) => T)(binding.current) : next;
    },
    [binding],
  );
  return [value, set];
}
