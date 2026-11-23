# Privacy Choices + cookie banner: regression catalogue

This file lists every bug, edge case and design rule found while building the HTML prototype (`privacy-choices-explorer.html`, v1 to v6). Seven council review rounds (Claude Opus 5.5, GPT 6.2 Sol, Gemini 4 Neon) and the product owner's own testing produced them. Use it when porting the prototype to the Inth SDK in TypeScript (React, Vue, Svelte, HTML).

**How to use it:** each entry is an invariant. When a component is ported, add a test that asserts the invariant and cite its ID in the test name, for example `it('[RIGHT-04] re-pressing Allow while the question is open does not apply', …)`. Most entries already have a scripted check in `selftest.html` (147 checks in v6). The permutation sweeps `perm.html` (17,024 checks: viewport × placement × edge style × blocking × region) and `perm2.html` (911 cross-flow checks) cover the PERM entries. The **Test** line says what to port.

**Read with `PRIVACY-CHOICES-IMPLEMENTATION-NOTES.md`:** it is the build spec (presentations, API, tokens, motion and copy). This file holds the invariants. Where an older entry here conflicts with **BNR-16, BNR-17 or BNR-18** (v6), the v6 entries win; superseded entries are marked _Superseded_.

This is product and engineering guidance, not legal advice. Customers' counsel should review the final copy.

**ID prefixes:**

| Prefix | Area                                                 |
| ------ | ---------------------------------------------------- |
| LAW    | compliance defaults                                  |
| RIGHT  | rights controls and the confirm step                 |
| GPC    | Global Privacy Control                               |
| RCPT   | receipt                                              |
| CAT    | cookie categories and vendors                        |
| EU     | the staged EU/UK model                               |
| BNR    | the banner and its link to the dialog                |
| LAY    | layout and fit                                       |
| NEST   | phone sheets and desktop accordions                  |
| FOC    | focus and keyboard                                   |
| SR     | screen readers and announcements                     |
| VIS    | contrast and visual states                           |
| MOT    | motion                                               |
| COPY   | wording                                              |
| CLIP   | copying the reference                                |
| ARCH   | rendering architecture                               |
| PERM   | permutations: options that broke only in combination |
| DEF    | deferred and rejected items                          |

---

## LAW: compliance defaults

These decisions set what most visitors end up with, because most visitors accept the defaults.

- **LAW-01. Statutory rights are never inside Preferences or an accordion.** "Selling, sharing and targeted ads" and "Sensitive personal information" are always visible on the first view of the dialog.
  - _Why:_ Sling TV (CA AG, $530k), where a cookie toggle was not accepted as a sale/share opt-out.
  - _Found:_ round 0, all three reviewers.
  - _Test:_ both rights groups are visible without expanding anything.
- **LAW-02. Opting out or limiting takes exactly one action.** Opting back in or allowing takes two: the choice, then a confirmation in place. The confirm step is never applied in the restrictive direction.
  - _Why:_ Honda (CPPA, $632,500), which requires a symmetrical path; and CPRA §§7026–7028, which require two steps to opt back in.
  - _Found:_ round 0.
  - _Test:_ clicking "Opt out" records the opt-out immediately; clicking "Allow" from a recorded opt-out opens the confirmation and doesn't record anything yet.
- **LAW-03. No email confirmation, sign-in or identity check before an opt-out.**
  - _Why:_ Ford (CPPA, $375,703) for email confirmation; LocateSmarter for asking for SSN digits.
  - _Test:_ the opt-out path makes no network-gated step.
- **LAW-04. Restrictive choices apply immediately in US regimes.** There is no "Save" step in the US. The footer has only "Done", which closes and never commits anything.
  - _Why:_ Todd Snyder (CPPA, $345,178): a broken or unsaved consent tool still counts as the business's violation. This also removes the old mixed commit model, where Save sat next to Done.
  - _Found:_ round 0. Opus and Gemini were for it; GPT preferred a staged Save for cookies, and the majority decided.
- **LAW-05. The ad-cookie category is not a separate switch in US regimes.** Advertising follows the sale/sharing choice. Preferences shows a read-only "Advertising: On/Off — Set by your … choice" row.
  - _Why:_ Healthline ($1.55M), where an opt-out must actually stop the tags; and Sling TV.
  - _Found:_ round 1, Opus: the note said "follows your choice" but nothing in the state linked them.
  - _Test:_ when sale is opted out, the Advertising row reads Off.
- **LAW-06. In the opt-out regime the legal default is "Allowed"**, and the dialog shows exactly that. A protective default ("Off by default" / "Limited by default", nothing recorded) is a configuration option, not the stock behaviour. This is a product decision that is still open.
- **LAW-07. US opt-in regime.** Sale/sharing starts at "Don't allow" and sensitive information starts at "Don't allow". Granting either needs the confirm step.
  - _Found:_ round 1, Opus and Gemini: sensitive information defaulted to Allowed and used CPRA "Limit" wording.
  - _Test:_ in opt-in, `sens === 'limit'` and `sensSrc === 'default'` on load; pressing "Allow" opens the confirmation.
- **LAW-08. The "Permitted-only" sensitive-information mode omits the row entirely.** No "nothing to limit" filler text.
  - _Found:_ round 0, 2 of 3 reviewers.
- **LAW-09. "Accept All" on the US opt-in banner grants sale/sharing only.** Sensitive information still needs its own explicit consent in the dialog. Bundling it into "Accept All" would be bad practice and legally weak in opt-in states.
  - _Found:_ added with the banner.
- **LAW-11. Opt-in regimes (EU and US opt-in) keep optional cookie categories _denied_ until an explicit choice.** Only the US opt-out preset allows them before a choice. The demo started US opt-in with categories on, which contradicts the SDK's `us_privacy_states_opt_in` rule ("Optional categories stay denied until an explicit choice").
  - _Found:_ when the banner was wired to the SDK presets.
  - _Test:_ in US opt-in on load, `functionality`, `experience` and `measurement` are all false.
- **LAW-10. The trigger link "Your Privacy Choices" shows the CCPA opt-out icon in US regimes.**
  - _Why:_ CPRA regulations §7015.
  - _Found:_ round 3, Opus. The prototype's icon is hand-drawn; the SDK must ship the official asset (see DEF-04).

## RIGHT: rights controls and the confirm step

- **RIGHT-01. Each right is a two-option segmented control, protective option first.** Options are "Opt out | Allow", "Limit | Allow", or in opt-in "Don't allow | Allow".
  - Use a `role="group"` containing `aria-pressed` buttons, **not radios**. Arrow keys on a radiogroup change the selection, which would silently apply a legal choice.
  - _Found:_ round 0 (Opus and Gemini), with the radio-versus-buttons issue noted when it was built.
- **RIGHT-02. The selected option must never look disabled.** Use a raised white thumb with a weight-600 label and a check that draws in, on a darker track (`--inth-surface-hover`). The original prototype's grey filled "✓ Opted out" read as disabled.
  - _Found:_ the original review, item 5; the light-mode track contrast was raised again after round 1.
- **RIGHT-03. Pressing the already-selected option:**
  - if the confirmation for that row is open, it closes the confirmation;
  - if the current state comes from a default, it turns it into a recorded user choice (`src = 'user'`, the receipt appears).
  - _Found:_ round 1, GPT and Gemini.
- **RIGHT-04. While the confirmation is open, pressing the segmented "Allow" again must not apply.** Instead the confirm box shakes (360ms), gets a red ring (`--inth-danger`), focus moves to the cancel button, and "Choose one of the two buttons first." is announced.
  - Under reduced motion there is no shake, but the ring stays.
  - The red state clears when the visitor cancels, confirms, or re-presses the restrictive option.
  - _Found:_ product owner.
  - _Test:_ `S.sens` is still `limit`, `data-nudged` is `true`, and focus is on cancel.
