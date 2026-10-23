# Accessibility review

This review covers keyboard-only use, screen reader structure, and 200% zoom
(Stellar Wave issues #108, #109, #110, #111). It records what was verified
automatically, what was fixed, and what still needs a manual pass.

## What is verified automatically

| Area | Check | Where |
| --- | --- | --- |
| Keyboard | Skip link is first in tab order and moves focus to the page content | `tests/visual/accessibility.spec.ts` |
| Keyboard | Every focusable control shows an outline on keyboard focus | `tests/visual/accessibility.spec.ts` |
| Keyboard | Workflow tabs respond to arrow, Home and End keys | `src/App.test.tsx`, `tests/visual/accessibility.spec.ts` |
| Keyboard | Each command in the limits example is reachable in order with Tab | `tests/visual/accessibility.spec.ts` |
| Screen reader | Landmarks, a single `h1`, and named navigation links | `tests/visual/accessibility.spec.ts` |
| Screen reader | Command selector is a labelled group of toggle buttons | `src/App.test.tsx`, `tests/visual/accessibility.spec.ts` |
| Screen reader | Copy results are announced through a polite live region | `src/App.test.tsx`, `tests/visual/accessibility.spec.ts` |
| Screen reader | Audit prerequisites are a labelled fieldset of checkboxes, each with its own accessible name | `src/App.test.tsx` |
| Zoom | No horizontal page scroll and no clipped controls at 640px and 320px CSS widths | `tests/visual/accessibility.spec.ts` |

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
