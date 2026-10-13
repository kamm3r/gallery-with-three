/** Reactive trees reconsider priorities each tick; long-running actions own their state. */
export type BehaviorStatus = "success" | "failure" | "running";
export type BehaviorNode<Context> = {
  readonly name: string;
  tick: (context: Context) => BehaviorStatus;
};

export function condition<Context>(
  name: string,
  predicate: (context: Context) => boolean,
): BehaviorNode<Context> {
  return { name, tick: (context) => (predicate(context) ? "success" : "failure") };
}

export function action<Context>(
  name: string,
  tick: (context: Context) => BehaviorStatus,
): BehaviorNode<Context> {
  return { name, tick };
}

/** First child that succeeds or is running wins, in priority order. */
export function selector<Context>(
  name: string,
  ...children: BehaviorNode<Context>[]
): BehaviorNode<Context> {
  return {
    name,
    tick(context) {
      for (const child of children) {
        const status = child.tick(context);
        if (status !== "failure") return status;
      }
      return "failure";
    },
  };
}

/** All guards must succeed before the action runs. */
export function sequence<Context>(
  name: string,
  ...children: BehaviorNode<Context>[]
): BehaviorNode<Context> {
  return {
    name,
    tick(context) {
      for (const child of children) {
        const status = child.tick(context);
        if (status !== "success") return status;
      }
      return "success";
    },
  };
}