- **RIGHT-05. The shake must not be clipped.** The confirm sits in a `.collapse-inner` with `overflow: hidden`, so give it bleed room: `margin-inline: -10px; padding-inline: 10px; margin-block: -4px; padding-block: 4px`. The same bleed is needed anywhere a focus ring sits inside `overflow: hidden`, such as the receipt "Details" button.
  - _Found:_ product owner (the red border was clipped on the right), and Gemini round 3 (the Details focus ring).
- **RIGHT-06. The confirmation focuses its cancel button when it opens**, not its heading. A focused heading with `tabindex=-1` made Tab jump to the dialog's × instead.
  - Cancel, or Esc, returns focus to the **invoking "Allow"** button.
  - _Found:_ rounds 2 and 3, GPT and Gemini.
- **RIGHT-07. The confirmation scrolls into view inside the dialog body only** (see LAY-05).
  - _Found:_ round 1, Opus: with Details expanded, the confirm buttons could end up below the fold.
- **RIGHT-08. Every recorded rights change sets `decided = true`** (see BNR-05), and updates the receipt timestamp to "just now".

## GPC: Global Privacy Control

- **GPC-01. GPC applies to sale/sharing (and targeted ads, where the bundle includes them) only.** It never limits sensitive information and never switches off analytics or functionality categories.
  - The original prototype treated GPC as a recorded sensitive-information limit and locked Analytics.
  - _Found:_ round 0, GPT and Opus.
  - _Test:_ with GPC on, `sens` is unchanged and no category switch is disabled.
- **GPC-02. GPC covering "targeted ads" in the "all" bundle is correct.** Under the CCPA, "sharing" means cross-context behavioural advertising, and Colorado-style universal opt-out mechanisms cover targeted advertising and sale. GPT round 1 item 1 was **rejected** on this basis.
- **GPC-03. While the signal is on, the sale control is locked.** Only the _unselected_ option gets `aria-disabled="true"`. The selected "Opt out" must not be announced as disabled.
  - _Found:_ round 1, Gemini.
- **GPC-04. One note replaces the description**, so the information isn't shown twice: "Your browser sent a Global Privacy Control signal, so Acme won't … {scope}. Allow isn't available while the signal is on."
  - **No icon.** The product owner removed the shield.
  - Do **not** tell people to "turn off the signal to change this"; round 3 GPT flagged that as misleading, because a known consumer's opt-out persists.
- **GPC-05. An opt-out that was honoured persists after the signal disappears.** It is kept as a recorded user choice (`saleSrc = 'user'`, `viaGpc = true`), the receipt credits "from your Global Privacy Control signal", and Allow becomes available.
  - _Why:_ CPPA §7025, for known consumers.
  - _Found:_ round 3, GPT.
  - _Test:_ the `gpc-past` fixture.
- **GPC-06. The receipt shows a live GPC signal as live, not as a stored date:** "Honoring Global Privacy Control from this browser", with the detail "Read from your browser on every visit." It must never say "Saved … Jan 15".
  - _Found:_ round 2, Opus, citing §7025(c)(6).
- **GPC-07. Any explicit sale choice clears the `viaGpc` provenance.**
- **GPC-08. The US notice banner mentions an honoured GPC signal.**

## RCPT: receipt

- **RCPT-01. The receipt is one line**, "✓ Saved for this browser · Jan 15, 2026", with a "Details" disclosure. It is not a key/value card; the old "Rights" value wrapped badly. Show it only when something has been recorded. A first visit, or a protective default that was never touched, shows no receipt.
- **RCPT-02. Its timestamp changes only on rights changes.** Cookie or vendor edits must not rewrite an earlier opt-out's date to "just now".
  - _Found:_ round 1, GPT and Gemini.
- **RCPT-03. Keep the receipt always mounted inside a collapse** (`data-open`), so it animates in and the rows below it are not recreated by the DOM diff. That recreation used to lose focus and cause a 30px jump.
  - _Found:_ round 1, Opus.
- **RCPT-04. The scope line must be truthful.**
  - Signed out: "Applies to this browser. Sign in to apply it to your account too."
  - Signed in: "Applies to this browser and your Acme account."
  - The rights description and the GPC note must use the same scope through `scopePhrase()`.
  - _Why:_ Disney ($2.75M), because an opt-out has to reach the account.
  - _Found:_ round 0, and round 3 (Gemini) for the description/receipt mismatch.

## CAT: cookie categories and vendors

- **CAT-01. Each category's one-sentence description is always inline next to its switch**, never hidden in an accordion.
  - _Why:_ CNIL's recommended structure, and so screen readers hear the description with the switch (see the separate layout thread).
  - Only long content is disclosed: vendor lists, cookie tables, IAB.
- **CAT-02. The category switch gates its vendors.**
  - Vendors default to on inside the category.
  - Turning a category on when none of its vendors are on turns all of them on. Before this fix, Analytics could be saved "on" with 0 of 3 vendors.
  - Turning off the last vendor turns the category off.
  - _Found:_ rounds 1 and 2, all three reviewers.
- **CAT-03. Vendor switches are never `disabled`.** Turning on a vendor whose category is off turns the category on with _only_ that vendor on. Before this, disabling all vendor switches when the last one went off dropped focus to `<body>` and blocked undo.
  - _Found:_ round 2, Gemini.
- **CAT-04. Automatic category changes are announced**, for example "Mapbox off. Experience off. Saved."
  - _Found:_ round 3, Opus.
- **CAT-05. The vendor disclosure is a full-width 40px row at the bottom of the category:** "View N vendors" on the left, "K on ⌄" in muted text on the right; "Hide N vendors" when open.
  - The old 12px "2 of 2 vendors ›" text link was too small and unclear.
  - Its accessible name must **start with the visible text**: "View 2 vendors for Functionality", with the category name in a `sr-only` span (WCAG 2.5.3, Label in Name). An `aria-label` like "Analytics vendors, 2 of 3 on" broke this.
  - _Found:_ product owner, and round 2 Opus for the label.
- **CAT-09. Vendor list = a boxed table; trigger = an in-segment "Tight" row with a ghost-to-outline hover** (decided from `proto-vendors`, three rounds).
  - **Table:** a nested bordered box (8px radius, subtle surface) with a header row "Vendor · Purpose". Each vendor is one 40px line: name, purpose (one line, cut off with "…" and the full text on hover), a ↗ icon link to its privacy policy (accessible name "{Vendor} privacy policy") and a small switch. ARIA `role="table"`, labelled "{Category} vendors".
  - **Trigger:** inside the category segment with **no divider line**. The category row's bottom padding is 6px, the trigger row is 32px (6px 8px padding), and a `::before` extension keeps a 40px hit area. Text: "View/Hide N vendors" with "K on ⌄".
  - **Hover / focus:** ghost at rest (no fill, no border). On hover and keyboard focus it becomes the **stroke button** (surface background, hairline border, small shadow), the same look as Reject all and Accept all.
  - **Press:** **no scale** — it should feel like a disclosure opening, not a button press. Feedback is the chevron rotating and the panel opening and closing; while pressed, only the fill dips to the hover grey.
  - **Rejected:**
    - **Lists:** the plain stacked list (round 1, too tall); Inline text trigger plus guide-line list (easy to miss); Logos with initials badges (no real logo assets; long name lists get cut off).
    - **Table placement:** flush, inset-divider and band tables (round 2: the product owner prefers the box).
    - **Trigger:** divided strip with its own line, tinted strip, and text link (round 3).
    - **Spacing and hover:** the 36px and 28px heights; grey-fill hover (reads as a highlighted row) and primary-outline hover (competes with the blue switches).
  - _Test:_ the v5 self-test, "vendors:" checks.
