# Soroban Testkit Interface

A visual companion to [Soroban Testkit](https://github.com/soroban-testkit/testkit-blockchain). It documents the library's focused testing modules and provides a command builder for the supported CLI workflows.

The interface does not execute contracts in the browser. Generated commands run locally through `soroban-testkit`, keeping contract tests deterministic and offline as required by the core project.

## Features

- **Shared Design Tokens**: CSS custom properties for surfaces (`--surface-base`, `--surface-elevated`, `--surface-terminal`, `--surface-output`, `--surface-card`) and borders (`--border-subtle`, `--border-default`, `--border-strong`, `--border-input`).
- **Compact Output for 320px Screens**: Responsive mobile output layout stacking the code block and action buttons on viewports down to 320px to prevent horizontal overflow and enhance touch targets.
- **Responsive Footer Layout**: Semantic multi-column footer with wrapping layout displaying brand description, workflow navigation links, and licensing metadata.
- **Workflow Input Reset**: Easily reset customized command builder inputs back to standard workflow defaults via the `Reset` action.

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
