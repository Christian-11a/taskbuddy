"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import "../../styles/promo.css";
import "../../styles/guide.css";
import { GUIDE_TRACKS, TRACK_LABELS, trackOf } from "./guideLessons";
import type { GuideTrack } from "./guideLessons";
import { SiteHeader } from "./SiteHeader";

const STORAGE_KEY = "taskbuddy-guide-progress";
const TRACKS: GuideTrack[] = ["clients", "providers"];

function readProgress(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeProgress(ids: string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* storage blocked: progress simply lasts for this visit */
  }
}

function setHash(id: string): void {
  try {
    window.history.replaceState(null, "", `#${id}`);
  } catch {
    /* ignore */
  }
}

function lessonFromHash(): string | null {
  let id = window.location.hash.replace(/^#/, "");
  try {
    id = decodeURIComponent(id);
  } catch {
    return null;
  }
  return id && trackOf(id) ? id : null;
}

export function GuidePage() {
  const [track, setTrack] = useState<GuideTrack>("clients");
  const [activeId, setActiveId] = useState<string>(GUIDE_TRACKS.clients[0].id);
  const [done, setDone] = useState<string[]>([]);
  const tabRefs = useRef<Record<GuideTrack, HTMLButtonElement | null>>({ clients: null, providers: null });
  const playerRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Hydrate from the URL hash and storage after mount (both are browser-only).
  useEffect(() => {
    const applyHash = () => {
      const id = lessonFromHash();
      const t = id ? trackOf(id) : null;
      if (id && t) {
        setTrack(t);
        setActiveId(id);
      }
    };
    applyHash();
    queueMicrotask(() => setDone(readProgress()));
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  const lessons = GUIDE_TRACKS[track];
  const index = Math.max(0, lessons.findIndex((l) => l.id === activeId));
  const lesson = lessons[index];

  const select = useCallback((id: string) => {
    const t = trackOf(id);
    if (!t) return;
    setTrack(t);
    setActiveId(id);
    setHash(id);
  }, []);

  // Tapping a lesson in the list. On narrow screens the list sits above the
  // player, so bring the player into view and move focus to its heading so the
  // new lesson is announced. Not used on first load, hashchange or tab switches.
  const chooseFromList = (id: string) => {
    select(id);
    headingRef.current?.focus({ preventScroll: true });
    const panel = playerRef.current;
    if (!panel || typeof panel.scrollIntoView !== "function") return;
    const top = panel.getBoundingClientRect().top;
    // Only a sliver of the player peeking in at the bottom still counts as hidden.
    if (top >= 0 && top < window.innerHeight * 0.5) return;
    const reduceMotion =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panel.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
  };

  const switchTrack = (t: GuideTrack, focus = false) => {
    setTrack(t);
    const first = GUIDE_TRACKS[t][0].id;
    setActiveId(first);
    setHash(first);
    if (focus) tabRefs.current[t]?.focus();
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = TRACKS.indexOf(track);
    let next: GuideTrack | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = TRACKS[(i + 1) % TRACKS.length];
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = TRACKS[(i + TRACKS.length - 1) % TRACKS.length];
    else if (e.key === "Home") next = TRACKS[0];
    else if (e.key === "End") next = TRACKS[TRACKS.length - 1];
    if (next) {
      e.preventDefault();
      switchTrack(next, true);
    }
  };

  const isDone = done.includes(lesson.id);
  const toggleDone = () => {
    const next = isDone ? done.filter((x) => x !== lesson.id) : [...done, lesson.id];
    setDone(next);
    writeProgress(next);
  };
  const reset = () => {
    setDone([]);
    writeProgress([]);
  };

  const doneCount = lessons.filter((l) => done.includes(l.id)).length;

  return (
    <div className="promo-site">
      <SiteHeader current="guide" />
      <div className="account-shell">
        <main className="guide-main">
          <header className="guide-head">
            <p className="eyebrow">Guide</p>
            <h1 className="guide-title">Learn TaskBuddy step by step</h1>
            <p className="guide-intro">Short walkthroughs for clients and providers, from signing up to the finished job.</p>
          </header>

          <div className="guide-tabs" role="tablist" aria-label="Guide track">
            {TRACKS.map((t) => (
              <button
                key={t}
                ref={(el) => {
                  tabRefs.current[t] = el;
                }}
                type="button"
                role="tab"
                id={`guide-tab-${t}`}
                aria-selected={track === t}
                aria-controls="guide-panel"
                tabIndex={track === t ? 0 : -1}
                className="guide-tab"
                onClick={() => switchTrack(t)}
                onKeyDown={onTabKey}
              >
                {TRACK_LABELS[t]}
              </button>
            ))}
          </div>

          <div className="guide-layout" role="tabpanel" id="guide-panel" aria-labelledby={`guide-tab-${track}`}>
            <nav className="guide-list" aria-label={`${TRACK_LABELS[track]} lessons`}>
              <p className="guide-progress">
                {doneCount} of {lessons.length} complete
              </p>
              <ol>
                {lessons.map((l, i) => {
                  const complete = done.includes(l.id);
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        className="guide-item"
                        aria-current={l.id === lesson.id ? "true" : undefined}
                        onClick={() => chooseFromList(l.id)}
                      >
                        <span className="guide-item__num" aria-hidden="true">
                          {complete ? "✓" : i + 1}
                        </span>
                        <span className="guide-item__title">{l.title}</span>
                        <span className="guide-item__time">{l.duration}</span>
                        {complete && <span className="guide-sr">Completed</span>}
                      </button>
                    </li>
                  );
                })}
              </ol>
              <button type="button" className="guide-reset" onClick={reset}>
                Reset progress
              </button>
            </nav>

            <article className="guide-player" ref={playerRef}>
              <p className="eyebrow">
                Lesson {index + 1} of {lessons.length}
              </p>
              <h2 className="guide-lesson-title" ref={headingRef} tabIndex={-1}>
                {lesson.title}
              </h2>
              {lesson.video ? (
                <video
                  className="guide-video"
                  key={lesson.id}
                  controls
                  preload="none"
                  poster={lesson.poster || undefined}
                  src={lesson.video}
                />
              ) : (
                <div className="guide-video guide-video--empty">
                  <strong>Video coming soon</strong>
                  <span>{lesson.duration}</span>
                </div>
              )}
              <p className="guide-summary">{lesson.summary}</p>
              <div className="guide-actions">
                <button type="button" className="button button--primary" aria-pressed={isDone} onClick={toggleDone}>
                  {isDone ? "Completed" : "Mark as complete"}
                </button>
                <div className="guide-nav">
                  <button
                    type="button"
                    className="button button--quiet"
                    disabled={index === 0}
                    onClick={() => select(lessons[index - 1].id)}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="button button--quiet"
                    disabled={index === lessons.length - 1}
                    onClick={() => select(lessons[index + 1].id)}
                  >
                    Next lesson
                  </button>
                </div>
              </div>
            </article>
          </div>
        </main>
      </div>
    </div>
  );
}
