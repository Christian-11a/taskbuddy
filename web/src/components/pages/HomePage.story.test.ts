import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { GUIDE_TRACKS } from "./guideLessons";
import { HOME_MARKUP } from "./HomePage.markup";

interface StoryStep {
  body: string;
  lesson: string;
  lessonTitle: string;
}

// The carousel data lives in the static script, so read the `stories` literal
// out of it and evaluate that object alone.
const script = readFileSync(path.resolve("public/promo/script.js"), "utf8");
const storiesStart = script.indexOf("  var stories = {");
const storiesEnd = script.indexOf('  var currentRole = "customer";');
expect(storiesStart).toBeGreaterThan(-1);
expect(storiesEnd).toBeGreaterThan(storiesStart);
const storiesLiteral = script
  .slice(storiesStart + "  var stories = ".length, storiesEnd)
  .trim()
  .replace(/;$/, "");
const stories = runInNewContext(`(${storiesLiteral})`) as Record<
  "customer" | "provider",
  { steps: StoryStep[] }
>;

const TRACK_BY_ROLE = {
  customer: GUIDE_TRACKS.clients,
  provider: GUIDE_TRACKS.providers,
} as const;

describe("homepage story carousel links to the guide", () => {
  it("has five client cards and six provider cards", () => {
    expect(stories.customer.steps).toHaveLength(5);
    expect(stories.provider.steps).toHaveLength(6);
  });

  it.each(["customer", "provider"] as const)(
    "gives every %s card a unique lesson that exists in the guide",
    (role) => {
      const steps = stories[role].steps;
      const lessons = TRACK_BY_ROLE[role];
      const ids = steps.map((step) => step.lesson);

      expect(new Set(ids).size).toBe(ids.length);
      for (const step of steps) {
        const lesson = lessons.find((item) => item.id === step.lesson);
        expect(lesson, `unknown lesson id ${step.lesson}`).toBeDefined();
        expect(step.lessonTitle).toBe(lesson?.title);
      }
    },
  );

  it("keeps each card line to one short sentence", () => {
    for (const role of ["customer", "provider"] as const) {
      for (const step of stories[role].steps) {
        expect(step.body.length).toBeLessThanOrEqual(110);
        // One sentence: a single terminal punctuation mark at the end.
        expect(step.body.match(/[.!?](?=\s|$)/g)).toHaveLength(1);
      }
    }
  });

  it("renders the Watch the guide link target in the homepage markup", () => {
    expect(HOME_MARKUP).toContain('href="/guide#create-your-account"');
    expect(HOME_MARKUP).toContain("data-story-guide");
    expect(HOME_MARKUP).not.toContain("data-story-points");
  });
});
