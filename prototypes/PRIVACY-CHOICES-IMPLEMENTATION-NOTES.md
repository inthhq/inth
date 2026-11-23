# Consent UI: implementation notes for the Inth SDK

These notes cover the cookie banner and the "Your Privacy Choices" dialog, from the v6 prototype to production code in `@inth/sdk-*` (core, React, Vue, Svelte and plain HTML).

**Two companion files:**

- `PRIVACY-CHOICES-REGRESSIONS.md` is the rulebook. It holds every invariant, with an ID, its reason and its test. These notes say _what to build_; the regressions file says _what must never break_. Cite its IDs in test names.
- `privacy-choices-explorer.html` with `selftest.html` is the living reference. It has 146 scripted checks, and every number in these notes comes from it. Build `selftest.html`, `perm.html` and `perm2.html` with `node prototypes/privacy-choices-tests/build.mjs`; they land in `prototypes/privacy-choices-tests/out/`.

**Who decided:** the product owner, testing by hand, and seven council review rounds (Claude Opus 5.5, GPT 6.2 Sol, Gemini 4 Neon).

**Not legal advice.** Customers' counsel reviews the final copy and defaults.

---

## 0. The guiding rule

> Most people keep the defaults, so the default must be the compliant one.

Every option below has one default, and that default is the best-in-class choice. We cut variants on purpose. Before adding an option back, read section 12 ("Do not reintroduce").

---

## 1. Ten things that must survive the port

If a ported component breaks any of these, it is not done.

1. **Statutory rights are never inside Preferences or an accordion** (LAW-01). "Selling, sharing and targeted ads" and "Sensitive personal information" appear on the first view of the dialog.
2. **Opting out takes one action. Opting back in takes two:** the choice, then a confirmation in place (LAW-02). The US has no Save step; restrictive choices apply immediately (LAW-04).
3. **The first layer follows the region's policy preset** (BNR-01, BNR-10). The US opt-out preset shows nothing and never blocks the page (BNR-13).
4. **Reject and Accept are equal**: same style, same weight, same size (EU-01). This applies everywhere they appear: card, banner, drawer and dialog.
5. **Customize never opens the full dialog from a banner.** It expands the options in place (Card, Banner, top and bottom Drawer). Side drawers are all-in-one, so they have no Customize. The full dialog opens only from "Your Privacy Choices".
6. **Dismissing is not consent.** Esc never dismisses a banner. It only folds an expanded panel back.
7. **GPC covers sale and sharing (and targeted ads) only.** An opt-out it triggered persists after the signal stops (GPC-01, GPC-05). See DEF-09: the SDK presets currently disagree.
8. **Never re-render with `innerHTML`; nodes must persist** (ARCH-01). Focus, transitions and screen-reader context all depend on it.
9. **Only the top layer is modal.** It gets its own `role="status"` region, its own focus trap, and the page behind it is `inert` (FOC-01, FOC-02, SR-01, NEST-03).
10. **There is one corner-radius scale and one motion vocabulary** (VIS-07, MOT-02). Don't introduce new values.

---

## 2. Region: what shows on first visit

The source is `packages/sdk/schema/src/shared/policy-rule-presets.ts`.

| Preset | First layer (`bannerVariant`) | Buttons | Can it block the page? |
| --- | --- | --- | --- |
| `europe_opt_in`; also the geo fallback | `choice`: "We value your privacy" | Reject All · Accept All · Customize | Yes, when configured |
| `us_privacy_states_opt_in`, `california_opt_in` | `us-consent`: "Your privacy choices", asking in US terms (BNR-09) | Don't allow · Allow · Choose (or "Choose what to allow") | Yes, when configured |
| `us_privacy_states_opt_out`, `california_opt_out`; the default in `recommendedPolicyRules` | `none`: nothing is shown | (none) | **Never** |
| the same opt-out presets, with the notice option | `notice`: "Privacy notice" | Do not sell or share my data · OK | **Never** |
| `europe_iab` | separate IAB banner | **Not designed yet** (DEF-10) | (not decided) |

**US opt-out regime:**

- The dialog is reachable only through the persistent "Your Privacy Choices" link, which shows the CCPA icon (LAW-10, DEF-04).
- Dismissing the notice with OK records no consent.

**US opt-in regime:**

- Accept or Allow grants sale and sharing plus the optional cookies.
- Sensitive information always needs its own consent in the dialog (LAW-09).

**Optional categories in opt-in regimes:** they stay **denied** until an explicit choice (LAW-11).

---

## 3. Presentations

There are three presentations: **Card**, **Banner** and **Drawer**. All three render the same content, copy and decision logic; presentation changes only the container.

### 3.1 Proposed public API

```ts
type ConsentPresentation =
  | { type: "card"; position?: "start" | "end" | "center" } // default type; position default 'start'
  | { type: "banner"; edge?: "bottom" | "top" } // default 'bottom'
  | { type: "drawer"; side?: "bottom" | "top" | "start" | "end" }; // default 'bottom'

interface ConsentPromptOptions {
  presentation?: ConsentPresentation; // default { type: 'card', position: 'start' }
  edgeStyle?: "inset" | "flush"; // default 'inset'; applies to Banner, Drawer and phone sheets, never to Card
  blockUntilChoice?: boolean; // default false; forced true for card + center; ignored under US opt-out
}
```

