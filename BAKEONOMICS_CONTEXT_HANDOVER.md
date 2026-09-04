# BakeOnomics — Context Handover

Living continuation file for anyone (human or Claude) picking up work on Anthony's bakery-costing SaaS. Read it end-to-end before touching code. Keep it current — append revisions to §14 as work ships.

---

## 0. Continuation status (verified this session)

- **Date verified:** 2026-08-13
- **Active branch:** `claude/code-implementation-81o6iw` (feature branch; PR to `main` when ready). Netlify auto-deploys `main`.
- **Build:** `npm run build` passes clean — 359 modules, ~3.6s. CSS bundle ~558 kB (76 kB gzip), JS ~1.08 MB (232 kB gzip). The >500 kB chunk warning is expected/benign.
- **Deps:** `npm install` clean. React 18.3 + Vite 5.4 + Supabase-js 2.45 + React Router 6.26.
- **State:** everything reported working. No open bug at pickup. This doc now lives in the repo so it survives the ephemeral container.

---

## 1. Product identity

**BakeOnomics** (formerly BakerNomics, formerly Lily Artisan) — a bakery costing / pricing / print-templates web app. Originally built for Anthony's spouse Lily's bakery, converted to a multi-tenant SaaS.

Customers pay **RM149/year** for a subscription. They add ingredients (with purchase prices), build recipes (BOM linking ingredients to yields), and the app computes cost per portion, suggested price by target food-cost %, and margin. On top of that costing engine sits a **print-templates system** — 10 template types × **14 style variants** = 140 distinct printable artefacts (recipe cards, cost sheets, care cards, product labels, menu inserts, wholesale price lists, delivery tags, social cards, kitchen binder pages, certificates).

**Sysadmin account:** anthony2211@gmail.com
**Second test account:** lily2211@gmail.com

**Business entity:** Swim Revelation Trading (JR0164533-V), 18 Lingkaran Meru Valley 2, Meru Valley Resort, 30020 Ipoh, Perak, Malaysia. No SST. Maybank 558172685790.

---

## 2. Infrastructure

| Layer | Value |
|---|---|
| **GitHub repo** | https://github.com/AnthonyAngOLY/bakeonomics.com |
| **Netlify** | https://lilyartisan.netlify.app/ (auto-deploys `main`) |
| **Supabase project** | https://zbciulldxdoegndvywgf.supabase.co |
| **Supabase org** | `lilybakes` |
| **Supabase project name** | "lilybakes BOM" |
| **Supabase branch** | `main` |
| **Supabase login** | `swimrev@gmail.com` via GitHub |
| **Supabase storage bucket** | `lilyartisan-images` |

**Tech stack:** React + Vite + Supabase + Netlify. React Router 6.

**Deploy path** (post Aug 2026 repo transfer): push to `main` → Netlify auto-builds → live in ~1 min. Anthony's workflow: Claude edits code in a session's local checkout, commits + pushes, Netlify picks it up. Zip-delta workflow (extracting into web-uploads) is deprecated — direct push is the norm now.

**Cosmetic renames deferred** — Netlify site and Supabase bucket still carry the `lilyartisan` name from the pre-SaaS era. Not renaming until Anthony explicitly prioritizes (migration risk on bucket, minor friction on site).

---

## 3. Multi-tenant architecture (READ THIS BEFORE TOUCHING DATA)

Every user-scoped table has a `user_id uuid` column referencing `auth.users(id)`, and RLS policies enforce strict `USING (user_id = auth.uid())` isolation — no sysadmin loophole. See `supabase/rls-tenancy-fix-v2.sql` for the canonical policy set.

Tables under this regime: `ingredients`, `recipes`, `bom_lines`, `inventory`, `header_links`, `settings`, `template_customization`, `content_blocks`.

**How the frontend interacts with RLS:**

- `useTable('recipes', 'name')` calls plain `supabase.from('recipes').select('*')`. NO client-side owner filter — RLS returns only the current user's rows.
- Inserts don't need to stamp `user_id` explicitly IF the table has a `DEFAULT auth.uid()` on that column OR a BEFORE INSERT trigger. Check `supabase/delta-1-auth-foundation.sql` for defaults. If a table's insert path fails with 23502 (null user_id), the fix is to add `user_id: (await supabase.auth.getUser()).data.user.id` to the insert payload.
- The `settings` table uses `user_id` as its PK (per-user singleton), not `id`.
- Sysadmin management pages (`/app/sysadmin/*`) use `SECURITY DEFINER` RPCs like `sysadmin_list_users` that bypass RLS by design. Anthony's sysadmin role gives him NO extra visibility through normal queries.
- Impersonation flow (`sysadmin_start_impersonation`) swaps the session to another user for support cases.

