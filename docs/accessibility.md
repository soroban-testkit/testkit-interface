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
