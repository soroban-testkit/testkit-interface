# Accessibility review

This review covers keyboard-only use, screen reader structure, 200% zoom,
link cues, heading hierarchy, command summaries, and high contrast mode
(Stellar Wave issues #104, #105, #106, #107, #108, #109, #110, #111). It records what was verified
automatically, what was fixed, and what still needs a manual pass.

## What is verified automatically

| Area | Check | Where |
| --- | --- | --- |
| Keyboard | Skip link is first in tab order and moves focus to the page content | `tests/visual/accessibility.spec.ts` |
| Keyboard | Every focusable control shows an outline on keyboard focus | `tests/visual/accessibility.spec.ts` |
| Keyboard | Workflow tabs respond to arrow, Home and End keys | `src/App.test.tsx`, `tests/visual/accessibility.spec.ts` |
| Non-color cues | Links have underline, offset, and cues on hover/active states beyond color (#104) | `src/styles.css`, `src/App.test.tsx` |
| Screen reader | Module cards follow logical heading hierarchy h2 -> h3 -> h4 with labelled regions (#105) | `src/App.test.tsx` |
| Screen reader | Active command and option settings are summarized in an accessible live region (#106) | `src/App.test.tsx` |
| Keyboard | Each command in the limits example is reachable in order with Tab | `tests/visual/accessibility.spec.ts` |
| Screen reader | Landmarks, a single `h1`, and named navigation links | `tests/visual/accessibility.spec.ts` |
| Screen reader | Command selector is a labelled group of toggle buttons | `src/App.test.tsx`, `tests/visual/accessibility.spec.ts` |
| Screen reader | Copy results are announced through a polite live region | `src/App.test.tsx`, `tests/visual/accessibility.spec.ts` |
| Screen reader | Audit prerequisites are a labelled fieldset of checkboxes, each with its own accessible name | `src/App.test.tsx` |
| Screen reader | Every form field carries an `aria-describedby` pointing to visible inline help text (#100) | `src/App.test.tsx` |
| Screen reader | Focus moves to the command section heading after a workflow tab switch (#101) | `src/App.test.tsx` |
| Screen reader | Validation errors are announced via an `aria-live="assertive"` region (#102) | `src/App.test.tsx` |
| Screen reader | "Copied" label remains visible for at least 2 000 ms to give AT time to announce it (#103) | `src/App.test.tsx` |
| High contrast | Controls, buttons, tabs, inputs, and cards retain boundaries in high-contrast/forced-colors modes (#107) | `src/styles.css`, `src/App.test.tsx` |
| Zoom | No horizontal page scroll and no clipped controls at 640px and 320px CSS widths | `tests/visual/accessibility.spec.ts` |
| Responsive | No horizontal overflow or clipped controls in the landscape command form at 541px-900px width and max 600px height (#333) | `tests/visual/landing.spec.ts` |
| Screen reader | Multiline editor has a visible matching label, described help, disclosure state, and an applied-command announcement (#334) | `src/App.test.tsx`, `tests/visual/accessibility.spec.ts` |
| Keyboard | Escape clears the module filter and category chip without blurring the search field (#336) | `src/App.test.tsx`, `tests/visual/accessibility.spec.ts` |
| Touch targets | Preflight checklist expand/collapse controls are at least 44px tall on mobile (#260) | `tests/visual/accessibility.spec.ts` |

These checks read the accessibility tree and computed styles. They do not
replace listening to the page with a real screen reader.

## Manual screen reader pass

Not yet run. Run this before marking the review complete, with at least one
browser and screen reader pair per platform.

1. Start the interface with `npm run dev` and open `http://localhost:5173/`.
2. Pick a pair: NVDA with Firefox or Chrome on Windows, or VoiceOver with Safari
   on macOS.
3. Open the rotor or landmarks list. Expect: *Main navigation*, *Main*, and the
   *Command workflow selector* group inside the workbench.
4. Navigate by headings. Expect one `h1`, then `h2` for each section.
5. Activate the *Copy* button in the workbench. Expect the announcement
   "Command copied to clipboard".
6. Open the *Example Soroban test* region and read it. Expect the region name
   before the code.
7. Record each finding below with the browser, screen reader, and version.

## Findings

| # | Finding | Status | Where |
| --- | --- | --- | --- |
| 1 | The workflow selector was a `tablist`, but its children were `aria-pressed` toggle buttons, so screen readers announced tabs that were not tabs. | Fixed: now a labelled `group`. | `src/App.tsx` |
| 2 | The example terminal had an `aria-label` on a plain `div`, which is ignored, so its code was read with no name. | Fixed: `role="region"`. | `src/App.tsx` |
| 3 | Three buttons were all named "Clear", so the field each one clears was unclear. | Fixed: each names its field. | `src/App.tsx` |
| 4 | Copying a command changed the button label only, which screen readers do not reliably announce. | Fixed: polite live region. | `src/App.tsx` |
| 5 | Module numbers (`01`–`07`) were read as text before every module name. | Fixed: `aria-hidden`. | `src/App.tsx` |
| 6 | The `footer` sits inside `main`, so it is not exposed as a `contentinfo` landmark. | Open. Moving it out of `main` changes the wide-screen layout, so it needs a visual check. | `src/App.tsx` |
| 7 | Collapsed guide toggles set `aria-controls` to panels that are not rendered until opened. | Open. Minor; the attribute points at a missing id while collapsed. | `src/App.tsx` |
| 8 | The limits workflow needed a discoverable, ready-to-run command reference. | Fixed: added a focusable reference section and a build-and-run example with keyboard-focusable command steps. | `src/App.tsx`, `src/styles.css`, `tests/visual/accessibility.spec.ts` |
| 9 | Scrollable `pre` blocks are not keyboard-focusable in every browser, so long lines may be unreachable by keyboard on some browsers. | Open. | `src/styles.css` |
| 10 | The stored visual baselines in `tests/visual/__screenshots__` predate the current layout and do not match a fresh render. | Open. Baselines should be regenerated on the CI platform, not locally. | `tests/visual/` |
| 11 | Form fields had no programmatic help text, so users relying on screen readers could not learn what each field expects without trial and error. | Fixed (#100): every required and optional input, select, and checkbox now carries an `aria-describedby` id pointing to a visible `.field-help` element. | `src/App.tsx` |
| 12 | Switching workflow tabs left focus on the tab button, so screen reader users had to navigate forwards to find where the form changed. | Fixed (#101): after any tab switch, focus moves to the "From intent to command" `h2`, giving AT users an unambiguous entry point. | `src/App.tsx` |
| 13 | Validation failures were silent; a screen reader user copying a command with an empty required field received no feedback. | Fixed (#102): an `aria-live="assertive"` region announces the first unsatisfied constraint, and the error clears when the field is filled. | `src/App.tsx` |
| 14 | The "Copied" label reset after 1 600 ms, which is shorter than the announcement latency of many screen readers and Braille displays. | Fixed (#103): the reset timeout is now 3 000 ms, giving assistive technology enough time to read the change. | `src/App.tsx` |
| 11 | Hover and active link and button states relied solely on color changes (#104). | Fixed: added underlines, offsets, and elevation cues. | `src/styles.css` |
| 12 | Module cards lacked structured heading levels for cards and their workflow groups (#105). | Fixed: established h2 -> h3 -> h4 hierarchy and region grouping. | `src/App.tsx` |
| 13 | Active command parameters lacked a screen-reader accessible summary (#106). | Fixed: added polite live region and focusable summary card. | `src/App.tsx` |
| 14 | Interactive controls and cards lost clear boundaries in high-contrast/forced-colors modes (#107). | Fixed: added forced-colors and prefers-contrast: more styling. | `src/styles.css` |
| 15 | The coverage preflight checklist defaulted to all-unchecked with no warning beside the generated command (#329). | Fixed: an `aria-live="polite"` hint flags the unchecked default and is exposed through `aria-describedby` on the command actions until every item is confirmed. | `src/App.tsx`, `src/styles.css` |
| 16 | Workflow switcher tab order was not verified against visual order at every breakpoint (#330). | Verified: both switchers render in DOM reading order at 1280/900/640/540/320px; component and browser tests cover the order and arrow-key rotation. | `src/App.test.tsx`, `tests/visual/accessibility.spec.ts` |
| 17 | Module list links and filter chips were shorter than 44px in the portrait phone layout (<540px) (#331). | Fixed: module list controls have 44px minimum width and height inside the `<540px` breakpoint using the existing spacing scale. | `src/styles.css`, `tests/visual/accessibility.spec.ts` |
| 18 | Copy actions relied on visible label changes, and a stale clipboard failure could remain after a later success (#332). | Verified and fixed: success is announced in the polite live region, failure in the assertive region, and successful copies clear previous errors. | `src/App.tsx`, `src/App.test.tsx` |

## Command history keyboard audit (#343)

Code-inspection finding (manual screen-reader/screenshot verification pending):
the `.command-history .history-toggle` persists when the expanded
`.command-history-list[role="log"]` closes, but Escape previously did
nothing when focused on a command in the list. Also, activating
`Clear history` removed the focused Clear button together with the entire
`.command-history` section, potentially dropping focus to `<body>`.

Escape now closes the panel and restores focus to the toggle; hiding the
list with the toggle retains focus there. Clearing first moves focus to the
nearby persistent generated-command Copy button before unmounting history.
See `src/App.test.tsx` and `tests/visual/accessibility.spec.ts` for
regression coverage. Manual audit: create a history entry, open with Enter,
focus a history Copy button, press Escape, then reopen and activate Clear.
Confirm a visible focus indicator on the toggle after Escape and on Copy
after clearing. Relevant WCAG 2.1 AA criteria: 2.1.1 and 2.4.3.
| 15 | The coverage and limits preflight toggle buttons (`.guide-card .guide-header .preflight-toggle`) were about 24px tall on mobile, below the project's 44px minimum touch target (#260, WCAG 2.1 AA 2.5.5 advisory size). | Fixed: `min-height: var(--tap-target-min)` with 44px token and padded height at 768px and below. | `src/App.tsx`, `src/styles.css` |

## Coverage report formats (#324)

The Coverage workbench uses native `html`, `lcov`, and `text` radio inputs in a
named `radiogroup`. The group references visible help via `aria-describedby`;
`src/App.test.tsx` verifies one checked choice at a time, and
`tests/visual/accessibility.spec.ts` locks in the browser accessibility tree.

## Placeholder color contrast audit (#327)

**Before:** `.module-filter-input::placeholder` and command-builder
`input::placeholder` relied on browser-default text color and opacity,
which can lower contrast on the dark form surface.

**Fix:** `input::placeholder` and `textarea::placeholder` explicitly use
`--color-placeholder: #a9bbb4` with `opacity: 1`, against the input
background `#ffffff06` on `--color-canvas: #061310`. This exceeds
the WCAG 2.1 AA 1.4.3 minimum contrast ratio of 4.5:1 for normal text.
Selectors: `.module-filter-input::placeholder`,
`.builder input::placeholder`, and advanced-settings inputs.
The browser contrast test examines the computed color and opacity.
A repository screenshot reference for the Coverage workflow exists at
`tests/visual/__screenshots__/commands-coverage.png`; no separate
manual screenshot audit is claimed here.

## Module card disclosure semantics (#337)

The existing "View details" card button navigates to a detail page. Because
it is **navigation**, `aria-expanded` would be misleading on that button.
To expose a meaningful expanded/collapsed state within every module card,
the card now has a separate "Show/Hide [module] module summary" disclosure.
This control sets `aria-expanded`, references an always-mounted panel with
`aria-controls`, and hides/unhides actual testing-concern content. Unit and
browser tests cover both transitions.

## Multiline command editor virtual-cursor audit (#334)

Audited the Audit workflow's advanced editor against this document's stated
goals and WCAG 2.1 AA (1.3.1 Info and Relationships, 3.3.2 Labels or
Instructions, 4.1.2 Name, Role, Value). Reference screenshot for the workflow
tab state: `tests/visual/__screenshots__/commands-audit.png`; the expanded
editor and its accessibility tree are exercised in
`tests/visual/accessibility.spec.ts`.

| # | Selector / screen | Finding | Status |
| --- | --- | --- | --- |
| 1 | `.advanced-command-block textarea[aria-label="Advanced command arguments"]` | The visible "Advanced command editor" label was overridden by a different `aria-label`, so a virtual-cursor user heard a name that did not match the screen; the wrapping `<label>` also contained block-level `<div>` markup. | Fixed: a real `<label for="advanced-command-editor">` now supplies the visible, matching accessible name. |
| 2 | `#advanced-command-editor` | No `aria-describedby`, so multiline syntax guidance was unavailable to screen reader users. | Fixed: visible `#advanced-command-help` text is referenced by `aria-describedby`. |
| 3 | `.advanced-command-block > button.button.secondary` | The disclosure exposed neither `aria-expanded` nor `aria-controls`, so its state was unavailable outside the visual interface. | Fixed: both attributes, with an always-mounted `#advanced-command-panel` so the reference always resolves. |
| 4 | `.advanced-command-block .button.primary` | Applying a command only changed generated output; nothing was announced to a virtual-cursor user. | Fixed: the polite live region announces "Multiline command applied"; invalid input is reported in the assertive validation region. |
## Validation-error announcement audit (#342)

**Audit result:** The required-path validation is announced; it is not relying
on visual styling alone. Clicking the workbench's `Copy` button with an empty
path sets the message in
`p.sr-only[aria-live="assertive"][role="alert"]` in `src/App.tsx`. The
`.sr-only` rule in `src/styles.css` visually clips the message without
removing it from the accessibility tree. The component test in
`src/App.test.tsx` verifies that the assertive live region receives the
required-path message and that the clipboard is not called; a separate test
verifies that filling in the path clears the error.

This covers WCAG 2.1 AA 4.1.3 (Status Messages) for the announcement and
3.3.1 (Error Identification) for the text description. No implementation
change was needed for #342. The automated checks verify DOM semantics, not
spoken output; the manual screen-reader pass above remains outstanding.

**Pre-change visual reference:** [Coverage command-builder screenshot](../tests/visual/__screenshots__/commands-coverage.png).
It shows the idle form, not the invalid interaction. The error is intentionally
screen-reader-only, so a screenshot cannot establish whether a screen reader
announces it; the DOM assertion is the relevant automated evidence.

## Audit and Coverage controls

- Audit strict mode (checkbox with `aria-describedby="strict-help"`) has the
  name “Fail on warnings (Audit strict mode)”. The help remains its description,
  and the accessible name contains the visible label for voice control.
- Coverage’s Open report checkbox (`aria-describedby="open-help"`) uses native
  `disabled` for LCOV and text. Its help explains that it is available for HTML
  only. This exposes the disabled state independently of the visual styling.

Component tests verify these names, descriptions and native disabled states.
