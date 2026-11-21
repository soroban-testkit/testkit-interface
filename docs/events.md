# events module

`soroban_testkit::events` captures contract-emitted events and provides typed topic and payload assertions for deterministic tests.

## Quick start

1. Add the crate: `cargo add --dev soroban-testkit`.
2. Initialize `TestEnv::new()` and register your contract.
3. Capture events during a contract invocation with `EventLog::capture`:

   ```rust
   use soroban_sdk::symbol_short;
   use soroban_testkit::core::TestEnv;
   use soroban_testkit::events::EventLog;

   let env = TestEnv::new();
   let id = env.env().register(Vault, ());
   let client = VaultClient::new(env.env(), &id);

   let log = EventLog::capture(&env, || {
       client.deposit(&env.address(), &500);
   });
   ```

4. Filter by contract and assert the expected topic and payload:

   ```rust
   log.for_contract(&id)
       .assert_emitted::<i128>((symbol_short!("deposit"),), &500);
   ```

## Troubleshooting FAQ

**No events captured after calling a contract method.**
Events were inspected before the contract invocation ran, or the test environment reset between calls. Capture events immediately inside or right after the contract call using `EventLog::capture(&env, || { ... })` or `env.events().all()`.

**Topic assertion fails due to `Symbol` vs `String` mismatch.**
Soroban contract events distinguish between `Symbol` (such as `symbol_short!("transfer")`) and `String` values in topic tuples. Match the exact topic types published by `env.events().publish(...)` when building your expected topic matcher.

**Contract filter misses events emitted by a sub-contract.**
Filtering by the outer contract address excludes events emitted by downstream token or helper contracts. Pass the emitting contract's `Address` to `for_contract(&contract_id)`, or inspect the full captured log when asserting cross-contract flows.

**Event payload decoding fails with a type mismatch.**
The Rust type requested in the assertion does not match the tuple or `#[contracttype]` struct serialized by the contract. Verify the exact field order and integer width (for example `i128` vs `u64`) in the contract's `publish` call.
