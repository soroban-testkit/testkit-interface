# tokens module

`soroban_testkit::tokens` provides Stellar Asset Contract (SAC) test doubles for deterministic minting, transfers, allowances, and balance assertions in contract tests.

## API overview

- `env.token()` — deploys an isolated Stellar Asset Contract (SAC) test double bound to `TestEnv`.
- `token.address()` — returns the `Address` of the SAC test double to pass into contracts under test.
- `token.mint(&to, amount)` — mints `amount` (`i128`) tokens to `to` using test admin privileges.
- `token.transfer(&from, &to, amount)` — transfers `amount` tokens from `from` to `to` while enforcing SAC authorization.
- `token.approve(&owner, &spender, amount, expiration_ledger)` — approves `spender` to transfer up to `amount` on behalf of `owner` until `expiration_ledger`.
- `token.transfer_from(&spender, &from, &to, amount)` — transfers `amount` from `from` to `to` using an existing allowance for `spender`.
- `token.balance(&id)` / `token.assert_balance(&id, expected)` — reads an account's `i128` balance or asserts it equals `expected`.

## Quick start

1. Add the crate: `cargo add --dev soroban-testkit`.
2. Create a deterministic `TestEnv` and deploy a Stellar Asset Contract test double:

   ```rust
   use soroban_testkit::core::TestEnv;

   let env = TestEnv::new();
   let token = env.token();
   let alice = env.address();
   let bob = env.address();
   ```

3. Mint an initial balance to an account:

   ```rust
   token.mint(&alice, 1_000);
   assert_eq!(token.balance(&alice), 1_000);
   ```

4. Transfer tokens or pass `token.address()` into your contract under test, then assert the resulting balances:

   ```rust
   token.transfer(&alice, &bob, 350);
   assert_eq!(token.balance(&alice), 650);
   assert_eq!(token.balance(&bob), 350);
   ```

## Common failure modes

- **`insufficient balance`**: `token.transfer` or `token.transfer_from` panicked because the sender balance was lower than the requested amount. Fund the sender with `token.mint(&from, amount)` first.
- **`negative amount or overflow`**: Soroban SAC amounts are signed `i128` values. Passing a negative amount or overflowing `i128::MAX` panics immediately.
- **`allowance exceeded or missing approval`**: `token.transfer_from` requires a prior `token.approve(&owner, &spender, amount, expiration_ledger)` covering the transfer amount that has not expired.
- **`authorization error on transfer`**: unlike `token.mint` (which uses test admin privileges), `token.transfer` and `token.approve` enforce SAC authorization. Mock auth for the sender or owner when testing without `mock_all_auths`.

## Related command-builder workflows

When token tests move from library setup to CLI verification, use the command-builder workflows documented in the [README](../README.md#workflow-testing--verification):

- **Coverage** — measure which token-contract test paths execute and choose HTML, LCOV, or text output.
- **Limits** — probe resource ceilings for token-heavy entry points such as batched transfers or minting flows.
- **Audit** — scan contract sources for authorization, arithmetic, and TTL risks that commonly matter in token integrations.

These are CLI workflows; the `tokens` API on this page remains a Rust test module.

## Version and compatibility

- **Current version**: Soroban SDK 27.0.x and later.
- **Minimum Rust version**: Rust 1.84 or later with the `wasm32v1-none` target.
- **Token standard support**: Implements the Stellar Asset Contract (SEP-41) token interface (`transfer`, `transfer_from`, `approve`, `balance`, `allowance`).
- **Stellar network support**: Compatible with Testnet and Mainnet SAC behavior, using `i128` signed amounts.
- **Known considerations**:
  - **Signed `i128` amounts**: All token amounts and balances use `i128`; negative values or overflows panic as in the Soroban SAC.
  - **Auth requirements on transfers**: `token.mint` uses test admin privileges, whereas `token.transfer` and `token.transfer_from` follow standard SAC authorization rules.
  - **Isolated per `TestEnv`**: Each `env.token()` instance is scoped to its `TestEnv` and does not share state across tests.

## Related command-builder workflows

The [command builder](../README.md#features) in this interface provides offline CLI tooling to benchmark, measure, and audit contracts using `soroban_testkit::tokens`:

- **[Limits Workflow](../README.md#features)** — Benchmark and verify resource consumption (CPU instructions and memory) for token entrypoints like `transfer` or custom batch operations via `soroban-testkit limits`. See the [Limits command reference](../README.md#features) and [Limits Workflow verification](../README.md#workflow-testing--verification).
- **[Coverage Workflow](../README.md#features)** — Generate coverage reports (`html`, `lcov`, `text`) for token test suites using `soroban-testkit coverage` with the [Coverage preflight checklist](../README.md#features).
- **[Audit Workflow](../README.md#features)** — Verify contract source invariants, strict auth checks, and signed `i128` boundary handling prior to deployment via `soroban-testkit audit`. See [Audit workflow support](../README.md#features).