`start` and `end` are logical, like CSS `inset-inline-start`: they follow the page's writing direction. On a left-to-right page `start` is the left (the Card's bottom-left corner); on a right-to-left page it is the right.

Put the whole decision matrix in **one pure resolver** in core, so every framework renders the same thing. Unit-test the resolver directly; it is easy to test and is where the regressions kept happening.

```ts
resolveLayout({ presentation, edgeStyle, blockUntilChoice, variant, regime, viewport }) => {
  placement: 'card-start' | 'card-end' | 'card-center'
           | 'bar-top' | 'bar-bottom' | 'drawer-top' | 'drawer-bottom' | 'drawer-start' | 'drawer-end';
  flow: 'expand-in-place' | 'all-in-one';
  blocking: boolean;
  edgeStyle: 'inset' | 'flush';
}
```

The prototype's equivalents are `effPres()`, `centerOn()`, `blockingOn()`, `expandsInPlace()`, `aioOn()` and `barCollapsed()`, at around lines 925–945 of the explorer.

**The resolver's rules:**

| Input | Rule |
| --- | --- |
| Card, `center` | Always blocking. Under US opt-out (which never blocks) it falls back to `start`. |
| `blockUntilChoice` | `blocking = (blockUntilChoice \|\| cardCenter) && regime !== 'us-opt-out' && variant !== 'none'` |
| Drawer `start` or `end` on desktop | `flow = 'all-in-one'` |
| Drawer `start` or `end` on phone | Becomes `drawer-bottom` with `flow = 'expand-in-place'`. |
| Drawer `top` on phone | Stays `drawer-top`. |
| Card, Banner, Drawer `top` or `bottom` | `flow = 'expand-in-place'` |
| Banner, collapsed | The slim one-line bar. Once expanded, it behaves exactly like the drawer on the same edge. |

**Phone breakpoint:** the prototype switches viewports through the explorer. The SDK has to pick a real breakpoint, chosen where the content breaks rather than at a device size. A side drawer needs about 460px plus page room, so around `max-width: 640px` is a reasonable start. Verify it on devices.

### 3.2 Card (default)

**Layout:**

- A floating card, `min(440px, 100%)` wide, 24px from the viewport edges (16px on phone), with a 16px radius and layered shadow.
- **Bottom left** is the default. **Bottom right** mirrors it.
  - Implement bottom right as a full-width root with `align-items: flex-end`. Don't use `right: 0` alone: the root overflowed the left edge at narrow widths, which gave uneven 10px/24px margins.
- **Centre** is the old "modal":
  - 480px wide, entering with scale 0.96 and a fade.
  - It is always blocking, because a centred layer that doesn't block looks broken.

**Behaviour:**

- **Collapsed:**
  - The title, a short description with inline policy links (only those configured, BNR-08), and the footer `[Reject All][Accept All] … [Customize]`.
  - On phone, Reject and Accept share one row at equal widths, Customize is full width below, and every button is 44px tall.
- **Customize expands in place:**
  - The control is a disclosure button with `aria-expanded` and `aria-controls`.
  - A `grid-template-rows: 0fr → 1fr` panel opens between the intro and the footer. The card grows upward from its anchor.
  - The panel scrolls, up to 360px tall (320px on phone), with edge fades.
  - The footer becomes Reject all · Accept all · **Save choices**. In US opt-in it reads Don't allow · Allow · Save choices; on the US notice it is just OK.
  - Focus moves to the panel's first control, and "More options shown." is announced.
  - **Esc folds the panel back** and returns focus to Customize. It never dismisses the banner.

### 3.3 Banner (slim bar)

**Layout:**

- A one-line bar on the **bottom** (default) or **top** edge.
- Its content is capped to a 960px column using `padding-inline: max(24px, calc((100% - 960px) / 2))`.
- Collapsed height is about **53px**: 10px vertical padding, 13.5/20 text, and buttons at a 32px minimum height.

**Collapsed copy.** Keep it to one short sentence plus **one** policy link (Privacy Policy), or it wraps to two lines:

| Variant | Text | Actions |
| --- | --- | --- |
| EU | "We use cookies to improve your experience and analyze traffic." | Reject All · Accept All · Customize |
| US opt-in | "{Business} asks before using optional cookies or {short phrase from the rights bundle}." | Don't allow · Allow · Choose |
| US notice | "We use cookies to run this site, measure traffic and personalize ads. You can opt out at any time." | Do not sell or share my data · OK |

US opt-in short phrases, by rights bundle:

- `all`: "selling or sharing your data for ads"
- `sale-share`: "selling or sharing your data"
- `sale-ads`: "selling your data or using it for ads"

**Headings and narrow layout:**

- **Visually hidden heading:** "We value your privacy", "Your privacy choices" or "Privacy notice". This keeps a proper `aria-labelledby`.
- **Narrow layout** uses a **container query** on the card (`container-type: inline-size; @container (max-width: 720px)`), not a media query, so a narrow desktop window stacks too. When stacked, text sits on top and the buttons are full width (`flex: 1 1 0`) at a 40px minimum height. _Port TODO:_ use 44px on `pointer: coarse`.

