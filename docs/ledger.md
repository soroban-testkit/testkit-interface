# ledger module

`soroban_testkit::ledger` provides deterministic time, sequence, and clock control over an in-memory Soroban ledger state.

This guide covers the Rust testing API, not a `soroban-testkit ledger` command.
The CLI exposes `coverage`, `limits`, and `audit`; its `__limits-probe` helper
is hidden, and there is no ledger subcommand
([CLI command definitions](https://github.com/soroban-testkit/testkit-blockchain/blob/main/crates/cli/src/commands/mod.rs)).
For the command-builder workflows this interface does support, see the
[README workflow testing overview](../README.md#workflow-testing--verification).

## Version and compatibility

- **Current version**: Soroban SDK 27.0.x and later.
- **Minimum Rust version**: Rust 1.84 or later with `wasm32v1-none` target.
- **Network access**: Uses the in-memory SDK test ledger; it does not connect to Testnet or Mainnet or make RPC calls.
- **Clock & sequence control**: Uses in-memory mock ledger state via `env.ledger()` with deterministic timestamp and sequence warping.

## Known considerations

- **Monotonic progression**: Advance ledger sequences and timestamps forward; warping backward can invalidate TTL or time-lock assumptions.
- **Offline deterministic state**: All ledger time and sequence changes run in-memory with zero network RPC calls.
- **TTL interaction**: Advancing the ledger sequence also ages persistent and temporary storage entries—pair with `ttl` checks when testing expiration.

## Troubleshooting FAQ

Each answer below is taken from the crate's ledger source (`crates/testkit/src/ledger/clock.rs`) and its documented behaviour. The source was read through the GitHub API; the examples have not been compiled or run here.

**Why did `advance`, `advance_hours`, or `warp_to` panic with `misuse of testkit API`?**
`warp_to` panics when the target timestamp is earlier than `now()`, because the ledger clock cannot run backwards. The `advance*` methods panic when the jump would overflow ledger arithmetic. Use the `try_*` variants to get a `TestkitError::Misuse` back instead; the clock is unchanged on error.

**Why did the clock move a different amount than I asked for?**
`advance(Duration)` applies only whole seconds, because ledger timestamps are whole Unix seconds. Any sub-second part of the duration is ignored.

**Why does the sequence number move by a different amount than the time?**
Sequence numbers follow the close interval, not the wall clock. The default interval is `LEDGER_CLOSE_TIME_SECS` (5 seconds). `advance_ledgers(n)` adds `n * interval` seconds. `warp_to` and the calendar helpers add `ceil(seconds / interval)` ledgers. Check the setting with `ledger_close_interval()`.

**Why did `with_ledger_close_interval(0)` panic?**
A close interval must be at least 1 second. A zero interval cannot map elapsed time onto ledger sequence numbers.

**Does changing the close interval move the clock?**
No. Configuring it does not change `now()` or `sequence()`. It is also per environment; other `TestEnv` values are unaffected.

**My test's ledger state did not carry over to a copy or a reset.**
`clone_config()` and `reset()` keep only the seed and the close interval. The clock position, deployed contracts, and changes made through `env().ledger()` are not carried over. Re-apply them to the new environment.

**Advancing the clock makes my stored entries expire. Is that expected?**
Yes. As noted under Known considerations above, advancing the ledger sequence also ages persistent and temporary storage entries. Pair ledger advances with `ttl` checks when you are testing expiry.

**Can I rely on the same timestamps across runs?**
Use `TestEnv::with_seed(n)` for reproducible addresses and generated values. The clock itself starts from the environment's starting ledger and is moved only by the calls you make, so the same sequence of calls gives the same clock values.
