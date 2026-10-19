// 60s @ 30fps, 120 BPM → 1 bar = 60 frames. Mirrors scripts/arrangement60.mjs.
export const TOTAL60 = 1800;
export const S = {
  hook: 0,        // bars 0–1   logo assembles, splits into the two sides
  sides: 120,     // bars 2–3   "One app. Two sides." phones rise
  verify: 240,    // bars 4–6   provider gets verified
  post: 420,      // bars 7–10  homeowner posts a job
  handoff1: 630,  //            job card flies to the provider
  propose: 680,   // bars 11–14 provider sees it, sends a proposal
  handoff2: 870,  //            proposal flies back
  hire: 920,      // bars 15–18 homeowner hires, provider accepts
  work: 1140,     // bars 19–23 chat, done, escrow released
  review: 1440,   // bars 24–25 5 stars
  build: 1560,    // bar 26     montage + silence
  drop: 1620,     // bar 27     halves re-form the logo
  end: 1680,      // bars 28–29 tagline, hold
} as const;

// Names/amounts are illustrative sample data.
export const HOMEOWNER = { name: 'Ana Reyes', first: 'Ana', ini: 'AR' };
export const PROVIDER = { name: 'Mark Santos', first: 'Mark', ini: 'MS' };
export const JOB = { title: 'Fix leaking kitchen sink', service: 'Plumbing', budget: 1500, offer: 1450, address: 'Brgy. Poblacion, Lipa City' };