**Expanding:**

- Customize or Choose expands the bar **into the drawer on the same edge**: full title, description, both policy links, every option and the Save footer.
- The expansion animation is `bar-grow` over 220ms, with −8px travel for the top edge and +8px for the bottom.
- Esc folds it back to the slim row, with focus on Customize.

**Edge style:**

- **Inset:** a rounded bar, 12px from the edges.
- **Flush:** square, edge to edge, with no border on the screen-edge side.

### 3.4 Drawer

**Shared rules:**

- One presentation with a **side** setting: Start, Top, Bottom (default) or End. Start and End follow the writing direction (left and right on a left-to-right page).
- **There are two logic sets, with no option to switch between them** (decided by the product owner: "Left and right are one logic set. Bottom, middle is another."). The side decides which set applies.

**Side set: start and end on desktop, "all-in-one".**

- **Size and layout:**
  - Full height, 460px wide (484px inset, which includes the 12px gaps).
  - Intro first, then **the choices themselves** in one scroll area, then a footer pinned to the bottom.
- **What's inside, by variant:**
  - **EU:** the cookie category box. Footer: Reject all · Accept all (equal) · Save choices. Switches are a draft; Save records exactly what is on.
  - **US opt-in:** the same rights rows and Preferences as the dialog, with the confirm step and the nudge. Footer: Don't allow · Allow · Save choices. Save turns untouched defaults into explicit refusals.
  - **US notice:** the rights rows, which apply immediately, then OK. The separate "Do not sell or share" link is dropped, because the control is right there.
- **Layering:**
  - The choices scroll down to the footer divider, with a 64px bottom fade over the end.
  - The "Consent by" tag floats _on top of_ the fade, centred, 14px above the divider.
  - The body has 60px of bottom padding, so the last row can scroll clear of the tag.
  - Only the tag takes pointer events; its wrapper is `pointer-events: none`.
- **No Customize**, because the choices are already showing.

**Edge set: top and bottom, plus every drawer on phone, "expand in place".**

- Full width, with content capped to the 960px column.
- **Collapsed:** a summary, the same content as the Card.
- **Expanded:** Customize expands the drawer in place, upward for bottom and downward for top.
  - The scroll area is up to 400px on desktop and up to 300px on phone, so the tag stays clear of the opposite screen edge.
  - The footer becomes Reject/Accept plus Save choices.
  - Esc folds it back.
- **Top** mirrors Bottom:
  - It slides down from the top.
  - The "Consent by" tag **hangs 8px below** the card on the right, because there is no room above it.
  - On phone, Top stays Top.

**Edge style (Inset is the default):**

- **Inset:**
  - The drawer sits 12px from every edge it touches, with 16px corners on all sides and a layered shadow.
  - Enter and exit animations travel the extra 12px, so the drawer fully leaves the screen.
  - On phone, an inset bottom drawer has `0 12px 12px` padding.
- **Flush:**
  - Square on every corner (radius 0), edge to edge.
  - A hairline appears only on the side facing the page.
  - On phone, padding is 0.
- **Phone pitfall:** a drawer's padding must never inherit the generic 16px phone banner padding. That bug made the flush drawer float with clipped corners.

### 3.5 Block until choice (BNR-13)

**Activation:**

- Off by default.
- Forced on for Card Centre.
- **Never applies under US opt-out**, whether that means no banner or the optional notice. There is nothing to consent to, so blocking would be a wall with no purpose.
- The explorer shows "Never applied under the US opt-out preset" and locks the control there.

**While blocking:**

- **One page-wide overlay:**
  - `--inth-overlay-block`: 62% slate in light mode, 72% black in dark mode.
  - A 3px backdrop blur.
  - With `prefers-reduced-transparency`, no blur and a more opaque overlay (78% light, 85% dark).
- **The page:**
  - The page is `inert`.
  - Document scroll is locked, with scrollbar-gutter compensation so the page doesn't shift.
- **The banner:**
  - It becomes `role="dialog"` with `aria-modal="true"`.
  - Focus moves in and is trapped.
  - **Esc never dismisses it.** It still closes an open confirmation, then folds an expanded panel (PERM-03).
  - The modal boundary and the trap cover the whole banner shell, including the "Consent by" tag (PERM-08).
- **Visual treatment (VIS-08):**
  - Surfaces over the scrim drop their light 1px border, which looked like a pale halo.
  - Instead use a faint dark ring, `0 0 0 1px rgba(15,23,42,.10)`, plus deeper layered shadows: 2/6px, 16/40px at 35%, 40/80px at 35%.
  - In dark mode, use a faint light ring (`rgba(255,255,255,.10)`) instead.

**On exit:**

- The overlay fades out over 160ms together with the banner.
- The page is released.
- Focus moves to "Your Privacy Choices".

**EU note:** blocking until _a_ choice, with Reject as easy as Accept, is not a cookie wall. Keep EU-01 whenever blocking is on.

### 3.6 Rules that hold across every combination