**The "seed starter recipes for new users" flow:**

- Trigger `on_new_user_seed_recipes` on `auth.users AFTER INSERT` calls `trigger_seed_starter_recipes(NEW.id)` which calls `seed_starter_recipes(p_user_id)`.
- `seed_starter_recipes` inserts 18 ingredients + 6 recipes + BOM lines, all stamped with `p_user_id`. Idempotent: skips if the user already has any recipes.
- **Historical gotcha:** the first version of `seed_starter_recipes` didn't stamp `user_id` on `bom_lines` (was written before that column went NOT NULL). Caused `rls-tenancy-fix.sql` v1 to roll back with 23502. Fixed in `rls-tenancy-fix-v2.sql` which redefines the function and reruns the RLS tightening in one transaction.

**Migration hygiene:** any new schema change → `supabase/<name>.sql` file, run manually in Supabase SQL Editor. Never assume prior SQL deltas ran in production without explicit confirmation. The "Delta 3b never ran" incident + the "rls v1 rolled back" incident are the two documented cases where SQL didn't reach prod.

---

## 4. The design system — 14 template variants

Each variant is a complete, dedicated visual voice. All 10 template types are implemented per variant. Variant folder lives at `src/components/templates/variants/<name>/` and contains: `_parts.jsx` (shared primitives), 10 template JSX files, `index.js` (barrel with `<VARIANT>_TEMPLATES` map keyed by shared template key), and self-contained `styles.css`.

| Key | Name | Class prefix | Accent | Voice |
|---|---|---|---|---|
| `bko` | BakeOnomics Clean *(default)* | `.b-` | #7367F0 purple | App-native, clean, matches the product UI |
| `kraft` | Rustic Kraft & Stamp | `.k-` | #8B4A2B brown | Kraft paper, Bitter serif + Karla, farmers-market feel |
| `crisp` | Crisp | `.c-` | #8B4A2B brown | Clinical, white paper, thin gray rules with brown overlays |
| `letterpress` | Vintage Letterpress | `.l-` | #7A2E3B burgundy | Playfair + Cormorant italic, fleuron ornaments, centred, highest formality |
| `editorial` | Editorial Magazine | `.e-` | #8E4527 rust | Playfair + Archivo, italic-accent titles ("Chocolate *Fudge* Cake"), full-height rust side bands, zebra rows, WHERE THE MONEY GOES bar chart |
| `minimal` | Quiet Minimal | `.q-` | #A5502D rust dot | Manrope Light + JetBrains Mono for all meta, tiny rust dot before section titles, "500 g" wide-spaced units, no logo box |
| `verdant` | Verdant | `.v-` | #1E4A38 forest green | DM Serif Display + Manrope, mint pill chips, numbered method chips (last step accent-filled dark green), soft decorative circles floating at edges |
| `ember` | Ember | `.em-` | #DE4A1F ember orange | Bebas Neue heavy condensed + Manrope, burgundy→red→orange gradient headers with **diagonal-cut** bottom edges via `clip-path`, 3-tone meta chips (black/ember/outlined), full black caution bars |
| `flour-ink` | Flour & Ink | `.fi-` | #1A1A18 near-black | Jost throughout with wide letter-tracking, cream + stone + ink only. Thin outlined DC circle recurs. Filled-black FINAL method chip + Cost Sheet "SUGGESTED PRICE" rectangle are the only dark accents. Numbers spelled out ("YIELD TWELVE") |
| `tessellate` | Tessellate | `.te-` | #C74A22 rust | Warm cream paper with rust×cream and navy×cream checkerboard bands, three-tone diagonal stripes, small navy dot-square rules, and a four-quadrant 2×2 logo mark. Manrope body + JetBrains Mono meta throughout |
| `aurora` | Aurora | `.au-` | #6C5CE7 purple | Purple → teal → pink gradient bands power every header; Delivery Tag and Social Card wear the full aurora. Rounded gradient pill chips for allergens and meta, gradient bar chart on Cost Sheet, hot-pink final method step. Manrope 800 titles on soft lavender paper |
| `bauhaus` | Bauhaus | `.bh-` | #2A4BE0 cobalt | Primary-color modernism: cobalt blue, marigold yellow, vermillion red, near-black on warm cream. Archivo Black caps titles, solid geometric quarter-circles and squares hugging page edges, sharp filled chips |
| `patisserie` | Patisserie | `.pa-` | #7A2E3B burgundy | Dusty pink and deep burgundy on ivory. Cormorant Garamond serif titles, mauve section eyebrows, Roman-numeral method steps (I · II · III), thin gold hairline frames on every portrait. Care Card and Delivery Tag on soft pink; Social Card on deep burgundy |
| `riso-pop` | Riso Pop | `.rp-` | #E84C22 rust | Warm cream, deep navy, rust. Signature offset title effect (rust copy nudged down-right behind navy front) on every product name, overlapping solid circles with `mix-blend-mode: multiply` for brown overprint, solid navy/rust chips, cream-on-rust Social Card |
| `terminal` | Terminal | `.tr-` | #4EE0BE teal | **First dark-mode set.** Deep navy paper with subtle teal grid overlay, JetBrains Mono for every meta label, price, date. Teal for section labels/prices, amber (#F4B942) for warnings/allergens/final method step. Code-style naming throughout (RECIPE_01, COST_ANALYSIS / CAKES, target_food_cost: 30%, BINDER / CAKES / REV_04, ISO dates) |

