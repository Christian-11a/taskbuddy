"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { documentTitle, totalAttention } from "@/lib/attention";

const COUNT_PREFIX = /^\(\d+\)\s/;

/**
 * Puts the number of waiting items in the browser tab title: "(3) Users · TaskBuddy Admin".
 *
 * The count is stripped from whatever title is current (not from a title saved
 * earlier), so a route change, where Next sets a new page title, never brings
 * back the previous page's title. Cleanup also clears the count on sign-out
 * and on unmount.
 */
export function useDocumentTitleCount() {
  const { queueCounts, isLoggedIn } = useApp();
  const pathname = usePathname(); // Next sets a fresh title on each route; re-apply the count after it
  const total = isLoggedIn ? totalAttention(queueCounts) : 0;

  useEffect(() => {
    const base = () => document.title.replace(COUNT_PREFIX, "");
    // Brings the title to the correct prefix. Writes only when it differs, so
    // the observer's own write does not trigger another pass.
    const apply = () => {
      const current = document.title;
      const next = documentTitle(current.replace(COUNT_PREFIX, ""), total);
      if (next !== current) document.title = next;
    };

    // Watches the <title> text (and the title element itself being replaced).
    // Next may set the title after this effect has run, in either order.
    const observer = new MutationObserver(() => {
      apply();
      observe();
    });
    const observe = () => {
      observer.disconnect();
      const titleEl = document.querySelector("title");
      observer.observe(document.head, { childList: true }); // title element added/replaced
      observer.observe(titleEl ?? document.head, { childList: true, characterData: true, subtree: true });
    };

    apply();
    observe();
    return () => {
      observer.disconnect();
      document.title = base();
    };
  }, [total, pathname]);
}
