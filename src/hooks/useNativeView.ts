import { useLayoutEffect, useRef } from "react";

export type NativeView<Props> = { update: (props: Props) => void; dispose: () => void };

/** Mount adapter only. The view owns its DOM, subscriptions, and cleanup. */
export function useNativeView<Props>(
  props: Props,
  mount: (host: HTMLElement, props: Props) => NativeView<Props>,
) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<NativeView<Props> | null>(null);
  const initial = useRef({ props, mount });
  useLayoutEffect(() => {
    if (!host.current) return;
    view.current = initial.current.mount(host.current, initial.current.props);
    return () => {
      view.current?.dispose();
      view.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    view.current?.update(props);
  });
  return host;
}
