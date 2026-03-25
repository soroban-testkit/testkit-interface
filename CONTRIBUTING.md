# Contributing to RemitLend

First off, thank you for considering contributing to RemitLend! It's people like you who make RemitLend a powerful tool for providing fair lending access to migrant workers worldwide.

This document provides a set of guidelines for contributing to RemitLend and its packages. These are mostly guidelines, not rules. Use your best judgment, and feel free to propose changes to this document in a pull request.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Branching Strategy](#branching-strategy)
- [Development Workflow](#development-workflow)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Pull Request Process](#pull-request-process)
- [Style Guides](#style-guides)

## Code of Conduct

By participating in this project, you agree to maintain a respectful, inclusive, and harassment-free environment for everyone. We are committed to providing a welcoming experience for contributors of all backgrounds and skill levels.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Include environment details** (OS, Node version, Browser, Wallet)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. Provide a detailed description and explain why the enhancement would be useful.

## Branching Strategy

We follow a **Feature-Branch-to-Main** workflow. All development should happen on dedicated branches before being merged into the `main` branch.

### Branch Naming Convention

- `feat/`: New features (e.g., `feat/lender-dashboard`)
- `fix/`: Bug fixes (e.g., `fix/nft-minting-error`)
- `docs/`: Documentation changes (e.g., `docs/update-architecture`)
- `refactor/`: Code improvements without behavior changes
- `test/`: Adding or updating tests
- `chore/`: Maintenance tasks

### Workflow Steps

1. **Sync**: Always ensure your local `main` is up-to-date.
   ```bash
   git checkout main
   git pull origin main
   ```
2. **Branch**: Create a new branch for your task.
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. **Draft**: Keep your commits small and focused.

## Commit Message Guidelines

We strictly follow the [Conventional Commits](https://www.conventionalcommits.org/) specification. This allows for automated changelog generation and enforced standards.

### Format
`<type>(<scope>): <short summary>`

- **type**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.
- **scope**: (Optional) The module affected (e.g., `contracts`, `frontend`, `backend`).
- **subject**: Present tense, imperative mood (e.g., "add", not "added").

### Examples
- `feat(contracts): implement loan repayment logic`
- `fix(frontend): resolve wallet disconnect on refresh`
- `docs(wiki): add indexer synchronization guide`

## Pull Request Process

1. **Fork & Branch**: Work on a fork and a feature branch.
2. **Local Verification**: Ensure all tests and linters pass locally.
   - **Frontend**: `npm run lint` and `npm run test`
   - **Backend**: `npm run lint` and `npm test`
   - **Contracts**: `cargo fmt --all -- --check` and `cargo test`
3. **Submit PR**: Open a PR to the `main` branch of the target repository.
4. **Description Checklist**:
   - [ ] Link to the related Issue (e.g., `Closes #123`).
   - [ ] Summary of changes.
   - [ ] Screenshots/Gifs for UI changes.
   - [ ] Verification steps (manual or automated).
5. **CI Compliance**: All CI checks must pass before merging.
6. **Review**: Address any comments from maintainers.

## Style Guides

### Code Style
- **TypeScript (Frontend/Backend)**: Use functional components, strict typing, and Prettier for formatting.
- **Rust (Contracts)**: Follow standard Rust idioms and use `cargo clippy`.

### Project Structure
RemitLend is a monorepo:
- `contracts/`: Soroban smart contracts (Rust).
- `backend/`: Express.js indexer and API server.
- `frontend/`: Next.js web application.

---
Thank you for contributing to RemitLend! 🚀
