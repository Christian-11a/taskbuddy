"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Moon, Sun } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Light ↔ dark. Same state as Settings → Dark Mode. */
export function ThemeToggle() {
  const { darkMode, setDarkMode } = useApp();
  const reduce = useReducedMotion();
  const label = darkMode ? "Switch to light mode" : "Switch to dark mode";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" onClick={() => setDarkMode(!darkMode)} aria-label={label}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={darkMode ? "moon" : "sun"}
              initial={reduce ? false : { opacity: 0, rotate: -60, scale: 0.7 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, rotate: 60, scale: 0.7 }}
              transition={{ duration: 0.18 }}
              className="grid place-items-center"
            >
              {darkMode ? <Moon /> : <Sun />}
            </motion.span>
          </AnimatePresence>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
