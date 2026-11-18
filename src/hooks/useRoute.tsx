import { useLayoutEffect, useSyncExternalStore, type AnchorHTMLAttributes } from "react";
import { getGameRouter, type NavigateOptions } from "../runtime/router";

/** Temporary adapters for views still mounted by React. Navigation is native. */
export function useLocation() {
  const router = getGameRouter();
  return useSyncExternalStore(router.subscribe, router.getSnapshot);
}
export function useNavigate() {
  return getGameRouter().navigate;
}
export function useParams() {
  return useLocation().params;
}

export function Navigate({ to, replace = false }: { to: string; replace?: boolean }) {
  const navigate = useNavigate();
  useLayoutEffect(() => {
    navigate(to, { replace });
  }, [navigate, to, replace]);
  return null;
}

export function Link({
  to,
  replace,
  state,
  onClick,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & NavigateOptions & { to: string }) {
  const navigate = useNavigate();
  return (
    <a
      {...props}
      href={to}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          (props.target && props.target !== "_self") ||
          props.download !== undefined
        )
          return;
        if (new URL(to, window.location.href).origin !== window.location.origin) return;
        event.preventDefault();
        navigate(to, { replace, state });
      }}
    />
  );
}
