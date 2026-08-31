# Design — TaskBuddy Admin

The locked visual system for the TaskBuddy web admin. Product logic, routes, and information architecture stay unchanged; visual decisions should make daily marketplace operations easier to scan.

## Genre

Modern-minimal operations workspace with a practical service-marketplace voice.

## App macrostructure

- Shell: quiet fixed navigation, compact command header, wide work surface.
- Login: asymmetric brand field plus focused authentication form.
- Dashboard: attention queue, marketplace summary, grouped money, activity feed.
- Data pages: title and toolbar followed by the table as the dominant surface.

## Theme

- Preserve TaskBuddy teal/cyan as the brand anchor and blue as a supporting transition.
- Neutral surfaces carry most of the viewport.
- Accent color is reserved for selection, action, and meaningful status.
- Light and dark modes are equal first-class themes.

## Typography

- Use the existing system font stack.
- Display text is upright, tightly tracked, and used sparingly.
- Body and table copy follow the shared `--fs-*` scale.
- Figures use tabular numerals.

## Spacing and shape

- Use the existing four-point `--sp-*` scale.
- Use `--r-sm` for dense controls, `--r-md` for inputs/actions, and `--r-lg` only for major surfaces.
- Prefer spacing, alignment, and rules over enclosing every section in a card.

## Motion

- Motion communicates state or spatial origin only.
- Animate transform and opacity; keep feedback short and interruptible.
- Non-interactive metrics never move on hover.
- Respect `prefers-reduced-motion`.

## Interaction voice

- Primary actions use the solid brand fill.
- Status color appears only when a real status exists.
- Zero/clear states are calm, not warnings.
- Errors explain recovery; successful visible changes do not need celebratory decoration.

## Anti-slop constraints

- No fabricated or hardcoded operational metrics.
- No decorative pills, emoji icons, gradient text, glow blobs, or nested cards.
- No new raw colors inside components; add a semantic token first.
- No generic equal-card grid unless the data has genuinely equal importance.
- Copy describes TaskBuddy operations rather than generic business intelligence.

## Per-page allowances

- Login may use one restrained brand transition; the form remains the primary task.
- App pages do not use decorative enrichment.
- Charts may use multiple semantic series colors from the shared token set.
