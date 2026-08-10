import { useEffect, useLayoutEffect, useRef, useState } from "react";

const MOVE_TOLERANCE_PX = 12;
const TOOLTIP_SELECTOR = '[data-mobile-tooltip], [title]:not([title=""])';

interface TooltipState {
  text: string;
  x: number;
  y: number;
  placement: "above" | "below";
}

function tooltipText(element: Element) {
  return (element.getAttribute("data-mobile-tooltip") ?? element.getAttribute("title") ?? "").trim();
}

export function MobileLongPressTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const pendingTap = useRef<number | null>(null);
  const tooltipElement = useRef<HTMLDivElement | null>(null);
  const press = useRef<{ pointerId: number; x: number; y: number; target: HTMLElement } | null>(null);
  const activeTarget = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const clearPendingTap = () => {
      if (pendingTap.current !== null) window.clearTimeout(pendingTap.current);
      pendingTap.current = null;
    };
    const clearActiveTarget = () => {
      activeTarget.current?.removeAttribute("data-long-press-active");
      activeTarget.current = null;
    };
    const dismiss = () => {
      clearPendingTap();
      press.current = null;
      clearActiveTarget();
      setTooltip(null);
    };
    const cancelPending = () => {
      press.current = null;
    };

    const tooltipForTarget = (target: HTMLElement): TooltipState | null => {
      const text = tooltipText(target);
      if (!text) return null;
      const rect = target.getBoundingClientRect();
      const placement = rect.top >= 110 ? "above" : "below";
      return {
        text,
        x: Math.min(window.innerWidth - 18, Math.max(18, rect.left + rect.width / 2)),
        y: placement === "above" ? rect.top - 10 : rect.bottom + 10,
        placement,
      };
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" || event.isPrimary === false || event.button !== 0) return;
      const origin = event.target instanceof Element ? event.target : null;
      const target = origin?.closest(TOOLTIP_SELECTOR);
      if (!(target instanceof HTMLElement)) return;
      if (!tooltipText(target)) return;
      clearPendingTap();
      press.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, target };
    };

    const onPointerMove = (event: PointerEvent) => {
      const current = press.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > MOVE_TOLERANCE_PX) cancelPending();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (press.current?.pointerId !== event.pointerId) return;
      const target = press.current.target;
      press.current = null;
      const nextTooltip = tooltipForTarget(target);
      if (!nextTooltip) return;
      pendingTap.current = window.setTimeout(() => {
        clearActiveTarget();
        if (target.isConnected) {
          target.setAttribute("data-long-press-active", "true");
          activeTarget.current = target;
        }
        setTooltip(nextTooltip);
        pendingTap.current = null;
      }, 0);
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (press.current?.pointerId === event.pointerId) cancelPending();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerCancel, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("scroll", dismiss, true);
    window.addEventListener("blur", dismiss);
    window.addEventListener("resize", dismiss);
    document.addEventListener("visibilitychange", dismiss);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerCancel, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("blur", dismiss);
      window.removeEventListener("resize", dismiss);
      document.removeEventListener("visibilitychange", dismiss);
      clearPendingTap();
      clearActiveTarget();
    };
  }, []);

  useLayoutEffect(() => {
    const element = tooltipElement.current;
    if (!element || !tooltip) return;
    const rect = element.getBoundingClientRect();
    const desiredTop = tooltip.placement === "above" ? tooltip.y - rect.height : tooltip.y;
    const left = Math.min(window.innerWidth - rect.width - 12, Math.max(12, tooltip.x - rect.width / 2));
    const top = Math.min(window.innerHeight - rect.height - 12, Math.max(12, desiredTop));
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.transform = "none";
  }, [tooltip]);

  const closeVisibleTooltip = () => {
    if (pendingTap.current !== null) window.clearTimeout(pendingTap.current);
    pendingTap.current = null;
    press.current = null;
    activeTarget.current?.removeAttribute("data-long-press-active");
    activeTarget.current = null;
    setTooltip(null);
  };

  if (!tooltip) return null;
  return (
    <div className="mobile-tooltip-layer" onPointerDown={closeVisibleTooltip}>
      <div
        ref={tooltipElement}
        className={`mobile-long-press-tooltip ${tooltip.placement}`}
        role="tooltip"
        aria-live="polite"
        style={{ left: tooltip.x, top: tooltip.y }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {tooltip.text}
        <small>Tap outside to close</small>
      </div>
    </div>
  );
}