### The 10 template types (shared keys across all variants)

| Key | Name | Size | Purpose |
|---|---|---|---|
| `classic` | Recipe Card | A5 portrait | Kitchen recipe with ingredients + method |
| `cost` | Cost Breakdown / Cost Sheet | A4 portrait | INTERNAL — supplier prices, margin, per-portion |
| `care` | Care & Storage Card | A6 portrait | Customer-facing — storage instructions, allergens |
| `label` | Product Label | A7 portrait | Packaging — ingredients + allergen notice |
| `menu` | Menu Insert | A5 portrait | Multi-recipe menu grouped by category |
| `wholesale` | Wholesale Price List | A4 portrait | Multi-recipe — retail / wholesale / batch prices, terms |
| `delivery` | Delivery Tag | A7 portrait | Per-order hang tag with punch hole |
| `social` | Social Media Card | 148×148mm (1080²) | Instagram / Facebook square |
| `binder` | Recipe Binder Page | A4 portrait | Comprehensive kitchen reference with photo, meta, notes |
| `cert` | Certificate of Craft | A4 landscape | Premium orders / gifts / press |

### Where variants register (three places — keep in sync)

- **`src/components/templates/index.js`** — imports each `<VARIANT>_TEMPLATES` map and lists them in `VARIANT_MAP` keyed by the STYLE_VARIANTS key
- **`src/lib/template-styles.js`** — `STYLE_VARIANTS` array with `{ key, name, description, accent, isDefault }`
- **`src/pages/Templates.jsx`** — local `STYLE_VARIANTS` array with a shorter description shown in the picker

All three must stay in sync. When adding a new variant, update all three.

### The resolver

`getTemplateComponent(templateKey, styleVariant)` in `templates/index.js` checks `VARIANT_MAP[styleVariant]?.[templateKey]`. Returns the variant's component if found, else falls back to the base `src/components/templates/<Template>.jsx`. **Base templates are legacy and should not be relied on** — they render with the old `.tpl-*` classes and lack the design polish of the variants. Any variant missing a template will show the base as a jarring fallback.

---

## 5. Recurring architecture patterns

### Shared primitives per variant (`_parts.jsx`)

Every variant exports the same shape of primitives, adapted to its voice:

- `<VariantLogo brand size tone>` — square/circle/text-only monogram based on variant style
- `<VariantBrandLockup brand size layout tone>` — logo + name + tagline in various arrangements
- `<VariantEyebrow tone className>` — small-caps letter-tracked label
- `<VariantRule tone weight>` — thick / hair horizontal divider
- `<VariantMethodChip number variant>` — numbered chip for method steps
- `<VariantFooter brand layout showSocials>` — split / centered / minimal footer
- `variantMoney(value, { bare, currency })` — money formatter
- `topContributors(lines, n)` — top-N ingredient cost contributors for bar charts
- `normalizeMethod(raw)` — flatten method array into `{ step } | { group }` sequence
- `zeroPad(n)` — "01" "02" for numbered lists