These broke only in combination; see PERM-01 to PERM-14.

- **One surface at a time.** Sheets exist only inside the open dialog. Banner panels always use accordions, phone included.
- **The banner hands off instantly.** Opening the dialog removes the banner and its scrim at once, even if their exit animation has already started. There is no overlap, and the dialog sits above the banner layer.
- **Changing surface clears transient state.** Opening, closing or committing drops any open confirmation, nudge, open receipt Details, in-flight copy, copy feedback and live message. Delayed reveals carry a surface token, so a dialog timer never scrolls the banner.
- **The blocking modal boundary is the banner shell (card + tag).** `aria-modal` goes on the shell; Tab from the focused card moves into the card first.
- **Esc on a non-blocking banner acts only when focus is inside the banner.**
- **Banner commits respect existing state.** They never change a live GPC lock or a recorded opt-out; Allow only fills in an untouched default. A refusal always applies in one action, unless a live GPC lock already has sale off. It also revokes a sensitive-data grant made in the panel. The receipt time moves only when a right actually changes.
- **Every commit ends the banner cleanly** (`endBanner()`): it records the decision, clears the expanded state, any open confirmation and pending focus, then releases the page and focuses "Your Privacy Choices".
- **Esc order inside banners:** confirmation, then expanded panel, never the banner itself. This also applies while blocking.
- **Shared helpers find the active surface.** Confirm reveal, shake, accordion reveal and copy work the same in the dialog and in banner panels.
- **The blocking surface treatment is applied last**, so it wins over edge-style rules while keeping the tag's hover and focus states.
- **The centred card centres the card**; the tag hangs above it, out of flow.

### 3.7 Lifecycle shared by every presentation

- Banner and dialog are **never visible together**: one `activeUI` (BNR-02).
- A non-blocking banner doesn't take focus when it appears, and the page stays interactive (BNR-03).
- **Accept or Reject on the banner:**
  - apply the choice and hide the banner;
  - move focus to "Your Privacy Choices";
  - announce the outcome through a page-level status region (BNR-06).
- **Closing the dialog without deciding** brings the banner back and focuses it. Once a decision is recorded, the banner never returns (BNR-05).
- **Changing the presentation** replays the entrance animation.
- **Exit:** faster and ease-in, back toward the edge the layer came from.

---

## 4. The "Your Privacy Choices" dialog

This is the full settings surface, opened from the persistent page link.

**Layout:**

- One column: 520px wide in the US, 560px in the EU.
- Max height `min(640px, 100%)`.
- The header and footer are fixed. **Only the body scrolls** (LAY-01).

**Order on the first view (US):**

1. **Intro:** "Your choices apply right away." on one line. The GPC note _replaces_ this text rather than adding to it.
2. **Rights rows**, each a **segmented control**:
   - Options are "Opt out | Allow" or "Limit | Allow", or in opt-in "Don't allow | Allow". The protective option is always first.
   - Build it as a `role="group"` of `aria-pressed` buttons, **not radios**. Arrow keys on a radio group would silently apply a legal choice.
   - The selected option shows a raised thumb, a weight-600 label and a check that draws in. It must never look disabled (RIGHT-02).
   - The group label carries the statutory phrase, generated from the rights bundle (SR-04, COPY-01).
3. **Confirmation for opting back in:**
   - It opens inline and focuses **Cancel** (RIGHT-06).
   - Pressing segmented "Allow" again while it's open triggers the **nudge**: a 360ms shake, a red ring (`--inth-danger`), focus to Cancel, and the announcement "Choose one of the two buttons first." (RIGHT-04).
   - Under reduced motion: the ring, but no shake.
   - Give it bleed padding so the shake and focus rings aren't clipped by the collapse's `overflow: hidden` (RIGHT-05).
4. **Receipt:**
   - One line: "✓ Saved for this browser · {date}" with a Details disclosure.
   - Shown only after something is recorded. A live GPC signal shows as live ("Honoring Global Privacy Control from this browser"), not as a saved date.
   - Copying the reference uses a token per attempt, and shows a visible fallback field if the copy fails (RCPT, CLIP).
5. **Preferences:**
   - On desktop it is an accordion row; on phone it is a nested sheet.
   - Categories sit in **one bordered group** (1px `--inth-border-strong`, 12px radius) with row dividers.
   - Each category's description is **inline**, never hidden (CAT-01).
   - In the US, the Marketing category is hidden. Advertising appears as a read-only row that follows the sale choice (LAW-05, CAT-08).
6. **Vendors** (CAT-09):
   - **Table:** a boxed table nested in the category: 8px radius, subtle surface, header row "Vendor · Purpose", 40px rows.
     - Each row has a purpose truncated with "…" (full text on hover), a ↗ link to the vendor's privacy policy, and a small switch.
     - `role="table"`, labelled "{Category} vendors".
   - **Trigger:** a 32px row inside the category's segment with **no divider**, using a `::before` extension to keep a 40px hit area.
     - Text: "View N vendors", with "K on ⌄" right-aligned.
     - Ghost at rest; on hover or focus it takes the stroke-button look.
     - **No press scale**: it should feel like something opening, not a click.
   - Its accessible name starts with the visible text (CAT-05).
