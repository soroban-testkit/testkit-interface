import { type RefObject, useLayoutEffect } from "react";

// Focus-return rule for dialogs and other transient surfaces (#111).
//
// When a surface opens, the element that had focus is remembered. When it
// closes, focus goes back to that element, whether the user confirmed,
// cancelled, or pressed Escape. If the element was removed or disabled while
// the surface was open, focus goes to the fallback instead, so it never drops
// to <body>. See the README section "Focus return for dialogs".

function canReceiveFocus(element: HTMLElement | null): element is HTMLElement {
  if (!element || !element.isConnected) return false;
  return !("disabled" in element && element.disabled === true);
}

/** Picks where focus should land when a surface closes. */
export function resolveFocusReturnTarget(
  trigger: HTMLElement | null,
  fallback: HTMLElement | null,
): HTMLElement | null {
  if (canReceiveFocus(trigger)) return trigger;
  if (canReceiveFocus(fallback)) return fallback;
  return null;
}

/**
 * Applies the focus-return rule to a surface controlled by `open`.
 *
 * The trigger is read in a layout effect, which runs before any effect inside
 * the surface. A dialog should therefore move focus into itself from a
 * `useEffect`, not with `autoFocus`, which runs before this hook can read the
 * trigger.
 */
export function useFocusReturn(open: boolean, fallbackRef: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    if (!open) return;

    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      // Runs on close and on unmount while open. The fallback is read here,
      // not copied at open time, so it reflects the element present at close.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      resolveFocusReturnTarget(trigger, fallbackRef.current)?.focus();
    };
  }, [open, fallbackRef]);
}