- **CAT-10. Clicking anywhere on a category's name and description, or a vendor's name and purpose, toggles its switch**, the way a `<label>` does. The pointer becomes a hand, and the row text isn't selectable.
  - Links inside the row (vendor privacy policy) don't toggle, and neither does a click while text is selected.
  - The switch stays the only keyboard and focus target, so screen readers still hear a single switch per row.
  - _Found:_ product owner.
  - _Test:_ the v5 self-test, "row click:" checks.
- **CAT-06. Bordered accordion group, matching the shipped Inth dialog.**
  - Categories sit in one bordered box (`1px --inth-border-strong`, 12px radius) with row dividers.
  - Vendors sit in a nested bordered box.
  - The SDK's `accordion.module.css` instead draws each category as a separate card with a 0.75rem gap (see DEF-05).
  - _Found:_ product owner.
- **CAT-07. The vendor "Privacy policy" link's accessible name includes the vendor**, for example "Intercom privacy policy".
- **CAT-08. The US cookie view hides the Marketing category** (see LAW-05). EU shows it.

## EU: the staged EU/UK model

- **EU-01. Footer buttons:** "Reject all" and "Accept all" use the same stroke style and weight; "Save choices" is primary and disabled until something has changed.
  - _Why:_ EDPB cookie banner taskforce, on equal prominence.
- **EU-02. Closing with × or Esc, or without Save, Accept or Reject, discards the draft.** On reopen, the last committed state shows. Before this, unsaved toggles reappeared with Save enabled, which misstated the consent in force.
  - _Found:_ round 1, all three reviewers.
- **EU-03. The dirty check compares _effective_ state**: a vendor only counts when its category is on. Toggling on and then off after "Reject all" must not enable Save.
  - _Found:_ round 2, Gemini.
- **EU-04. `euSaved` is initialised on reset**, not lazily from the controls.
- **EU-05. A nested EU vendor sheet says "Changes apply when you save in Privacy settings."** Its own "Done" button does not commit; the real Save sits in the parent. Never use "Turn off a vendor to stop it" in EU, because it implies an immediate effect.
  - _Found:_ rounds 2 and 3, GPT, Opus and Gemini.

## BNR: the banner and its link to the dialog

- **BNR-01. The banner follows the SDK policy preset for the visitor's region** (`packages/sdk/schema/src/shared/policy/policy-rule-presets.ts`):

  | Region | Preset | First layer |
  | --- | --- | --- |
  | EU / UK / Gibraltar (also the geo fallback) | `europe_opt_in` | **choice**: "We value your privacy"; Reject All, Accept All, Customize |
  | US privacy states and California, opt-in | `us_privacy_states_opt_in`, `california_opt_in` | **US consent request**, not the GDPR banner (see BNR-09) |
  | US privacy states and California, opt-out (the US entry in `recommendedPolicyRules`) | `us_privacy_states_opt_out`, `california_opt_out` | **none**: nothing on first visit; the dialog is reachable only through "Your Privacy Choices". An _optional_ notice ("Privacy notice", OK, "Do not sell or share my data") is allowed, and dismissing it records no consent. |
  | EU with IAB TCF | `europe_iab` | a separate IAB banner (`iab-prompt`). **Not built in the prototype.** |
  - _Test:_ in each region the first visit shows exactly that layer; in US opt-out, the footer link opens the dialog.

