# Contributing to RemitLend

First off, thank you for considering contributing to RemitLend! It's people like you who make RemitLend a great tool for providing fair lending access to migrant workers.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please be respectful, inclusive, and professional in all interactions.

## Branching Strategy

To keep our repository organized, please follow this naming convention for your branches:
- **Features**: `feat/short-description` (e.g., `feat/lender-dashboard`)
- **Bug Fixes**: `fix/short-description` (e.g., `fix/nft-minting-error`)
- **Documentation**: `docs/short-description` (e.g., `docs/update-architecture-diagram`)
- **Refactoring**: `refactor/short-description` (e.g., `refactor/loan-state-machine`)

*Note: Always branch off of the latest `main` branch.*

## Local Development Expectations

Before submitting a Pull Request, you must ensure that your code meets our quality standards:

1. **Frontend (`frontend/`)**:
   - Run `npm run lint` and ensure there are no warnings or errors.
   - Run `npm run format` (if available) to ensure code style consistency.
2. **Backend (`backend/`)**:
   - Run `npm run lint`.
   - Run the test suite using `npm run test` and verify all tests pass.
3. **Smart Contracts (`contracts/`)**:
   - Run `cargo fmt` to auto-format your Rust code.
   - Run `cargo clippy` and resolve any warnings.
   - Run `cargo test` to ensure all contract logic remains intact.

See the [README.md](README.md) for full instructions on setting up your local environment.

## Styleguides

### Git Commit Messages

We strictly follow the [Conventional Commits](https://www.conventionalcommits.org/) specification. This leads to more readable messages that are easy to follow when looking through the project history, and allows us to generate changelogs automatically.

Format: `<type>(<scope>): <subject>`

**Examples:**
- `feat(contracts): add flash loan prevention to lending pool`
- `fix(frontend): resolve wallet connection timeout`
- `docs(readme): add docker setup instructions`
- `test(backend): add coverage for credit score generation`

### Code Style
- **TypeScript (Frontend/Backend)**: Use functional components and hooks for React. Prefer `interface` over `type` for object definitions. Ensure strict typing everywhere; avoid using `any`.
- **Rust (Contracts)**: Always run `cargo fmt` and follow standard Rust naming conventions.

## Pull Request Checklist

When you are ready to open a Pull Request, please ensure you have completed the following checklist. Your PR description should confirm these steps:

- [ ] I have pulled from `main` and resolved any merge conflicts locally.
- [ ] My branch follows the established naming convention (`feat/`, `fix/`, etc.).
- [ ] My commit messages follow the Conventional Commits specification.
- [ ] I have run the appropriate linters and formatters (`npm run lint`, `cargo fmt`).
- [ ] I have added or updated tests to cover my changes.
- [ ] All existing and new tests pass successfully.
- [ ] If my change affects functionality, I have updated the documentation (`README.md`, `ARCHITECTURE.md`, etc.).

## Review Process

Once you submit your PR, a maintainer will review it. Be prepared to engage in discussion and make requested changes. Once approved, a maintainer will merge your code into `main`.

Thank you for contributing to RemitLend!