7. **Row clicks** (CAT-10):
   - Clicking a category's or vendor's name or description toggles its switch.
   - Links inside the row don't toggle, and neither does a click made while selecting text.
   - The switch stays the only focus target.
8. **The category switch gates its vendors**, and vendor switches are never `disabled` (CAT-02, CAT-03). Automatic changes are announced (CAT-04).

**Footers:**

- **US:** only "Done", which closes and commits nothing. Done's label never changes; the phone save cue is a check that slides in beside it (SR-07, FOC-06).
- **EU:** Reject all and Accept all (stroke style, equal weight), plus **Save choices** (primary), which stays disabled until the _effective_ state differs from the saved one (EU-01, EU-03).
  - Closing without saving discards the draft (EU-02).
  - Nested EU sheets say "Changes apply when you save in Privacy settings." (EU-05).

**Phone versus desktop:**

- **Desktop uses accordions only.** Nested dialogs on desktop "look goofy" (product owner).
- **Phone uses nested sheets**, at most **two layers** (NEST-02).
- **Parent layer while a child sheet is open:**
  - The parent goes `inert` and dims: it moves up 32px and scales down 5% per level.
  - Only the top layer carries `aria-modal`.
- **Closing a sheet:**
  - Esc, ×, Done or a backdrop tap closes only the top layer.
  - Focus returns to the row that opened it.
  - Ignore clicks for about 450ms after a backdrop `pointerdown`, or the tap's `click` lands on the parent's × (NEST-05).
- **Edge style applies to phone sheets too:**
  - Inset: 12px from the sides and bottom, with every corner at 16px.
  - Flush: edge to edge, radius 0.

**Scrolling:**

- Never call `Element.scrollIntoView` inside the dialog; it also scrolls the card and pushes the header out of view.
- Scroll only the body, with `scrollBy`.
- When an accordion opens, reveal as much of it as fits _without scrolling its trigger out_ (LAY-05).

**Scroll edge fades (LAY-08)** apply to every scroll area:

- A `mask-image` gradient, 20px at the top and 28px at the bottom.
- Each fade appears only when more content lies in that direction.
- The fade lengths animate over 150ms through registered `@property --fade-top/--fade-bottom`.
- Recompute on scroll, on render, and on `transitionend` of `grid-template-rows`.

---

## 5. Attribution tag: "Consent by [INTH]"

- **Content:**
  - The text "Consent by" plus the square **INTH monogram**: `InthMark` from c15t `packages/react/src/components/shared/ui/logo.tsx`, the same as `@inth/sdk-ui` `BRAND_MARKS.inth`.
  - The mark is 15px tall (13px on phone) and decorative. The link's name comes from a `sr-only` "Inth".
  - It links to `https://inth.com`.
- **Style:**
  - A quiet neutral surface with a hairline border, muted text and a near-flat shadow.
  - **8px radius**, not a full pill.
  - A 44px hit area via `::before`.
  - Neutral focus ring.
- **Hover and focus:**
  - Primary text, mark and 1px border on **`--inth-primary-tint`**.
  - The tint is **opaque**: primary mixed into the surface, 10% on white and 18% on dark. Never use the translucent soft colour, which went see-through over the scrim.
  - Hover effects apply only under `(hover: hover) and (pointer: fine)`. Press scales it to 0.97.

**Placement by presentation:**

| Presentation | Tag position |
| --- | --- |
| Card (any corner), bottom drawer, bottom banner | **8px above** the card, right edge flush with the card. On full-width drawers and banners it aligns to the content column, not the screen edge. |
| Top drawer, top banner | **8px below** the card, on the right. |
| Side drawer (all-in-one) | Floating over the bottom scroll fade, centred, 14px above the footer divider. |

**Rejected options (decision record in the regressions file):**

- the wording "Secured by" or "Protected by": an assurance claim Inth doesn't make, so an FTC deception risk;
- a brand-blue tab: too loud next to Reject and Accept;
- the inth.com wordmark: overpowering;
- an attached tab;
- a full-pill shape;
- a shield icon.

---

## 6. Tokens

### 6.1 Radius (VIS-07)

| Token | px | Used for |
| --- | --- | --- |
| `--inth-radius-lg` | 16 | Surfaces: the dialog, the Card in every position, inset drawers, inset banners, inset phone sheets. |
| `--inth-radius-container` | 12 | Large containers inside a surface: the category box, the Preferences row, the confirm box, receipt Details, the GPC note. |
| `--inth-radius-md` | 10 | Controls: buttons and the segmented track. The track's thumb is 7, which is 10 minus its 3px inset. |
| `--inth-radius-nested` | 8 | Containers inside containers (the vendor box), and the attribution tag. |
| (none) | 0 | **Anything flush**: flush drawers, flush banners, flush phone sheets. All four corners are square. |
| (none) | full | Switches. |

- Never give a container the same radius as the control inside it.
- Neighbours that line up share a radius.

### 6.2 Colour

