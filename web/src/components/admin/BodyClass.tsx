"use client";

import { useEffect } from "react";

/**
 * Adds classes to <body> while mounted. The admin font variable lives on the
 * admin segment's wrapper, but dialogs, menus and toasts portal straight into
 * <body> — this puts them inside the same font scope.
 */
export function BodyClass({ className }: { className: string }) {
  useEffect(() => {
    const names = className.split(/\s+/).filter(Boolean);
    document.body.classList.add(...names);
    return () => document.body.classList.remove(...names);
  }, [className]);
  return null;
}