- **BNR-02. The banner and the dialog are never visible at the same time** (the SDK's single `activeUI`).
  - _Test:_ at no point is `!banner.hidden && dialog.open` true.
- **BNR-03. The banner is non-modal.** The page behind it stays interactive and is not `inert`. Esc does **not** dismiss it, because dismissing isn't consent. It doesn't steal focus when it first appears.
- **BNR-04. _Superseded in v6:_ "Customize" and "Do not sell or share my data" no longer open the dialog.** They expand the options in place: Card, Banner, and the top and bottom Drawer. Side drawers on desktop are all-in-one, so they have no Customize. The full dialog opens only from the persistent "Your Privacy Choices" link, and focus returns there when it closes. See BNR-16.
- **BNR-05. Closing the dialog without deciding brings the banner back, and focus moves to it.** Deciding means:
  - EU: Save, Accept all or Reject all;
  - US opt-in: any recorded rights choice, or Accept/Reject on the banner;
  - US notice: "OK", or opening the dialog from the notice (which acknowledges it).

  Once decided, closing the dialog never brings the banner back.

- **BNR-06. Accept or Reject on the banner:** apply the choice, hide the banner, move focus to the "Your Privacy Choices" link (otherwise it drops to `<body>`), and announce the outcome through a page-level status region, for example "Optional cookies rejected. You can change this in Your Privacy Choices."
- **BNR-07. Banner layout follows the SDK prompt.** (_v6:_ this is the Card, BNR-17; the tag is "Consent by", BNR-11.)
  - The Card, at the bottom left, 440px wide, with the "Consent by" tag 8px above it.
  - Footer on desktop: `[Reject All][Accept All] … [Customize]`.
  - On phone: Reject and Accept take equal widths in a row, with Customize full width below; all 44px tall.
  - A non-blocking banner may cover page content, including the site's own "Your Privacy Choices" link, depending on where the site puts it (council permutation round 1 raised the bottom-right Card case; accepted, not a bug). The banner itself carries the same choices, and the link is always reachable once the banner is answered.
- **BNR-08. Legal links are inline at the end of the banner description**, and only when they are configured.
- **BNR-09. The US opt-in banner asks for the specific permission in US terms.**
  - Title: "Your privacy choices".
  - Text: "With your permission, Acme would use optional cookies for site features and analytics, and {sell or share … per the rights bundle}. Nothing is turned on unless you allow it."
  - Buttons: "Don't allow" and "Allow" as equal-weight stroke buttons, plus "Choose what to allow", which opens the dialog.
  - Don't reuse the GDPR wording ("We value your privacy", "Reject All", "Accept All") for US opt-in.
  - Allow grants sale/sharing and the optional cookies; sensitive information still needs its own consent (LAW-09).
  - _Found:_ product owner.
- **BNR-10. First-layer behaviour by model:** opt-out preset shows nothing; opt-in shows a consent request (EU: cookie choice; US: sale/sharing consent). Never show a choice banner under the opt-out preset.
  - _Found:_ product owner.

- **BNR-11. Attribution tag: "Consent by [INTH mark]" on a quiet, neutral tab.**
  - Background is the card surface, with a hairline border on three sides that joins the card. Text is muted; the mark uses the text colour; links to `https://inth.com`.
  - The tag has a 44px hit area, a neutral focus ring, and hover effects only on mouse devices.
  - **Hover and keyboard focus** highlight it: primary text, logo and 1px border on an **opaque** primary tint (`--inth-primary-tint` = primary mixed into the surface: 10% on white, 18% on the dark surface). Never use the translucent `--inth-primary-soft` here: over the modal backdrop or page content it went see-through (product owner), the same hover language as the "Customize" stroke button. Use a tint, not solid primary; a solid fill would out-shout the banner's own actions. Press scales it to 0.97.
  - **Floating tag (the only tag style; the attached tab was removed):** detached **8px** above the card (12px felt too far; product owner), or 8px below it on a top drawer or top banner. Its right edge is flush with the card's right edge (on full-width drawers and banners, flush with the content column), with a hairline border and a near-flat shadow. It is a **rounded rectangle (8px radius), not a full pill**: fully rounded looked too soft (product owner). The side-drawer tag uses the same 8px radius.
  - **Logo:** the square INTH monogram, from c15t/c15t (`packages/react/src/components/shared/ui/logo.tsx`, `InthMark`); it is identical to `@inth/sdk-ui` `BRAND_MARKS.inth`. It is 15px tall (13px on phone) and decorative; the link's name comes from a `sr-only` "Inth".
    - _Rejected:_ the horizontal inth.com wordmark (`#sprite-icon-inth-wordmark`). Even at 11px its solid "TH" block overpowered the "Consent by" text (product owner).
  - _Decided by:_ product owner, from `proto-branding`, option 3.

- **BNR-17 (v6). Naming: "Compact" is renamed "Card".** Card pairs with Drawer: a floating, detached card versus a sheet attached to an edge. "Compact" named a size, and stopped being true once it expanded. In the SDK this is `presentation: 'card'` with `position: 'bottom-left' | 'bottom-right' | 'center'`.
- **BNR-18 (v6). "Banner": a slim, one-line bar on the Top or Bottom edge** (content capped at 960px). It follows **Edge style** like the drawers: **Inset** (default) is a rounded bar 12px from the edges; **Flush** is a square, edge-to-edge bar. The explorer control is renamed "Drawer style" → "Edge style" and is shown for both Banner and Drawer.
  - **Collapsed:** a single 53px row with one short sentence, one policy link (Privacy Policy, so it fits on one line), and the actions on the right. Copy by region:
    - EU: "We use cookies to improve your experience and analyze traffic." — Reject All · Accept All · Customize.
    - US opt-in: "Acme asks before using optional cookies or {selling or sharing your data for ads, from the rights bundle}." — Don't allow · Allow · Choose.
    - US notice: the short notice — "Do not sell or share my data" · OK.
  - **Customize/Choose expands the bar in place:** full title, description, both policy links, every option, and Reject/Accept/Save, exactly like the top or bottom drawer expanded. Esc folds it back to the slim row with focus on Customize.
  - **Narrow layout:** the row stacks into text and full-width buttons when the bar itself is under 720px wide (a container query, so it works in narrow desktop windows too, not just on phone).
  - The "Consent by" tag sits above a bottom bar and below a top bar, on the right.
  - Blocking (BNR-13) and the region rules apply unchanged.
  - _Test:_ "banner:" checks.
- **BNR-16 (v6). Three presentations: Card, Banner, Drawer.** This supersedes the presentation list in BNR-12, BNR-14 and BNR-15.
  - **Card (default):** the floating card. Customize expands every option in place (BNR-15). **Position:** Bottom left (default), Bottom right, or Centre. Bottom right mirrors bottom left; the tag stays flush with the card's right edge. Bottom right puts a full-width root behind the card and aligns the card right; anchoring the root with `right: 0` alone let it overflow the left edge at narrow widths, leaving uneven margins (10px left, 24px right). _Test:_ "card bottom right" (24px from the right edge, at least 22px on the left).
    - **Centre always blocks** (BNR-13 is forced on; the setting shows On and locks Off). A centred card that doesn't block looks like an accident.
    - **US opt-out can't be centred** because it never blocks: Centre falls back to bottom left. This also settles the earlier "US opt-out + modal with no backdrop" question.
  - **Drawer:** one presentation with a **location** setting: Left, Top, Bottom or Right (default Bottom).
    - **Top** mirrors Bottom. It's a full-width sheet sliding down from the top, with the content column capped at 960px. Flush is square on every corner (VIS-07); Inset rounds all corners and sits 12px from the top and sides.
    - The "Consent by" tag hangs 8px **below** the card on the right, because there's no room above it.
    - Customize expands the drawer _downward_ in place. On phone, Top stays Top; only Left and Right fall back to Bottom.
    - _Test:_ "top drawer:" checks. There are **two logic sets, with no option between them:**
    - **Side set (left/right, desktop): all-in-one** (BNR-14). Every option is in the drawer.
    - **Top/bottom set (top and bottom drawers, and every drawer on phone): summary first, then Customize expands the drawer in place**, the same flow as Card (BNR-15).
      - No centred dialog opens: the drawer grows upward and the options sit in its scroll area. On desktop that area is up to 400px, in the 960px content column; on phone it's up to 300px, so the "Consent by" tag stays clear of the top edge.
      - The footer becomes Reject/Accept plus Save choices.
      - Esc folds it back.
      - _Changed:_ the first version opened the desktop dialog or phone sheets on top (product owner: "act more like card").
      - The full dialog is still reachable from "Your Privacy Choices".
    - _Regression found:_ v6 first made bottom and phone drawers all-in-one too, which dropped the two-sheet flow (product owner).
  - **Drawer style (Inset/Flush) and blocking (BNR-13) still apply.**
  - **Removed:** _Modal_ (it was the Card card centred; now Card → Centre, which always blocks); _Floating_ (Card is the same card and does strictly more); separate Left, Bottom and Right presentations (now one Drawer with a location); and the Summary vs All-in-one drawer setting (the location now decides it).
  - _Why:_ fewer variants, each the best default for its job (product owner).
  - _Test:_ the v6 self-test (presentation checks, "drawer is always all-in-one", "no floating / no summary-drawer controls").
- **BNR-12. Banner presentation is display only.** Every presentation renders the _same_ content, actions, copy and decision logic (BNR-01 to BNR-11 apply unchanged).
  - _Superseded in v6:_ the presentation list is now Card, Banner and Drawer (BNR-16). "Floating" became the Card; "Modal" became Card → Centre, which always blocks. The rules on drawer style, phone padding and motion below still apply.
  - **Every presentation is non-blocking unless blocking is on** (BNR-13): the page stays usable, there's no backdrop, and focus isn't taken.
  - **Drawer style:**
    - **Inset is the default** (product owner); Flush is the alternative.
    - **The drawer style also applies to the phone dialog sheets** (main and nested). Inset: 12px from the sides and bottom, all corners 16px. Flush: edge to edge, square corners (radius 0, VIS-07; the earlier top-corners-only flush was superseded). They were always flush before, even with Inset selected (product owner).
    - **Phone:** a drawer's padding must never come from the generic phone banner padding (16px). That rule outranked the drawer's own padding, so the _flush_ bottom drawer floated 16px off the edges with square bottom corners and looked clipped. Phone flush bottom drawer: 0 padding. Phone inset bottom drawer: 0 12px 12px. _Test:_ the v5 self-test, "phone flush/inset bottom drawer".
    - **Flush:** side drawers are square, edge to edge, with a hairline only on the edge facing the page and no rounded corners.
    - **Inset:** the drawer sits 12px from every edge (side drawers, and the bottom drawer's sides and bottom), with all corners at 16px radius and a layered shadow, so it reads as a large modal sliding in. Its enter and exit travel the extra 12px so it fully leaves the screen.
  - **Side drawers:** _Superseded in v6._ They are always all-in-one, 460px wide (484px inset), and the tag floats over the bottom fade (BNR-14). The v5 summary side drawer was 380px wide, with the tag 16px above the divider. In both versions, a grey row under the actions looked detached, and a pill above the title competed with it (product owner).
  - **On phone, side drawers become the bottom drawer.**
  - **Motion:** enter with ease-out from the presentation's own edge (drawers 280ms, centred card 220ms scale 0.96 plus fade, corner card 180ms, banner bar expanding 220ms); exit faster with ease-in (160ms) back to the same edge; the modal's backdrop fades. Reduced motion is near-instant.
  - Changing the presentation re-runs the entrance.
  - _Test:_ the v5 self-test, "pres" checks.

- **BNR-13. "Block the page until a choice" is an option on every presentation** (Card, Banner, Drawer). It is off by default, and **forced on for Card → Centre**.
  - **When it's on and a consent banner is showing:**
    - one overlay darkens the **whole page**, darker than the dialog's own overlay (`--inth-overlay-block`: 62% slate in light mode, 72% black in dark mode) with a 3px blur, so the banner is the only thing to act on. With `prefers-reduced-transparency` there's no blur and the overlay is more opaque instead (78% light, 85% dark);
    - the page is `inert` and its scroll is locked (in the SDK: the document, with scrollbar-gutter compensation);
    - the banner shell (card + tag) becomes `role="dialog"` with `aria-modal="true"` (PERM-08);
    - focus moves into it and is trapped there;
    - **Esc does not dismiss it**, because dismissing isn't consent. It stays until a commit: Reject, Accept, Save choices or OK. (_v6:_ Customize only expands the panel in place; it never releases the page. Esc still closes an open confirmation and folds an expanded panel, PERM-03.)
  - On exit, the backdrop fades out (160ms) together with the banner. A choice releases the page and moves focus to "Your Privacy Choices".
  - **Never under the US opt-out preset.** That covers both the preset's "nothing shown" and the optional notice: no backdrop, no inert, no scroll lock, even if the setting is on. The explorer shows "Never applied under the US opt-out preset". Blocking there would be a consent wall with no consent to collect.
  - _EU note:_ blocking until _a_ choice, with Reject as easy as Accept, is not a "cookie wall"; a wall makes access depend on _accepting_. Keep Reject equal (EU-01) whenever blocking is on.
  - _Found:_ product owner.
  - _Test:_ the v5 self-test, "block on + …" checks.

- **BNR-14. "All-in-one" drawer** (v6: always on for left/right drawers on desktop; never for bottom or phone; see BNR-16). In the left and right drawers, the choices themselves sit under the intro in one scroll area, so the visitor decides without opening the dialog. The drawer is 460px wide (484px inset).
  - **EU:** the cookie category box (inline descriptions, switches, vendor accordions). Footer: Reject all, Accept all (equal weight), and Save choices. Switches are a draft; Save records exactly what is switched on (EU-03). No Customize, because the choices are already there.
  - **US opt-in:** the same rights rows and Preferences as the dialog, with the same rules: granting needs the confirm step (LAW-02, LAW-07) and the nudge (RIGHT-04). Footer: Don't allow, Allow, Save choices. Save records the untouched defaults as explicit refusals.
  - **US opt-out notice:** the rights rows inline (opt-out applies immediately, LAW-04), then OK. The separate "Do not sell or share my data" link is dropped because the control is right there.
  - **Layering:** the choices scroll right down to the footer divider. The bottom scroll fade (64px here) sits over the end of the scroll area, and the "Consent by" tag floats _on top of_ the fade, centred 14px above the divider. The body has 60px of bottom padding so the last row can scroll clear of the tag. Only the tag catches pointer events; the overlay wrapper is `pointer-events: none`.
  - **Never on phone:** side drawers become the bottom drawer, which shows a summary and expands in place (BNR-15 flow).
  - The dialog's controls work unchanged inside the drawer, using the same click handler, focus requests (confirm cancel button, accordions), status announcements and scroll-edge fades (LAY-08).
  - _Found:_ product owner.
  - _Test:_ the v5 self-test, "aio" checks.

- **BNR-15. Expand in place (the Card flow).** Customize expands the options _inside the card_ instead of opening the dialog. _v6:_ the same flow is used by the Banner and by the top and bottom Drawer, including every drawer on phone (BNR-16, BNR-18). The scroll area is up to 400px on desktop and 300px on phone for full-width drawers.
  - **Collapsed:** the summary card (formerly "Floating"). "Customize" (or "Do not sell or share my data" on the US notice) is a disclosure button with `aria-expanded` and `aria-controls="card-panel"`.
  - **Expanded:** a `grid-template-rows` accordion opens between the intro and the footer, and the card grows upward from its bottom-left anchor. The options stack in one scroll area (max 360px, or 320px on phone) with the edge fades (LAY-08):
    - EU: cookie categories and vendors;
    - US opt-in: rights rows plus Preferences, with the confirm step and nudge;
    - US opt-out notice: the rights rows, which apply immediately.
  - **Expanded footer:** Reject all · Accept all (equal weight) plus Save choices (US opt-in: Don't allow · Allow; US notice: OK).
  - **On expand,** focus moves to the first control in the panel and "More options shown." is announced. **Esc folds the panel back** and returns focus to Customize; it never dismisses the banner.
  - Works with "Block the page until a choice", and on phone.
  - _Found:_ product owner.
  - _Test:_ the v5 self-test, "card:" checks.

### Decision record: attribution tag (decided from proto-branding)

- **Chosen:** "Consent by" with the INTH mark, on a quiet neutral tab.
- **Rejected:**
  - "Secured by" (today's SDK) and "Protected by": both make an assurance claim to the visitor that Inth doesn't make good on (the site, not Inth, is responsible for protecting the data). That is an FTC deception risk for a compliance vendor, and a trust badge next to "Accept All" works as a nudge.
  - The brand-blue tab: it was the loudest element next to Reject and Accept on every first visit.
  - "Choices recorded by": it's only true _after_ a choice, and it's long once localised. Its idea fits the receipt instead (optional: "Recorded by Inth" in the receipt line).
  - Mark only: touch users never see the label.
- **Cost accepted:** less brand reach than the blue tab.

## LAY: layout and fit

- **LAY-01. US opt-out is one column, 520px wide (EU is 560px).** The card's max height is `min(640px, 100%)`. The header and footer stay fixed and the **body is the only scroller**. The original two-pane layout had an inner scroller inside a scrolling dialog.
  - _Test:_ at 1064×700 the default state is 518×519 with no scroll, and the recorded, GPC and opt-in states all fit.
- **LAY-02. No duplicate disclosure.** The old "Preferences" row in the left column, shown while the right pane was open, is removed.
- **LAY-03. No header status text** ("Opted out", "Limited") repeating the selected control.
- **LAY-04. The intro is a single short line: "Your choices apply right away."** The GPC note replaces the description rather than adding to it, which saved about 45px.
- **LAY-05. Never use `Element.scrollIntoView` inside the dialog.** It also scrolls the `overflow: hidden` card and pushes the header out of view.
  - Scroll only `.card-body` with `scrollBy`.
  - After an accordion opens, bring as much of its panel into view as fits **without scrolling its trigger out**.
  - _Found:_ product owner's screenshot, where the header disappeared.
- **LAY-08. Every scroll area fades at its edges.** The fade at the top is 20px and the one at the bottom is 28px, and each shows **only when there is more content in that direction**: no top fade at the top, no bottom fade at the end, and none at all when everything fits.
  - Use a `mask-image` gradient, not a coloured overlay, so it works on any surface in light and dark mode without colour matching.
  - The fade lengths animate over 150ms, using registered custom properties.
  - Update on scroll, on every render, and after accordion height transitions (`transitionend` on `grid-template-rows`). Otherwise expanding a panel leaves a stale fade.
  - _Found:_ product owner.
  - _Test:_ the v5 self-test, "fades:" checks.
- **LAY-06. Phone footer:**
  - the privacy link is **centred** on its own row;
  - an empty link slot takes no space;
  - Done is full width and 44px tall;
  - EU "Save choices" is full width below Reject and Accept;
  - the footer respects the safe area.
  - _Found:_ product owner, and round 1 Gemini.
- **LAY-07. Prototype chrome must never cover the dialog's footer.** The original's variant picker and fit badge overlapped Done and "Learn more".

## NEST: phone sheets and desktop accordions

- **NEST-01. Desktop uses accordions; phone uses nested sheets** (Base UI nested-dialog pattern).
  - Desktop: Preferences and vendor lists expand inside the one dialog. Nested dialogs on desktop "look goofy", in the product owner's words.
  - Phone: Preferences is a sheet over the main dialog.
- **NEST-02. At most two layers.**
  - US phone: main, then the Preferences sheet; vendors are accordions _inside_ that sheet.
  - EU phone: main, then the vendor sheet.
  - Three stacked sheets left 20–25px slivers.
  - _Found:_ rounds 2 and 3, Opus and Gemini.
- **NEST-03. What a parent dialog does while a child is open:**
  - it gets `inert` and `data-nested-open`, moves up 32px, shrinks 5% per level and dims;
  - only the **top** card has `aria-modal="true"`; a closing card drops it;
  - the closing card is `inert` while it animates out (160ms);
  - focus moves to the parent's opener **immediately** when the close starts.
  - _Found:_ rounds 2 and 3, GPT and Gemini.
- **NEST-04. Esc, ×, "Done", or a tap on the dimmed parent closes only the top layer**, and focus returns to the row that opened it.
- **NEST-05. A tap on the dimmed parent must not also click the control underneath.** On touch, `pointerdown` pops the sheet and removes the parent's `inert`, so the tap's `click` landed on the parent's × (closing the whole dialog and discarding EU edits) or on a switch.
  - The prototype ignores clicks for 450ms after a backdrop `pointerdown`.
  - _Found:_ round 3, Opus, reproduced with `hasTouch`. This was a blocker.
- **NEST-06. Changing the viewport, or any reset, cancels pending close timers** (`popTimer`) and drops any open sheets. Without this, a delayed pop could remove a newly opened layer.
- **NEST-07. A vendor sheet must never be a dead end.** If its category is off, mirror the category switch at the top of the sheet (with unique IDs, see SR-05).
  - _Found:_ round 2, Opus.
- **NEST-08. Each child footer says what "Done" means:** "Saved automatically" in the US, "Save your choices in Privacy settings" in EU.

## FOC: focus and keyboard

- **FOC-01. Focus trap.** It covers the top card only, using the selector `button, a[href], input, [tabindex]:not([tabindex="-1"])`, skipping `disabled` and inert elements.
  - When focus sits on a non-tabbable node inside the card (a heading with `tabindex=-1`), Tab and Shift+Tab move to the next or previous tabbable element in document order.
  - Before this, Shift+Tab from the focused title escaped to the page.
  - _Found:_ rounds 1 to 3, all three reviewers.
- **FOC-02. While the dialog is open, the page behind it is `inert`.** `aria-modal` alone isn't enough.
- **FOC-03. On open, focus the dialog title (`tabindex=-1`).** On close, return focus to the opener, or to the banner card if the banner comes back.
- **FOC-04. Esc order:** close the top nested layer first, then an open confirmation, then the dialog.
- **FOC-05. Clicking a segmented option keeps focus on it**, because the same node survives the re-render. Don't force focus on mouse clicks: programmatic focus after a click showed a focus ring.
- **FOC-06. When "Saved" appears or disappears, Done must keep its DOM identity.** The cue was inserted before Done, so the positional diff replaced Done and focus dropped to `<body>`. Use a stable slot (`display: contents`) with a fixed key.
  - _Found:_ round 2, GPT, Opus and Gemini.

## SR: screen readers and announcements

- **SR-01. Each dialog card has its own `role="status"` region.** VoiceOver ignores live regions outside an `aria-modal` subtree.
  - _Found:_ round 2, Opus.
- **SR-02. Announcements render only in the layer that made them, and never in a closing layer.** Clear them when a layer opens, a layer closes, or the dialog reopens. Otherwise closing a sheet re-announced the last message from the parent, and reopening mounted a stale message.
  - _Found:_ rounds 3 and 4, Opus and Gemini.
- **SR-03. A repeated identical message must still be announced.** Toggle a trailing zero-width character.
- **SR-04. The group label carries the statutory phrase, built from the rights bundle:** "Do Not Sell or Share My Personal Information"; "Opt out of the sale of my personal data and targeted advertising" for the sale+ads bundle; "Allow {rights}" in opt-in; "Limit the Use of My Sensitive Personal Information".
  - _Found:_ rounds 1, 3 and 4, GPT and Gemini: the opt-in label said "sharing" for the sale+ads bundle.
- **SR-05. No duplicate IDs across stacked layers.** A sheet that re-renders a category uses an ID prefix (`sheet-cn-…`), so `aria-labelledby` doesn't resolve to the inert parent.
  - _Found:_ round 3, Opus and Gemini.
- **SR-06. Switches use `role="switch"` with `aria-labelledby` pointing to the name and `aria-describedby` pointing to the inline description.**
- **SR-07. Done's visible text never changes.** The phone save cue is a check that slides in before "Done". Swapping the label to "Saved" broke voice control, WCAG 2.5.3.
  - _Found:_ round 3, GPT.

## VIS: contrast and visual states

- **VIS-01. Dark-mode primary button:** `#2f66df` with white text (5.1:1). The old `#4f83f1` was 3.6:1.
  - _Found:_ rounds 1 and 2.
- **VIS-02. Blue text on surfaces in dark mode uses `--inth-primary-text: #8ab4ff`** (8.7:1). The primary blue is only 3.5:1 on the dark card. This affects the banner's Customize stroke button and its links.
  - _Found:_ when the banner was added.
- **VIS-03. Switch off-tracks need 3:1 against the surface:** `#8492a6` in light mode (3.2:1), `#64748b` in dark mode (3.8:1). `#cbd5e1` was 1.5:1.
  - _Found:_ round 2, GPT, WCAG 1.4.11.
- **VIS-04. The dark scrollbar thumb is themed.**
- **VIS-06. Theme switches flip every surface in the same frame.** Disable all transitions while the theme changes (`html[data-theme-switching] * { transition: none !important }`, removed two frames later). Before this, the tag, buttons and switches animated their colours (120–150ms) while the card and page flipped instantly, so the switch visibly drifted.
  - _Found:_ product owner.
  - _Test:_ during the switch the attribute is set and computed `transition-duration` is `0s`.
- **VIS-07. One corner-radius scale everywhere.** Tokens: `--inth-radius-lg` 16, `--inth-radius-container` 12, `--inth-radius-md` 10, `--inth-radius-nested` 8.
  - **16, surfaces:** the dialog, the Card (every position), inset drawers and inset phone sheets.
  - **0, anything Flush:** flush drawers (left, top, bottom, right), flush phone sheets and the Banner bar are square on every corner. Flush means attached to the edge; Inset is the rounded, floating style. Half-rounded flush panels looked like neither (product owner).
  - **12, large containers inside a surface:** the cookie category box, the "Preferences" row, the opt-back-in confirmation box, receipt Details and the GPC note.
  - **10, controls:** buttons and the segmented track. The track's thumb is 7 (10 minus its 3px inset).
  - **8, containers nested inside containers, plus the "Consent by" tag:** the vendor box sits inside the category box.
  - **Fully rounded:** switches.
  - **Never** give a container the same radius as the control inside it. Neighbours that line up, such as the "Preferences" row and the category box below it, share a radius.
  - _Found:_ product owner's alignment check. The banner card was 12 while every other surface was 16; the "Preferences" row was 10 above a 12 box; and the confirmation box was 10 around 10px buttons.
  - _Alignment verified:_ the title's left edge equals the buttons' left edge in every presentation; the tag's right edge is flush with the card (Card, any position) or the content column (full-width drawer or banner); the side-drawer tag is centred.
- **VIS-08. Surfaces over the blocking overlay drop their light border.** The light-grey 1px border on the banner card and the "Consent by" tag read as a pale halo against the dark scrim, and soft light-mode shadows disappear on it.
  - While blocking (`data-blocking`), set the border to transparent and use a faint **dark** ring, `0 0 0 1px rgba(15,23,42,.10)`, so the white surface runs edge to edge.
  - Add a deeper layered shadow that stays visible on the scrim: 2/6px, then 16/40px at 35%, then 40/80px at 35%.
  - In dark mode, use a faint **light** ring (`rgba(255,255,255,.10)`) instead, with darker shadows.
  - _Found:_ product owner.
  - _Test:_ "blocking: card border swapped for dark ring".
- **VIS-05. Nested parent dim:** `rgba(15,23,42,.1)` in light mode and `rgba(0,0,0,.4)` in dark mode, so the stack reads clearly.

## MOT: motion

- **MOT-01. All animations run on nodes that persist.** See ARCH-01.
- **MOT-02. Timings:**
  - segmented thumb 200ms `cubic-bezier(.23,1,.32,1)`; check stroke-draw 260ms;
  - disclosures use `grid-template-rows: 0fr → 1fr` over 200ms, with content opacity delayed 60ms;
  - nested child in 260ms, out 160ms;
  - shake 360ms;
  - banner in 180ms.
- **MOT-03. Reduced motion:** everything is effectively instant. No shake. The check renders fully drawn. The "Saved" cue shows without fading, and a JS timer (1.7s) removes it rather than the animation. Before this, a 1ms animation ending at `opacity: 0` made "Saved" invisible.
  - _Found:_ round 1, Opus and Gemini.
- **MOT-04. The "Saved" cue is absolutely positioned**, so it never shifts Done (desktop). On phone the check slides into Done instead.

## COPY: wording

- **COPY-01. All sale-row wording is generated from the configured rights bundle**: description, GPC note, confirmation title and body, announcements and labels. Nothing hard-codes "selling and sharing".
  - _Found:_ rounds 2 and 3, GPT, Opus and Gemini.
- **COPY-02. "Off by default" or "Limited by default" appears only when the state is an untouched default** (`src === 'default'`). An explicit "Don't allow" uses plain text.
  - _Found:_ round 4, GPT and Gemini.
- **COPY-03. EU wording never implies changes take effect immediately** (see EU-05).
- **COPY-04. Sensitive-information wording** depends on the regime and state: opt-out allowed, opt-out limited, opt-in default, opt-in recorded.
- **COPY-05. The cookie-category row is called "Preferences"**, not "Cookie settings" or "Cookie preferences". Its sheet title is "Preferences" and its close label is "Close preferences".
  - _Found:_ product owner.

## CLIP: copying the reference

- **CLIP-01. Announce "copied" only after `navigator.clipboard.writeText` resolves.** If it rejects, or the API doesn't exist, show a **visible** failure ("Couldn't copy. Select and copy your reference:") with a labelled, read-only `<input>` holding the full reference. The field takes focus and selects its text, and is reachable with Tab (it's included in the focus trap).
  - _Found:_ rounds 3, 4 and 5, GPT.
- **CLIP-02. Every copy attempt gets a token.** Results from an earlier attempt, or arriving after the dialog closed or the scenario reset, are ignored.
  - _Found:_ rounds 5 and 6, GPT, reproduced with delayed rejections.
- **CLIP-03. If Details has collapsed by the time copying fails,** keep the fallback (`copyFailed`) for when Details reopens, but don't move focus to the hidden field or announce anything.
  - _Found:_ round 6, GPT.
- **CLIP-04. Closing the dialog resets the copied and failed state.**
  - _Found:_ round 4, Opus and Gemini.

## ARCH: rendering architecture

- **ARCH-01. Never re-render the dialog with `innerHTML` on each interaction.** The original prototype did, which destroyed focus after every click and made transitions impossible. Use component state, or a keyed diff (React keys; the prototype uses a small keyed morph).
  - Changing an element's key must recreate it (for enter animations); otherwise the node persists.
- **ARCH-02. Timers (`cue`, `pop`, `copy`) are cleared on close and on reset.**
- **ARCH-04. Status and telemetry must refresh on every state change, including when the dialog is closed.** The prototype's fit read-out stayed on "no banner" while the US opt-in banner was showing, because measuring only ran while the dialog was open. Any SDK debug overlay or devtools panel must not show stale state.
  - _Found:_ product owner.
- **ARCH-03. The trigger link for the dialog is persistent page UI.** It is the return target for focus whenever neither the banner nor the dialog is open.

## PERM: permutations (options that broke only in combination)

These came from the exhaustive permutation sweep (`privacy-choices-tests/perm.inc.html`, `perm2.inc.html`) and council permutation round 1 (Claude Opus 5.5 7/10, GPT 6.2 Sol 6/10, Gemini 4 Neon 6.5/10). Every one was invisible when each option was tested alone.

- **PERM-01. Nested sheets exist only inside the open dialog.** Banner panels (expanded Card, Banner, Drawer, and the all-in-one side drawer) always use accordions, **phone included**.
  - _Bug:_ on phone, "Preferences" and "View N vendors" inside an expanded banner were sheet triggers. A tap pushed a layer onto the hidden dialog's stack, so nothing appeared, and the stale layer reappeared the next time the dialog opened.
  - _Fix:_ `nestedMode = phone && dialogOpen`.
  - _Found:_ all three reviewers, and the author's probe.
  - _Test:_ "[R1] phone banner panel".
- **PERM-02. A banner commit never overrides a live GPC signal or a recorded opt-out.**
  - Allow or Accept on the US opt-in banner sets sale/sharing **only while it is an untouched default**.
  - "Don't allow" or Reject **always** applies, in one action, even after the visitor granted sale through the confirm step. The only exception is a live GPC lock, which is already opted out.
    - _Round 2 regression:_ the first fix skipped refusals whenever a user choice already existed (GPT).
  - A refusal also **revokes a sensitive-data grant** made in the panel. An untouched sensitive default stays untouched (LAW-09).
    - _Found:_ Opus, round 3.
  - **The receipt time moves only when a right actually changes** (RCPT-02). Save with rights already recorded, or Reject on an already-recorded opt-out, keeps the old date. A change of provenance counts as a change: Reject on an opt-out that came from an earlier GPC signal makes the visitor the source and moves the date (Opus, round 4).
    - _Found:_ GPT, round 3.
  - A live GPC signal keeps sale locked (GPC-03). The announcement says it "stays off because of your Global Privacy Control signal".
  - A recorded opt-out keeps the two-step path in Your Privacy Choices (LAW-02).
  - An explicit "Don't allow" clears GPC provenance (GPC-07).
  - _Bug:_ footer Allow in the all-in-one drawer, or in an expanded panel, switched sale to allowed under GPC.
  - _Found:_ all three.
  - _Test:_ "[R1] banner Allow never overrides".
- **PERM-03. Esc order inside banners:** close the open confirmation, then fold an expanded panel. This holds **while blocking** too: folding is not dismissing.
  - _Bugs:_
    - the blocking key handler swallowed every Esc;
    - in the all-in-one drawer, Esc never closed a confirmation;
    - after a commit, a stray Esc on the page was still swallowed and left a pending focus that a later banner render stole (BNR-03).
  - _Fix:_ Esc acts only while a banner is actually showing. Every commit clears the confirm, the expanded state and pending focus (`endBanner()`).
  - _Test:_ "expanded Esc", "[R1] aio".
- **PERM-04. Dialog controls work the same inside banner panels** (BNR-14): confirm reveal, nudge shake, accordion reveal-scroll, and copy-reference with its CLIP-01 fallback.
  - _Bug:_ the helpers looked only inside the dialog's stage, and copy bailed out whenever the dialog was closed.
  - _Fix:_ query the active surface (`activeRoot()`).
  - _Test:_ "[R1] copy in banner".
- **PERM-05. Handing off from banner to dialog is instant.** When the dialog opens, the banner and its scrim leave at once: no 170ms exit animation and no overlap, so IDs never repeat (BNR-02, SR-05).
  - This applies **even when the exit has already started**. For example, Accept followed by a fast Enter on "Your Privacy Choices", which already has focus.
    - _Round 2 regression:_ found by all three reviewers.
  - A banner that is leaving for any other reason is `inert`.
  - The dialog layer stacks above the banner layer.
  - Closing the dialog clears its live message, so the returning banner doesn't re-announce it (SR-02).
  - _Test:_ "[R1] dialog open: banner + scrim gone at once".
- **PERM-06. The centred card centres the _card_, not the card plus its tag.** The tag hangs 8px above it, out of flow.
  - _Bug:_ the card sat 34px low.
  - _Test:_ "centred".
- **PERM-07. VIS-08 must win over the edge-style rules.** The inset and flush rules set their own border and shadow with more attribute selectors, so the blocking ring silently lost on every inset Banner or Drawer.
  - The SDK should make the blocking surface treatment a final layer, not rely on source order.
  - It must also keep the tag's hover and focus border.
  - _Test:_ "VIS-08 border transparent", "dark VIS-08".
- **PERM-08. The blocking modal boundary is the whole banner shell (card + tag), not the card.** On Card, Banner, and the top or bottom Drawer, the "Consent by" tag sits outside the card.
  - `role="dialog" aria-modal="true" aria-labelledby` goes on the shell. The card then drops its `region` role.
  - The trap covers the shell. Tab from the focused card (not itself tabbable) moves in DOM order, into the card's first control.
  - _Round 2 regression (Opus, Gemini):_ the first fix trapped focus over the shell while `aria-modal` stayed on the card, so the first Tab landed outside the modal.
  - The trap skips hidden, inert and disabled controls; collapsed panels are inert.
  - _Test:_ "trap wraps".
- **PERM-09. The collapsed slim bar has no `aria-controls`.** The panel doesn't exist until the bar expands into it. Every `aria-controls` in the banner must resolve.
- **PERM-10. The stacked slim bar keeps the content-column inset**, so the tag's right edge stays aligned with the buttons in narrow desktop windows (720px and under).
  - Phone uses 16px everywhere.
  - Side drawers have `max-width: 100%`.
  - _Test:_ run `perm.html` at 700px.
- **PERM-11. A lone OK (expanded notice) sits at the end of the footer**, where OK and Customize sat while collapsed.
- **PERM-12. The slim notice bar acknowledges an honoured GPC signal** (GPC-08): "We use cookies to run this site and measure traffic. Your Global Privacy Control signal is honored."
- **PERM-13. Viewport changes don't carry a stale expanded state into the all-in-one drawer.** The explorer clears the banner on every scenario reset.
- **PERM-14. Reduced motion covers banner transitions** (panel `grid-template-rows`, fades), not only animations (MOT-03).
- **PERM-15. Esc acts on a non-blocking banner only when focus is inside it.** Esc pressed elsewhere on the page must not fold the panel, close a confirmation, or pull focus into the banner (BNR-03).
  - _Found:_ Opus, round 2.
- **PERM-16. Switching surface drops the old surface's transient state.** Opening the dialog, closing it, or committing the banner clears:
  - an open confirmation and the nudge;
  - copy attempts (the token is bumped, so a late clipboard result is ignored) and copy feedback;
  - the receipt disclosure, the "Saved" cue and the live message.

  A confirmation left open in the dialog must not reappear in the returning banner. Neither must an open receipt Details.

  Delayed reveals (confirm scroll, accordion scroll) carry a surface token. A timer scheduled in the dialog must not scroll the banner that replaced it (GPT, round 3).
  - _Found:_ all three reviewers, round 2.
  - _Test:_ "[R2]" checks in `perm2.html`.

- **Rejected in this round:**
  - Keeping drafts across presentation changes (GPT): presentation is configuration, not runtime state; only the explorer switches it live.
  - Keeping the page link clear of the bottom-right Card (GPT): see BNR-07.

## DEF: deferred, rejected and prototype-only items

- **DEF-01 (rejected, round 7, GPT): placeholder policy links that go nowhere.** In the SDK these links come from configuration. Render them only when a URL is configured, and they must navigate.
- **DEF-02 (decision): protective default.** Stock behaviour keeps "Allowed" in the opt-out regime (LAW-06). Revisit if the product wants protective defaults; that will reduce the allow rate.
- **DEF-03 (decision): GPC override.** The stock behaviour is locked. Any "consent past GPC" flow needs legal sign-off and should sit behind an explicit prop, for example `allowGpcOverride: false`.
- **DEF-04 (SDK port): ship the official CCPA opt-out icon asset.** The prototype draws an approximation.
- **DEF-05 (SDK port): accordion grouping.** To match the shipped look (one bordered group), set `--accordion-stack-gap: 0` and add an outer bordered wrapper, or change the default.
- **DEF-06 (decision): US opt-out first layer.** The prototype follows the SDK preset (`prompt: 'none'`, no banner). The optional notice is a control in the explorer.
- **DEF-09 (conflict to resolve): what GPC denies.** The SDK's US presets map GPC to `denyCategories: ['marketing', 'measurement']`, and the SDK's own review note says not all measurement is sale or sharing. The council and the prototype (GPC-01) apply GPC to sale, sharing and ad cookies only, and leave analytics on. Pick one before shipping. The council's recommendation is to keep the denied categories configurable and to drop `measurement` from the default unless the measurement vendors actually sell or share data.
- **DEF-10 (not built): the IAB TCF banner** for `europe_iab`.
- **DEF-07 (verify): hand testing with VoiceOver and NVDA.** Every check so far was scripted in headless Chromium.
- **DEF-08 (verify): browser-only enforcement.** Disney, Lyft, Jam City: make sure an opt-out also reaches native apps and signed-in accounts where the integration supports it.

---

### Council scores (for the record)

| Delegate | R1 | R2 | R3 | R4 | R5 | R6 | R7 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Claude Opus 5.5 | 7.5 | 8 | 8.5 | **9 ✓** | not run (signed off) | not run (signed off) | not run (signed off) |
| GPT 6.2 Sol | 7 | 7.5 | 8 | 8.5 | 8.8 | 8.9 | 8.5 (placeholder links only, DEF-01) |
| Gemini 4 Neon | 7.5 | 8 | 8.5 | **9 ✓** | not run (signed off) | not run (signed off) | not run (signed off) |

### Council scores: permutation audit (PERM)

| Delegate | R1 | R2 | R3 | R4 | R5 |
| --- | --- | --- | --- | --- | --- |
| Claude Opus 5.5 | 7 | 8 | 8.5 | 8.5 | **9 ✓** |
| GPT 6.2 Sol | 6 | 7.5 | 8.5 | **9 ✓** | not run (signed off) |
| Gemini 4 Neon | 6.5 | 8 | **9 ✓** | not run (signed off) | not run (signed off) |