| Token | Light | Dark | Note |
| --- | --- | --- | --- |
| `--inth-primary` | `#2563eb` | `#2f66df` | Dark-mode white-on-primary contrast is 5.1:1 (VIS-01). |
| `--inth-primary-text` | `#2563eb` | `#8ab4ff` | Blue text on surfaces. Dark-mode primary is only 3.5:1 on the card (VIS-02). |
| `--inth-primary-tint` | `color-mix(in srgb, #2563eb 10%, #fff)` | `color-mix(in srgb, #4f83f1 18%, #14161a)` | Opaque. Used for tag and ghost hovers. |
| `--inth-danger` | `#dc2626` | `#f87171` | The nudge ring. |
| `--inth-border-strong` | `rgba(15,23,42,.16)` | `#3a404e` | Group borders. |
| `--inth-overlay-block` | `rgba(15,23,42,.62)` | `rgba(0,0,0,.72)` | Blocking scrim, with a 3px blur. |
| `--inth-overlay-block-solid` | `rgba(15,23,42,.78)` | `rgba(0,0,0,.85)` | Used under `prefers-reduced-transparency`. |
| Switch off-track | `#8492a6` | `#64748b` | Needs at least 3:1 against the surface (VIS-03, WCAG 1.4.11). |
| Nested parent dim | `rgba(15,23,42,.1)` | `rgba(0,0,0,.4)` | VIS-05. |

**Theme switching:** disable every transition while the theme changes. Set `html[data-theme-switching] * { transition: none !important }` and remove it two frames later (VIS-06).

---

## 7. Motion

The house ease-out curve is `--ease-out: cubic-bezier(.23,1,.32,1)`.

**Principles:**

- Exits are faster than entrances and use `ease-in`, leaving toward the edge the element came from.
- Animate only `transform` and `opacity`, plus `grid-template-rows` for disclosures.

| What | Enter | Exit |
| --- | --- | --- |
| Card (corner) | 180ms, opacity plus `translateY(8px)`, ease-out | 160ms, ease-in, opacity plus 8px |
| Card (centre) | 220ms, scale 0.96 plus fade | 160ms, scale 0.97 plus fade |
| Drawer, any side | 280ms translate from its own edge; inset adds 12px of travel | 160ms ease-in, back to the same edge |
| Banner bar expanding | 220ms `bar-grow` (opacity 0.6→1, ±8px) | (none; folding back is instant) |
| Blocking scrim | 200ms fade | 160ms fade, together with the banner |
| Disclosure | `grid-template-rows` 0fr→1fr over 200ms; content opacity delayed 60ms | the same, reversed |
| Segmented thumb | 200ms with the ease-out curve; the check draws over 260ms | (none) |
| Nudge shake | 360ms | (none) |
| Nested phone sheet | 260ms | 160ms |
| Scroll fades | 150ms on the length of `--fade-*` | (none) |
| Hover and press | 120–150ms colour transitions; press scale 0.97 on the tag and other buttons | **no** press scale on disclosure triggers |

**Reduced motion:**

- Everything is effectively instant.
- No shake; the check renders fully drawn.
- The "Saved" cue is removed by a 1.7s JS timer rather than by an animation (MOT-03).

**Persistence:** every animation runs on nodes that persist. A key change must recreate a node only when you _want_ the entrance to play again (ARCH-01).

---

## 8. Accessibility checklist for each port

- [ ] Rights controls are a `role="group"` of `aria-pressed` buttons, not radios.
- [ ] Under GPC, only the _unselected_ option has `aria-disabled` (GPC-03).
- [ ] Every switch is `role="switch"`, with `aria-labelledby` pointing at its name and `aria-describedby` pointing at its inline description (SR-06).
- [ ] Each disclosure button has `aria-expanded` and `aria-controls`, and its accessible name starts with the visible label (WCAG 2.5.3).
- [ ] Each modal layer has its own `role="status"`. Announcements are cleared when a layer opens or closes, and a repeated message still gets announced (SR-01 to SR-03).
- [ ] No duplicate IDs across stacked layers; prefix the IDs in nested sheets (SR-05).
- [ ] The focus trap covers the top layer only, and handles focus starting on a `tabindex=-1` node (FOC-01).
- [ ] Focus goes to the right place:
  - the dialog opens on its title;
  - the confirmation opens on Cancel;
  - an expanded panel starts on its first control;
  - closing returns focus to the opener;
  - a banner choice moves focus to "Your Privacy Choices".
- [ ] Esc follows this order (FOC-04):
  1. top nested sheet;
  2. open confirmation;
  3. dialog;
  4. expanded banner panel, which folds back.

  Esc never dismisses a banner.

- [ ] Hit areas are at least 44px on touch and 40px on desktop, extended with `::before`, and never overlapping.
- [ ] Hover styles sit behind `(hover: hover) and (pointer: fine)`.
- [ ] Contrast is AA for text and 3:1 for UI parts, in light and dark mode (section 6.2).
- [ ] Phone footers respect `env(safe-area-inset-bottom)` (LAY-06).
- [ ] **Still to do (DEF-07):** hand-test with VoiceOver on macOS and iOS, and NVDA on Windows. Every check so far ran in headless Chromium.

---

## 9. Architecture notes for the port

