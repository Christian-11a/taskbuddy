"use client";

import Script from "next/script";
import "../../styles/promo.css";
import { HOME_MARKUP } from "./HomePage.markup";

/**
 * The public promotional homepage, ported from
 * taskbuddy-product-reference/public-site/index.html.
 *
 * The markup is rendered via dangerouslySetInnerHTML (see HomePage.markup.ts)
 * rather than hand-converted to JSX: it's our own trusted static content, and
 * script.js/auth.js drive it entirely through class names and data-attribute
 * selectors (not refs), so byte-identical markup is what keeps their behavior
 * — the story carousel, scroll-reveal, header hide/show, hero video toggle,
 * and the whole auth modal — working exactly as already validated, with zero
 * risk of a hand-transcription bug.
 */
export function HomePage() {
  return (
    <div className="promo-site">
      <a className="skip-link" href="#main">Skip to content</a>
      <div dangerouslySetInnerHTML={{ __html: HOME_MARKUP }} />

      {/* Fonts, matching the static prototype's <head> links exactly. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=switzer@400,500,600,700&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&display=swap" />

      {/* Same load order as the static prototype: GSAP + ScrollTrigger as
          globals, then script.js (site interactions), then auth.js (the
          account modal, now wired to the real backend via /api/auth/*). */}
      <Script src="/promo/vendor/gsap.min.js" strategy="afterInteractive" />
      <Script src="/promo/vendor/ScrollTrigger.min.js" strategy="afterInteractive" />
      <Script src="/promo/script.js" strategy="afterInteractive" />
      <Script src="/promo/auth.js" strategy="afterInteractive" />
    </div>
  );
}
