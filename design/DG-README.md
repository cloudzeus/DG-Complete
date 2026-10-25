# DG Design System

Unified web + app design system for the **DG** portfolio — Microsoft Fluent 2 logic re‑skinned with DG crimson, warm neutrals, and Greek/English bilingual copy. Powers marketing, compliance, BI, and project‑management surfaces.

---

## Products covered

| Product | What it is | Source |
|---|---|---|
| **DGsoft** | Parent software company / marketing site shell. Red brand mark. | `uploads/dgsoftFullRedwhite1.png` |
| **DGsmart** | "Business Intelligence on Demand" — BI dashboards. | `uploads/dgsmartLogo.png` |
| **DG‑GDPR** | GDPR compliance OS: assessments, DPIA, data‑flow mapper, DSR. Next.js 16, React 19, Tailwind v4, Radix, Prisma. Microsoft Fluent palette (blue). | `dg-gdpr/` local mount |
| **A‑Sisyphus / DGproject** | Premium PM app: Kanban with drag‑drop, Gantt, Calendar, Microsoft 365 integrations. Next.js 14, Tailwind, `@dnd-kit`, Framer Motion, Fluent 2. | github.com/cloudzeus/DGproject |

### Sources consulted
- Local mount: `dg-gdpr/` (full Next.js codebase — `src/app/globals.css`, `src/components/**`)
- GitHub: `cloudzeus/DGproject@master` — `tailwind.config.ts`, `app/globals.css`, `components/layout/*`, `components/board/*`, `components/ui/*`
- Brand marks: `uploads/dgOnlyRed.svg`, `uploads/dgsoftFullRedwhite1.png`, `uploads/dgsmartLogo.png`

---

## Index

```
README.md                    ← this file
SKILL.md                     ← Claude Agent Skill manifest
colors_and_type.css          ← canonical CSS vars: color, type, motion, radius, spacing, shadow
assets/
  dg-logo-red.svg            ← brand DG mark
  dgsoft-full-logo.png       ← full DGsoft wordmark
  dgsmart-logo.png           ← DGsmart logo + tagline
preview/                     ← Design System tab specimens (20 cards)
ui_kits/
  shared/dg-primitives.jsx   ← DGButton / DGCard / DGBadge / DGAvatar / DGIcon / DGIcons
  a-sisyphus/                ← PM app with Kanban drag‑drop + M365 integration
  dg-gdpr/                   ← Compliance OS dashboard + sidebar groups
  dgsoft-web/                ← Marketing landing page
```

Open `ui_kits/a-sisyphus/index.html` first — it's the deepest kit. The others share `shared/dg-primitives.jsx`.

---

## Content Fundamentals

**Voice.** Professional, pragmatic, bilingual. Greek (Ελληνικά) is canonical in real products; English is used for technical/dev surfaces.

**Tone.** Direct, imperative or impersonal ("Add task", "Προσθήκη εργασίας"). Enterprise‑calm; no hype, no exclamation marks. Numbers and dates unadorned.

**Casing.**
- Primary actions: **Title Case** ("Add Task", "Generate DPIA")
- Everything else: **sentence case** ("No projects yet.")
- Section eyebrows: `UPPERCASE` with 0.08em tracking
- Headings: title case, never all caps

**Pronouns.** "You" / "your" — or imperative. Never "we" in product UI.

**Emoji.** None in product UI. Status = color + icon + text.

**Reference copy (from real codebase):**
- Sidebar groups: `ΣΥΜΜΌΡΦΩΣΗ`, `ΛΕΙΤΟΥΡΓΊΕΣ`, `ΔΙΑΧΕΊΡΙΣΗ`
- Empty state: `"Σύρε μια εργασία εδώ"` (Drag a task here)
- CTA: `"Προσθήκη εργασίας"` / `"Add task"` — verb‑first
- Footer meta: `"v1.0 · GDPR Article 5"` — middot separator

---

## Visual Foundations

**Palette.** DG Red (`#E31E2A`) = **brand** (logos, brand glow, primary CTAs on marketing, destructive/high‑priority). Sisyphus Blue (`#0078D4`) = **product interior** (nav active, links, focus on data screens). Warm neutrals: `#F3F2F1` canvas, `#EDEBE9` hover, `#201F1E` ink.