Patisserie adds `toRoman(n)`. Riso Pop adds `<RpOffsetTitle>` for its signature rust-shadow-behind-navy-front effect. Terminal adds `isoDate` / `isoYearMonth` helpers. Bauhaus and Tessellate use pure CSS `border-radius: 100% 0 0 0` quarter-circles and CSS-drawn checkerboard bands respectively.

### The "last method step" pattern

Most variants highlight the FINAL method step visually — a distinct chip variant (filled black in Flour & Ink, filled ember in Ember, filled dark green in Verdant, filled red in Bauhaus, filled amber-square in Terminal, filled rust in Riso Pop) and a bolded leading phrase. Implemented via:

```js
const totalSteps = method.filter(s => !s.group).length
let stepCounter = 0
// ...in the render loop:
stepCounter += 1
const isLast = stepCounter === totalSteps
```

Then `<VariantMethodChip variant={isLast ? 'accent' : 'normal'} />` and a `renderLastStep(text)` helper that regex-matches "Cool completely" style opening imperatives to bold them.

### The allergen-chip parsing pattern

Care Cards on several variants render allergens as individual chips instead of a "Contains: wheat, dairy, eggs" sentence. Parser:

```js
const allergenList = allergensRaw
  .replace(/^\s*contains?\s*:?\s*/i, '')
  .replace(/\.\s*$/, '')
  .split(/\s*,\s*|\s+and\s+/i)
  .map(s => s.trim())
  .filter(Boolean)
```

### PreviewFit

`src/components/PreviewFit.jsx` — auto-scales print-sized templates to fit the container width using CSS `transform: scale()` with `ResizeObserver`. Three refs:

1. **outer** (`display: block; width: 100%`) — measures container width via `clientWidth`
2. **wrap** (`display: inline-block`) — measures the child's natural size via `offsetWidth/Height`. Transform is temporarily neutralized during measurement then restored in the same tick.
3. **viewport** — sized to `naturalDim × scale`, `overflow: hidden`, `margin: 0 auto` (centers when template fits at natural size)

Only scales **down**, never up. Shows a "Fit / Actual" toggle on narrow viewports.

### Topbar spotlight search (`src/components/Topbar.jsx`)

Types-as-you-go search across recipes + ingredients. Loads both tables on session start (RLS scopes automatically). Prefix-beats-substring scoring. Keyboard nav (↑↓/Enter/Esc, mouse hover moves cursor too). Navigating to a hit sends `/app/recipes?highlight=<id>` or `/app/ingredients?highlight=<id>`; both pages read the query param, scroll the matching `<tr>` into view, and add a `row-flash` class that plays a 1.6s accent-soft fade. The URL param is stripped after the flash so refresh doesn't re-flash.

### PWA installability

Registered service worker at `public/sw.js` — network-first on navigation with app-shell fallback, cache-first for `/assets/`, favicons, fonts, and Supabase Storage images. Deliberately passes Supabase REST/auth calls through untouched so RLS never sees a stale token. Registered in `src/main.jsx` production-only with silent auto-upgrade on new deploys. Manifest at `public/favicon/site.webmanifest` — `start_url: /app`, `display: standalone`, Android long-press shortcuts for Recipes / Ingredients / Templates.

### BOM yield modifier (`src/pages/Bom.jsx`)

Recipe BOM shows the recipe's `yield_portions` in the sub-header. Above the ingredient list, a "Batch yield" input scales displayed line quantities + line costs by `active / default`. Override persists per-recipe in localStorage (key `bom:yield-override:<id>`) — reload keeps it, other device / logout starts clean. "Reset to default" restores. Stored `bom_lines` never change — the multiplier is display only. Add / Edit still enter recipe-native quantities (hint appears when the multiplier is active).

---

## 6. Ship workflow

**The vibe-coder loop (post repo transfer):**