- **Headless core, thin views.** These all live in framework-agnostic core and are tested once:
  - the decision matrix (`resolveLayout`);
  - the consent state machine (`sale/saleSrc`, `sens/sensSrc`, `viaGpc`, `decided`, the EU draft against `euSaved`);
  - the copy generators (`scopePhrase`, the strings built from the rights bundle).

  React, Vue, Svelte and HTML only render.

- **Source of each value matters:**
  - `src: 'default' | 'user' | 'gpc'` drives the copy ("Off by default" appears only for defaults, COPY-02), the receipt, and whether Save records something.
  - Any explicit sale choice clears `viaGpc` (GPC-07).
- **Receipt timestamps:** the receipt time changes only on rights changes, never on cookie or vendor edits (RCPT-02).
- **Mounting and identity:**
  - Keep collapsible regions (receipt, confirm, panels) mounted, and toggle a `data-open` attribute. Mounting and unmounting them caused focus loss and a 30px jump (RCPT-03).
  - Stable slots: elements that appear next to a focusable control must not shift that control's identity (FOC-06; for example `display: contents` with a stable key).
- **Timers:** clear the cue, pop, copy and banner-exit timers on close, reset and viewport change. Copy results carry a token so stale ones are ignored (ARCH-02, NEST-06, CLIP-02).
- **Scroll lock and `inert`:**
  - Apply them to the document only while blocking or while the dialog is open.
  - Never apply them under the US opt-out preset.
  - Compensate for the scrollbar gutter.
- **Status and debug UI:** any devtools overlay must refresh on every state change, including while the dialog is closed (ARCH-04).
- **Policy links** come from configuration. Render one only when it is configured, and it must actually navigate (DEF-01).

---

## 10. Where each piece lands in `~/dev/inth`

| Prototype piece | SDK location (today) | Port action |
| --- | --- | --- |
| Presets → `bannerVariant` | `packages/sdk/schema/src/shared/policy-rule-presets.ts` | Add a `notice` option to the US opt-out presets. Resolve DEF-09 (whether GPC denies `measurement`). |
| Card, Banner and Drawer containers | `packages/sdk/react/src/components/prompt/*` | Add the `presentation`, `edgeStyle` and `blockUntilChoice` props, and the in-place expand panel. |
| Dialog body and accordions | `packages/sdk/ui/src/styles/components/accordion.module.css` | Use one bordered group: set `--accordion-stack-gap: 0` plus an outer wrapper, or change the default (DEF-05). |
| Attribution tag | `packages/sdk/ui/src/utils/branding.ts` (`BRAND_MARKS`) | Change "Secured by" to **"Consent by"** and make the tag a neutral 8px-radius surface. |
| Copy | `packages/sdk/translations/src/translations/en.ts` | Add the strings from section 11, including the US opt-in strings and the short bar copy for each rights bundle. |
| CCPA opt-out icon | (missing) | Ship the official asset (DEF-04). |
| Tokens | the UI theme | Add `--inth-primary-tint`, `--inth-primary-text`, `--inth-overlay-block(-solid)` and `--inth-danger`, plus the radius scale. |

---

## 11. Copy reference (English)

All sale-row wording is **generated from the rights bundle**. Nothing hard-codes "selling and sharing" (COPY-01).

| Where | String |
| --- | --- |
| EU card title | We value your privacy |
| EU bar | We use cookies to improve your experience and analyze traffic. |
| US opt-in title | Your privacy choices |
| US opt-in card body | With your permission, {Business} would use optional cookies for site features and analytics, and {sell or share … per bundle}. Nothing is turned on unless you allow it. |
| US opt-in bar | {Business} asks before using optional cookies or {short phrase}. |
| US notice bar | We use cookies to run this site, measure traffic and personalize ads. You can opt out at any time. |
| Dialog intro (US) | Your choices apply right away. |
| GPC note | Your browser sent a Global Privacy Control signal, so {Business} won't {scope}. Allow isn't available while the signal is on. |
| Nudge | Choose one of the two buttons first. |
| Panel expanded (announced) | More options shown. |
| Banner reject (announced) | Optional cookies rejected. You can change this in Your Privacy Choices. |
| All-in-one Save (announced) | Choices saved. You can change them in Your Privacy Choices. |
| Receipt scope, signed out | Applies to this browser. Sign in to apply it to your account too. |
| Receipt scope, signed in | Applies to this browser and your {Business} account. |
| EU nested sheet | Changes apply when you save in Privacy settings. |
| Copy failed | Couldn't copy. Select and copy your reference: |
| Preferences row (cookie categories) | Preferences · Site features and analytics · {N} on |
| Slim notice bar, GPC honoured | We use cookies to run this site and measure traffic. Your Global Privacy Control signal is honored. |
| Banner Allow while sale stays off (announced) | Optional cookies allowed. {Rights} stay off[ because of your Global Privacy Control signal]. You can change this in Your Privacy Choices. |
| Attribution tag | Consent by [INTH] |

**Never write:**

- "turn off the signal to change this" (misleading, GPC-04);
- "Turn off a vendor to stop it" in the EU (it implies an immediate effect);
- GDPR wording such as "Reject All" or "Accept All" on the US opt-in banner (BNR-09).