**Type.** Segoe UI Variable first, **Inter fallback** (flagged substitution). Fraunces for rare editorial display. Cascadia Code / JetBrains Mono for code. Fluent ramp: 11 / 12 / 14 / 16 / 18 / 20 / 24 / 32 / 40 / 56.

**Spacing.** 4‑px baseline (`4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 / 80`). Forms: 8‑px gaps, cards: 16–20, sections: 32–48.

**Backgrounds.** Solid `#F3F2F1` by default. Marketing heroes may use the brand gradient `135° #E31E2A → #A10A13` or the red+blue mesh gradient. Acrylic (blurred translucent white) for topbars/flyouts/dropdowns. Mica (subtle tinted solid) for sidebars.

**Motion.** Standard ease `cubic-bezier(0.33,0,0.67,1)`. 80 ms color · 150 ms hover · 240 ms flyouts · 400 ms page. Springs **only** for drawers and toggle knobs. `layoutId` for animated nav indicators.

**Hover.** Buttons: `500 → 600`. Cards: border → `--dg-red-300` + shadow lifts `elev-2` → `elev-4`. Nav: `rgba(0,0,0,0.05)` bg. **Reveal effect** — faint red radial follows cursor on interactive card surfaces.

**Press.** Primary: `600 → 700`. Cards / sortables: `active:scale-[0.98]`. No bouncy scales.

**Borders.** 1 px hairlines — `rgba(0,0,0,0.06)` subtle, `rgba(0,0,0,0.10)` default, `rgba(0,0,0,0.16)` strong. Brand border reserved for primary CTAs and active nav 3 px indicator.

**Elevation.** Six‑level Fluent ramp (2 / 4 / 8 / 16 / 28 / 64). Plus `--elev-brand-glow`: `0 8px 24px -8px rgba(227,30,42,0.35)` for hero CTAs and logo cards. **Shadows are always two layers** (near + far).

**Transparency / blur.** Acrylic (topbar, dropdowns) and Mica (sidebar) only. Never on body text or cards below top layer.

**Corner radii.** `2` hairline · **`4` default** (buttons, inputs, chips) · `6` secondary · `8` cards · `12` modals · pill for badges/avatars. Tight, not Material/bubbly.

**Cards.** White `#FFFFFF`, 1 px `rgba(0,0,0,0.06)` border, `--radius-lg` (8), `--elev-2`. Interior padding 16–20. Header → body: 12 px gap. Footer: 1 px top border.

**Layout.** Sidebar 220 (expanded) / 56 (collapsed) sticky left. Topbar 56 px sticky top with acrylic. Max content 1440, gutters 24. Forms: single column, labels above, 8/16 px gaps.

---

## Iconography

**Primary: Fluent UI System Icons** — what the codebases use:
- `dg-gdpr` → React Icons / Material `md/*` (`MdDashboard`, `MdSecurity`, `MdFactCheck`)
- `DGproject` → `@fluentui/react-icons` (`Home24Regular`, `Board24Filled`)

**Substitution (flagged):** Lucide at 1.5 px stroke — closest Fluent Regular match. Prefer native Fluent in production.

**Stroke vs fill.** `*Regular` inactive, `*Filled` active nav / selected.

**Sizes.** 16 / 20 / 24 matched to adjacent text. Never below 14.

**Logos.** `assets/dg-logo-red.svg` (mark), `assets/dgsoft-full-logo.png` (wordmark), `assets/dgsmart-logo.png` (BI sub‑brand). **Never** the red mark on a colored background — only white or dark. Min size 24 px.

---

## Accessibility fixes applied

- Raised muted text `--fg-3` to hit WCAG AA 4.5:1 on small text against `--bg-canvas`.
- Replaced low‑contrast `rgba(0,120,212,0.08)` active‑nav bg with a blend that keeps the 3 px left indicator as the primary active cue.
- Primary button: white text on red (`#FFFFFF` on `#E31E2A`) hits 4.8:1 — DG red on white was only 4.0:1.

---

## Font substitution flag

**Segoe UI Variable** is a Microsoft system font and **not redistributable**. We load **Inter** from Google Fonts as the webfont fallback (first in `--font-sans`). On Windows the real Segoe kicks in; elsewhere Inter renders. Upload licensed WOFF2 files for pixel‑perfect parity on macOS/Linux.

---

## Files

See **Index** above. The UI kits share `ui_kits/shared/dg-primitives.jsx` — load it before any kit‑specific Babel file.
