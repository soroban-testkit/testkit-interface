# events module

`soroban_testkit::events` captures contract-emitted events during a test invocation and provides typed assertions so state-change notifications are verified alongside return values.

## API overview

- `EventLog::capture(&env, || { ... })` — runs a closure against `TestEnv` and records all contract events emitted during that call.
- `log.assert_count(n)` — fails with a summary of captured events if the total count does not equal `n`.
- `log.assert_topic(&contract_id, topics)` — verifies that a captured event from `contract_id` matches the expected Soroban topic tuple.
- `log.assert_data::<T>(&contract_id, expected)` — decodes the event payload as `T` and asserts equality against `expected`.
- `log.for_contract(&contract_id)` — returns only the events emitted by a specific contract address, isolating cross-contract calls.
- `log.len()` / `log.is_empty()` — inspects the number of captured events without panicking.

## Runnable example

Put this in a test file of your contract crate (for example `tests/events.rs`), with `soroban-testkit` as a dev-dependency, then run `cargo test`:

```rust
use soroban_sdk::{symbol_short, Address};
use soroban_testkit::core::TestEnv;
use soroban_testkit::events::EventLog;

#[test]
fn deposit_emits_typed_transfer_event() {
    let env = TestEnv::new();
    let contract_id = env.env().register(Vault, ());
    let client = VaultClient::new(env.env(), &contract_id);
    let sender: Address = env.address();

    let log = EventLog::capture(&env, || {
        client.deposit(&sender, &250);
    });

    log.assert_count(1);
    log.assert_topic(&contract_id, (symbol_short!("deposit"), sender.clone()));
    log.assert_data::<i128>(&contract_id, 250);
}
```

In a real contract test, wrap the single contract call you want to inspect inside `EventLog::capture` so unrelated setup calls do not pollute the captured event list.

## Common failure modes

- **`expected N events, found M`**: setup calls (such as `token.mint` or initialization) ran inside `EventLog::capture`, or a cross-contract call emitted an extra event. Move setup before `EventLog::capture`, or filter by `contract_id`.
- **`topic mismatch at index ...`**: Soroban encodes `Symbol` topics differently from `String` values. Use `symbol_short!` (or `Symbol::new`) to match the exact topic type emitted by the contract.
- **`failed to decode event data as T`**: the Rust type passed to `assert_data::<T>` does not match the XDR type emitted by `env.events().publish(...)` (for example `u128` vs `i128`, or a tuple vs a struct).
- **`no events captured for contract`**: the contract invocation panicked before publishing, or `EventLog::capture` was called on a different `TestEnv` instance than the contract client.

## Version and compatibility

- **Current version**: Soroban SDK 27.0.x and later.
- **Minimum Rust version**: Rust 1.84 or later with the `wasm32v1-none` target.
- **Stellar network support**: Compatible with Testnet and Mainnet contract event encoding (`env.events().publish(...)` and XDR `ContractEvent`).
- **Known considerations**:
  - **Scoped to closure**: `EventLog::capture(&env, || { ... })` records only events emitted during the closure; setup calls outside the closure are excluded.
  - **Cross-contract filtering**: Cross-contract invocations emit events under each emitting contract's address; use `log.for_contract(&contract_id)` to isolate events for a single contract.
  - **Strict topic and payload typing**: Soroban distinguishes `Symbol` (`symbol_short!` / `Symbol::new`) from `String` and requires exact XDR numeric widths (`i128` vs `u128`).
