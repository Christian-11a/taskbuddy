"use client";

import Script from "next/script";
import { useState } from "react";
import "../../styles/promo.css";
import { HOME_MARKUP } from "./HomePage.markup";

const HOME_MARKUP_WITH_MOBILE_JOIN_CTA = HOME_MARKUP.replace(
  '<nav class="site-nav" id="site-nav" aria-label="Primary navigation"><a href="#stories">How it works</a><a href="#features">Features</a><a href="#services">Services</a><a href="#faq">FAQ</a></nav>',
  '<nav class="site-nav" id="site-nav" aria-label="Primary navigation"><a href="#stories">How it works</a><a href="#features">Features</a><a href="#services">Services</a><a href="#faq">FAQ</a><a class="site-nav__cta site-nav__cta--primary site-nav__cta--mobile" href="#join">Join TaskBuddy</a></nav>',
);

const HOME_MARKUP_WITHOUT_DUPLICATE_SKIP_LINK = HOME_MARKUP_WITH_MOBILE_JOIN_CTA.replace(
  '<a class="skip-link" href="#main">Skip to content</a>',
  "",
);

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
  const [gsapReady, setGsapReady] = useState(false);
  const [scrollTriggerReady, setScrollTriggerReady] = useState(false);

  return (
    <div className="promo-site">
      <a className="skip-link" href="#main">Skip to content</a>
      <div dangerouslySetInnerHTML={{ __html: HOME_MARKUP_WITHOUT_DUPLICATE_SKIP_LINK }} />

      {/* Switzer remains on Fontshare because no licensed local font files are
          part of this repository. Bricolage Grotesque is self-hosted by
          next/font in the root layout. */}
      <link rel="preconnect" href="https://api.fontshare.com" />
      <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=switzer@400,500,600,700&display=swap" />

      {/* Load the motion dependencies sequentially. Next's afterInteractive
          scripts can otherwise race: script.js may initialize before
          ScrollTrigger exists and permanently select the heavier fallback. */}
      <Script
        src="/promo/vendor/gsap.min.js"
        strategy="afterInteractive"
        onReady={() => setGsapReady(true)}
      />
      {gsapReady && (
        <Script
          src="/promo/vendor/ScrollTrigger.min.js"
          strategy="afterInteractive"
          onReady={() => setScrollTriggerReady(true)}
        />
      )}
      {scrollTriggerReady && (
        <>
          <Script src="/promo/script.js" strategy="afterInteractive" />
          <Script src="/promo/auth.js" strategy="afterInteractive" />
        </>
      )}
    </div>
  );
}