---

## 12. Do not reintroduce

Each of these was tried and rejected. Each needs a new decision before it comes back.

- **Presentations:**
  - A separate _Floating_ presentation: Card is the same card and does more.
  - A separate _Modal_: use Card → Centre.
  - Separate Left, Bottom and Right presentations: use one Drawer with a side.
  - A Summary versus All-in-one setting for drawers: the side decides.
- **Dialog flows:**
  - Customize opening the full dialog, or phone sheets, from a banner or drawer: use expand in place.
  - Nested dialogs on desktop: use accordions.
  - Three or more stacked phone sheets.
- **Statutory rights:** inside Preferences or behind an accordion.
- **Controls and labels:**
  - Radios for the rights controls.
  - A grey filled "✓ Opted out" selected state, which looked disabled.
  - A header status text that repeats the selected control.
  - A Done label that changes to "Saved".
- **Vendors:**
  - A plain stacked vendor list, or an inline-text vendor trigger.
  - Logo badges for vendors.
  - A divided or tinted vendor strip.
  - Grey-fill or primary-outline hover on the vendor trigger.
  - Press scale on a disclosure.
- **Attribution tag:**
  - The wording "Secured by" or "Protected by".
  - A brand-blue tab, an attached tab, a full-pill tag, the wordmark, or a shield icon.
- **Visual treatments:**
  - A translucent hover tint over a scrim.
  - A light border on surfaces over the blocking scrim.
  - Half-rounded flush panels.
- **Blocking:** a blocking layer, scroll lock or `inert` under US opt-out.
- **Scrolling:** `scrollIntoView` inside the dialog.

---

## 13. Open decisions (owner: product and legal)

| ID | Question | Current stock behaviour |
| --- | --- | --- |
| DEF-02 | Use a protective default ("Off by default") in the opt-out regime? | Allowed (the legal default). A protective default would lower the allow rate. |
| DEF-03 | Offer a flow to consent past GPC? | Locked. If it's added, put it behind `allowGpcOverride` and get legal sign-off. |
| DEF-06 | In US opt-out, show no banner or the notice? | No banner (the preset); the notice is optional. |
| DEF-09 | Does GPC deny `measurement` as well as sale and sharing? | **Conflict:** the SDK presets deny `marketing` and `measurement`; the prototype and council deny sale, sharing and ads only. Council recommendation: make it configurable and drop `measurement` from the default. |
| DEF-10 | The IAB TCF banner for `europe_iab` | Not designed. |
| (new) | A **"California + wiretap protection"** option: gate third-party pixels, session replay and chat vendors until consent, given the CIPA wiretap rulings (Javier, Camplisson, OnePlus, Limas, Forbes, Ubisoft, Spears, Politico, Formula 1, Variety Media tentative). | Not built. The plain CCPA opt-out preset allows no banner; CIPA exposure argues for consent before those vendors fire. Waiting on a product decision. |
| DEF-07 | Manual testing with VoiceOver and NVDA | Not done yet. |
| DEF-08 | Does an opt-out reach native apps and signed-in accounts? | Make sure the integration supports it (Disney, Lyft, Jam City). |

---

## 14. Testing a port

0. **Port the permutation sweeps too.** `perm.html` runs 17,024 checks: 3 viewports × 9 placements × 2 edge styles × 2 blocking states × 4 region variants, each collapsed, expanded, after Esc and after a commit. `perm2.html` runs 911 cross-flow checks: the dialog round trip, opening the dialog directly, GPC and signed-in, theme switches mid-state, presentation changes and the regressions from rounds 1 to 3. Run `perm.html` at 1400px and at 700px (a narrow desktop window).
1. **Port the self-test first.** `selftest.html` (built from `privacy-choices-tests/selftest.inc.html`) has 146 checks grouped by prefix: `pres`, `card:`, `card bottom right`, `banner:`, `top drawer:`, `aio`, `block on + …`, `blocking:`, `fades:`, `vendors:`, `row click:`, `phone flush/inset bottom drawer`, and others. Port each group as a component test, keeping the regression ID in the test name:

   ```ts
   it('[BNR-13] blocking never applies under US opt-out, even with blockUntilChoice', …)
   ```

2. **Unit-test `resolveLayout` exhaustively.** Cover every combination of presentation × position or side × edge style × blocking × regime × variant × viewport (about 400 cases), checked against section 3.1.

3. **Use this timing harness**, which the prototype needed:
   - stub `setTimeout` and `requestAnimationFrame`;
   - call `document.getAnimations().forEach(a => a.finish())` before measuring geometry;
   - allow ±1px for sub-pixel rounding.

4. **Screenshot matrix:**
   - light and dark;
   - desktop (1280 wide, plus a narrow window under 720) and phone (390);
   - each presentation, collapsed and expanded;
   - blocking on and off;
   - EU, US opt-in and US notice.

5. **Measure geometry, don't eyeball it:**
   - Card margins are equal at narrow widths.
   - The tag's right edge equals the card's right edge (or the content column's).
   - The title's left edge lines up with the buttons' left edge.
   - The collapsed bar is about 53px tall and fits on one line at 1280px.