1. Anthony reports a bug or feature request
2. Claude investigates in local checkout (clone from https://github.com/AnthonyAngOLY/bakeonomics.com in a fresh session)
3. Claude makes edits, runs `npm run build` to verify
4. Claude commits with descriptive message + pushes
5. Netlify auto-deploys `main` in ~1 minute
6. Anthony tests on live URL
7. Repeat

**Commit conventions:**

- Descriptive subject line, one-sentence summary of change
- Longer body explaining *why*, not just *what*
- Author: `Claude <noreply@anthropic.com>`

**Never ask Anthony to manually edit files** — always ship complete edits + commit + push. He doesn't have a local git.

**Zip-delta workflow is deprecated** — was used before repo transfer when Anthony was uploading zips via GitHub web UI. All 6 `Add files via upload` commits in the repo history are from that era. The `README-FIX.md` / `README-update.md` root files are leftover delta notes from that era, not current docs.

**Communication style:** Anthony likes concise, direct explanations. Skip the pleasantries. When shipping a fix, briefly explain *what* changed and *why* the previous state was wrong. Anthony reads carefully and asks focused follow-up questions.

---

## 7. Recurring template bug patterns — the specificity story (four rounds)

**The bug that keeps coming back:** the root `.tpl` class in `src/styles.css` sets `background: #fff; color: #1F2440; display: flex; flex-direction: column; font-family: 'Plus Jakarta Sans'` at `(0,1,0)` specificity. Variant-level rules like `.em-social { background: gradient }` sit at the same specificity — whichever loads later in the CSS bundle wins. When bundle order goes against the variant, the base's white/column wins and templates render broken.

**The fix pattern** (permanent going forward): chain the variant's `-tpl` class to any container-level override, taking specificity to `(0,2,0)`:

```css
/* Instead of: */
.em-social { background: var(--em-gradient); ... }

/* Use: */
.em-tpl.em-social { background: var(--em-gradient); ... }
```

### Round-by-round history

**Round 1 — Direction mismatch.** Added explicit `flex-direction: row` to Editorial's row-layout templates (Recipe Card, Delivery Tag, Binder, Cert). Fixed at same specificity as base → bundle-order-dependent.

**Round 2 — Specificity race.** Boosted to `.e-tpl.e-<template>` at (0,2,0). Row layout applied correctly, but templates still rendered elongated.

**Round 3 — Content overflow past `min-height`.** With `min-height: 105mm`, long recipes grew the container past the intended size and the sibling rust sideband stretched to match. Fix: switch to fixed `height` + inherited `overflow: hidden` clips overflow. Applied to Delivery Tag / Recipe Card / Binder / Cert.

**Round 4 — Flex-item min-height:auto inflates in fixed-height parent.** In `.tr-tpl.tr-cost` (297mm flex-column with overflow:hidden), the top-row grid was a flex item whose default `flex-shrink: 1 + min-height: auto` collapsed the grid track to ~60px while its grid-item children's own `min-height: auto` simultaneously inflated them to viewport height. Result: card content overflowed down through the table, and everything below got clipped off the bottom edge — symptom "content body missing". Fix: `flex: none` on the top-row (pins it at natural grid content height) + `min-height: 0` on the grid items (top-left, price card, discount card, so their auto-min doesn't inflate to viewport). Same pattern used for Aurora Cost Sheet + Binder Page (Binder additionally needed explicit `flex-direction: row` at chained specificity so its gradient stripe stopped stacking column-wise).

### Round-4 rule of thumb

If a variant template is a fixed-height flex-column and one of its children is a `display: grid` container: apply `flex: none` on the grid container AND `min-height: 0` on every direct grid item. Otherwise the grid track collapses AND the items inflate to viewport height. Both are needed together; either alone is not enough.

Applied to date (all now using `.xx-tpl.xx-template` (0,2,0) specificity):

- **Ember** — `.em-tpl.em-delivery`, `.em-tpl.em-social`
- **Verdant** — `.v-tpl.v-delivery`, `.v-tpl.v-social`
- **Editorial** — `.e-tpl.e-recipe-card`, `.e-tpl.e-delivery`, `.e-tpl.e-binder`, `.e-tpl.e-cert`
- **Flour & Ink** — `.fi-tpl.fi-delivery`, `.fi-tpl.fi-social`
- **Quiet Minimal** — `.q-tpl.q-social`
- **Aurora** — `.au-tpl.au-cost`, `.au-tpl.au-binder`
- **Terminal** — every container-level rule (dark background NEEDS to win over base white)
- **Riso Pop, Tessellate, Bauhaus, Patisserie** — all built from the start with (0,2,0) specificity

### Table header cream-on-cream (Riso Pop, but a class of bug)

Root `src/styles.css` line ~252: `th { background: #fafaff }` global at (0,0,1). Riso Pop originally put its navy header fill on `<tr>` at (0,2,0) — higher specificity, but `<tr>` background paints BEHIND `<th>` background, so the global near-white on each cell completely covered the row's navy. Cream text on near-white cells = invisible. **When you want a filled table header, always paint on `<th>`, never on `<tr>`.** Bauhaus / Terminal / Tessellate all did this correctly from the start; Riso Pop was the one exception, now fixed.

