# Soroban Testkit Interface

A visual companion to [Soroban Testkit](https://github.com/soroban-testkit/testkit-blockchain). It documents the library's focused testing modules and provides a command builder for the supported CLI workflows.

The interface does not execute contracts in the browser. Generated commands run locally through `soroban-testkit`, keeping contract tests deterministic and offline as required by the core project.

## Features

- **Design System & Theme Tokens**: Comprehensive CSS custom property scale (`:root`) standardizing color schemes (`--surface-base`, `--surface-elevated`, `--surface-terminal`, `--surface-output`, `--surface-card`, canvas, accent, text hierarchy, and `--border-subtle`, `--border-default`, `--border-strong`, `--border-input`) and spacing increments.
- **Compact Output for 320px Screens**: Responsive mobile output layout stacking the code block and action buttons on viewports down to 320px to prevent horizontal overflow and enhance touch targets.
- **Responsive Footer Layout**: Semantic multi-column footer with wrapping layout displaying brand description, workflow navigation links, and licensing metadata.
- **Workflow Input Reset**: Easily reset customized command builder inputs back to standard workflow defaults via the `Reset` action.
- **Module Filter & Empty State**: Search and filter testing modules by name or description with real-time feedback and an accessible empty-state layout with quick filter reset.
- **Responsive Layout Enhancements**:
  - **Large-text Hero Layout**: Enhanced typography scaling at 1200px+ viewports for improved readability on large displays.
  - **Improved Navigation**: Prevents link wrapping on small screens with optimized spacing and flexible layouts.
  - **Tablet Two-Column Grid**: Compact two-column module layout for tablet widths (601px-900px) for better space utilization.
  - **Landscape Phone Optimization**: Condensed command form layout for landscape phone orientations (541px-900px width, max 600px height).
- **Required vs. Optional Setting Distinction**: Visual badges (`Required` / `Optional`) and `aria-required` attributes in the CLI workbench distinguishing mandatory parameters from optional configuration flags.
- **Audit workflow support**: An expandable, keyboard-accessible preflight checklist, strict-mode control, and advanced multiline command editor help users prepare and reproduce source audits.
- **Limits command reference**: A standalone, keyboard-accessible walkthrough builds the Sororail batch-payout contract and runs `soroban-testkit limits` against its `execute_equal` entry point, alongside argument defaults and offline/read-only behavior.
- **Enhanced Copy Options**: Multiple ways to copy commands:
  - **Copy with Comments** (#144): Export commands with inline explanatory comments for documentation and learning.
  - **Copy as Script** (#145): Generate complete, executable bash scripts with variables and error handling.
- **Workflow Management**:
  - **Reset to Defaults** (#141): Quickly reset the active workflow to its default configuration.
  - **Command History** (#143): Restore previously configured commands with one click (maintains last 10 commands).

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
