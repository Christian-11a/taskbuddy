"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

const defaultFormat = (n: number) => Math.round(n).toLocaleString("en-PH");

interface AnimatedNumberProps {
  value: number;
  /** Formats every intermediate value, e.g. pesos or one decimal place. */
  format?: (n: number) => string;
  /** Seconds. */
  duration?: number;
  /** Count up from zero the first time it appears (dashboard KPIs). */
  countUpOnMount?: boolean;
  className?: string;
}

/**
 * A number that glides to its new value when live data changes, so an admin
 * notices *that* something moved without the layout jumping. Under reduced
 * motion it simply shows the new value.
 */
export function AnimatedNumber({ value, format = defaultFormat, duration = 0.6, countUpOnMount = false, className }: AnimatedNumberProps) {
  const reduce = useReducedMotion();
  const from = useRef(countUpOnMount ? 0 : value);
  const [display, setDisplay] = useState(() => (countUpOnMount && !reduce ? 0 : value));

  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (reduce || start === value) {
      setDisplay(value);
      return;
    }
    const controls = animate(start, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: setDisplay,
    });
    return () => controls.stop();
  }, [value, reduce, duration]);

  return <span className={cn("tabular", className)}>{format(display)}</span>;
}