### The permanent fix (not yet applied)

Would strip `background: #fff` (and possibly the other properties) from the root `.tpl` and let each variant's `.xx-tpl` set the paper color. Requires auditing Kraft/Crisp/BKO/Letterpress to confirm none implicitly rely on the white default. Would eliminate the specificity pattern permanently. Ask Anthony before doing this — he's mentioned it a few times but not prioritized.

---

## 8. Recent work + other bug fixes

**Shipped and working:**

- **Multi-tenant checkout flow** — `/checkout` order form, DuitNow QR + bank transfer payment instructions, proof-of-payment upload, sysadmin verification queue with approve/reject modals and temp-password display
- **Sysadmin content editor** — Content Blocks wired through the app (e.g. `dashboard.greeting` block with title/body/cta fields, editable per-tenant)
- **Brand rename** — BakerNomics → BakeOnomics across all frontend files and database content
- **Brand & Identity Settings expansion** — logo upload, brand color picker, tagline, contact info, socials, address, storage and allergen defaults
- **Templates page** — 10 printable templates × 14 style variants selector
- **Sidebar navigation** — purpose-drawn duotone SVG glyphs for 17 nav items
- **Hero carousel** on landing page — 5 slides, real baker photos + inline mock UI
- **New user onboarding** — database trigger seeds realistic starter recipe data per user (18 ingredients + 6 recipes + BOM lines)
- **PreviewFit** — auto-scales template preview on mobile
- **TemplateCustomization route** — Pricing's "Edit defaults →" link now works. TemplateCustomization save no-op (wholesale discount / MOQ) also fixed
- **Recipe image upload** — wired through the `<Chip uploadable>` component matching the Ingredients pattern. Uploads land in `recipes/` folder within the `lilyartisan-images` Supabase bucket
- **Base CareCard emoji removal** — the fallback base component had 🌡️ and ⚠️ hardcoded next to section titles. Removed defensively so any variant that falls back stays icon-free
- **Bebas Neue @import** in Ember's `styles.css`, **Archivo Black @import** in Bauhaus's `styles.css` — the only two variants that add fonts beyond the globally-loaded set
- **Content drawer "+ Add step"** — was a no-op because `cleanup()` filtered blank rows on every mutation. Fixed: mutations pass items raw; cleanup only runs at save time (renamed `commitMethod`)
- **BOM yield indicator + planning modifier** — shows recipe's default yield + a "Batch yield" input that scales displayed qty/cost, persisted per-recipe in localStorage
- **Topbar spotlight search** — types-as-you-go dropdown over recipes + ingredients, keyboard nav, navigates to `/app/recipes?highlight=<id>` or `/app/ingredients?highlight=<id>` with a row-flash on arrival
- **PWA installability** — service worker registered, manifest with start_url `/app` + display standalone + Android long-press shortcuts, iOS Add-to-Home-Screen splash
- **Multi-tenant RLS lockdown** — `supabase/rls-tenancy-fix-v2.sql` closed the sysadmin loophole and seeded Anthony's account with its own starter recipes. Prior state: sysadmin's `SELECT` returned every user's rows including Lily's, and edits from Anthony's session landed on Lily's data

**Known open items:**

1. **Cosmetic infrastructure renames** — Netlify site and Supabase storage bucket. Deferred until Anthony explicitly prioritizes (migration friction).
2. **Editorial Recipe Card compact-spacing follow-up** — if the fixed-height clipping bothers Anthony's real content, redesign the card for higher density (smaller ingredient row padding, tighter method line-height, maybe 3-column ingredient layout for short-name lists).
3. **Permanent `.tpl` background/color/display strip** — to prevent the specificity bug from recurring. Requires audit of the 4 legacy variants that haven't hit it.
4. **Kraft/Crisp/BKO/Letterpress specificity audit** — proactively boost their container-level overrides to the `(0,2,0)` pattern even though bugs haven't been reported, so they don't surprise us later.
5. **Certificate seal on base** — the base `CertificateOfCraft` has a "Baked with ♡ Care" nested seal-ring that renders badly. Not touched because all 14 variants override `cert`. If someone lands on the base by mistake, it looks scribbly. Cleanup optional.

---

## 9. Key principles Anthony cares about (from lessons the hard way)

