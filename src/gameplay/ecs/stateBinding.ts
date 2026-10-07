import { trait, type World } from "koota";

/** AoS is appropriate for simulation records containing arrays and engine objects. */
export const GameplayState = trait(() => ({ value: undefined as unknown, domain: "" }));

/** A stable adapter for existing view/physics APIs. The entity owns mounted state. */
export function createStateBinding<T>(world: World, domain: string, initialize: () => T) {
  const owner = trait();
  let detached = initialize();
  let mounted = false;
  const binding = {
    get current(): T {
      if (!mounted) return detached;
      const entity = world.queryFirst(owner, GameplayState);
      if (!entity) throw new Error(`Missing ECS state: ${domain}`);
      return entity.get(GameplayState)!.value as T;
    },
    set current(value: T) {
      if (!mounted) detached = value;
      else {
        const entity = world.queryFirst(owner, GameplayState);
        if (!entity) throw new Error(`Missing ECS state: ${domain}`);
        entity.set(GameplayState, { value, domain });
      }
    },
    subscribe: (listener: () => void) => {
      return world.onChange(GameplayState, (entity) => {
        if (entity.has(owner)) listener();
      });
    },
    mount() {
      if (mounted) throw new Error(`ECS state already mounted: ${domain}`);
      const entity = world.spawn(owner, GameplayState({ value: detached, domain }));
      mounted = true;
      return () => {
        if (entity.isAlive()) {
          detached = entity.get(GameplayState)!.value as T;
          entity.destroy();
        }
        mounted = false;
      };
    },
  };
  return binding;
}
