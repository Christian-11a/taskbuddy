/** Maps the adapters' legacy `.badge-*` classes onto the new Badge tones, so
 *  status colour keeps coming from one place (lib/adapters). */
export type Tone = "neutral" | "accent" | "warn" | "danger" | "ok" | "info";

const TONE_BY_CLASS: Record<string, Tone> = {
  "badge-active": "ok",
  "badge-approved": "ok",
  "badge-completed": "ok",
  "badge-pending": "warn",
  "badge-processing": "info",
  "badge-cancelled": "danger",
  "badge-rejected": "danger",
  "badge-banned": "danger",
  "badge-suspended": "danger",
  "badge-refunded": "neutral",
};

export function toneFromBadgeClass(cls: string | null | undefined): Tone {
  if (!cls) return "neutral";
  for (const part of cls.split(/\s+/)) {
    if (TONE_BY_CLASS[part]) return TONE_BY_CLASS[part];
  }
  return "neutral";
}