- **Never ask Anthony to manually edit files.** He doesn't have a local git. Ship complete edits + commit + push, Netlify picks it up.
- **Database migrations must be confirmed as actually run** — Delta 3b's SQL had never run in production causing a `content_blocks` bug. rls-tenancy-fix v1 rolled back and never applied — v2 was written to reconcile. Don't assume prior SQL deltas were applied. If a schema change is needed, call it out explicitly and give the exact SQL file + how to run it (Supabase SQL Editor).
- **Multi-tenant isolation is non-negotiable.** Any new user-scoped table needs `user_id uuid REFERENCES auth.users(id) NOT NULL` + RLS policy `USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`. Any new insert path needs to stamp `user_id` (either via DB default or explicit in the payload).
- **Shared components over hardcoded switches.** The `<Icon />` component, `<Chip uploadable />` component, `PreviewFit`, `Logo` — these prevent classname/rendering mismatches. When adding a new template variant, mirror the shared primitives pattern (`_parts.jsx`).
- **Infrastructure cosmetics are low priority.** Renaming Netlify site, storage bucket carry migration risk or friction. Defer unless Anthony explicitly prioritizes.
- **The user is Anthony working on his own SaaS.** All the template designs he uploads as mockups are his own IP for his own product. Don't treat any of it as external material.
- **Every filled table header goes on `<th>`, not `<tr>`.** Global `th { background: #fafaff }` at (0,0,1) will paint over any `<tr>` background.

---

## 10. File locations to remember

**In the repo:**

```
src/
├── App.jsx                                              # Routes
├── main.jsx                                             # Entry + PWA SW registration
├── styles.css                                           # Root — has the .tpl class + PreviewFit + templates-preview + row-flash + bom-yield-bar
├── components/
│   ├── Chip.jsx                                         # Uploadable image chip
│   ├── PreviewFit.jsx                                   # Mobile auto-scaler
│   ├── RecipeContentDrawer.jsx                          # Recipe method/description editor (Add step fixed here)
│   ├── Topbar.jsx                                       # Spotlight search lives here
│   ├── Logo.jsx                                         # BakeOnomics wordmark
│   └── templates/
│       ├── index.js                                     # TEMPLATES registry + VARIANT_MAP + getTemplateComponent
│       ├── CareCard.jsx                                 # Base fallback (icons removed)
│       ├── CertificateOfCraft.jsx                       # Base fallback (scribbly seal)
│       ├── ... (other base templates)
│       └── variants/
│           ├── bko/  kraft/  crisp/  letterpress/  editorial/  quiet-minimal/
│           ├── verdant/  ember/  flour-ink/  tessellate/  aurora/
│           └── bauhaus/  patisserie/  riso-pop/  terminal/
├── lib/
│   ├── template-styles.js                               # STYLE_VARIANTS array (source of truth)
│   ├── upload.js                                        # uploadImage / deleteImage helpers
│   ├── settings.jsx                                     # Settings context
│   └── data.js                                          # useTable hook (RLS-scoped, no owner filter needed)
└── pages/
    ├── Templates.jsx                                    # Template picker + preview
    ├── TemplateCustomization.jsx                        # Edit defaults page
    ├── Recipes.jsx                                      # Recipe list (highlight handler for topbar search)
    ├── Ingredients.jsx                                  # Ingredient list (highlight handler for topbar search)
    ├── Bom.jsx                                          # Recipe BOM + yield modifier
    ├── Pricing.jsx                                      # Pricing calculator with Edit defaults link
    └── Settings.jsx                                     # Brand identity settings

public/
├── sw.js                                                # PWA service worker
├── favicon/site.webmanifest                             # PWA manifest (start_url /app, shortcuts)
├── android-chrome-*.png                                 # PWA icons
└── favicon/maskable-icon-512x512.png                    # Maskable icon variant

supabase/
├── schema.sql                                           # Base schema
├── delta-1-auth-foundation.sql                          # Multi-tenant foundations (user_id columns, is_sysadmin, RLS initial)
├── starter-recipes.sql                                  # seed_starter_recipes function + auto-seed trigger
├── rls-tenancy-fix-v2.sql                               # CURRENT canonical RLS policy set (own only) + patched seed function
├── delta-3a-users-billing.sql, delta-3b-content.sql, delta-3c-platform-audit.sql
├── delta-4-checkout.sql
├── brand-identity.sql
├── invite-and-approve-fix.sql
├── template-access.sql
└── ... (older deltas — historical reference only)
```

---

## 11. Onboarding checklist for the next Claude

