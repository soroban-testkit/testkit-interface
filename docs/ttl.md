# ttl module

`soroban_testkit::ttl` reads storage TTLs and simulates expiry, so missing TTL bumps show up as failing tests.

## API overview

The ttl module provides the following key functions:

- **`ttl_of(&env, storage_kind, key)`** — Reads the current TTL (in ledger entries) for a storage entry. Returns the remaining lifetime before expiry.
- **`assert_bumps_ttl(&env, storage_kind, key, closure)`** — Asserts that the closure extends the TTL for the given entry. Fails if the TTL does not increase.
- **`assert_survives_expiry(storage_kind, closure)`** — Asserts that the closure handles expired data gracefully (no panics or unwraps on missing values).
- **`expire_all()`** — Advances the ledger past `max_entry_ttl`, expiring all storage entries of all kinds.

**Storage kinds:**
- `StorageKind::Persistent` — Long-lived contract state (default TTL: 4,294,967 ledger entries, ~6 months).
- `StorageKind::Temporary` — Short-lived state requiring frequent TTL extension (default TTL: 2,629,743 ledger entries, ~100 days).
- `StorageKind::Instance` — Single TTL per contract, ignores specific keys.

## Runnable example

Put this in a test file of your contract crate (for example `tests/ttl.rs`), with `soroban-testkit` as a dev-dependency, then run `cargo test`:

```rust
use soroban_sdk::symbol_short;
use soroban_testkit::core::TestEnv;
use soroban_testkit::ttl::StorageKind;

#[test]
fn test_ttl_bump_on_read() {
    let env = TestEnv::new();
    
    // Register contract and set persistent data
    let id = env.env().register(Store, ());
    let client = StoreClient::new(env.env(), &id);
    client.set(&symbol_short!("balance"), &1000);
    
    // Read initial TTL
    let ttl_before = env.ttl_of(&id, StorageKind::Persistent, symbol_short!("balance"));
    
    // Assert that reading the balance extends the TTL
    env.assert_bumps_ttl(&id, StorageKind::Persistent, symbol_short!("balance"), || {
        let _ = client.get(&symbol_short!("balance"));
    });
}

#[test]
fn test_contract_handles_expiry_gracefully() {
    let env = TestEnv::new();
    let id = env.env().register(Store, ());
    let client = StoreClient::new(env.env(), &id);
    client.set(&symbol_short!("config"), &42);
    
    // Assert that the contract handles expired temporary storage without panicking
    env.assert_survives_expiry(StorageKind::Temporary, || {
        let result = client.get_config_or_default(&symbol_short!("config"));
        // Result should be a default value, not a panic
        assert_eq!(result, 0);
    });
}
```

## Common failure modes

- **`ttl_of` panics or returns None** — The entry does not exist or has already expired. Write it first, and always read the TTL before calling `expire_all()` or advancing the ledger too far. Check that the storage kind matches where the data was written.

- **`expected the call to extend the TTL beyond X, but it was Y afterward`** — The closure did not call a function that extends the TTL (like `extend_ttl` or a contract function that accesses the entry). Alternatively, the entry's TTL was already above the threshold, so nothing changed. Verify that your contract client is calling the right method.

- **`expected the contract to survive ... expiry gracefully, but it panicked`** — The contract read an expired entry with `.unwrap()` or other panic operations on missing values. Use `get(...).unwrap_or(default)`, `has(key)`, or `Option` patterns to handle missing data. Never assume a storage entry still exists after expiry.

- **Different TTL values for `Persistent` vs. `Temporary`** — `StorageKind::Persistent` has a much longer default TTL (~6 months) than `Temporary` (~100 days). Tests for temporary storage will expire much faster. Use the correct `StorageKind` in your test.

- **`expire_all()` ignores the storage kind** — This function advances past the network's `max_entry_ttl`, which expires every entry of every kind. Use it to test expiry of all storage types at once. The kind argument in `assert_survives_expiry` only documents intent; it does not filter expiry.

- **Key argument ignored for `StorageKind::Instance`** — Instance storage has one TTL per contract, not one per key. Any key argument returns the same TTL. If you need per-key lifetimes, use `StorageKind::Persistent` or `Temporary` instead.
