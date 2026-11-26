# core module

`soroban_testkit::core` provides `TestEnv`, a wrapper around `soroban_sdk::Env` that tracks testkit state (ledger clock position, captured events, registered tokens) alongside the raw SDK environment, and `TestkitError`, the error type the assertion helpers panic with. Every other module extends `TestEnv` rather than introducing its own handle, so one `TestEnv` is enough for a whole test.

## API overview

- `TestEnv::new()` — creates a deterministic environment wrapping `soroban_sdk::Env`; every other testkit module extends it.
- `TestEnv::with_seed(n)` — creates a reproducible environment so generated addresses and values repeat across runs.
- `env.address()` / `env.addresses(n)` — generates a test address for a caller or contract, or several at once.
- `env.env()` — returns the underlying `&soroban_sdk::Env` for SDK calls the core module does not wrap directly.
- `env.reset()` — clears contracts and the ledger clock while keeping the original seed and close interval.
- `TestkitError::code()` — classifies an assertion failure by a stable code instead of matching panic message text.

## Quick start

1. Add the crate as a dev-dependency: `cargo add --dev soroban-testkit`.
2. Create an environment with `TestEnv::new()`. Use `TestEnv::with_seed(42)` when a test must be reproducible.
3. Derive addresses with `env.address()`, or `env.addresses(n)` for several at once.
4. Move the ledger with `env.advance_hours(1)`, `env.advance(Duration)`, or `env.warp_to(timestamp)`, and read it with `env.now()` and `env.sequence()`. See the [ledger module](ledger.md).
5. For SDK calls this crate does not wrap, use `env.env()`, which returns the underlying `&soroban_sdk::Env`.

Run `cargo test` in your contract crate to confirm the setup. This walkthrough was written from the crate source; it has not been compiled or run against a checkout.

## Version and compatibility

| Topic | Compatibility |
|---|---|
| Core API | `soroban-testkit` core API with Soroban SDK 27.0.x and later |
| Minimum Rust version | Rust 1.84 or later with the `wasm32v1-none` target |
| Environment support | `TestEnv` wraps `soroban_sdk::Env`; use `env.env()` for SDK calls the core module does not expose directly |
| Network support | Tests run locally without RPC; Testnet and Mainnet behavior is represented by in-memory ledger state |
| Reproducibility | Use `TestEnv::with_seed(n)` when generated addresses must repeat across runs |
| Error handling | Match on `TestkitError::code()` instead of panic message text |

## Troubleshooting FAQ

### Why does `try_warp_to` return an error?

**Cause:** The target timestamp is earlier than `env.now()`; the mock ledger clock cannot move backwards.

**Solution:** Compute targets from `env.now()`, or handle the `Err` returned by `try_warp_to` and leave the clock unchanged.

### Why did an `advance` call overflow ledger arithmetic?

**Cause:** The requested sequence or timestamp exceeds the ledger counter type after applying the duration.

**Solution:** Use smaller whole-second durations, or call the `try_advance*` variants and inspect the error.

### Why do addresses and clients stop working after `reset()`?

**Cause:** `reset()` discards all state, so handles created before the reset still point at the old environment.

**Solution:** Recreate addresses, clients, and `Env` handles after calling `reset()`.

## Common failure modes

| Symptom | Cause (from the source) | What to do |
|---|---|---|
| Panic: `misuse of testkit API: ...` from `warp_to` | The target timestamp is earlier than `env.now()`. The ledger clock cannot run backwards. | Compute targets from `env.now()`, or use `try_warp_to` and handle the `Err`. |
| Panic: `... overflows ledger arithmetic` from `advance*` | The matching ledger count does not fit the `u32` sequence number, or the new sequence or timestamp would exceed its type's maximum. The clock is left unchanged. | Use smaller durations, or use the `try_advance*` variants and check the result. |
| Panic: `ledger close interval must be at least 1 second` | `with_ledger_close_interval(0)` was called. A zero interval cannot map time onto sequence numbers. | Pass 1 or more. |
| Clock moved less than expected | `advance(Duration)` applies only whole seconds; any sub-second part is ignored. | Use whole-second durations. |
| Contract or address handle misbehaves after `reset()` | `reset()` discards all state. Addresses, clients, and `Env` handles created before the reset keep pointing at the discarded state. | Recreate them after calling `reset()`. |
| A ledger setting changed through `env.env()` is missing in a copy | `clone_config()` and `reset()` carry over only the seed and the ledger close interval. Changes made directly on the raw `Env` are not carried over. | Re-apply such changes to the new environment. |
| Two environments seem to share state | They do not. `TestEnv` has no `Clone` impl on purpose; a cloned `Env` would share one host. | Use `clone_config()` for an isolated copy with the same configuration and a fresh clock. |
| Test results differ between runs | `TestEnv::new()` uses a non-reproducible seed for randomized value generation. | Use `TestEnv::with_seed(n)` for reproducible runs. |
| CI needs to classify a failure | Messages may be reworded. | Match on `TestkitError::code()`. Current codes: `TESTKIT_ASSERTION_FAILED`, `TESTKIT_DECODE_FAILED`, `TESTKIT_MISUSE`. Codes are not reused for other variants. |

The `try_*` variants return `Err(TestkitError::Misuse(..))` instead of panicking, and leave the clock unchanged on error.

## Runnable example

Put this in a test file of your contract crate (for example `tests/core.rs`), with `soroban-testkit` as a dev-dependency, then run `cargo test`:

```rust
use soroban_testkit::core::TestEnv;

#[test]
fn quick_start_is_reproducible_and_advances_clock() {
    // Setup: a seeded environment, so addresses repeat across runs.
    let env = TestEnv::with_seed(42);
    let alice = env.address();
    let bob = env.address();
    assert_ne!(alice, bob);

    // Operation: advance the ledger clock by one hour.
    let start = env.now();
    env.advance_hours(1);

    // Assertion: the timestamp moved forward by exactly 3600 seconds.
    assert_eq!(env.now(), start + 3600);
}

#[test]
fn seeded_environments_issue_the_same_addresses() {
    let a = TestEnv::with_seed(42);
    let b = TestEnv::with_seed(42);
    assert_eq!(a.address(), b.address());
}

#[test]
fn failed_warp_leaves_the_clock_unchanged() {
    let env = TestEnv::new();
    env.advance_hours(1);
    let before = env.now();
    // Warping to an earlier timestamp is rejected and the clock stays put.
    assert!(env.try_warp_to(before - 1).is_err());
    assert_eq!(env.now(), before);
}
```

The example uses only functions that appear in the crate source: `TestEnv::new`, `TestEnv::with_seed`, `address`, `now`, `advance_hours`, and `try_warp_to`. The example has not been compiled here.

## Known considerations

- `TestEnv` deliberately has no `Clone` impl. To get a second environment with the same configuration, use `clone_config()`; it starts with a fresh clock and no contracts.
- Use `reset()` between scenarios in one test when you want the original seed and close interval but a clean clock and no deployed contracts.
