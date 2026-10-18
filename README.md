# Soroban Testkit Interface

A visual companion to [Soroban Testkit](https://github.com/soroban-testkit/testkit-blockchain). It documents the library's focused testing modules and provides an accessible, validated command builder for supported CLI workflows (`coverage`, `limits`, `audit`).

The interface does not execute contracts in the browser. Generated commands run locally through `soroban-testkit`, keeping contract tests deterministic and offline as required by the core project.

## Features

- **CLI Workbench**: Switch between `coverage`, `limits`, and `audit` command builders with instant command generation and argument quoting.
- **Accessible Workflow Navigation**: Compliant with WAI-ARIA tab pattern (`role="tablist"`, `role="tab"`, `role="tabpanel"`). Navigate workflows using keyboard arrow keys (`ArrowRight`, `ArrowLeft`), `Home`, and `End` with roving `tabIndex`.
- **Form Controls & Labels**: Explicit association of labels and form controls (`htmlFor` / `id`), enabling assistive technology support.
- **Input Validation**: Real-time validation for required contract paths and limits identifiers (`fn` and `ramp` verified as valid Rust identifiers). Displays inline `role="alert"` messages linked with `aria-invalid` and `aria-describedby`, safely disabling clipboard copy while inputs are invalid.
- **Default Reset**: Quickly restore customized inputs back to canonical workflow defaults via the `Reset` action.
- **Clipboard Feedback & Status**: Copy commands with visual and screen-reader status announcements via `aria-live="polite"`. Handles clipboard success (`Copied`) as well as graceful error recovery on failure (`Failed`).

## Development

```sh
npm install
npm run dev
```

## Validation

```sh
npm run build
npm test
```

## Project boundary

- Rust testing library and CLI: `testkit-blockchain`
- Documentation and CLI workbench: this repository

Licensed under Apache-2.0.