1. **Clone the repo** from https://github.com/AnthonyAngOLY/bakeonomics.com (skip if already there)
2. **Run `npm install`** if `node_modules` is missing
3. **Verify `npm run build` passes** before making any changes — confirms the baseline is clean
4. **Read `src/lib/template-styles.js`** to see the current list of registered variants
5. **Read `src/components/templates/index.js`** to see the VARIANT_MAP registration
6. **If Anthony reports a bug on a variant template:**
   - **"Text on wrong background" or "layout stacked wrong":** almost certainly the (0,2,0) specificity bug — fix with `.xx-tpl.xx-template` pattern.
   - **"Content body missing" or "elongated":** almost certainly the flex-column-with-grid-child bug from Round 4 — fix with `flex: none` on the grid container + `min-height: 0` on its grid items.
   - **"Cream text on cream table header" or similar table-header contrast:** the global `th { background: #fafaff }` is winning. Put the background on `<th>` at (0,2,1) or higher, not on `<tr>`.
7. **If Anthony asks for a new template variant**, follow the established pattern: create `src/components/templates/variants/<name>/` with `_parts.jsx`, 10 template files, `index.js`, `styles.css`. Register in three places (VARIANT_MAP, STYLE_VARIANTS in template-styles.js, STYLE_VARIANTS in Templates.jsx). Use a unique two-letter class prefix. Build guardrails from the start: fixed `height` (never `min-height`) on containers, chained `.xx-tpl.xx-template` (0,2,0) specificity on every container-level override, explicit `flex-direction` + `align-items: stretch`, `position: relative` where absolute descendants exist.
8. **If a new schema change is needed**, write it as a new file under `supabase/<name>.sql` and give Anthony the exact steps to run it in Supabase SQL Editor. Never assume prior deltas ran.
9. **Commit + push** — Netlify deploys `main`. Anthony has no local git. Use `Claude <noreply@anthropic.com>` as author.

---

## 12. Design language cheatsheet — quick reference

If Anthony uploads new mockups for a 15th variant, use these hints to pattern-match quickly:

- **Serif titles** → Playfair Display (loaded), DM Serif Display (loaded), Cormorant Garamond (loaded), Bitter (loaded, slab)
- **Sans titles heavy** → Archivo Black (Bauhaus imports it), Bebas Neue (Ember imports it), or Manrope 800/900
- **Sans light/geometric** → Jost (loaded), Manrope (loaded), Plus Jakarta Sans (loaded)
- **Monospace** → JetBrains Mono (loaded, Terminal's identity typeface), IBM Plex Mono (loaded)

**All globally-loaded fonts:** Plus Jakarta Sans, JetBrains Mono, Bitter, Karla, Playfair Display, Cormorant Garamond, DM Serif Display, Archivo, Manrope, IBM Plex Mono, Jost, plus Bebas Neue (via Ember's variant CSS) and Archivo Black (via Bauhaus's variant CSS).

**Color palette shorthand across the collection:** Purples (BKO, Aurora) · Browns (Crisp, Kraft) · Rusts (Editorial, Ember, Tessellate, Riso Pop) · Greens (Verdant, Terminal's teal accent) · Mono/near-black (Flour & Ink) · Burgundy/romance (Letterpress, Patisserie) · Primary triads (Bauhaus) · Dark mode (Terminal — the only one).

---

## 13. What Anthony will likely ask next

- **More template variants** — apply the established architecture WITH the elongation defenses baked in from the start.
- **Storage isolation for uploaded images** — bucket-level policy scoping to `<uid>/*` paths so signed URLs can't be guessed. Currently uploads work but there's no path prefix per user.
- **CSV export of ingredients/recipes/BOM** — the marketing copy in `content-defaults.js` promises this exists. If it doesn't, wire it up.
- **The permanent `.tpl` cleanup** — mentioned repeatedly across sessions. Would be a clean audit + strip.
- **Editorial Recipe Card compact-density redesign** — if the fixed-height clipping bites him.
- **Refinements to specific variants** — pixel-level adjustments after seeing them with real data.
- **Fresh bug reports on any variant** — with 140 template surfaces × real bakery data, edge cases keep appearing.

---

## 14. Session log (append newest at top)

- **2026-08-13** — Onboarding + persistence. Verified clean baseline (`npm install` + `npm run build` pass, 359 modules). Committed this handover doc into the repo (`BAKEONOMICS_CONTEXT_HANDOVER.md`) so continuation context survives the ephemeral container instead of living only as a per-session upload. No code changes; everything reported working.
