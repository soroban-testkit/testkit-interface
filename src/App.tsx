import { Fragment, type KeyboardEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  buildCommand,
  formatCommandLine,
  formatCommandWithComments,
  formatCommandAsScript,
  modules,
  moduleCategories,
  fallbackValues,
  type CommandName,
  type ModuleCategory,
  type OptionalArgKey,
  localFileGuides,
} from "./testkit";
import { copyToClipboard } from "./clipboard";
import { CORE_REPO_URL, INSTALL_GUIDE_URL, INTERFACE_REPO_URL } from "./links";
import { useActiveSection } from "./useActiveSection";
import "./styles.css";

const navSections = [
  { id: "install", label: "Install" },
  { id: "modules", label: "Modules" },
  { id: "commands", label: "Commands" },
  { id: "audit-reference", label: "Audit reference" },
  { id: "limits-reference", label: "Limits reference" },
] as const;
const navSectionIds = navSections.map((section) => section.id);
const COPY_COMMENTS_PREFERENCE_KEY = "testkit.copy-with-comments";

// Which CLI workflows are most useful for each module (#130). Keyed by module
// name so adding a module without a mapping fails type-checking.
const moduleRelatedWorkflows: Record<(typeof modules)[number]["name"], CommandName[]> = {
  core: ["coverage"],
  ledger: ["audit"],
  money: ["audit", "limits"],
  events: ["coverage"],
  tokens: ["limits"],
  auth: ["audit"],
  ttl: ["audit"],
};

// Issue #168 — Module feature matrix
const testConcerns = [
  "Deterministic execution",
  "Time manipulation",
  "Balance tracking",
  "Event capture",
  "Token mocking",
  "Auth simulation",
  "Storage lifecycle",
] as const;

type TestConcern = (typeof testConcerns)[number];

const moduleFeatureMatrix: Record<(typeof modules)[number]["name"], TestConcern[]> = {
  core: ["Deterministic execution"],
  ledger: ["Time manipulation", "Deterministic execution"],
  money: ["Balance tracking"],
  events: ["Event capture"],
  tokens: ["Token mocking", "Balance tracking"],
  auth: ["Auth simulation"],
  ttl: ["Storage lifecycle"],
};

// Issue #169 — Glossary terms
interface GlossaryTerm {
  term: string;
  definition: string;
  relatedModules?: string[];
}

const glossary: GlossaryTerm[] = [
  {
    term: "TestEnv",
    definition: "Deterministic test environment that isolates contract execution from external state.",
    relatedModules: ["core"],
  },
  {
    term: "Ledger time",
    definition: "Simulated blockchain timestamp that can be controlled in tests for time-dependent logic.",
    relatedModules: ["ledger"],
  },
  {
    term: "Conservation checks",
    definition: "Assertions verifying that token balances remain consistent across transfers and operations.",
    relatedModules: ["money"],
  },
  {
    term: "Event assertion",
    definition: "Typed validation of contract-emitted events to ensure correct state change notifications.",
    relatedModules: ["events"],
  },
  {
    term: "Test double",
    definition: "Mock implementation of the Stellar Asset Contract for isolated testing without deployment.",
    relatedModules: ["tokens"],
  },
  {
    term: "Auth matrix",
    definition: "Multi-actor authorization framework simulating privilege and access control scenarios.",
    relatedModules: ["auth"],
  },
  {
    term: "TTL",
    definition: "Time-to-live: storage entry lifetime simulation for testing expiry and restoration logic.",
    relatedModules: ["ttl"],
  },
  {
    term: "Adversarial values",
    definition: "Edge-case monetary inputs designed to expose overflow, underflow, and precision bugs.",
    relatedModules: ["money"],
  },
  {
    term: "Prelude",
    definition: "Unified import bringing all focused testing modules into scope with a single use statement.",
    relatedModules: ["core"],
  },
];

const descriptions: Record<CommandName, string> = {
  coverage: "Generate contract-test coverage through cargo-llvm-cov.",
  limits: "Ramp a contract input to find its practical resource ceiling.",
  audit: "Scan contract sources for common auth, arithmetic, and TTL risks.",
};

const defaultCoverageOrder: OptionalArgKey[] = ["format", "open"];

const eventsExampleCode = `use soroban_sdk::{symbol_short, Address};
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
}`;

const eventsFailureModes = [
  {
    title: "expected N events, found M",
    detail:
      "Setup calls (such as token minting or initialization) ran inside EventLog::capture, or a cross-contract call emitted an extra event. Move setup before capture or filter by contract_id.",
  },
  {
    title: "topic mismatch at index",
    detail:
      "Soroban encodes Symbol topics differently from String values. Use symbol_short! or Symbol::new to match the exact topic type emitted by the contract.",
  },
  {
    title: "failed to decode event data as T",
    detail:
      "The Rust type passed to assert_data::<T> does not match the XDR type emitted by env.events().publish(...) (for example u128 vs i128, or a tuple vs a struct).",
  },
  {
    title: "no events captured for contract",
    detail:
      "The contract invocation panicked before publishing, or EventLog::capture was called on a different TestEnv instance than the contract client.",
  },
] as const;

// Issue #33 — concise API overview for the core module
const coreApiOverview = [
  {
    symbol: "TestEnv::new()",
    summary: "Creates a deterministic environment wrapping soroban_sdk::Env; every other testkit module extends it.",
  },
  {
    symbol: "TestEnv::with_seed(n)",
    summary: "Creates a reproducible environment so generated addresses and values repeat across runs.",
  },
  {
    symbol: "env.address()",
    summary: "Generates a test address for a caller or contract; env.addresses(n) derives several at once.",
  },
  {
    symbol: "env.env()",
    summary: "Returns the underlying &soroban_sdk::Env for SDK calls the core module does not wrap directly.",
  },
  {
    symbol: "env.reset()",
    summary: "Clears contracts and the ledger clock while keeping the original seed and close interval.",
  },
  {
    symbol: "TestkitError::code()",
    summary: "Classifies an assertion failure by a stable code instead of matching panic message text.",
  },
] as const;

const eventsApiOverview = [
  {
    symbol: "EventLog::capture(&env, f)",
    summary: "Executes f against TestEnv and captures all contract events emitted during the invocation.",
  },
  {
    symbol: "log.assert_count(n)",
    summary: "Asserts that exactly n events were captured, printing a diagnostic summary on mismatch.",
  },
  {
    symbol: "log.assert_topic(&id, topics)",
    summary: "Verifies that a captured event from id matches the expected Soroban topic tuple.",
  },
  {
    symbol: "log.assert_data::<T>(&id, val)",
    summary: "Decodes the event data payload as T and asserts equality against val.",
  },
  {
    symbol: "log.for_contract(&id)",
    summary: "Filters captured events to those emitted by a single contract address.",
  },
] as const;

const authApiOverview = [
  {
    symbol: "AuthMatrix::new(&env)",
    summary: "Creates a privilege matrix bound to TestEnv to verify allowed and disallowed callers across entry points.",
  },
  {
    symbol: ".entry_point(name, allowed, invoke)",
    summary: "Registers an entry point with its authorized caller slice and invocation closure returning Result.",
  },
  {
    symbol: ".assert_enforced()",
    summary: "Cross-checks every entry point against allowed callers and all other known addresses, failing with a matrix diff on mismatch.",
  },
  {
    symbol: "env.assert_requires_auth(|| { ... })",
    summary: "Asserts that a single contract invocation fails when called without authorization.",
  },
] as const;

const authQuickStartSteps = [
  {
    title: "Add soroban-testkit as a dev-dependency",
    detail: "Run cargo add --dev soroban-testkit in your contract crate.",
  },
  {
    title: "Create a TestEnv and test identities",
    detail: "Call TestEnv::new() and env.address() to generate owner and unprivileged caller addresses.",
  },
  {
    title: "Register entry points in AuthMatrix",
    detail: "Pass each entry point name, its allowed caller slice, and a closure returning Result to .entry_point(...).",
  },
  {
    title: "Run cross-checks with assert_enforced",
    detail: "Call .assert_enforced() to verify allowed callers succeed and all other known callers are rejected.",
  },
] as const;

const authExampleCode = `use soroban_testkit::auth::AuthMatrix;
use soroban_testkit::core::TestEnv;

#[test]
fn only_owner_can_withdraw() {
    let env = TestEnv::new();
    let owner = env.address();
    let other = env.address();

    AuthMatrix::new(&env)
        .entry_point("deposit", &[owner.clone(), other.clone()], |_caller| Ok(()))
        .entry_point("withdraw", &[owner.clone()], |caller| {
            if *caller == owner {
                Ok(())
            } else {
                Err(soroban_sdk::Error::from_contract_error(1))
            }
        })
        .assert_enforced();
}`;

const authTroubleshootingFaq = [
  {
    id: "unauthorized-succeeds",
    question: "Why does an unauthorized caller succeed in AuthMatrix?",
    cause: "Global auth mocking (mock_all_auths) is enabled, or the entry point never calls require_auth().",
    solution:
      "Remove mock_all_auths() from auth tests and mock per-call auths for the tested caller with try_* client methods.",
  },
  {
    id: "attacker-never-tested",
    question: "Why did AuthMatrix pass even though an unprivileged address was not rejected?",
    cause: "AuthMatrix only tests addresses that appear in at least one entry point's allowed slice.",
    solution:
      "Register the unprivileged address as allowed on an open entry point (such as deposit or a read-only probe) so it becomes a known caller.",
  },
  {
    id: "matrix-panics-instead-of-err",
    question: "Why does my test panic instead of returning Err for disallowed callers?",
    cause: "The closure invokes the standard contract client method, which panics on HostError/AuthError.",
    solution:
      "Call the generated try_* client method inside the closure and map Ok/Err so AuthMatrix can inspect rejections.",
  },
  {
    id: "assert-requires-auth-fails",
    question: "Why does env.assert_requires_auth fail with 'succeeded without authorization'?",
    cause: "The contract entry point did not invoke address.require_auth() or require_auth_for_args() before returning.",
    solution: "Add require_auth() on the authorizing address at the start of the privileged contract method.",
  },
] as const;

const coreTroubleshootingFaq = [
  {
    id: "warp-to-earlier",
    question: "Why does try_warp_to return an error?",
    cause: "The target timestamp is earlier than env.now(); the mock ledger clock cannot move backwards.",
    solution: "Compute targets from env.now() or handle the Err returned by try_warp_to.",
  },
  {
    id: "advance-overflow",
    question: "Why did an advance call overflow ledger arithmetic?",
    cause: "The requested sequence or timestamp exceeds the ledger counter type after applying the duration.",
    solution: "Use smaller whole-second durations or the try_advance* variants and inspect the error.",
  },
  {
    id: "handles-after-reset",
    question: "Why do addresses and clients stop working after reset()?",
    cause: "reset() discards all state, so handles created before the reset still point at the old environment.",
    solution: "Recreate addresses, clients, and Env handles after calling reset().",
  },
] as const;

const moneyApiOverview = [
  {
    symbol: "Conservation::new(before, after)",
    summary: "Captures the expected and observed total supply across participating accounts for a state transition.",
  },
  {
    symbol: ".assert_holds()",
    summary: "Asserts that before == after, panicking with the signed delta if any value was leaked or created.",
  },
  {
    symbol: "assert_conserved_over(initial, steps)",
    summary: "Verifies that total supply remains conserved after every transition in a multi-step lifecycle.",
  },
  {
    symbol: "adversarial_amounts()",
    summary: "Generates boundary and rounding-edge i128 inputs (0, 1, i128::MAX) to stress-test arithmetic and overflow handling.",
  },
] as const;

const moneyQuickStartSteps = [
  {
    title: "Add soroban-testkit as a dev-dependency",
    detail: "Run cargo add --dev soroban-testkit in your contract crate.",
  },
  {
    title: "Create a TestEnv, token, and test addresses",
    detail: "Call TestEnv::new(), env.token(), and env.address() to set up buyer, seller, and escrow participants.",
  },
  {
    title: "Mint balances and record the initial supply",
    detail: "Fund test accounts with token.mint(&buyer, amount) and sum initial_total before running transfers.",
  },
  {
    title: "Assert supply conservation after transitions",
    detail: "Compute after_total and call Conservation::new(initial_total, after_total).assert_holds() to catch leaked balances.",
  },
] as const;

const moneyFailureModes = [
  {
    title: "supply conservation mismatch",
    detail:
      "Conservation::new(before, after).assert_holds() panicked because after differed from before. Check for unburned fees, rounding dust, or missed account balances in the total.",
  },
  {
    title: "i128 arithmetic overflow",
    detail:
      "Summing balances or multiplying large adversarial amounts exceeded i128::MAX. Use checked arithmetic (checked_add, checked_mul) in contract calculations.",
  },
  {
    title: "rounding dust accumulation",
    detail:
      "Integer division or fee splits truncated remainders across repeated transfers, causing assert_conserved_over to fail on a later step.",
  },
  {
    title: "negative amount input",
    detail:
      "Passing a negative i128 amount to token transfers or mints panics immediately; validate amount >= 0 at contract entry points.",
  },
] as const;

const moneyExampleCode = `use soroban_testkit::core::TestEnv;
use soroban_testkit::money::Conservation;

#[test]
fn escrow_release_conserves_total_supply() {
    let env = TestEnv::new();
    let token = env.token();
    let buyer = env.address();
    let seller = env.address();
    let escrow = env.address();

    token.mint(&buyer, 1_000);
    let initial_total = token.balance(&buyer) + token.balance(&seller) + token.balance(&escrow);

    token.transfer(&buyer, &escrow, 1_000);
    token.transfer(&escrow, &seller, 600);

    let after_total = token.balance(&buyer) + token.balance(&seller) + token.balance(&escrow);
    Conservation::new(initial_total, after_total).assert_holds();
}`;

const moneyTroubleshootingFaq = [
  {
    id: "conservation-off-by-one",
    question: "Why does Conservation::assert_holds() fail by 1 or a few stroops?",
    cause: "Integer division in fee, split, or pro-rata calculations truncated a remainder without accounting for dust.",
    solution:
      "Route remainder or dust explicitly to a designated recipient or treasury so total supply is conserved across every transfer.",
  },
  {
    id: "overflow-on-boundary-inputs",
    question: "Why does my contract panic on i128::MAX or adversarial boundary inputs?",
    cause: "Unchecked arithmetic (+, -, *) overflowed i128 in debug or WASM builds.",
    solution:
      "Use checked_add, checked_sub, and checked_mul and return a contract error instead of panicking on overflow.",
  },
  {
    id: "intermediate-step-conservation",
    question: "Why does assert_conserved_over fail on an intermediate step even though the final balance matches?",
    cause: "An intermediate state transition temporarily minted, burned, or omitted a holding account before a later step compensated.",
    solution:
      "Include every holding address (such as escrow or fee vaults) in the conserved total at each step.",
  },
  {
    id: "negative-amount-panic",
    question: "Why do negative amounts cause a panic before my conservation check runs?",
    cause: "Soroban SAC transfer and mint reject negative i128 amounts at the host boundary.",
    solution:
      "Validate amount > 0 (or >= 0 where zero-value no-ops are allowed) at contract entry points.",
  },
] as const;

const tokensApiOverview = [
  {
    symbol: "env.token()",
    summary: "Deploys an isolated Stellar Asset Contract (SAC) test double bound to TestEnv.",
  },
  {
    symbol: "token.address()",
    summary: "Returns the Address of the SAC test double to pass into contracts under test.",
  },
  {
    symbol: "token.mint(&to, amount)",
    summary: "Mints amount (i128) tokens to to using test admin privileges.",
  },
  {
    symbol: "token.transfer(&from, &to, amount)",
    summary: "Transfers amount tokens from from to to while enforcing SAC authorization.",
  },
  {
    symbol: "token.approve(&owner, &spender, amount, expiration_ledger)",
    summary: "Approves spender to transfer up to amount on behalf of owner until expiration_ledger.",
  },
  {
    symbol: "token.transfer_from(&spender, &from, &to, amount)",
    summary: "Transfers amount from from to to using an existing allowance for spender.",
  },
  {
    symbol: "token.balance(&id) / token.assert_balance(&id, expected)",
    summary: "Reads an account's i128 balance or asserts it equals expected.",
  },
] as const;

const tokensQuickStartSteps = [
  {
    title: "Add soroban-testkit as a dev-dependency",
    detail: "Run cargo add --dev soroban-testkit in your contract crate.",
  },
  {
    title: "Create a TestEnv and SAC test double",
    detail: "Call TestEnv::new() and env.token() to spin up an isolated Stellar Asset Contract test double.",
  },
  {
    title: "Mint initial test balances",
    detail: "Generate test addresses with env.address() and fund them using token.mint(&account, amount).",
  },
  {
    title: "Invoke transfers and assert balances",
    detail: "Call token.transfer(...) or pass the token address to your contract, then verify balances with token.balance(&account).",
  },
] as const;

const tokensExampleCode = `use soroban_testkit::core::TestEnv;

#[test]
fn token_transfer_updates_balances() {
    let env = TestEnv::new();
    let token = env.token();
    let alice = env.address();
    let bob = env.address();

    token.mint(&alice, 1_000);
    token.transfer(&alice, &bob, 350);

    assert_eq!(token.balance(&alice), 650);
    assert_eq!(token.balance(&bob), 350);
}`;

const tokensFailureModes = [
  {
    title: "insufficient balance",
    detail:
      "token.transfer or token.transfer_from panicked because the sender balance was lower than the requested amount. Mint funds with token.mint(&from, amount) before transferring.",
  },
  {
    title: "negative amount or overflow",
    detail:
      "Soroban SAC amounts are signed i128 values. Passing a negative amount or overflowing i128::MAX panics immediately.",
  },
  {
    title: "allowance exceeded or missing approval",
    detail:
      "token.transfer_from requires a prior token.approve(&owner, &spender, amount, expiration_ledger) that covers the transfer amount and has not expired.",
  },
  {
    title: "authorization error on transfer",
    detail:
      "Unlike token.mint (which uses test admin privileges), token.transfer and token.approve enforce SAC auth. Mock auth for the sender or owner when testing without mock_all_auths.",
  },
] as const;

const optionalArgumentRows = [
  { key: "format" as const, label: "Format", summary: "--format html" },
  { key: "open" as const, label: "Open report", summary: "--open" },
];

const workflowTabs = [
  { id: "coverage", label: "Coverage workflow" },
  { id: "workspace", label: "Cargo workspace" },
  { id: "limits", label: "Resource limits" },
] as const;

type WorkflowTabId = (typeof workflowTabs)[number]["id"];

interface CommandOptions {
  command: CommandName;
  path: string;
  format: "html" | "lcov" | "text";
  open: boolean;
  fn: string;
  ramp: string;
  strict: boolean;
  shell?: "bash" | "zsh" | "fish" | "sh";
  optionalArgOrder?: OptionalArgKey[];
}

interface SummaryRow {
  label: string;
  value: string;
}

interface DefaultRow {
  key: string;
  label: string;
  value: string;
  applied: boolean;
}

interface ComparisonRow {
  key: string;
  label: string;
  a: string;
  b: string;
  changed: boolean;
}

const installationSteps = [
  {
    title: "Install Rust",
    description: "Download and install the Rust toolchain",
    command: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
  },
  {
    title: "Add wasm32 target",
    description: "Install the WebAssembly compilation target",
    command: "rustup target add wasm32v1-none",
  },
  {
    title: "Install Soroban CLI",
    description: "Get the Stellar command-line tools",
    command: "cargo install stellar-cli",
  },
  {
    title: "Install cargo-llvm-cov",
    description: "Tool for generating coverage reports",
    command: "cargo install cargo-llvm-cov",
  },
  {
    title: "Clone Testkit",
    description: "Get the latest Soroban Testkit repository",
    command: "git clone https://github.com/soroban-testkit/testkit-blockchain",
  },
  {
    title: "Install Testkit CLI",
    description: "Build and install the testkit command",
    command: "cargo install --path testkit-blockchain/crates/cli",
  },
];

// Things worth confirming before running an audit scan (#91). Local-only
// checklist state; nothing here is persisted or sent anywhere.
const auditPrerequisites = [
  { id: "rust", label: "Rust toolchain installed via rustup" },
  { id: "wasm-target", label: "wasm32v1-none compilation target added" },
  { id: "testkit-cli", label: "Testkit CLI installed and on your PATH" },
  { id: "builds-clean", label: "Contract builds without warnings before scanning" },
];

// Issue #85: Prerequisites checklist for limits workflow
const limitsPrerequisites = [
  { id: "wasm-compiled", label: "Contract compiled to WASM and artifact exists" },
  { id: "testkit-cli", label: "Testkit CLI installed and on your PATH" },
  { id: "fn-exported", label: "Target function is exported in contract ABI" },
  { id: "ramp-param", label: "Ramp parameter exists in target function signature" },
];

// Issue #83: Preflight checklist for limits workflow
const limitsPreflight = [
  { id: "artifact-path", label: "WASM artifact path is correct" },
  { id: "function-valid", label: "Function name matches exported symbol" },
  { id: "param-compatible", label: "Ramp parameter is numeric or list type" },
  { id: "args-prepared", label: "Test arguments prepared for function invocation" },
];

// Issue #86: Advanced options for limits workflow
export const limitsAdvancedOptions = [
  { id: "timeout", label: "Execution timeout (ms)", type: "number", default: "5000" },
  { id: "sample-rate", label: "Sample rate for ramp sweep", type: "number", default: "10" },
  { id: "verbose", label: "Enable verbose output", type: "boolean", default: "false" },
  { id: "dump-state", label: "Dump contract state after each test", type: "boolean", default: "false" },
];

// Issue #81: Prerequisites checklist for coverage workflow
const coveragePrerequisites = [
  { id: "rust", label: "Rust toolchain installed via rustup" },
  { id: "llvm-cov", label: "cargo-llvm-cov installed and available" },
  { id: "testkit-cli", label: "Testkit CLI installed and on your PATH" },
  { id: "tests-pass", label: "Local test suite runs successfully" },
];

// Issue #78: Preflight checklist for coverage workflow
const coveragePreflight = [
  { id: "workspace-root", label: "Target path points to a Cargo contract workspace" },
  { id: "llvm-tools", label: "llvm-tools-preview component is installed for cargo-llvm-cov" },
  { id: "clean-tests", label: "Unit and integration tests compile and pass with cargo test" },
  { id: "output-format", label: "Report format (--format html, lcov, or text) matches your workflow" },
];

// Issue #79: Advanced options for coverage workflow
export const coverageAdvancedOptions = [
  { id: "threads", label: "Number of parallel test threads", type: "number", default: "4" },
  { id: "timeout", label: "Per-test timeout (seconds)", type: "number", default: "300" },
  { id: "fail-fast", label: "Stop on first test failure", type: "boolean", default: "false" },
  { id: "exact", label: "Run only exact test matches", type: "boolean", default: "false" },
];

// Issue #80: Ready-to-run examples for coverage workflow
const coverageExamples = [
  {
    title: "Single contract in root",
    description: "Run coverage for a contract in the repository root",
    command: "soroban-testkit coverage . --format html --open",
  },
  {
    title: "Monorepo structure",
    description: "Run coverage for a specific contract in a /contracts subdirectory",
    command: "soroban-testkit coverage ./contracts/my-contract --format html --open",
  },
  {
    title: "Machine-readable output",
    description: "Generate LCOV format for CI/CD integration",
    command: "soroban-testkit coverage . --format lcov",
  },
  {
    title: "Terminal summary only",
    description: "Quick coverage check without opening a report",
    command: "soroban-testkit coverage . --format text",
  },
];

function summarizeConfiguration(options: CommandOptions): SummaryRow[] {
  const rows: SummaryRow[] = [{ label: "Workflow", value: options.command }];
  if (options.path) rows.push({ label: "Path", value: options.path });
  if (options.command === "coverage" && options.format) {
    rows.push({ label: "Format", value: options.format });
    if (options.format === "html" && options.open) rows.push({ label: "Open report", value: "Yes" });
  }
  if (options.command === "limits") {
    rows.push({ label: "Function", value: options.fn });
    rows.push({ label: "Ramp", value: options.ramp });
  }
  if (options.command === "audit" && options.strict) {
    rows.push({ label: "Strict mode", value: "Enabled" });
  }
  return rows;
}

function effectiveDefaults(options: CommandOptions): DefaultRow[] {
  const rows: DefaultRow[] = [];
  if (options.command === "coverage") {
    if (!options.format) {
      rows.push({ key: "format", label: "Format", value: "html", applied: true });
    }
  }
  if (options.command === "limits") {
    if (!options.path) {
      rows.push({
        key: "contract",
        label: "Contract",
        value: fallbackValues.limitsContract,
        applied: true,
      });
    }
    if (!options.fn) {
      rows.push({ key: "fn", label: "Function", value: fallbackValues.limitsFunction, applied: true });
    }
    if (!options.ramp) {
      rows.push({ key: "ramp", label: "Ramp", value: fallbackValues.limitsRamp, applied: true });
    }
  }
  if (options.command === "audit" && !options.path) {
    rows.push({ key: "path", label: "Path", value: "./src", applied: true });
  }
  return rows;
}

function compareConfigurations(a: CommandOptions, b: CommandOptions): ComparisonRow[] {
  return [
    { key: "command", label: "Workflow", a: a.command, b: b.command, changed: a.command !== b.command },
    { key: "path", label: "Path", a: a.path, b: b.path, changed: a.path !== b.path },
    { key: "format", label: "Format", a: a.format, b: b.format, changed: a.format !== b.format },
    { key: "shell", label: "Shell", a: a.shell || "default", b: b.shell || "default", changed: a.shell !== b.shell },
  ];
}

function highlightCommand(command: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\s+|--|[^\s]+)/g;
  let match;
  let index = 0;

  while ((match = regex.exec(command)) !== null) {
    const text = match[0];
    if (/^\s+$/.test(text)) {
      parts.push(text);
    } else if (text.startsWith("--")) {
      parts.push(
        <span key={index} className="syntax-flag">
          {text}
        </span>
      );
    } else if (/^(soroban-testkit|coverage|limits|audit)$/.test(text)) {
      parts.push(
        <span key={index} className="syntax-command">
          {text}
        </span>
      );
    } else if (/^(html|lcov|text|batch_payout|recipients)$/.test(text)) {
      parts.push(
        <span key={index} className="syntax-value">
          {text}
        </span>
      );
    } else {
      parts.push(
        <span key={index} className="syntax-path">
          {text}
        </span>
      );
    }
    index++;
  }
  return parts;
}

export default function App() {
  const [command, setCommand] = useState<CommandName>("coverage");
  const [path, setPath] = useState(".");
  const [format, setFormat] = useState<"html" | "lcov" | "text">("html");
  const [open, setOpen] = useState(true);
  const [fn, setFn] = useState("batch_payout");
  const [ramp, setRamp] = useState("recipients");
  const [strict, setStrict] = useState(true);
  const [shell, setShell] = useState<"bash" | "zsh" | "fish" | "sh">("bash");
  const [copied, setCopied] = useState(false);
  const [copiedStep, setCopiedStep] = useState<number | null>(null);
  const [copiedModuleExample, setCopiedModuleExample] = useState<string | null>(null);
  const [includeComments, setIncludeComments] = useState(true);
  const [copiedCommentsMode, setCopiedCommentsMode] = useState<"with" | "without" | null>(null);
  const [copiedAsScript, setCopiedAsScript] = useState(false);
  // Issue #143: Command history for restore functionality
  const [commandHistory, setCommandHistory] = useState<CommandOptions[]>([]);
  // Copy buttons change their label, which screen readers often skip; this
  // polite live region announces the result explicitly (#108).
  const [announcement, setAnnouncement] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ModuleCategory | null>(null);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [expandedModuleCards, setExpandedModuleCards] = useState<Record<string, boolean>>({});
  const [moduleTocOpen, setModuleTocOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  // #102 — validation errors announced via live region
  const [validationError, setValidationError] = useState("");
  const moduleSearchRef = useRef<HTMLInputElement>(null);
  // #101 — focus the command section heading after a mode switch
  const commandHeadingRef = useRef<HTMLHeadingElement>(null);
  // #266 — ref for the generated command output panel so the jump shortcut can focus it
  const auditOutputPanelRef = useRef<HTMLDivElement>(null);

  // Resetting from the empty state removes the button that had focus, so move
  // focus back to the search box instead of dropping it to <body> (#123).
  const resetModuleFilter = () => {
    setModuleFilter("");
    setCategoryFilter(null);
    moduleSearchRef.current?.focus();
  };
  const [coverageOrder, setCoverageOrder] = useState<OptionalArgKey[]>(defaultCoverageOrder);
  const [multilineEditor, setMultilineEditor] = useState(false);
  const [advancedCommand, setAdvancedCommand] = useState("");
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowTabId>("coverage");
  const [compareOpen, setCompareOpen] = useState(false);
  const [configB, setConfigB] = useState<CommandOptions | null>(null);
  const [coverageGuideOpen, setCoverageGuideOpen] = useState(false);
  const [auditGuideOpen, setAuditGuideOpen] = useState(false);
  const auditGuideScroll = useRef<number | null>(null);
  useLayoutEffect(() => {
    const top = auditGuideScroll.current;
    auditGuideScroll.current = null;
    if (top !== null && window.scrollY !== top) {
      window.scrollTo({ top, behavior: "instant" });
    }
  }, [auditGuideOpen]);
  const [checkedPrerequisites, setCheckedPrerequisites] = useState<Record<string, boolean>>({});
  const [installFaqOpen, setInstallFaqOpen] = useState(false);
  const [auditWarningsGuideOpen, setAuditWarningsGuideOpen] = useState(false);
  const [limitsInterpretationGuideOpen, setLimitsInterpretationGuideOpen] = useState(false);
  // Issue #85: Prerequisites checklist for limits workflow
  const [limitsPrerequisitesOpen, setLimitsPrerequisitesOpen] = useState(false);
  // Issue #83: Preflight checklist for limits workflow
  const [limitsPreflightOpen, setLimitsPreflightOpen] = useState(false);
  const [checkedLimitsPrerequisites, setCheckedLimitsPrerequisites] = useState<Record<string, boolean>>({});
  const [checkedLimitsPreflight, setCheckedLimitsPreflight] = useState<Record<string, boolean>>({});
  // Issue #86: Advanced options for limits workflow
  const [limitsAdvancedOpen, setLimitsAdvancedOpen] = useState(false);
  const [, setLimitsAdvancedValues] = useState<Record<string, string>>({});
  // Issue #81: Prerequisites checklist for coverage workflow
  const [coveragePrerequisitesOpen, setCoveragePrerequisitesOpen] = useState(false);
  const [checkedCoveragePrerequisites, setCheckedCoveragePrerequisites] = useState<Record<string, boolean>>({});
  // Issue #78: Preflight checklist for coverage workflow
  const [coveragePreflightOpen, setCoveragePreflightOpen] = useState(false);
  const [checkedCoveragePreflight, setCheckedCoveragePreflight] = useState<Record<string, boolean>>({});
  // Issue #69: Troubleshooting FAQ for the auth module
  const [openAuthFaqIds, setOpenAuthFaqIds] = useState<Record<string, boolean>>({});
  // Issue #57: Troubleshooting FAQ for the money module
  const [openMoneyFaqIds, setOpenMoneyFaqIds] = useState<Record<string, boolean>>({});
  const [openCoreFaqIds, setOpenCoreFaqIds] = useState<Record<string, boolean>>({});
  // Issue #79: Advanced options for coverage workflow
  const [coverageAdvancedOpen, setCoverageAdvancedOpen] = useState(false);
  const [, setCoverageAdvancedValues] = useState<Record<string, string>>({});
  // Issue #80: Ready-to-run examples for coverage workflow
  const [coverageExamplesOpen, setCoverageExamplesOpen] = useState(false);
  // Issue #84: Coverage command reference
  const [coverageCommandReferenceOpen, setCoverageCommandReferenceOpen] = useState(false);
  const [multiContractExamplesOpen, setMultiContractExamplesOpen] = useState(false);
  // Issue #63: Troubleshooting FAQ for the tokens module
  // Issue #60: Runnable Rust example for the tokens module
  // Issue #62: Troubleshooting FAQ for the events module
  // Issue #61: Quick-start walkthrough for the events module
  const comparePanelRef = useRef<HTMLDivElement>(null);
  // Issue #34 — generated command output, selected when the clipboard is blocked
  const commandOutputRef = useRef<HTMLElement>(null);
  // Issue #35 — field inputs whose Clear button unmounts itself, so focus is restored
  const pathInputRef = useRef<HTMLInputElement>(null);
  const fnInputRef = useRef<HTMLInputElement>(null);
  const rampInputRef = useRef<HTMLInputElement>(null);
  // #117 — mobile nav toggle
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  // #116 — accessibility statement modal
  const [a11yOpen, setA11yOpen] = useState(false);
  // #174 — release notes modal
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
  const [activeSection, setActiveSection] = useActiveSection(navSectionIds);
  // Issue #168 — Feature matrix visibility (reserved for future interactivity)
  const [_featureMatrixOpen, _setFeatureMatrixOpen] = useState(false);
  // Issue #169 — Glossary visibility (reserved for future interactivity)
  const [_glossaryOpen, _setGlossaryOpen] = useState(false);
  // #147 — command history UI toggle
  const [historyOpen, setHistoryOpen] = useState(false);
  // #266 — incremented when the "jump to Audit output" shortcut is pressed
  const [auditOutputFocusRequest, setAuditOutputFocusRequest] = useState(0);
  // #356 — incremented when the "jump to Coverage output" shortcut is pressed
  const [coverageOutputFocusRequest, setCoverageOutputFocusRequest] = useState(0);
  
  // Prevent unused variable warnings
  void _featureMatrixOpen;
  void _setFeatureMatrixOpen;
  void _glossaryOpen;
  void _setGlossaryOpen;

  useEffect(() => {
    document.documentElement.style.scrollPaddingTop = "78px";
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        // "/" focuses the module search field (#127)
        if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement)?.tagName ?? "")) {
          event.preventDefault();
          document.getElementById("module-search")?.focus();
        }
        return;
      }

      // #356 — Ctrl/Cmd + Shift + C selects Coverage and jumps directly to
      // the generated command output. The chord is allowed from fields too,
      // matching the existing Audit shortcut behavior.
      if (event.shiftKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        setCommand("coverage");
        setCoverageOutputFocusRequest((request) => request + 1);
        return;
      }

      // Issue #266 — Ctrl/Cmd + Shift + A jumps straight to the Audit command
      // output panel. The focus effect below documents and applies the full
      // expected behavior. This chord is deliberately allowed while focus is
      // inside a field (e.g. the strict-mode checkbox or multiline editor).
      if (event.shiftKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setCommand("audit");
        setAuditOutputFocusRequest((request) => request + 1);
        return;
      }

      switch (event.key) {
        case "1":
          document.getElementById("top")?.scrollIntoView({ behavior: "smooth" });
          break;
        case "2":
          document.getElementById("install")?.scrollIntoView({ behavior: "smooth" });
          break;
        case "3":
          document.getElementById("modules")?.scrollIntoView({ behavior: "smooth" });
          break;
        case "4":
          document.getElementById("commands")?.scrollIntoView({ behavior: "smooth" });
          break;
        case "5":
          document.getElementById("limits-reference")?.scrollIntoView({ behavior: "smooth" });
          break;
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Reset transient copy feedback in the same event that switches workflows.
  // Avoid cascading state updates from an effect watching command.
  const changeCommand = (next: CommandName) => {
    setCommand(next);
    setCopied(false);
    setCopiedCommentsMode(null);
    setCopiedAsScript(false);
    setAnnouncement("");
  };

  const options = useMemo<CommandOptions>(
    () => ({
      command,
      path,
      format,
      open,
      fn,
      ramp,
      strict,
      shell,
      optionalArgOrder:
        command === "coverage" ? coverageOrder : command === "audit" ? ["strict"] : undefined,
    }),
    [command, path, format, open, fn, ramp, strict, shell, coverageOrder]
  );

  const generated = useMemo(() => buildCommand(options), [options]);
  const generatedRef = useRef(generated);

  useEffect(() => {
    generatedRef.current = generated;
  }, [generated]);

  useEffect(() => {
    try {
      const savedPreference = window.localStorage.getItem(COPY_COMMENTS_PREFERENCE_KEY);
      if (savedPreference === "true" || savedPreference === "false") {
        setIncludeComments(savedPreference === "true");
      }
    } catch {
      setValidationError("Could not load your saved comments preference. Comments will remain enabled for this visit.");
    }
  }, []);


  const toggleAdvancedEditor = () => {
    if (multilineEditor) {
      setMultilineEditor(false);
      return;
    }
    setAdvancedCommand(formatCommandLine(options, true));
    setMultilineEditor(true);
  };
  const summaryRows = useMemo(() => summarizeConfiguration(options), [options]);
  const defaultRows = useMemo(() => effectiveDefaults(options), [options]);
  const appliedDefaults = defaultRows.filter((row) => row.applied).length;
  const configBCommand = useMemo(() => (configB ? buildCommand(configB) : ""), [configB]);
  const comparisonRows = useMemo(
    () => (configB ? compareConfigurations(options, configB) : []),
    [options, configB]
  );

  useEffect(() => {
    if (compareOpen && comparePanelRef.current) {
      comparePanelRef.current.focus();
    }
  }, [compareOpen]);

  const filteredModules = useMemo(() => {
    const q = moduleFilter.trim().toLowerCase();
    return modules.filter((m) => {
      if (categoryFilter && m.category !== categoryFilter) return false;
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q);
    });
  }, [moduleFilter, categoryFilter]);

  const selectedModuleData = useMemo(
    () => (selectedModule ? modules.find((m) => m.name === selectedModule) ?? null : null),
    [selectedModule],
  );

  // Back-to-top visibility after long scrolling (#125)
  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 480);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.getElementById("top")?.focus?.();
  }, []);

  const moveOptionalArg = (key: OptionalArgKey, direction: "up" | "down") => {
    setCoverageOrder((current) => {
      const index = current.indexOf(key);
      if (index < 0) return current;
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const resetBuilder = () => {
    if (!window.confirm("Reset the command builder to its default values?")) return;
    changeCommand("coverage");
    setPath(".");
    setFormat("html");
    setOpen(true);
    setFn("batch_payout");
    setRamp("recipients");
    setStrict(true);
    setShell("bash");
    setCoverageOrder(defaultCoverageOrder);
    setMultilineEditor(false);
  };

  // Issue #141: Reset to defaults for active workflow only
  const resetToDefaults = () => {
    if (!window.confirm(`Reset ${command} workflow to its default values?`)) return;
    
    if (command === "coverage") {
      setPath(".");
      setFormat("html");
      setOpen(true);
      setCoverageOrder(defaultCoverageOrder);
    } else if (command === "limits") {
      setPath("");
      setFn("batch_payout");
      setRamp("recipients");
    } else if (command === "audit") {
      setPath("");
      setStrict(true);
    }
    setShell("bash");
    setMultilineEditor(false);
  };

  // Issue #143: Save current configuration to history
  const saveToHistory = () => {
    setCommandHistory((prev) => {
      const newHistory = [{ ...options }, ...prev];
      // Keep only last 10 commands
      return newHistory.slice(0, 10);
    });
  };

  // Issue #143: Restore previous command from history
  const restorePrevious = () => {
    if (commandHistory.length === 0) return;
    
    const previous = commandHistory[0];
    changeCommand(previous.command);
    setPath(previous.path);
    setFormat(previous.format);
    setOpen(previous.open);
    setFn(previous.fn);
    setRamp(previous.ramp);
    setStrict(previous.strict);
    if (previous.shell) setShell(previous.shell);
    if (previous.optionalArgOrder) setCoverageOrder(previous.optionalArgOrder);
    
    // Remove from history after restoring
    setCommandHistory((prev) => prev.slice(1));
    setAnnouncement("Previous command restored");
  };

  const applyAdvancedCommand = () => {
    const tokens = advancedCommand.match(/"[^"]+"|'[^']+'|[^\s]+/g) ?? [];
    if (tokens.length === 0) return;

    const [tool, selectedCommand, ...args] = tokens;
    if (tool !== "soroban-testkit") return;

    if (selectedCommand === "coverage") changeCommand("coverage");
    if (selectedCommand === "limits") changeCommand("limits");
    if (selectedCommand === "audit") changeCommand("audit");

    const stripQuotes = (value: string) => value.replace(/^["']|["']$/g, "");

    for (let index = 0; index < args.length; index += 1) {
      const token = args[index];
      if (token === "--format" && args[index + 1]) {
        setFormat(args[index + 1] as "html" | "lcov" | "text");
        index += 1;
      } else if (token === "--open") {
        setOpen(true);
      } else if ((token === "--contract" || token === "--path") && args[index + 1]) {
        setPath(stripQuotes(args[index + 1]));
        index += 1;
      } else if (token === "--fn" && args[index + 1]) {
        setFn(stripQuotes(args[index + 1]));
        index += 1;
      } else if (token === "--ramp" && args[index + 1]) {
        setRamp(stripQuotes(args[index + 1]));
        index += 1;
      } else if (token === "--strict") {
        setStrict(true);
      } else if (!token.startsWith("--")) {
        setPath(stripQuotes(token));
      }
    }
  };

  // Issue #34 — when the clipboard is blocked, select the generated command so
  // the user can copy it manually (Ctrl/Cmd+C), including keyboard-only users.
  const selectCommandOutput = () => {
    const node = commandOutputRef.current;
    const selection = typeof window.getSelection === "function" ? window.getSelection() : null;
    if (!node || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
    node.focus();
  };

  const showCopyFailure = () => {
    setValidationError(
      "Could not copy to clipboard. Select the command and press Ctrl/Cmd+C to copy it manually.",
    );
    window.setTimeout(() => setValidationError(""), 3000);
  };

  const copy = async () => {
    const requested = generated;
    try {
      await copyToClipboard(requested);
      if (generatedRef.current !== requested) return;
      saveToHistory(); // Save to history when copying
      setCopied(true);
      setAnnouncement("Command copied to clipboard");
      window.setTimeout(() => {
        setCopied(false);
        setAnnouncement("");
      }, 3000);
    } catch {
      if (generatedRef.current === requested) {
        // Issue #34 — the command stays selectable so it can still be copied.
        selectCommandOutput();
        showCopyFailure();
      }
    }
  };

  // Issue #144: Copy command with explanatory comments
  const copyWithComments = async () => {
    const requested = generated;
    const includeCommentsForCopy = includeComments;
    const commandToCopy = includeCommentsForCopy ? formatCommandWithComments(options) : generated;
    try {
      await copyToClipboard(commandToCopy);
      if (generatedRef.current !== requested) return;
      saveToHistory(); // Save to history when copying
      setCopiedCommentsMode(includeCommentsForCopy ? "with" : "without");
      setAnnouncement(
        includeCommentsForCopy
          ? "Command with comments copied to clipboard"
          : "Command without comments copied to clipboard",
      );
      window.setTimeout(() => {
        setCopiedCommentsMode(null);
        setAnnouncement("");
      }, 3000);
    } catch {
      if (generatedRef.current === requested) showCopyFailure();
    }
  };

  const updateIncludeComments = (checked: boolean) => {
    setIncludeComments(checked);
    try {
      window.localStorage.setItem(COPY_COMMENTS_PREFERENCE_KEY, String(checked));
    } catch {
      setValidationError("Could not save your comments preference. It will reset when you leave.");
    }
  };

  // Issue #145: Copy command as reusable shell script
  const copyAsScript = async () => {
    const requested = generated;
    const script = formatCommandAsScript(options);
    try {
      await copyToClipboard(script);
      if (generatedRef.current !== requested) return;
      saveToHistory(); // Save to history when copying
      setCopiedAsScript(true);
      setAnnouncement("Shell script copied to clipboard");
      window.setTimeout(() => {
        setCopiedAsScript(false);
        setAnnouncement("");
      }, 3000);
    } catch {
      if (generatedRef.current === requested) showCopyFailure();
    }
  };

  const copyStep = async (index: number, stepCommand: string) => {
    try {
      await copyToClipboard(stepCommand);
      setCopiedStep(index);
      setAnnouncement(`Step ${index + 1} command copied to clipboard`);
      window.setTimeout(() => {
        setCopiedStep(null);
        setAnnouncement("");
      }, 3000);
    } catch {
      showCopyFailure();
    }
  };

  const copyModuleExample = async (moduleName: string, exampleCode: string) => {
    try {
      await copyToClipboard(exampleCode);
      setCopiedModuleExample(moduleName);
      setAnnouncement(`${moduleName} module Rust example copied to clipboard`);
      window.setTimeout(() => {
        setCopiedModuleExample(null);
        setAnnouncement("");
      }, 3000);
    } catch {
      showCopyFailure();
    }
  };

  const renderModuleExample = (moduleName: string, filePath: string, code: string) => (
    <>
      <h3>Runnable Rust example</h3>
      <p>
        Put this in a test file of your contract crate (for example <code>{filePath}</code>), with{" "}
        <code>soroban-testkit</code> as a dev-dependency, then run <code>cargo test</code>:
      </p>
      <div className="module-code-block">
        <div className="module-code-header">
          <span>{filePath}</span>
          <button
            type="button"
            className="button secondary"
            aria-label={`Copy ${moduleName} module Rust example`}
            onClick={() => copyModuleExample(moduleName, code)}
          >
            {copiedModuleExample === moduleName ? "Copied" : "Copy example"}
          </button>
        </div>
        <pre tabIndex={0} aria-label={`${moduleName} module runnable Rust example`}>
          <code>{code}</code>
        </pre>
      </div>
    </>
  );

  // #146 — download generated command as shell script
  const downloadCommand = () => {
    const scriptContent = `#!/bin/bash\n\n# Generated by Soroban Testkit Interface\n# ${new Date().toISOString()}\n\n${generated}\n`;
    const blob = new Blob([scriptContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `soroban-testkit-${command}.sh`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setAnnouncement("Command script downloaded");
    window.setTimeout(() => setAnnouncement(""), 1600);
  };

  const toggleComparison = () => {
    if (!compareOpen) {
      setConfigB({ ...options });
    }
    setCompareOpen(!compareOpen);
  };

  const updateConfigB = (updates: Partial<CommandOptions>) => {
    if (configB) {
      setConfigB({ ...configB, ...updates });
    }
  };

  const handleWorkflowKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const lastIndex = workflowTabs.length - 1;
    const nextIndex =
      event.key === "ArrowRight"
        ? (currentIndex + 1) % workflowTabs.length
        : event.key === "ArrowLeft"
          ? (currentIndex - 1 + workflowTabs.length) % workflowTabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? lastIndex
              : currentIndex;

    if (nextIndex !== currentIndex) {
      event.preventDefault();
      const nextTab = workflowTabs[nextIndex];
      setActiveWorkflow(nextTab.id);
      const button = document.getElementById(`workflow-tab-${nextTab.id}`) as HTMLButtonElement | null;
      button?.focus();
    }
  };

  // #101 — move focus to the command section heading when the workflow tab changes
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    commandHeadingRef.current?.focus();
  }, [command]);

  // Issue #266 — Expected behavior: pressing Ctrl/Cmd + Shift + A from anywhere
  // on the page selects the Audit workflow (when another workflow is active),
  // then focuses the "Generated command output" region and scrolls it into view
  // so keyboard and screen-reader users land directly on the Audit command.
  // The jump is announced through the polite live region. This effect is
  // declared after the #101 effect so panel focus wins over the heading focus
  // that a workflow switch also triggers.
  useEffect(() => {
    if (auditOutputFocusRequest === 0) return;
    const panel = auditOutputPanelRef.current;
    if (!panel) return;
    panel.focus();
    if (typeof panel.scrollIntoView === "function") {
      panel.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setAnnouncement("Jumped to the Audit command output panel");
  }, [auditOutputFocusRequest]);

  // #356 — Expected behavior: Ctrl/Cmd+Shift+C switches to Coverage when
  // necessary, then focuses and scrolls the shared generated-output region.
  useEffect(() => {
    if (coverageOutputFocusRequest === 0) return;
    const panel = auditOutputPanelRef.current;
    if (!panel) return;
    panel.focus();
    if (typeof panel.scrollIntoView === "function") {
      panel.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setAnnouncement("Jumped to the Coverage command output panel");
  }, [coverageOutputFocusRequest]);

  // #102, #350 — validate required fields and announce actionable errors.
  const validateAndCopy = async () => {
    if (command === "audit" && !path.trim()) {
      setValidationError(
        "Audit source path is required. Enter the contract source directory (for example, ./src).",
      );
      return;
    }
    if (!path.trim()) {
      setValidationError("Project or contract path is required.");
      return;
    }
    if (command === "limits") {
      if (!fn.trim()) {
        setValidationError("Function name is required.");
        return;
      }
      if (!ramp.trim()) {
        setValidationError("Ramp parameter is required.");
        return;
      }
    }
    setValidationError("");
    await copy();
  };

  const fieldClasses = "field-input";

  return (
    <main>
      <a className="skip-link" href="#top">
        Skip to main content
      </a>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {/* #102 — validation errors announced via assertive live region */}
      <p className="sr-only" aria-live="assertive" role="alert">
        {validationError}
      </p>
      <nav aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="Soroban Testkit home">
          <span className="brand-mark">S</span>
          <span>Soroban Testkit</span>
        </a>
        {/* #117 — accessible mobile nav toggle */}
        <button
          type="button"
          className="mobile-menu-toggle"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-menu"
          aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          <span aria-hidden="true">{mobileMenuOpen ? "✕" : "☰"}</span>
        </button>
        <div className="nav-links" id="mobile-menu" ref={mobileMenuRef} data-open={mobileMenuOpen}>
          {navSections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              aria-current={activeSection === section.id ? "location" : undefined}
              onClick={() => { setActiveSection(section.id); setMobileMenuOpen(false); }}
              onFocus={() => setActiveSection(section.id)}
            >
              {section.label}
            </a>
          ))}
          <a href="https://github.com/soroban-testkit/testkit-blockchain">GitHub ↗</a>
          {/* #116 — accessibility statement link */}
          <button type="button" className="nav-a11y-link" onClick={() => { setA11yOpen(true); setMobileMenuOpen(false); }}>
            Accessibility
          </button>
        </div>
      </nav>

      <section className="hero" id="top" tabIndex={-1}>
        <div>
          <p className="eyebrow">Contract testing, without the repeated scaffolding</p>
          <h1>
            Break the contract
            <br />
            before users do.
          </h1>
          <p className="lede">
            Build precise Soroban tests with deterministic environments, adversarial money inputs, typed event
            assertions, and ledger-time control.
          </p>
          <div className="actions">
            <a className="button primary" href="#commands">
              Build a command
            </a>
            <a className="button secondary" href="#modules">
              Explore modules
            </a>
          </div>
          <p className="repo-callout">
            <a className="repo-link" href={INTERFACE_REPO_URL}>
              View this interface on GitHub <span aria-hidden="true">↗</span>
            </a>
            <span className="repo-callout-note">Open source — report issues or contribute to the interface.</span>
          </p>
        </div>
        <div className="terminal" role="region" aria-label="Example Soroban test">
          <div className="terminal-top">
            <i aria-hidden="true" />
            <i aria-hidden="true" />
            <i aria-hidden="true" />
            <span>escrow_test.rs</span>
          </div>
          <pre>
            <code>
              <span className="muted">use</span> soroban_testkit::prelude::*;{"\n\n"}
              <span className="muted">let</span> env = TestEnv::new();{"\n"}
              <span className="muted">let</span> token = env.token();{"\n"}
              <span className="muted">let</span> buyer = env.address();{"\n\n"}
              token.mint(&buyer, <b>100</b>);{"\n"}
              token.assert_balance(&buyer, <b>100</b>);
            </code>
          </pre>
          <div className="pass" aria-label="test result: ok">✓ test result: ok</div>
        </div>
      </section>

      <section className="install" id="install" aria-labelledby="install-heading" tabIndex={-1}>
        <header>
          <p className="eyebrow">First-time setup</p>
          <h2 id="install-heading">From a clean machine to your first command.</h2>
          <p className="install-intro">
            Six ordered steps install the Testkit CLI and its prerequisites. Every step runs locally and keeps
            contract tests deterministic and offline.
          </p>
        </header>
        <ol className="install-steps">
          {installationSteps.map((step, index) => (
            <li key={step.title} className="install-step">
              <span className="install-step-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
              <div className="install-command">
                <code>{step.command}</code>
                <button
                  type="button"
                  aria-label={`Copy step ${index + 1} command`}
                  onClick={() => copyStep(index, step.command)}
                >
                  {copiedStep === index ? "Copied" : "Copy"}
                </button>
              </div>
            </li>
          ))}
        </ol>
        <aside className="install-guide" aria-labelledby="install-guide-heading">
          <h3 id="install-guide-heading">Full installation instructions</h3>
          <p>
            Need crates.io installs, workspace checkouts, or a clean-environment check? The core repository keeps the
            complete, up-to-date installation guide.
          </p>
          <a className="button secondary" href={INSTALL_GUIDE_URL}>
            Read the installation guide <span aria-hidden="true">↗</span>
          </a>
        </aside>
      </section>

      <section className="modules" id="modules" aria-labelledby="modules-heading" tabIndex={-1}>
        {selectedModuleData ? (
          <article className="module-detail">
            {/* #136 — visible page title for deep-linked views */}
            <h1 className="sr-only">{selectedModuleData.name} Module</h1>
            <nav aria-label="Breadcrumb navigation">
              <a href="#top">Home</a>
              <span aria-hidden="true">/</span>
              <a href="#modules" onClick={() => setSelectedModule(null)}>Modules</a>
              <span aria-current="page">{selectedModuleData.name}</span>
            </nav>
            <p className="eyebrow">{selectedModuleData.category}</p>
            <h2 id="modules-heading">{selectedModuleData.name}</h2>
            <p>{selectedModuleData.description}</p>
            {selectedModuleData.name === "core" && (
              <>
                {/* Issue #33 — concise API overview for the core module */}
                <div className="module-doc-section">
                  <h3>API overview</h3>
                  <dl className="version-details">
                    {coreApiOverview.map((item) => (
                      <Fragment key={item.symbol}>
                        <dt>
                          <code>{item.symbol}</code>
                        </dt>
                        <dd>{item.summary}</dd>
                      </Fragment>
                    ))}
                  </dl>
                </div>
                <div className="module-version-info">
                  <h3>Version and compatibility</h3>
                  <dl className="version-details">
                    <dt>Current version</dt>
                    <dd>soroban-testkit core API with Soroban SDK 27.0.x and later</dd>

                    <dt>Minimum Rust version</dt>
                    <dd>Rust 1.84 or later with the wasm32v1-none target</dd>

                    <dt>Environment support</dt>
                    <dd>
                      <code>TestEnv</code> wraps <code>soroban_sdk::Env</code>; use <code>env.env()</code> for SDK
                      calls the core module does not expose directly.
                    </dd>

                    <dt>Network support</dt>
                    <dd>
                      Tests run locally without RPC. Testnet and Mainnet behavior is represented by in-memory
                      ledger state.
                    </dd>
                  </dl>
                  <h3>Known considerations</h3>
                  <ul>
                    <li>
                      <strong>Deterministic seeds:</strong> Use <code>TestEnv::with_seed(n)</code> when generated
                      addresses must repeat across runs.
                    </li>
                    <li>
                      <strong>Error classification:</strong> Match on <code>TestkitError::code()</code> rather than
                      panic message text.
                    </li>
                    <li>
                      <strong>State resets:</strong> Recreate addresses, clients, and <code>Env</code> handles after
                      <code>reset()</code>.
                    </li>
                  </ul>
                </div>
                <div className="module-doc-section">
                  <h3>Troubleshooting FAQ</h3>
                  <div className="core-faq-list">
                    {coreTroubleshootingFaq.map((item) => {
                      const isOpen = openCoreFaqIds[item.id] ?? false;
                      return (
                        <div key={item.id} className="guide-card">
                          <div className="guide-header">
                            <button
                              type="button"
                              className="guide-toggle"
                              aria-expanded={isOpen}
                              aria-controls={`core-faq-panel-${item.id}`}
                              onClick={() =>
                                setOpenCoreFaqIds((prev) => ({ ...prev, [item.id]: !isOpen }))
                              }
                            >
                              {item.question}
                            </button>
                          </div>
                          {isOpen && (
                            <div id={`core-faq-panel-${item.id}`} className="guide-panel">
                              <p><strong>Cause:</strong> {item.cause}</p>
                              <p><strong>Solution:</strong> {item.solution}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
            {/* Issue #51: Version and compatibility notes for the ledger module */}
            {selectedModuleData.name === "ledger" && (
              <div className="module-version-info">
                <h3>Version and compatibility</h3>
                <dl className="version-details">
                  <dt>Current version</dt>
                  <dd>Soroban SDK 27.0.x and later</dd>

                  <dt>Minimum Rust version</dt>
                  <dd>Rust 1.84 or later with wasm32v1-none target</dd>

                  <dt>Stellar network support</dt>
                  <dd>Compatible with Testnet and Mainnet ledger sequence and timestamp semantics.</dd>

                  <dt>Clock &amp; sequence control</dt>
                  <dd>
                    Uses in-memory mock ledger state via <code>env.ledger()</code> with deterministic timestamp and
                    sequence warping.
                  </dd>
                </dl>
                <h3>Known considerations</h3>
                <ul>
                  <li>
                    <strong>Monotonic progression:</strong> Advance ledger sequences and timestamps forward; warping
                    backward can invalidate TTL or time-lock assumptions.
                  </li>
                  <li>
                    <strong>Offline deterministic state:</strong> All ledger time and sequence changes run in-memory
                    with zero network RPC calls.
                  </li>
                  <li>
                    <strong>TTL interaction:</strong> Advancing the ledger sequence also ages persistent and temporary
                    storage entries—pair with <code>ttl</code> checks when testing expiration.
                  </li>
                </ul>
              </div>
            )}
            {/* Issue #82: Version and compatibility notes for the ttl module */}
            {selectedModuleData.name === "ttl" && (
              <div className="module-version-info">
                <h3>API overview</h3>
                <dl className="version-details">
                  <dt><code>ttl_of(&env, storage_kind, key)</code></dt>
                  <dd>Reads the current TTL (in ledger entries) for a storage entry. Returns the remaining lifetime before expiry.</dd>

                  <dt><code>assert_bumps_ttl(&env, storage_kind, key, closure)</code></dt>
                  <dd>Asserts that the closure extends the TTL for the given entry. Fails if the TTL does not increase.</dd>

                  <dt><code>assert_survives_expiry(storage_kind, closure)</code></dt>
                  <dd>Asserts that the closure handles expired data gracefully (no panics or unwraps on missing values).</dd>

                  <dt><code>expire_all()</code></dt>
                  <dd>Advances the ledger past <code>max_entry_ttl</code>, expiring all storage entries of all kinds.</dd>
                </dl>
                <p><strong>Storage kinds:</strong> Use <code>StorageKind::Persistent</code> for long-lived state (~6 months), <code>StorageKind::Temporary</code> for short-lived state (~100 days), or <code>StorageKind::Instance</code> for per-contract TTLs.</p>

                <h3>Quick example</h3>
                <pre><code>{`env.assert_bumps_ttl(&contract_id, StorageKind::Persistent, symbol_short!("key"), || {
    client.touch(&symbol_short!("key"));
});`}</code></pre>

                <h3>Common failure modes</h3>
                <ul>
                  <li><strong><code>ttl_of</code> panics or returns None:</strong> The entry does not exist or has already expired. Write it first, and read the TTL before calling <code>expire_all()</code> or advancing the ledger too far.</li>
                  <li><strong>Expected TTL to extend but it didn't:</strong> The closure did not call a function that extends the TTL. Verify that your contract client is calling the right method.</li>
                  <li><strong>Contract panics on expired data:</strong> The contract read an expired entry with <code>.unwrap()</code>. Use <code>unwrap_or()</code>, <code>has()</code>, or <code>Option</code> patterns instead.</li>
                  <li><strong>Different TTLs for Persistent vs. Temporary:</strong> Temporary storage expires much faster (~100 days vs. ~6 months). Use the correct <code>StorageKind</code> in your test.</li>
                  <li><strong>Instance storage ignores the key:</strong> Instance storage has one TTL per contract. Use <code>StorageKind::Persistent</code> or <code>Temporary</code> for per-key lifetimes.</li>
                </ul>

                <h3>Version and compatibility</h3>
                <dl className="version-details">
                  <dt>Current version</dt>
                  <dd>Soroban SDK 27.0.x and later</dd>

                  <dt>Minimum Rust version</dt>
                  <dd>Rust 1.84 or later with wasm32v1-none target</dd>

                  <dt>Stellar network support</dt>
                  <dd>Compatible with Testnet and Mainnet. TTL values are determined by the Soroban ledger context.</dd>

                  <dt>Ledger compatibility</dt>
                  <dd>Requires Soroban ledger functionality enabled. Use <code>env.ledger()</code> to access current ledger sequence and TTL calculations.</dd>
                </dl>
                <h3>Known considerations</h3>
                <ul>
                  <li><strong>Ledger sequence requirements:</strong> Ensure your test environment has a properly initialized ledger state. TTL calculations depend on accurate sequence numbers.</li>
                  <li><strong>Storage extension cost:</strong> Calling <code>env.storage().instance().extend_ttl()</code> consumes ledger resources. Plan for this in resource-sensitive contracts.</li>
                  <li><strong>Deterministic testing:</strong> TTL values in tests are deterministic. Use <code>env.ledger().sequence()</code> to control ledger time explicitly.</li>
                  <li><strong>Persistent vs. temporary:</strong> Different storage types (persistent vs. temporary) have different TTL semantics. Test both using the testkit module.</li>
                </ul>
              </div>
            )}
            {selectedModuleData.name === "events" && (
              <>
                <div className="module-doc-section">
                  <h3>API overview</h3>
                  <dl className="version-details">
                    {eventsApiOverview.map((item) => (
                      <Fragment key={item.symbol}>
                        <dt>
                          <code>{item.symbol}</code>
                        </dt>
                        <dd>{item.summary}</dd>
                      </Fragment>
                    ))}
                  </dl>
                  {renderModuleExample("events", "tests/events.rs", eventsExampleCode)}
                  <h3>Common failure modes</h3>
                  <ul>
                    {eventsFailureModes.map((mode) => (
                      <li key={mode.title}>
                        <strong>{mode.title}:</strong> {mode.detail}
                      </li>
                    ))}
                  </ul>
                </div>
                {/* Issue #59: Version and compatibility notes for the events module */}
                <div className="module-version-info">
                  <h3>Version and compatibility</h3>
                  <dl className="version-details">
                    <dt>Current version</dt>
                    <dd>Soroban SDK 27.0.x and later</dd>

                    <dt>Minimum Rust version</dt>
                    <dd>Rust 1.84 or later with wasm32v1-none target</dd>

                    <dt>Stellar network support</dt>
                    <dd>Compatible with Testnet and Mainnet contract event encoding (<code>env.events().publish(...)</code> and XDR <code>ContractEvent</code>).</dd>
                  </dl>
                  <h3>Known considerations</h3>
                  <ul>
                    <li><strong>Scoped to closure:</strong> <code>EventLog::capture(&amp;env, || &#123; ... &#125;)</code> records only events emitted during the closure; setup calls outside are excluded.</li>
                    <li><strong>Cross-contract filtering:</strong> Cross-contract calls emit events under each emitting contract&apos;s address; use <code>log.for_contract(&amp;contract_id)</code> to isolate events.</li>
                    <li><strong>Strict topic and payload typing:</strong> Soroban distinguishes <code>Symbol</code> (<code>symbol_short!</code> / <code>Symbol::new</code>) from <code>String</code> and requires exact XDR numeric widths (<code>i128</code> vs <code>u128</code>).</li>
                  </ul>
                </div>
              </>
            )}
            {selectedModuleData.name === "money" && (
              <>
                <div className="module-doc-section">
                  <h3>API overview</h3>
                  <dl className="version-details">
                    {moneyApiOverview.map((item) => (
                      <Fragment key={item.symbol}>
                        <dt>
                          <code>{item.symbol}</code>
                        </dt>
                        <dd>{item.summary}</dd>
                      </Fragment>
                    ))}
                  </dl>
                  <h3>Quick-start walkthrough</h3>
                  <ol>
                    {moneyQuickStartSteps.map((step) => (
                      <li key={step.title}>
                        <strong>{step.title}:</strong> {step.detail}
                      </li>
                    ))}
                  </ol>
                  {renderModuleExample("money", "tests/money.rs", moneyExampleCode)}
                  <h3>Common failure modes</h3>
                  <ul>
                    {moneyFailureModes.map((mode) => (
                      <li key={mode.title}>
                        <strong>{mode.title}:</strong> {mode.detail}
                      </li>
                    ))}
                  </ul>
                </div>
                {/* Issue #55: Version and compatibility notes for the money module */}
                <div className="module-version-info">
                  <h3>Version and compatibility</h3>
                  <dl className="version-details">
                    <dt>Current version</dt>
                    <dd>Soroban SDK 27.0.x and later</dd>

                    <dt>Minimum Rust version</dt>
                    <dd>Rust 1.84 or later with wasm32v1-none target</dd>

                    <dt>Stellar network support</dt>
                    <dd>Compatible with Testnet and Mainnet <code>i128</code> / <code>u128</code> arithmetic and Stellar Asset Contract (SEP-41) balance semantics.</dd>
                  </dl>
                  <h3>Known considerations</h3>
                  <ul>
                    <li><strong>Signed <code>i128</code> token balances:</strong> Soroban SAC balances use signed <code>i128</code>; adversarial boundary inputs test <code>0</code>, <code>1</code>, <code>i128::MAX</code>, and overflow boundaries.</li>
                    <li><strong>Rounding and dust:</strong> Integer division in fee splits or pro-rata payouts can leave dust; <code>Conservation::new(initial, after).assert_holds()</code> catches leaked or created value.</li>
                    <li><strong>Multi-step workflows:</strong> Use <code>assert_conserved_over</code> for multi-step lifecycles such as escrow releases or vesting claims so invariants hold after every transition.</li>
                  </ul>
                </div>
                {/* Issue #57: Troubleshooting FAQ for the money module */}
                <div className="module-doc-section">
                  <h3>Troubleshooting FAQ</h3>
                  <div className="auth-faq-list">
                    {moneyTroubleshootingFaq.map((item) => {
                      const isOpen = openMoneyFaqIds[item.id] ?? false;
                      return (
                        <div key={item.id} className="guide-card">
                          <div className="guide-header">
                            <button
                              type="button"
                              className="guide-toggle"
                              aria-expanded={isOpen}
                              aria-controls={`money-faq-panel-${item.id}`}
                              onClick={() =>
                                setOpenMoneyFaqIds((prev) => ({ ...prev, [item.id]: !isOpen }))
                              }
                            >
                              {item.question}
                            </button>
                          </div>
                          {isOpen && (
                            <div id={`money-faq-panel-${item.id}`} className="guide-panel">
                              <p>
                                <strong>Cause:</strong> {item.cause}
                              </p>
                              <p>
                                <strong>Solution:</strong> {item.solution}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
            {selectedModuleData.name === "tokens" && (
              <>
                <div className="module-doc-section">
                  <h3>API overview</h3>
                  <dl className="version-details">
                    {tokensApiOverview.map((item) => (
                      <Fragment key={item.symbol}>
                        <dt>
                          <code>{item.symbol}</code>
                        </dt>
                        <dd>{item.summary}</dd>
                      </Fragment>
                    ))}
                  </dl>
                  <h3>Quick-start walkthrough</h3>
                  <ol>
                    {tokensQuickStartSteps.map((step) => (
                      <li key={step.title}>
                        <strong>{step.title}:</strong> {step.detail}
                      </li>
                    ))}
                  </ol>
                  {renderModuleExample("tokens", "tests/tokens.rs", tokensExampleCode)}
                  <h3>Common failure modes</h3>
                  <ul>
                    {tokensFailureModes.map((mode) => (
                      <li key={mode.title}>
                        <strong>{mode.title}:</strong> {mode.detail}
                      </li>
                    ))}
                  </ul>
                </div>
                {/* Issue #64: Version and compatibility notes for the tokens module */}
                <div className="module-version-info">
                  <h3>Version and compatibility</h3>
                  <dl className="version-details">
                    <dt>Current version</dt>
                    <dd>Soroban SDK 27.0.x and later</dd>

                    <dt>Minimum Rust version</dt>
                    <dd>Rust 1.84 or later with wasm32v1-none target</dd>

                    <dt>Token standard support</dt>
                    <dd>Implements the Stellar Asset Contract (SEP-41) token interface (<code>transfer</code>, <code>transfer_from</code>, <code>approve</code>, <code>balance</code>, <code>allowance</code>).</dd>

                    <dt>Stellar network support</dt>
                    <dd>Compatible with Testnet and Mainnet SAC behavior using deterministic <code>i128</code> amounts.</dd>
                  </dl>
                  <h3>Known considerations</h3>
                  <ul>
                    <li><strong>Signed <code>i128</code> amounts:</strong> Token amounts and balances use <code>i128</code>; negative values or arithmetic overflows panic just like the Soroban SAC.</li>
                    <li><strong>Authorization rules:</strong> <code>token.mint</code> uses test admin privileges, while <code>transfer</code> and <code>transfer_from</code> enforce standard SAC authorization.</li>
                    <li><strong>Test isolation:</strong> Each <code>env.token()</code> test double is scoped to its own <code>TestEnv</code> and never shares balances across tests.</li>
                  </ul>
                </div>
              </>
            )}
            {selectedModuleData.name === "auth" && (
              <>
                <div className="module-doc-section">
                  <h3>API overview</h3>
                  <dl className="version-details">
                    {authApiOverview.map((item) => (
                      <Fragment key={item.symbol}>
                        <dt>
                          <code>{item.symbol}</code>
                        </dt>
                        <dd>{item.summary}</dd>
                      </Fragment>
                    ))}
                  </dl>
                </div>
                <div className="module-doc-section">
                  <h3>Quick-start walkthrough</h3>
                  <ol>
                    {authQuickStartSteps.map((step) => (
                      <li key={step.title}>
                        <strong>{step.title}:</strong> {step.detail}
                      </li>
                    ))}
                  </ol>
                  {renderModuleExample("auth", "tests/auth.rs", authExampleCode)}
                </div>
                {/* Issue #68: Version and compatibility notes for the auth module */}
                <div className="module-version-info">
                  <h3>Version and compatibility</h3>
                  <dl className="version-details">
                    <dt>Current version</dt>
                    <dd>Soroban SDK 27.0.x and later</dd>

                    <dt>Minimum Rust version</dt>
                    <dd>Rust 1.84 or later with wasm32v1-none target</dd>

                    <dt>Stellar network support</dt>
                    <dd>Compatible with Testnet and Mainnet authorization semantics (<code>require_auth</code> and <code>require_auth_for_args</code>).</dd>

                    <dt>Mocking compatibility</dt>
                    <dd>Designed for per-call <code>mock_auths</code> and generated <code>try_*</code> client methods that return <code>Result</code>.</dd>
                  </dl>
                  <h3>Known considerations</h3>
                  <ul>
                    <li><strong>Avoid <code>mock_all_auths</code> with <code>AuthMatrix</code>:</strong> Global auth mocking bypasses <code>require_auth</code> checks and masks missing authorization gates.</li>
                    <li><strong>Include an unprivileged caller:</strong> <code>AuthMatrix</code> cross-checks addresses listed as allowed on other entry points; include at least one non-admin address on an open entry point.</li>
                    <li><strong>Use <code>try_*</code> client methods:</strong> Non-<code>try</code> client methods panic on authorization failure instead of returning <code>Err</code>.</li>
                  </ul>
                </div>
                <div className="module-doc-section">
                  <h3>Troubleshooting FAQ</h3>
                  <div className="auth-faq-list">
                    {authTroubleshootingFaq.map((item) => {
                      const isOpen = openAuthFaqIds[item.id] ?? false;
                      return (
                        <div key={item.id} className="guide-card">
                          <div className="guide-header">
                            <button
                              type="button"
                              className="guide-toggle"
                              aria-expanded={isOpen}
                              aria-controls={`auth-faq-panel-${item.id}`}
                              onClick={() =>
                                setOpenAuthFaqIds((prev) => ({ ...prev, [item.id]: !isOpen }))
                              }
                            >
                              {item.question}
                            </button>
                          </div>
                          {isOpen && (
                            <div id={`auth-faq-panel-${item.id}`} className="guide-panel">
                              <p>
                                <strong>Cause:</strong> {item.cause}
                              </p>
                              <p>
                                <strong>Solution:</strong> {item.solution}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
            <button type="button" className="button secondary" onClick={() => setSelectedModule(null)}>
              Back to all modules
            </button>
          </article>
        ) : selectedModule && !selectedModuleData ? (
          /* #137 — not-found page for invalid module routes */
          <article className="module-not-found">
            <h1 className="sr-only">Module Not Found</h1>
            <div className="module-empty-icon" aria-hidden="true">
              !
            </div>
            <h2 id="modules-heading">Module not found</h2>
            <p>
              The module "{selectedModule}" does not exist in the Soroban Testkit library.
              Check the module name or browse the available modules below.
            </p>
            <button
              type="button"
              className="button primary"
              onClick={() => setSelectedModule(null)}
            >
              View all modules
            </button>
          </article>
        ) : (
          <>
            <header>
              <p className="eyebrow">One prelude. Seven focused modules.</p>
              <h2 id="modules-heading">Everything a serious contract test needs.</h2>
              <div className="module-filter-bar">
                <label htmlFor="module-search" className="sr-only">
                  Filter modules
                </label>
                <input
                  id="module-search"
                  ref={moduleSearchRef}
                  type="search"
                  className="module-filter-input"
                  placeholder="Search modules by name or description… (press /)"
                  value={moduleFilter}
                  onChange={(event) => setModuleFilter(event.target.value)}
                  aria-label="Search modules by name or description"
                />
                {moduleFilter && (
                  <button
                    type="button"
                    className="module-filter-clear"
                    onClick={() => setModuleFilter("")}
                    aria-label="Clear module search"
                  >
                    Clear
                  </button>
                )}
              </div>
              {/* Table of contents remains a real, labelled collapsible navigation list. */}
              <button
                type="button"
                className="module-card-disclosure"
                aria-expanded={moduleTocOpen}
                aria-controls="module-toc-list"
                onClick={() => setModuleTocOpen((prev) => !prev)}
              >
                {moduleTocOpen ? "Hide" : "Show"} table of contents
              </button>
              <nav aria-label="Module table of contents" hidden={!moduleTocOpen}>
                <ul id="module-toc-list">
                  {modules.map((mod) => (
                    <li key={mod.name}>
                      <button
                        type="button"
                        className="module-card-disclosure"
                        onClick={() => setSelectedModule(mod.name)}
                      >
                        {mod.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
              <div className="category-filter-bar" role="group" aria-label="Filter modules by category">
                <button
                  type="button"
                  className={`category-chip ${categoryFilter === null ? "active" : ""}`}
                  onClick={() => setCategoryFilter(null)}
                  aria-pressed={categoryFilter === null}
                >
                  All
                </button>
                {moduleCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`category-chip ${categoryFilter === cat ? "active" : ""}`}
                    onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
                    aria-pressed={categoryFilter === cat}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </header>

            {filteredModules.length > 0 ? (
              <div className="module-grid" id="module-grid">
                {filteredModules.map((mod, index) => (
                  <article key={mod.name} className="module-card" aria-labelledby={`module-heading-${mod.name}`}>
                    <button
                      type="button"
                      className="module-card-select"
                      aria-label={`View details for ${mod.name} module`}
                      onClick={() => setSelectedModule(mod.name)}
                    >
                      <span aria-hidden="true">0{index + 1}</span>
                      <h3 id={`module-heading-${mod.name}`}>{mod.name}</h3>
                      <p>{mod.description}</p>
                      <span className="module-category-tag">{mod.category}</span>
                    </button>
                    {/* #337: disclose extra information without changing the existing detail navigation. */}
                    <button
                      type="button"
                      className="module-card-disclosure"
                      aria-expanded={expandedModuleCards[mod.name] ?? false}
                      aria-controls={`module-details-${mod.name}`}
                      onClick={() =>
                        setExpandedModuleCards((prev) => ({ ...prev, [mod.name]: !(prev[mod.name] ?? false) }))
                      }
                    >
                      {expandedModuleCards[mod.name] ? "Hide" : "Show"} {mod.name} module summary
                    </button>
                    <div
                      id={`module-details-${mod.name}`}
                      className="module-card-details"
                      hidden={!(expandedModuleCards[mod.name] ?? false)}
                    >
                      <p>Testing concerns:</p>
                      <ul>
                        {moduleFeatureMatrix[mod.name].map((concern) => (
                          <li key={concern}>{concern}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="module-card-links" role="group" aria-label={`Workflows for ${mod.name} module`}>
                      <h4 className="sr-only">Available workflows</h4>
                      <a href="#commands" aria-label={`Open the command builder from the ${mod.name} module`}>
                        Command builder
                      </a>
                      {moduleRelatedWorkflows[mod.name].map((workflow) => (
                        <a
                          key={workflow}
                          href="#commands"
                          aria-label={`Open the ${workflow} workflow related to ${mod.name}`}
                          onClick={() => changeCommand(workflow)}
                        >
                          {workflow}
                        </a>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="module-empty-state" role="status" aria-live="polite" aria-labelledby="module-empty-heading">
                <div className="module-empty-icon" aria-hidden="true">
                  ∅
                </div>
                <h3 id="module-empty-heading">{moduleFilter ? `No modules match “${moduleFilter}”` : "No modules match your filters"}</h3>
                <p>
                  {categoryFilter
                    ? `No testing modules in the ${categoryFilter} category match this search.`
                    : "No testing modules match this search."}
                  {" "}Try adjusting your filters.
                </p>
                <button
                  type="button"
                  className="button secondary"
                  onClick={resetModuleFilter}
                >
                  Reset filters
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Issue #168 — Feature Matrix */}
      <section className="feature-matrix" aria-labelledby="feature-matrix-heading">
        <header>
          <p className="eyebrow">Coverage at a glance</p>
          <h2 id="feature-matrix-heading">Which modules cover each test concern?</h2>
          <p>
            This matrix shows which testing modules address common contract testing needs. Use it to identify
            the right module for your test scenario.
          </p>
        </header>
        <div className="matrix-table-wrap" role="region" aria-label="Module feature matrix" tabIndex={0}>
          <table className="feature-matrix-table" aria-label="Test concerns covered by each module">
            <thead>
              <tr>
                <th scope="col">Module</th>
                {testConcerns.map((concern) => (
                  <th key={concern} scope="col">{concern}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map((mod) => (
                <tr key={mod.name}>
                  <th scope="row">{mod.name}</th>
                  {testConcerns.map((concern) => {
                    const hasFeature = moduleFeatureMatrix[mod.name].includes(concern);
                    return (
                      <td key={concern} aria-label={hasFeature ? `${mod.name} supports ${concern}` : `${mod.name} does not support ${concern}`}>
                        {hasFeature ? <span className="feature-check" aria-hidden="true">✓</span> : <span className="feature-empty" aria-hidden="true">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Issue #169 — Glossary */}
      <section className="glossary" aria-labelledby="glossary-heading">
        <header>
          <p className="eyebrow">Learn the vocabulary</p>
          <h2 id="glossary-heading">Testkit module terminology</h2>
          <p>
            Key terms and concepts used across Testkit modules. Each term links to its related testing modules
            for deeper exploration.
          </p>
        </header>
        <dl className="glossary-list">
          {glossary.map((item) => (
            <div key={item.term} className="glossary-item">
              <dt id={`term-${item.term.toLowerCase().replace(/\s+/g, "-")}`}>{item.term}</dt>
              <dd>
                {item.definition}
                {item.relatedModules && item.relatedModules.length > 0 && (
                  <span className="glossary-modules">
                    {" "}Related modules: {item.relatedModules.map((modName, index) => (
                      <span key={modName}>
                        <a href="#modules" onClick={() => setSelectedModule(modName)}>{modName}</a>
                        {index < item.relatedModules!.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="docs" aria-label="Soroban workflow documentation">
        <div className="docs-header">
          <p className="eyebrow">Prerequisites & tutorials</p>
          <h2>Supported Rust and Soroban prerequisites</h2>
        </div>

        <div className="requirements">
          <ul>
            <li>
              <strong>Rust:</strong> Rust &gt;= 1.84 with the <code>wasm32v1-none</code> target installed.
            </li>
            <li>
              <strong>Soroban SDK:</strong> soroban-sdk 27.0.x for current contract builds and tests.
            </li>
            <li>
              <strong>Stellar CLI:</strong> stellar-cli &gt;= 22.0.0 when you need local contract deploy or
              inspect flows.
            </li>
            <li>
              <strong>Build environment:</strong> Cargo workspace with a stable contract crate and optional
              `cargo llvm-cov` for coverage reports.
            </li>
          </ul>
        </div>

        <div className="workflow-tabs" role="tablist" aria-label="Soroban workflow docs">
          {workflowTabs.map((tab, index) => (
            <button
              key={tab.id}
              id={`workflow-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={activeWorkflow === tab.id}
              aria-controls={`workflow-panel-${tab.id}`}
              tabIndex={activeWorkflow === tab.id ? 0 : -1}
              className={activeWorkflow === tab.id ? "active" : ""}
              onClick={() => setActiveWorkflow(tab.id)}
              onKeyDown={(event) => handleWorkflowKeyDown(event, index)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {workflowTabs.map((tab) => (
          <div
            key={tab.id}
            id={`workflow-panel-${tab.id}`}
            role="tabpanel"
            aria-labelledby={`workflow-tab-${tab.id}`}
            hidden={activeWorkflow !== tab.id}
            className="workflow-panel"
          >
            {tab.id === "coverage" && (
              <>
                <h3>Coverage workflow</h3>
                <p>
                  Start in the contract workspace, install the LLVM coverage tooling, and run every relevant
                  Rust test before exporting HTML or LCOV reports.
                </p>
                <pre>
                  <code>
                    cargo llvm-cov --workspace --all-features --html{"\n"}
                    cargo llvm-cov --workspace --lcov --output-path lcov.info
                  </code>
                </pre>
                {/* Issue #80 — Ready-to-run examples for coverage workflow */}
                <div className="coverage-examples" aria-labelledby="coverage-examples-heading">
                  <h4 id="coverage-examples-heading">Ready-to-run examples</h4>
                  <div className="example-grid">
                    {coverageExamples.map((example, index) => (
                      <div key={index} className="example-card">
                        <h5>{example.title}</h5>
                        <p>{example.description}</p>
                        <pre><code>{example.command}</code></pre>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
            {tab.id === "workspace" && (
              <>
                <h3>Cargo workspace layout</h3>
                <p>Keep each Soroban contract crate in a single workspace with shared dependencies and explicit workspace members.</p>
                <pre>
                  <code>
                    [workspace]{"\n"}
                    members = [{"\n"}
                    {"  "}"contracts/asset",{"\n"}
                    {"  "}"contracts/escrow",{"\n"}
                    {"  "}"contracts/auction",{"\n"}
                    ]{"\n"}
                    resolver = "2"
                  </code>
                </pre>
              </>
            )}
            {tab.id === "limits" && (
              <>
                <h3>Resource limits workflow</h3>
                <p>
                  Compile once, then sweep the function and ramp argument to find the practical limit for
                  batch_payout or any other entrypoint.
                </p>
                <pre>
                  <code>
                    soroban-testkit limits \{"\n"}
                    {"  "}--contract target/wasm32v1-none/release/contract.wasm \{"\n"}
                    {"  "}--fn batch_payout \{"\n"}
                    {"  "}--ramp recipients
                  </code>
                </pre>
                {/* Issue #170 — Valid function and ramp examples */}
                <div className="parameter-examples" aria-labelledby="parameter-examples-heading">
                  <h4 id="parameter-examples-heading">Valid function and ramp parameter examples</h4>
                  <div className="example-grid">
                    <div className="example-card">
                      <h5>Function examples</h5>
                      <ul>
                        <li><code>batch_payout</code> — Multi-recipient payment distribution</li>
                        <li><code>transfer</code> — Single token transfer operation</li>
                        <li><code>execute_equal</code> — Equal distribution to recipients</li>
                        <li><code>swap</code> — Token exchange operation</li>
                        <li><code>mint</code> — Token creation function</li>
                      </ul>
                      <p className="example-note">Use the exported symbol name from your contract ABI.</p>
                    </div>
                    <div className="example-card">
                      <h5>Ramp parameter examples</h5>
                      <ul>
                        <li><code>recipients</code> — Number of payment recipients</li>
                        <li><code>amount</code> — Transaction amount value</li>
                        <li><code>iterations</code> — Loop iteration count</li>
                        <li><code>accounts</code> — Number of accounts involved</li>
                        <li><code>entries</code> — Storage or data entries</li>
                      </ul>
                      <p className="example-note">Must match a parameter name in the function signature.</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </section>

      {/* Issue #171 — Offline execution boundary documentation */}
      <section className="offline-boundary" aria-labelledby="offline-boundary-heading">
        <header>
          <p className="eyebrow">Zero network dependency</p>
          <h2 id="offline-boundary-heading">Offline execution boundary</h2>
          <p>
            The Soroban Testkit Interface generates commands that run completely offline. No contract bytecode,
            source files, or test data ever leave your machine.
          </p>
        </header>
        <div className="boundary-grid">
          <article className="boundary-card">
            <h3>What stays local</h3>
            <ul>
              <li><strong>Contract source code:</strong> Never transmitted remotely during audit scans</li>
              <li><strong>Compiled WASM:</strong> Probed locally without deployment to test networks</li>
              <li><strong>Test state:</strong> Deterministic environments run in isolated processes</li>
              <li><strong>Coverage data:</strong> Generated and stored entirely on your filesystem</li>
              <li><strong>Configuration:</strong> All command parameters remain in your terminal session</li>
            </ul>
          </article>
          <article className="boundary-card">
            <h3>Execution guarantees</h3>
            <dl className="boundary-list">
              <dt><code>coverage</code></dt>
              <dd>Runs local test suites through cargo-llvm-cov. Writes HTML/LCOV reports to disk.</dd>
              
              <dt><code>limits</code></dt>
              <dd>Executes WASM in child processes with mocked ledger state. Zero network RPC calls.</dd>
              
              <dt><code>audit</code></dt>
              <dd>Parses Rust AST from local files. Read-only analysis with no external telemetry.</dd>
            </dl>
          </article>
          <article className="boundary-card boundary-note">
            <h3>Why offline matters</h3>
            <p>
              Deterministic testing requires reproducible environments. Network dependencies introduce
              variability, latency, and state synchronization issues that break test reliability.
            </p>
            <p>
              By keeping execution local, Testkit ensures your contract tests produce identical results
              regardless of network conditions, third-party service availability, or ledger state changes.
            </p>
            <p className="boundary-highlight">
              <strong>Security benefit:</strong> Proprietary contract logic and business rules remain
              confidential during development and testing phases.
            </p>
          </article>
        </div>
      </section>

      <section className="commands" id="commands" tabIndex={-1}>
        <div className="command-copy">
          <p className="eyebrow">CLI workbench</p>
          {/* #101 — heading receives focus after workflow tab switch */}
          <h2 ref={commandHeadingRef} tabIndex={-1}>From intent to command.</h2>
          <p>Configure a supported Testkit workflow and copy the exact command to your terminal.</p>
          <div className="command-tabs" role="group" aria-label="Command workflow selector">
            {(["coverage", "limits", "audit"] as const).map((name) => (
              <button
                key={name}
                className={command === name ? "active" : ""}
                onClick={() => changeCommand(name)}
                aria-pressed={command === name}
              >
                {name}
              </button>
            ))}
          </div>
          <p className="description">{descriptions[command]}</p>
          <div className="command-actions">
            <button type="button" className="button secondary" onClick={resetBuilder}>
              Reset builder
            </button>
            {/* Issue #141: Reset to defaults for active workflow */}
            <button 
              type="button" 
              className="button secondary" 
              onClick={resetToDefaults}
              aria-label={`Reset ${command} workflow to defaults`}
            >
              Reset {command} to defaults
            </button>
            {/* Issue #143: Restore previous command */}
            <button 
              type="button" 
              className="button secondary" 
              onClick={restorePrevious}
              disabled={commandHistory.length === 0}
              aria-label="Restore previous command"
              title={commandHistory.length === 0 ? "No previous commands" : `Restore previous ${commandHistory[0]?.command || ''} command`}
            >
              Restore previous ({commandHistory.length})
            </button>
          </div>

          <section
            className="summary-card"
            aria-labelledby="command-summary-heading"
            tabIndex={0}
            role="region"
            aria-label="Active command configuration summary"
          >
            <h3 id="command-summary-heading">Command summary</h3>
            <div
              className="sr-only"
              aria-live="polite"
              aria-atomic="true"
              data-testid="active-command-sr-summary"
            >
              Active {command} command settings: {summaryRows.map((row) => `${row.label} is ${row.value}`).join(", ")}.
            </div>
            <p className="summary-workflow">{command}</p>
            <dl className="summary-settings">
              {summaryRows.map((row) => (
                <div className="summary-row" key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
            <p className="summary-note">
              Updates live from the builder. Values marked (default) apply when a field is left empty.
            </p>
          </section>

          <button
            type="button"
            className="comparison-toggle"
            aria-expanded={compareOpen}
            aria-controls="comparison-panel"
            onClick={toggleComparison}
          >
            Compare two configurations
          </button>
        </div>
        <div className="builder">
          <label>
            <div className="field-header">
              <span>Project or contract path</span>
              <span className="badge badge-required">Required</span>
            </div>
            {/* #100 — inline help text associated with the field */}
            <div id="path-help" className="field-help">
              Path to the contract workspace or source directory, such as . or ./contracts/token.
            </div>
            <div className="field-with-clear">
              <input
                className={fieldClasses}
                ref={pathInputRef}
                value={path}
                onChange={(event) => { setPath(event.target.value); if (event.target.value.trim()) setValidationError(""); }}
                aria-label="Project or contract path"
                aria-required="true"
                aria-describedby="path-help"
              />
              {path && (
                <button
                  type="button"
                  className="clear-field-button"
                  onClick={() => { setPath(""); pathInputRef.current?.focus(); }}
                  aria-label="Clear project or contract path"
                >
                  Clear
                </button>
              )}
            </div>
          </label>
          {command === "coverage" && (
            <>
              <div className="field-group">
                <div className="field-header">
                  <span>Optional arguments</span>
                  <span className="badge badge-optional">Reorder</span>
                </div>
                <div className="argument-order-list" aria-label="Optional argument order">
                  {optionalArgumentRows.map((arg) => {
                    const selected = coverageOrder.includes(arg.key);
                    const currentIndex = coverageOrder.indexOf(arg.key);
                    const lastIndex = optionalArgumentRows.length - 1;
                    return (
                      <div key={arg.key} className="argument-order-row">
                        <span className="argument-order-name">{arg.label}</span>
                        <span className="argument-order-summary">{arg.summary}</span>
                        <div className="argument-order-controls">
                          <button
                            type="button"
                            onClick={() => moveOptionalArg(arg.key, "up")}
                            disabled={currentIndex <= 0 || !selected}
                            aria-label={`Move ${arg.label} up`}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveOptionalArg(arg.key, "down")}
                            disabled={currentIndex === -1 || currentIndex >= lastIndex}
                            aria-label={`Move ${arg.label} down`}
                          >
                            ↓
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* #324: native report-format radio group with explicit roles and labels. */}
              <fieldset className="format-fieldset">
                <legend id="coverage-format-legend">
                  Report format <span aria-hidden="true" className="badge badge-optional">Optional</span>
                </legend>
                <div id="format-help" className="field-help">
                  html opens in a browser; lcov feeds into CI coverage tools; text prints to stdout.
                </div>
                <div className="format-radio-group" role="radiogroup" aria-labelledby="coverage-format-legend" aria-describedby="format-help">
                  {(["html", "lcov", "text"] as const).map((value) => (
                    <label key={value} className="format-radio-option">
                      <input
                        type="radio"
                        name="coverage-report-format"
                        value={value}
                        checked={format === value}
                        onChange={() => setFormat(value)}
                        aria-describedby="format-help"
                      />
                      <span>{value}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="check">
                <span className="check-content">
                  {/* #100 — inline help text for open checkbox */}
                  <input
                    type="checkbox"
                    checked={format === "html" && open}
                    disabled={format !== "html"}
                    onChange={(event) => setOpen(event.target.checked)}
                    aria-describedby="open-help"
                  />
                  <span>Open report when complete</span>
                </span>
                <span className="badge badge-optional">Optional</span>
                <div id="open-help" className="field-help">
                  Available for HTML reports only. Opens the report in your default browser after generation.
                </div>
              </label>
            </>
          )}
          {command === "limits" && (
            <div className="row">
              <label>
                <div className="field-header">
                  <span>Function</span>
                  <span className="badge badge-required">Required</span>
                </div>
                <div id="fn-help" className="field-help">
                  Use the exported symbol name from your contract ABI, such as batch_payout.
                </div>
                <div className="field-with-clear">
                  <input
                    className={fieldClasses}
                    ref={fnInputRef}
                    value={fn}
                    onChange={(event) => { setFn(event.target.value); if (event.target.value.trim()) setValidationError(""); }}
                    aria-label="Function"
                    aria-required="true"
                    aria-describedby="fn-help"
                  />
                  {fn && (
                    <button
                      type="button"
                      className="clear-field-button"
                      onClick={() => { setFn(""); fnInputRef.current?.focus(); }}
                      aria-label="Clear function"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </label>
              <label>
                <div className="field-header">
                  <span>Ramp parameter</span>
                  <span className="badge badge-required">Required</span>
                </div>
                <div id="ramp-help" className="field-help">
                  Use the parameter you want to increase in the contract input set; recipients is the default.
                </div>
                <div className="field-with-clear">
                  <input
                    className={fieldClasses}
                    ref={rampInputRef}
                    value={ramp}
                    onChange={(event) => { setRamp(event.target.value); if (event.target.value.trim()) setValidationError(""); }}
                    aria-label="Ramp parameter"
                    aria-required="true"
                    aria-describedby="ramp-help"
                  />
                  {ramp && (
                    <button
                      type="button"
                      className="clear-field-button"
                      onClick={() => { setRamp(""); rampInputRef.current?.focus(); }}
                      aria-label="Clear ramp parameter"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </label>
            </div>
          )}
          {command === "audit" && (
            <label className="check">
              <span className="check-content">
                {/* #100 — inline help text for strict checkbox */}
                <input type="checkbox" checked={strict} onChange={(event) => setStrict(event.target.checked)} aria-label="Fail on warnings (Audit strict mode)" aria-describedby="strict-help" />
                <span>Fail on warnings</span>
              </span>
              <span className="badge badge-optional">Optional</span>
              <div id="strict-help" className="field-help">
                When enabled, the audit command exits with a non-zero status if any warnings are found.
              </div>
            </label>
          )}

          <label>
            <div className="field-header">
              <span>Shell target</span>
              <span className="badge badge-optional">Optional</span>
            </div>
            {/* #100 — inline help text for shell select */}
            <div id="shell-help" className="field-help">
              Adjusts quoting and syntax so the generated command is valid for your shell.
            </div>
            <select value={shell} onChange={(event) => setShell(event.target.value as typeof shell)} aria-describedby="shell-help">
              <option value="bash">Bash</option>
              <option value="zsh">Zsh</option>
              <option value="fish">Fish</option>
              <option value="sh">POSIX sh</option>
            </select>
          </label>

          <section className="defaults-preview" aria-labelledby="defaults-preview-heading">
            <div className="defaults-preview-header">
              <h3 id="defaults-preview-heading">Effective defaults</h3>
              {defaultRows.length > 0 && (
                <span className="defaults-count">
                  {appliedDefaults} of {defaultRows.length} applied
                </span>
              )}
            </div>
            {defaultRows.length === 0 ? (
              <p className="defaults-empty">
                This workflow has no empty-field fallbacks. The copied command uses the values you set above,
                exactly.
              </p>
            ) : (
              <dl className="defaults-list">
                {defaultRows.map((row) => (
                  <div className="defaults-row" key={row.key}>
                    <dt>{row.label}</dt>
                    <dd>
                      <code>{row.applied ? `(empty) → ${row.value}` : row.value}</code>
                      <span className={`badge ${row.applied ? "badge-required" : "badge-optional"}`}>
                        {row.applied ? "Default applied" : "From your input"}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <div
            ref={auditOutputPanelRef}
            className="output"
            role="region"
            aria-label="Generated command output"
            aria-describedby="command-output-desc"
            tabIndex={-1}
          >
            <span id="command-output-desc" className="sr-only">
              Copy this command to your terminal to run the selected workflow.
            </span>
            <div
              className="sr-only"
              aria-live="polite"
              data-testid="generated-command-sr-summary"
            >
              Active generated command: {generated}
            </div>
            {/* Issue #34 — focusable so the command stays selectable without the clipboard */}
            <code data-testid="command-output" ref={commandOutputRef} tabIndex={0}>
              {highlightCommand(generated)}
            </code>
            <button onClick={validateAndCopy}>{copied ? "Copied" : "Copy"}</button>
            {/* #146 — download action for generated shell script */}
            <button onClick={downloadCommand} className="button-download" aria-label="Download command as shell script">
              Download
            </button>
          </div>
          </div>

          {/* Issue #144 & #145: Additional copy options */}
          <div className="copy-options">
            <label className="copy-comments-preference">
              <input
                type="checkbox"
                checked={includeComments}
                onChange={(event) => updateIncludeComments(event.currentTarget.checked)}
              />
              Include explanatory comments
            </label>
            <button 
              type="button" 
              className="button secondary" 
              onClick={copyWithComments}
              aria-label={
                copiedCommentsMode === "with"
                  ? "Command with explanatory comments copied"
                  : copiedCommentsMode === "without"
                    ? "Command without explanatory comments copied"
                    : includeComments
                      ? "Copy command with explanatory comments"
                      : "Copy command without explanatory comments"
              }
            >
              {copiedCommentsMode === "with"
                ? "Copied with comments"
                : copiedCommentsMode === "without"
                  ? "Copied without comments"
                  : includeComments
                    ? "Copy with comments"
                    : "Copy without comments"}
            </button>
            <button 
              type="button" 
              className="button secondary" 
              onClick={copyAsScript}
              aria-label="Copy as shell script"
            >
              {copiedAsScript ? "Script copied" : "Copy as script"}
            </button>
          </div>

          {/* #147, #348 — keep Command History discoverable before the first copy. */}
          <section className="command-history" aria-labelledby="command-history-heading">
            <div className="command-history-header">
              <h3 id="command-history-heading">Command history</h3>
              <button
                type="button"
                className="history-toggle"
                aria-expanded={historyOpen}
                aria-controls="command-history-list"
                onClick={() => setHistoryOpen(!historyOpen)}
              >
                {historyOpen ? "Hide" : "Show"} ({commandHistory.length})
              </button>
            </div>
            {historyOpen && (
              <div
                className="command-history-list"
                id="command-history-list"
                role="log"
                aria-live="polite"
              >
                {commandHistory.length === 0 && (
                  <p className="command-history-empty">
                    No commands yet. Copy a generated command to add it to this session history.
                  </p>
                )}
                {commandHistory.slice().reverse().map((entry, index) => {
                  const cmd = buildCommand(entry);
                  return (
                    <div key={index} className="command-history-item">
                      <span className="history-timestamp">
                        Entry {commandHistory.length - index}
                      </span>
                      <code className="history-command">{cmd}</code>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await copyToClipboard(cmd);
                            setAnnouncement(`History command ${commandHistory.length - index} copied`);
                            window.setTimeout(() => setAnnouncement(""), 1600);
                          } catch {
                            showCopyFailure();
                          }
                        }}
                        aria-label={`Copy history command ${commandHistory.length - index}`}
                      >
                        Copy
                      </button>
                    </div>
                  );
                })}
                {commandHistory.length > 0 && (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => {
                      setCommandHistory([]);
                      setAnnouncement("Command history cleared");
                      window.setTimeout(() => setAnnouncement(""), 1600);
                    }}
                  >
                    Clear history
                  </button>
                )}
              </div>
            )}
          </section>

          <div className="advanced-command-block">
            <button type="button" className="button secondary" onClick={toggleAdvancedEditor}>
              {multilineEditor ? "Hide advanced editor" : "Advanced arguments"}
            </button>
            {multilineEditor && (
              <>
                <label>
                  <div className="field-header">
                    <span>Advanced command editor</span>
                    <span className="badge badge-optional">Multiline</span>
                  </div>
                  <textarea
                    value={advancedCommand}
                    rows={8}
                    onChange={(event) => setAdvancedCommand(event.target.value)}
                    aria-label="Advanced command arguments"
                    aria-describedby={command === "audit" ? "audit-editor-count" : undefined}
                  />
                </label>
                {/* #351 — Expected behavior: while the Audit multiline editor is open,
                    show both character and line counts so users can gauge pasted commands
                    without altering the command text itself. */}
                {command === "audit" && (
                  <p className="advanced-editor-count" id="audit-editor-count" aria-live="polite">
                    {advancedCommand.length} characters · {advancedCommand.split("\n").length} lines
                  </p>
                )}
                <button type="button" className="button primary" onClick={applyAdvancedCommand}>
                  Apply multiline command
                </button>
              </>
            )}
          </div>

        {compareOpen && configB && (
          <section
            className="comparison"
            id="comparison-panel"
            ref={comparePanelRef}
            tabIndex={-1}
            aria-labelledby="comparison-heading"
          >
            <div className="comparison-header">
              <h3 id="comparison-heading">Compare two configurations</h3>
              <p>
                Configuration A is the workbench above. Edit configuration B and the table marks every setting
                that differs; both commands update as you type.
              </p>
            </div>

            <fieldset className="comparison-config">
              <legend>Configuration B</legend>
              <div className="row">
                <label>
                  <div className="field-header">
                    <span>Workflow</span>
                  </div>
                  <select
                    value={configB.command}
                    onChange={(event) => updateConfigB({ command: event.target.value as CommandName })}
                  >
                    <option value="coverage">coverage</option>
                    <option value="limits">limits</option>
                    <option value="audit">audit</option>
                  </select>
                </label>
                <label>
                  <div className="field-header">
                    <span>Project or contract path</span>
                    <span className="badge badge-required">Required</span>
                  </div>
                  <input
                    value={configB.path}
                    onChange={(event) => updateConfigB({ path: event.target.value })}
                    aria-required="true"
                  />
                </label>
              </div>
              {configB.command === "coverage" && (
                <div className="row">
                  <label>
                    <div className="field-header">
                      <span>Report format</span>
                      <span className="badge badge-optional">Optional</span>
                    </div>
                    <select
                      value={configB.format}
                      onChange={(event) => updateConfigB({ format: event.target.value as CommandOptions["format"] })}
                    >
                      <option>html</option>
                      <option>lcov</option>
                      <option>text</option>
                    </select>
                  </label>
                  <label className="check">
                    <span className="check-content">
                      <input
                        type="checkbox"
                        checked={configB.format === "html" && configB.open}
                        disabled={configB.format !== "html"}
                        onChange={(event) => updateConfigB({ open: event.target.checked })}
                      />
                      <span>Open report when complete</span>
                    </span>
                    <span className="badge badge-optional">Optional</span>
                  </label>
                </div>
              )}
              {configB.command === "limits" && (
                <div className="row">
                  <label>
                    <div className="field-header">
                      <span>Function</span>
                      <span className="badge badge-required">Required</span>
                    </div>
                    <input
                      value={configB.fn}
                      onChange={(event) => updateConfigB({ fn: event.target.value })}
                      aria-required="true"
                    />
                  </label>
                  <label>
                    <div className="field-header">
                      <span>Ramp parameter</span>
                      <span className="badge badge-required">Required</span>
                    </div>
                    <input
                      value={configB.ramp}
                      onChange={(event) => updateConfigB({ ramp: event.target.value })}
                      aria-required="true"
                    />
                  </label>
                </div>
              )}
              {configB.command === "audit" && (
                <label className="check">
                  <span className="check-content">
                    <input
                      type="checkbox"
                      checked={configB.strict}
                      aria-label="Fail on warnings (configuration B Audit strict mode)"
                      onChange={(event) => updateConfigB({ strict: event.target.checked })}
                    />
                    <span>Fail on warnings</span>
                  </span>
                  <span className="badge badge-optional">Optional</span>
                </label>
              )}
              <label>
                <div className="field-header">
                  <span>Shell target</span>
                  <span className="badge badge-optional">Optional</span>
                </div>
                <select value={configB.shell || "bash"} onChange={(event) => updateConfigB({ shell: event.target.value as typeof shell })}>
                  <option value="bash">Bash</option>
                  <option value="zsh">Zsh</option>
                  <option value="fish">Fish</option>
                  <option value="sh">POSIX sh</option>
                </select>
              </label>
              <button
                type="button"
                className="button secondary comparison-sync"
                onClick={() => setConfigB({ ...options })}
              >
                Match B to A
              </button>
            </fieldset>

            <div className="comparison-table-wrap" role="region" aria-label="Configuration differences" tabIndex={0}>
              <table
                className="comparison-table"
                aria-label="Setting comparison between configuration A and configuration B"
              >
                <thead>
                  <tr>
                    <th scope="col">Setting</th>
                    <th scope="col">Configuration A</th>
                    <th scope="col">Configuration B</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => (
                    <tr key={row.key} data-changed={row.changed}>
                      <th scope="row">{row.label}</th>
                      <td>{row.a}</td>
                      <td>{row.b}</td>
                      <td>
                        {row.changed ? (
                          <span className="badge badge-required">Changed</span>
                        ) : (
                          <span className="comparison-status">Matches</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="comparison-commands">
              <div>
                <h4>Configuration A command</h4>
                <pre className="comparison-command">
                  <code>{highlightCommand(generated)}</code>
                </pre>
              </div>
              <div>
                <h4>Configuration B command</h4>
                <pre className="comparison-command">
                  <code>{highlightCommand(configBCommand)}</code>
                </pre>
              </div>
            </div>
          </section>
        )}
      </section>

      <section className="guides" aria-label="Workflow guides">
        {/* Quick reference section for all three commands */}
        <article className="quick-reference-card">
          <div className="quick-reference-header">
            <h3>Quick Reference — All Commands</h3>
            <button
              type="button"
              className="button secondary"
              onClick={() => window.print()}
              aria-label="Print quick reference"
            >
              Print reference
            </button>
          </div>
          <div className="quick-reference-grid">
            <div className="quick-ref-item">
              <h4>Coverage</h4>
              <p className="quick-ref-desc">Generate contract-test coverage through cargo-llvm-cov</p>
              <pre><code>soroban-testkit coverage [PATH]
  --format [html|lcov|text]
  --open</code></pre>
              <dl className="quick-ref-details">
                <dt>Default path:</dt>
                <dd>. (current directory)</dd>
                <dt>Example:</dt>
                <dd><code>soroban-testkit coverage ./contracts/token --format html --open</code></dd>
                <dt>Example with spaces:</dt>
                <dd><code>soroban-testkit coverage "./my contracts/token" --format html</code></dd>
              </dl>
            </div>
            <div className="quick-ref-item">
              <h4>Limits</h4>
              <p className="quick-ref-desc">Ramp a contract input to find its practical resource ceiling</p>
              <pre><code>soroban-testkit limits
  --contract [WASM_PATH]
  --fn [FUNCTION]
  --ramp [PARAMETER]</code></pre>
              <dl className="quick-ref-details">
                <dt>Defaults:</dt>
                <dd>contract: target/wasm32v1-none/release/contract.wasm<br />fn: batch_payout<br />ramp: recipients</dd>
                <dt>Example:</dt>
                <dd><code>soroban-testkit limits --contract ./build/token.wasm --fn transfer --ramp amount</code></dd>
                <dt>Example with spaces:</dt>
                <dd><code>soroban-testkit limits --contract "./my build/token.wasm" --fn transfer</code></dd>
              </dl>
            </div>
            <div className="quick-ref-item">
              <h4>Audit</h4>
              <p className="quick-ref-desc">Scan contract sources for common auth, arithmetic, and TTL risks</p>
              <pre><code>soroban-testkit audit [PATH]
  --strict</code></pre>
              <dl className="quick-ref-details">
                <dt>Default path:</dt>
                <dd>./src</dd>
                <dt>Example:</dt>
                <dd><code>soroban-testkit audit ./contracts/escrow/src --strict</code></dd>
                <dt>Example with spaces:</dt>
                <dd><code>soroban-testkit audit "./my contracts/src" --strict</code></dd>
              </dl>
            </div>
          </div>
          <div className="quick-reference-note">
            <p><strong>Note on paths with spaces:</strong> Always wrap paths containing spaces in double quotes (e.g., <code>"./my contracts"</code>) to ensure proper command parsing.</p>
          </div>
        </article>

        <article className="guide-card">
          <div className="guide-header">
            <h3>Coverage report guide</h3>
            <div className="guide-header-actions">
              <button
                type="button"
                className="guide-toggle"
                aria-expanded={coverageGuideOpen}
                aria-controls="coverage-guide-panel"
                onClick={() => setCoverageGuideOpen((open) => !open)}
              >
                {coverageGuideOpen ? "Hide guide" : "Show guide"}
              </button>
              <a 
                href="https://github.com/soroban-testkit/testkit-interface/issues/new?title=Coverage%20guide%20feedback&labels=documentation" 
                className="guide-feedback-link"
                aria-label="Provide feedback on Coverage guide"
                target="_blank"
                rel="noopener noreferrer"
              >
                Feedback
              </a>
            </div>
          </div>
          {coverageGuideOpen && (
            <div id="coverage-guide-panel" className="guide-panel">
              <ol>
                <li>Start with the local project path so the tool can read the crate and tests in context.</li>
                <li>
                  Choose HTML output when you want a visual report and open it immediately after generation.
                </li>
                <li>
                  Read branch and line coverage together: low execution density usually explains weak confidence
                  more than raw percentages.
                </li>
                <li>
                  Use the report to prioritize untested edge cases before shipping a contract update.
                </li>
              </ol>
            </div>
          )}
        </article>

        <article className="guide-card">
          <div className="guide-header">
            <h3>Audit workflow tutorial</h3>
            <div className="guide-header-actions">
              <button
                type="button"
                className="guide-toggle"
                aria-expanded={auditGuideOpen}
                aria-controls="audit-guide-panel"
                onClick={() => {
                  // Keep the viewport at the same page offset when the checklist changes height.
                  auditGuideScroll.current = window.scrollY;
                  setAuditGuideOpen((open) => !open);
                }}
              >
                {auditGuideOpen ? "Hide tutorial" : "Show tutorial"}
              </button>
              <a 
                href="https://github.com/soroban-testkit/testkit-interface/issues/new?title=Audit%20guide%20feedback&labels=documentation" 
                className="guide-feedback-link"
                aria-label="Provide feedback on Audit guide"
                target="_blank"
                rel="noopener noreferrer"
              >
                Feedback
              </a>
            </div>
          </div>
          {auditGuideOpen && (
            <div id="audit-guide-panel" className="guide-panel">
              <fieldset className="audit-prerequisites">
                <legend>Prerequisites</legend>
                {auditPrerequisites.map((item) => (
                  <label key={item.id} className="check">
                    <span className="check-content">
                      <input
                        type="checkbox"
                        checked={checkedPrerequisites[item.id] ?? false}
                        onChange={(event) =>
                          setCheckedPrerequisites((prev) => ({ ...prev, [item.id]: event.target.checked }))
                        }
                      />
                      <span>{item.label}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <ol>
                <li>Point the audit at the contract source directory or workspace root most relevant to the change.</li>
                <li>
                  Review auth and storage access warnings first; they often explain failure modes and privilege
                  issues.
                </li>
                <li>
                  Use the strict mode toggle when you want warning-level findings to block release readiness.
                </li>
                <li>
                  Pair each finding with a focused regression test before finalizing the deployment checklist.
                </li>
              </ol>
            </div>
          )}
        </article>

        <article className="guide-card">
          <div className="guide-header">
            <h3>Guide: Resolving audit warnings</h3>
            <button
              type="button"
              className="guide-toggle"
              aria-expanded={auditWarningsGuideOpen}
              aria-controls="audit-warnings-guide-panel"
              onClick={() => setAuditWarningsGuideOpen((open) => !open)}
            >
              {auditWarningsGuideOpen ? "Hide guide" : "Show guide"}
            </button>
          </div>
          {auditWarningsGuideOpen && (
            <div id="audit-warnings-guide-panel" className="guide-panel">
              <p>
                Common audit warnings fall into three categories: authentication, arithmetic safety, and TTL management.
                Each category has specific resolution patterns.
              </p>
              <h4>Authentication warnings</h4>
              <ul>
                <li><strong>Missing require_auth:</strong> Add explicit authorization checks before state-changing operations. Use <code>address.require_auth()</code> to verify caller identity.</li>
                <li><strong>Unchecked caller privilege:</strong> Validate that the authenticated caller has permission for the requested action using role checks or ownership verification.</li>
                <li><strong>Authorization bypass:</strong> Ensure all entry points that modify contract state include proper authentication gates before execution.</li>
              </ul>
              <h4>Arithmetic safety warnings</h4>
              <ul>
                <li><strong>Potential overflow:</strong> Use checked arithmetic operations or validate input ranges. Replace <code>a + b</code> with <code>a.checked_add(b)</code> for critical calculations.</li>
                <li><strong>Division by zero:</strong> Add explicit zero checks before division operations. Return early or panic with clear error messages.</li>
                <li><strong>Underflow risk:</strong> Validate that subtraction operands maintain proper ordering. Use <code>checked_sub</code> for balance calculations.</li>
              </ul>
              <h4>TTL and storage warnings</h4>
              <ul>
                <li><strong>Missing TTL extension:</strong> Call <code>env.storage().instance().extend_ttl()</code> before reading persistent data to prevent expiry-related failures.</li>
                <li><strong>Unbounded storage growth:</strong> Implement cleanup logic or periodic archival for collections that grow indefinitely. Consider pagination for large datasets.</li>
                <li><strong>Persistent key without extension:</strong> Always extend TTL when reading critical state. Treat persistent storage as requiring active maintenance.</li>
              </ul>
              <p className="guide-note">
                After addressing warnings, re-run the audit with <code>--strict</code> to confirm all issues are resolved. Add regression tests for each fixed warning.
              </p>
            </div>
          )}
        </article>

        <article className="guide-card">
          <div className="guide-header">
            <h3>Guide: Interpreting resource limit results</h3>
            <button
              type="button"
              className="guide-toggle"
              aria-expanded={limitsInterpretationGuideOpen}
              aria-controls="limits-interpretation-guide-panel"
              onClick={() => setLimitsInterpretationGuideOpen((open) => !open)}
            >
              {limitsInterpretationGuideOpen ? "Hide guide" : "Show guide"}
            </button>
          </div>
          {limitsInterpretationGuideOpen && (
            <div id="limits-interpretation-guide-panel" className="guide-panel">
              <p>
                The <code>soroban-testkit limits</code> command ramps a contract input parameter until execution hits resource boundaries. Understanding the output helps you design scalable contracts.
              </p>
              <h4>Reading the results</h4>
              <ul>
                <li><strong>Last successful count:</strong> The highest parameter value that completed without exceeding limits. This represents your practical ceiling for production.</li>
                <li><strong>Instruction count:</strong> Total WASM instructions executed. Stellar contracts have a per-invocation instruction budget; staying well below prevents timeout failures.</li>
                <li><strong>Memory usage:</strong> Peak memory allocated during execution. High memory usage may indicate inefficient data structures or unnecessary copying.</li>
                <li><strong>Failed ramp value:</strong> The first parameter value that exceeded limits. This boundary helps you understand where optimization becomes critical.</li>
              </ul>
              <h4>Common patterns and what they mean</h4>
              <dl className="guide-definitions">
                <dt>Linear scaling with flat memory</dt>
                <dd>Indicates efficient iteration without extra allocations. This is ideal for batch operations like token transfers.</dd>
                
                <dt>Exponential instruction growth</dt>
                <dd>Suggests nested loops or recursive patterns. Consider flattening algorithms or batching work across multiple transactions.</dd>
                
                <dt>Sharp memory increase at boundary</dt>
                <dd>Points to collection pre-allocation hitting capacity thresholds. Review vector sizing and consider streaming patterns.</dd>
                
                <dt>Early instruction ceiling with low memory</dt>
                <dd>Indicates computation-heavy logic. Look for redundant calculations, expensive cryptographic operations, or unoptimized sorting.</dd>
                
                <dt>Memory ceiling before instruction limit</dt>
                <dd>Signals data structure overhead. Consider using maps instead of vectors for lookups, or splitting large structures across storage keys.</dd>
              </dl>
              <h4>Optimization strategies</h4>
              <ul>
                <li><strong>Batch size tuning:</strong> Use limits results to set safe default batch sizes in your contract API. Document maximum supported values.</li>
                <li><strong>Pagination:</strong> If limits are too restrictive, split operations across multiple contract calls with cursor-based continuation.</li>
                <li><strong>Data structure choice:</strong> High memory usage suggests switching from vectors to iterators, or using compact representations.</li>
                <li><strong>Algorithm complexity:</strong> Exponential growth indicates the need for more efficient algorithms. Profile and refactor hot paths.</li>
              </ul>
              <p className="guide-note">
                Run limits tests after each optimization to quantify improvements. Track metrics over time to detect performance regressions.
              </p>
            </div>
          )}
        </article>

        <article className="guide-card">
          <div className="guide-header">
            <h3>FAQ: Common CLI installation errors</h3>
            <button
              type="button"
              className="guide-toggle"
              aria-expanded={installFaqOpen}
              aria-controls="install-faq-panel"
              onClick={() => setInstallFaqOpen((open) => !open)}
            >
              {installFaqOpen ? "Hide FAQ" : "Show FAQ"}
            </button>
          </div>
          {installFaqOpen && (
            <div id="install-faq-panel" className="guide-panel">
              <h4>cargo install fails with "failed to compile"</h4>
              <p><strong>Cause:</strong> Outdated Rust toolchain or missing system dependencies.</p>
              <p><strong>Solution:</strong></p>
              <ol>
                <li>Update Rust to the latest stable version: <code>rustup update stable</code></li>
                <li>Ensure you have build essentials: <code>sudo apt install build-essential</code> (Linux) or install Xcode Command Line Tools (macOS)</li>
                <li>Try installing with <code>--locked</code> flag: <code>cargo install soroban-testkit-cli --locked</code></li>
              </ol>

              <h4>wasm32v1-none target not found</h4>
              <p><strong>Cause:</strong> The WebAssembly compilation target isn't installed for your Rust toolchain.</p>
              <p><strong>Solution:</strong></p>
              <ol>
                <li>Add the target explicitly: <code>rustup target add wasm32v1-none</code></li>
                <li>Verify installation: <code>rustup target list | grep wasm32v1</code></li>
                <li>If the target doesn't exist, update Rust: <code>rustup update</code> (requires Rust 1.84+)</li>
              </ol>

              <h4>soroban-testkit: command not found</h4>
              <p><strong>Cause:</strong> Cargo's bin directory isn't in your shell PATH.</p>
              <p><strong>Solution:</strong></p>
              <ol>
                <li>Add Cargo bin to PATH. For bash/zsh, add to <code>~/.bashrc</code> or <code>~/.zshrc</code>: <code>export PATH="$HOME/.cargo/bin:$PATH"</code></li>
                <li>Reload your shell: <code>source ~/.bashrc</code> or open a new terminal</li>
                <li>Verify: <code>which soroban-testkit</code> should show the binary path</li>
              </ol>

              <h4>cargo-llvm-cov: not found when running coverage</h4>
              <p><strong>Cause:</strong> The LLVM coverage tool isn't installed.</p>
              <p><strong>Solution:</strong></p>
              <ol>
                <li>Install the tool: <code>cargo install cargo-llvm-cov</code></li>
                <li>Verify: <code>cargo llvm-cov --version</code></li>
                <li>If you only need limits or audit, you can skip this installation</li>
              </ol>

              <h4>Permission denied errors during installation</h4>
              <p><strong>Cause:</strong> Insufficient permissions for the cargo install directory.</p>
              <p><strong>Solution:</strong></p>
              <ol>
                <li>Never use <code>sudo</code> with cargo install. This breaks Rust's user-local installation model.</li>
                <li>Ensure <code>~/.cargo</code> is owned by your user: <code>ls -la ~/.cargo</code></li>
                <li>If ownership is wrong, reclaim it: <code>sudo chown -R $USER:$USER ~/.cargo</code></li>
              </ol>

              <h4>OpenSSL or pkg-config errors on Linux</h4>
              <p><strong>Cause:</strong> Missing system libraries required for compiling dependencies.</p>
              <p><strong>Solution:</strong></p>
              <ol>
                <li>Ubuntu/Debian: <code>sudo apt install pkg-config libssl-dev</code></li>
                <li>Fedora/RHEL: <code>sudo dnf install pkg-config openssl-devel</code></li>
                <li>Arch: <code>sudo pacman -S pkg-config openssl</code></li>
              </ol>

              <h4>stellar-cli installation fails</h4>
              <p><strong>Cause:</strong> Network issues or crates.io being temporarily unavailable.</p>
              <p><strong>Solution:</strong></p>
              <ol>
                <li>Retry with verbose output: <code>cargo install stellar-cli -v</code></li>
                <li>Check network connectivity and proxy settings</li>
                <li>Try an alternative mirror if available in your region</li>
                <li>Install a specific version: <code>cargo install stellar-cli --version 22.0.0</code></li>
              </ol>

              <p className="guide-note">
                Still stuck? Check the <a href={INSTALL_GUIDE_URL}>full installation guide</a> or open an issue on the <a href={CORE_REPO_URL}>core repository</a>.
              </p>
            </div>
          )}
        </article>

        <article className="guide-card">
          <div className="guide-header">
            <h3>Examples: Projects with multiple contracts</h3>
            <button
              type="button"
              className="guide-toggle"
              aria-expanded={multiContractExamplesOpen}
              aria-controls="multi-contract-examples-panel"
              onClick={() => setMultiContractExamplesOpen((open) => !open)}
            >
              {multiContractExamplesOpen ? "Hide examples" : "Show examples"}
            </button>
          </div>
          {multiContractExamplesOpen && (
            <div id="multi-contract-examples-panel" className="guide-panel">
              <p>
                Soroban projects often contain multiple contracts in a Cargo workspace. Each workflow supports this pattern with specific conventions.
              </p>
              
              <h4>Workspace structure</h4>
              <pre role="region" aria-label="Example multi-contract workspace structure" tabIndex={0}>
                <code>{`project-root/
├── Cargo.toml          # Workspace manifest
├── contracts/
│   ├── token/
│   │   ├── Cargo.toml
│   │   └── src/lib.rs
│   ├── escrow/
│   │   ├── Cargo.toml
│   │   └── src/lib.rs
│   └── auction/
│       ├── Cargo.toml
│       └── src/lib.rs
└── tests/
    └── integration_tests.rs`}</code>
              </pre>

              <h4>Coverage: Test all contracts together</h4>
              <p>Run coverage from the workspace root to include all contract crates:</p>
              <pre role="region" aria-label="Multi-contract coverage command" tabIndex={0}>
                <code>soroban-testkit coverage . --format html --open</code>
              </pre>
              <p>
                The workspace-aware coverage report aggregates results across all members. Each contract's test coverage appears in the unified HTML output.
              </p>

              <h4>Coverage: Single contract in workspace</h4>
              <p>Target a specific contract by providing its subdirectory:</p>
              <pre role="region" aria-label="Single contract coverage command" tabIndex={0}>
                <code>soroban-testkit coverage contracts/escrow --format html</code>
              </pre>
              <p>This isolates coverage to just the escrow contract and its tests, ignoring sibling contracts.</p>

              <h4>Audit: Workspace-wide scan</h4>
              <p>Audit all contract sources from the workspace root:</p>
              <pre role="region" aria-label="Workspace audit command" tabIndex={0}>
                <code>soroban-testkit audit contracts --strict</code>
              </pre>
              <p>The scanner recursively processes all <code>.rs</code> files under <code>contracts/</code>, reporting findings across every contract.</p>

              <h4>Audit: Per-contract scanning</h4>
              <p>Focus the audit on a single contract's source directory:</p>
              <pre role="region" aria-label="Single contract audit command" tabIndex={0}>
                <code>soroban-testkit audit contracts/token/src</code>
              </pre>
              <p>This scans only the token contract, useful for incremental security reviews.</p>

              <h4>Limits: Testing each contract separately</h4>
              <p>Each contract compiles to its own WASM artifact. Test limits for the auction contract:</p>
              <pre role="region" aria-label="Limits command for auction contract" tabIndex={0}>
                <code>{`soroban-testkit limits \\
  --contract target/wasm32v1-none/release/auction.wasm \\
  --fn place_bid \\
  --ramp bidders`}</code>
              </pre>
              <p>Repeat for each contract, adjusting the <code>--contract</code> path, <code>--fn</code>, and <code>--ramp</code> parameters.</p>

              <h4>Limits: Batch testing script</h4>
              <p>Automate limits testing across multiple contracts with a shell script:</p>
              <pre role="region" aria-label="Batch limits testing script" tabIndex={0}>
                <code>{`#!/bin/bash
for contract in token escrow auction; do
  echo "Testing $contract..."
  soroban-testkit limits \\
    --contract target/wasm32v1-none/release/$contract.wasm \\
    --fn execute \\
    --ramp items
done`}</code>
              </pre>

              <h4>Build optimization for workspaces</h4>
              <p>When working with multiple contracts, build them all at once to share dependencies:</p>
              <pre role="region" aria-label="Workspace build command" tabIndex={0}>
                <code>{`cargo build --release --target wasm32v1-none --workspace`}</code>
              </pre>
              <p>
                This ensures all contracts are up-to-date before running limits tests or deploying.
              </p>

              <h4>Cargo.toml workspace configuration</h4>
              <p>Define workspace members in the root <code>Cargo.toml</code>:</p>
              <pre role="region" aria-label="Workspace Cargo.toml example" tabIndex={0}>
                <code>{`[workspace]
members = [
  "contracts/token",
  "contracts/escrow",
  "contracts/auction",
]
resolver = "2"

[workspace.dependencies]
soroban-sdk = "27.0.0"
soroban-testkit = "0.2.0"`}</code>
              </pre>
              <p>
                Individual contract <code>Cargo.toml</code> files inherit shared dependencies using <code>workspace = true</code>.
              </p>

              <p className="guide-note">
                All three workflows (coverage, audit, limits) respect Cargo workspace conventions. Point the CLI at the workspace root for aggregate analysis or at specific subdirectories for focused testing.
              </p>
            </div>
          )}
        </article>

        {/* Issue #81: Prerequisites checklist for coverage workflow */}
        <article className="guide-card">
          <div className="guide-header">
            <h3>Coverage workflow: Prerequisites</h3>
            <button
              type="button"
              className="guide-toggle"
              aria-expanded={coveragePrerequisitesOpen}
              aria-controls="coverage-prerequisites-panel"
              onClick={() => setCoveragePrerequisitesOpen((open) => !open)}
            >
              {coveragePrerequisitesOpen ? "Hide checklist" : "Show checklist"}
            </button>
          </div>
          {coveragePrerequisitesOpen && (
            <div id="coverage-prerequisites-panel" className="guide-panel">
              <fieldset className="coverage-prerequisites">
                <legend>Before running the coverage workflow, confirm:</legend>
                {coveragePrerequisites.map((item) => (
                  <label key={item.id} className="check">
                    <span className="check-content">
                      <input
                        type="checkbox"
                        checked={checkedCoveragePrerequisites[item.id] ?? false}
                        onChange={(event) =>
                          setCheckedCoveragePrerequisites((prev) => ({ ...prev, [item.id]: event.target.checked }))
                        }
                      />
                      <span>{item.label}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <ol>
                <li>Ensure Rust is installed via rustup with the wasm32v1-none target available</li>
                <li>Install cargo-llvm-cov for coverage report generation: <code>cargo install cargo-llvm-cov</code></li>
                <li>Verify testkit-cli is installed and accessible: <code>soroban-testkit --version</code></li>
                <li>Run your test suite locally to confirm all tests pass: <code>cargo test</code></li>
              </ol>
            </div>
          )}
        </article>

        {/* Issue #78: Preflight checklist for coverage workflow */}
        <article className="guide-card">
          <div className="guide-header">
            <h3>Coverage workflow: Preflight checklist</h3>
            <button
              type="button"
              className="guide-toggle"
              aria-expanded={coveragePreflightOpen}
              aria-controls="coverage-preflight-panel"
              onClick={() => setCoveragePreflightOpen((open) => !open)}
            >
              {coveragePreflightOpen ? "Hide checklist" : "Show checklist"}
            </button>
          </div>
          {coveragePreflightOpen && (
            <div id="coverage-preflight-panel" className="guide-panel">
              <fieldset className="coverage-preflight">
                <legend>Before hitting run, verify these:</legend>
                {coveragePreflight.map((item) => (
                  <label key={item.id} className="check">
                    <span className="check-content">
                      <input
                        type="checkbox"
                        checked={checkedCoveragePreflight[item.id] ?? false}
                        onChange={(event) =>
                          setCheckedCoveragePreflight((prev) => ({ ...prev, [item.id]: event.target.checked }))
                        }
                      />
                      <span>{item.label}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <ol>
                <li>Confirm the target path contains a valid <code>Cargo.toml</code> for your Soroban contract</li>
                <li>Ensure <code>llvm-tools-preview</code> is installed: <code>rustup component add llvm-tools-preview</code></li>
                <li>Verify your contract tests pass under <code>cargo test</code> so coverage data is complete</li>
                <li>Choose <code>html</code> with <code>--open</code> for local inspection, <code>lcov</code> for CI, or <code>text</code> for terminal summaries</li>
              </ol>
            </div>
          )}
        </article>

        {/* Issue #80: Ready-to-run examples for coverage workflow */}
        <article className="guide-card">
          <div className="guide-header">
            <h3>Coverage workflow: Ready-to-run examples</h3>
            <button
              type="button"
              className="guide-toggle"
              aria-expanded={coverageExamplesOpen}
              aria-controls="coverage-examples-guide-panel"
              onClick={() => setCoverageExamplesOpen((open) => !open)}
            >
              {coverageExamplesOpen ? "Hide examples" : "Show examples"}
            </button>
          </div>
          {coverageExamplesOpen && (
            <div id="coverage-examples-guide-panel" className="guide-panel">
              <p>
                Quick reference for common coverage workflow patterns. Copy any command and adjust the path for your project.
              </p>
              <div className="coverage-command-examples">
                {coverageExamples.map((example, index) => (
                  <div key={index} className="command-example">
                    <h5>{example.title}</h5>
                    <p>{example.description}</p>
                    <pre role="region" aria-label={example.title} tabIndex={0}>
                      <code>{example.command}</code>
                    </pre>
                  </div>
                ))}
              </div>
              <dl className="coverage-examples-reference">
                <dt><code>--format html</code></dt>
                <dd>Interactive coverage dashboard. Best for local development and reviewing coverage gaps by file and function.</dd>

                <dt><code>--format lcov</code></dt>
                <dd>Machine-readable LCOV format for CI/CD integration with GitHub Actions, GitLab CI, Codecov, or Coveralls.</dd>

                <dt><code>--format text</code></dt>
                <dd>Simple summary output to the terminal. Fast for quick checks without generating report files.</dd>

                <dt><code>--open</code></dt>
                <dd>Automatically open the HTML report in your default browser after generation (HTML format only).</dd>
              </dl>
            </div>
          )}
        </article>

        {/* Issue #79: Advanced options for coverage workflow */}
        <article className="guide-card">
          <div className="guide-header">
            <h3>Coverage workflow: Advanced options</h3>
            <button
              type="button"
              className="guide-toggle"
              aria-expanded={coverageAdvancedOpen}
              aria-controls="coverage-advanced-panel"
              onClick={() => setCoverageAdvancedOpen((open) => !open)}
            >
              {coverageAdvancedOpen ? "Hide options" : "Show options"}
            </button>
          </div>
          {coverageAdvancedOpen && (
            <div id="coverage-advanced-panel" className="guide-panel">
              <p>
                Customize coverage workflow behavior with these advanced options. All are optional; defaults provide sensible baseline behavior for most projects.
              </p>
              <div className="advanced-options-grid">
                {coverageAdvancedOptions.map((option) => (
                  <div key={option.id} className="advanced-option">
                    <label htmlFor={`coverage-advanced-${option.id}`}>
                      {option.label}
                    </label>
                    {option.type === "number" ? (
                      <input
                        id={`coverage-advanced-${option.id}`}
                        type="number"
                        defaultValue={option.default}
                        onChange={(e) =>
                          setCoverageAdvancedValues((prev) => ({ ...prev, [option.id]: e.target.value }))
                        }
                        placeholder={option.default}
                      />
                    ) : (
                      <input
                        id={`coverage-advanced-${option.id}`}
                        type="checkbox"
                        defaultChecked={option.default === "true"}
                        onChange={(e) =>
                          setCoverageAdvancedValues((prev) => ({ ...prev, [option.id]: e.target.checked ? "true" : "false" }))
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
              <dl className="advanced-options-reference">
                <dt><code>--threads</code></dt>
                <dd>Number of parallel test threads. Default: 4. Increase on powerful machines for faster test execution; decrease on resource-constrained environments.</dd>

                <dt><code>--timeout</code></dt>
                <dd>Per-test timeout in seconds. Default: 300s. Increase for slow tests or complex contract initialization logic.</dd>

                <dt><code>--fail-fast</code></dt>
                <dd>Stop test execution on the first failure. Useful for rapid iteration; disable for complete coverage reporting.</dd>

                <dt><code>--exact</code></dt>
                <dd>Run only exact test name matches. Useful for targeting specific test functions without wildcards or substring matching.</dd>
              </dl>
            </div>
          )}
        </article>

        {/* Issue #85: Prerequisites checklist for limits workflow */}
        <article className="guide-card">
          <div className="guide-header">
            <h3>Limits workflow: Prerequisites</h3>
            <button
              type="button"
              className="guide-toggle"
              aria-expanded={limitsPrerequisitesOpen}
              aria-controls="limits-prerequisites-panel"
              onClick={() => setLimitsPrerequisitesOpen((open) => !open)}
            >
              {limitsPrerequisitesOpen ? "Hide checklist" : "Show checklist"}
            </button>
          </div>
          {limitsPrerequisitesOpen && (
            <div id="limits-prerequisites-panel" className="guide-panel">
              <fieldset className="limits-prerequisites">
                <legend>Before running the limits workflow, confirm:</legend>
                {limitsPrerequisites.map((item) => (
                  <label key={item.id} className="check">
                    <span className="check-content">
                      <input
                        type="checkbox"
                        checked={checkedLimitsPrerequisites[item.id] ?? false}
                        onChange={(event) =>
                          setCheckedLimitsPrerequisites((prev) => ({ ...prev, [item.id]: event.target.checked }))
                        }
                      />
                      <span>{item.label}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <ol>
                <li>Compile your Soroban contract to WebAssembly: <code>cargo build --target wasm32v1-none --release</code></li>
                <li>Verify the WASM artifact exists at the expected path (default: <code>target/wasm32v1-none/release/contract.wasm</code>)</li>
                <li>Ensure the target function is exported in your contract's ABI and callable from tests</li>
                <li>Confirm the ramp parameter exists in the function signature and accepts numeric or collection types</li>
              </ol>
            </div>
          )}
        </article>

        {/* Issue #83: Preflight checklist for limits workflow */}
        <article className="guide-card">
          <div className="guide-header">
            <h3>Limits workflow: Preflight checklist</h3>
            <button
              type="button"
              className="guide-toggle"
              aria-expanded={limitsPreflightOpen}
              aria-controls="limits-preflight-panel"
              onClick={() => setLimitsPreflightOpen((open) => !open)}
            >
              {limitsPreflightOpen ? "Hide checklist" : "Show checklist"}
            </button>
          </div>
          {limitsPreflightOpen && (
            <div id="limits-preflight-panel" className="guide-panel">
              <fieldset className="limits-preflight">
                <legend>Before hitting run, verify these:</legend>
                {limitsPreflight.map((item) => (
                  <label key={item.id} className="check">
                    <span className="check-content">
                      <input
                        type="checkbox"
                        checked={checkedLimitsPreflight[item.id] ?? false}
                        onChange={(event) =>
                          setCheckedLimitsPreflight((prev) => ({ ...prev, [item.id]: event.target.checked }))
                        }
                      />
                      <span>{item.label}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <ol>
                <li>Double-check the WASM artifact path matches your compiled output location</li>
                <li>Confirm the function name exactly matches an exported contract symbol (case-sensitive)</li>
                <li>Verify the ramp parameter is compatible with the ramping strategy (numeric types scale naturally; collections scale by count)</li>
                <li>Test invocation arguments are prepared; the limits workflow will inject various values for the ramp parameter</li>
              </ol>
            </div>
          )}
        </article>

        {/* Issue #86: Advanced options section for limits workflow */}
        <article className="guide-card">
          <div className="guide-header">
            <h3>Limits workflow: Advanced options</h3>
            <button
              type="button"
              className="guide-toggle"
              aria-expanded={limitsAdvancedOpen}
              aria-controls="limits-advanced-panel"
              onClick={() => setLimitsAdvancedOpen((open) => !open)}
            >
              {limitsAdvancedOpen ? "Hide options" : "Show options"}
            </button>
          </div>
          {limitsAdvancedOpen && (
            <div id="limits-advanced-panel" className="guide-panel">
              <p>
                Customize limits workflow behavior with these advanced options. All are optional; defaults provide sensible baseline behavior.
              </p>
              <div className="advanced-options-grid">
                {limitsAdvancedOptions.map((option) => (
                  <div key={option.id} className="advanced-option">
                    <label htmlFor={`advanced-${option.id}`}>
                      {option.label}
                    </label>
                    {option.type === "number" ? (
                      <input
                        id={`advanced-${option.id}`}
                        type="number"
                        defaultValue={option.default}
                        onChange={(e) =>
                          setLimitsAdvancedValues((prev) => ({ ...prev, [option.id]: e.target.value }))
                        }
                        placeholder={option.default}
                      />
                    ) : (
                      <input
                        id={`advanced-${option.id}`}
                        type="checkbox"
                        defaultChecked={option.default === "true"}
                        onChange={(e) =>
                          setLimitsAdvancedValues((prev) => ({ ...prev, [option.id]: e.target.checked ? "true" : "false" }))
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
              <dl className="advanced-options-reference">
                <dt><code>--timeout</code></dt>
                <dd>Maximum milliseconds per test invocation before timing out. Default: 5000ms. Increase for slow contract initialization or complex logic.</dd>

                <dt><code>--sample-rate</code></dt>
                <dd>Number of samples to collect while ramping the parameter. Default: 10. Lower values run faster; higher values provide finer granularity in resource curves.</dd>

                <dt><code>--verbose</code></dt>
                <dd>Emit detailed logging for each ramp step, including instruction counts and memory snapshots. Useful for debugging resource scaling patterns.</dd>

                <dt><code>--dump-state</code></dt>
                <dd>Write contract state snapshots after each test invocation. Helps identify state corruption or unexpected side effects across ramp steps.</dd>
              </dl>
            </div>
          )}
        </article>

        {/* Issue #84: Command reference page for coverage workflow */}
        <article className="guide-card">
          <div className="guide-header">
            <h3>Coverage workflow: Command reference</h3>
            <button
              type="button"
              className="guide-toggle"
              aria-expanded={coverageCommandReferenceOpen}
              aria-controls="coverage-command-reference-panel"
              onClick={() => setCoverageCommandReferenceOpen((open) => !open)}
            >
              {coverageCommandReferenceOpen ? "Hide reference" : "Show reference"}
            </button>
          </div>
          {coverageCommandReferenceOpen && (
            <div id="coverage-command-reference-panel" className="guide-panel">
              <p>
                The coverage workflow runs your Rust test suite through <code>cargo-llvm-cov</code> and produces machine-readable and human-friendly coverage reports.
              </p>
              <h4>Basic syntax</h4>
              <pre role="region" aria-label="Coverage command syntax" tabIndex={0}>
                <code>{`soroban-testkit coverage [OPTIONS] [PATH]\n\nOPTIONS:\n  --format <FORMAT>    Output format: html, lcov, or text [default: html]\n  --open              Automatically open HTML report in browser\n  --help              Print help information`}</code>
              </pre>
              <h4>Common usage patterns</h4>
              <dl className="coverage-patterns">
                <dt>Generate HTML report (default)</dt>
                <dd><code>soroban-testkit coverage . --format html --open</code></dd>

                <dt>Output machine-readable LCOV format</dt>
                <dd><code>soroban-testkit coverage . --format lcov &gt; coverage.lcov</code></dd>

                <dt>Terminal summary only</dt>
                <dd><code>soroban-testkit coverage . --format text</code></dd>

                <dt>Specific contract in workspace</dt>
                <dd><code>soroban-testkit coverage ./contracts/my-contract --format html</code></dd>
              </dl>
              <h4>Output formats</h4>
              <ul>
                <li><strong>html:</strong> Interactive coverage dashboard. Click to drill down into files, functions, and coverage gaps. Best for local development.</li>
                <li><strong>lcov:</strong> Machine-readable format compatible with CI/CD tools (GitHub Actions, GitLab CI, etc.). Use for automated gates and reporting.</li>
                <li><strong>text:</strong> Simple summary to stdout. Fast for quick checks without file I/O.</li>
              </ul>
              <h4>Coverage interpretation</h4>
              <ul>
                <li><strong>Line coverage:</strong> Percentage of executable lines executed during the test run. Gaps often indicate error handling paths or edge cases.</li>
                <li><strong>Branch coverage:</strong> Tracks both sides of conditional logic. High branch coverage means error paths and alternate flows are tested.</li>
                <li><strong>Function coverage:</strong> Shows whether each function was invoked. Useful for identifying dead code and untested entry points.</li>
              </ul>
            </div>
          )}
        </article>

        <section
          className="command-reference"
          id="audit-reference"
          tabIndex={-1}
          aria-labelledby="audit-reference-heading"
        >
          <div className="reference-header">
            <p className="eyebrow">Command reference</p>
            <h2 id="audit-reference-heading">Audit workflow, at a glance.</h2>
            <p>
              Use <code>soroban-testkit audit</code> to scan contract sources for authentication
              gaps, arithmetic pitfalls, and TTL misuse. The scan is read-only and runs entirely
              offline.
            </p>
          </div>
          <div className="reference-grid">
            <article className="reference-card">
              <h3>Ready-to-run command</h3>
              <pre aria-label="Audit command example"><code>{"soroban-testkit audit \\\n  ./src \\\n  --strict"}</code></pre>
              <p>
                Replace <code>./src</code> with the path to your contract source directory. Omit{" "}
                <code>--strict</code> to treat warnings as informational only.
              </p>
            </article>
            <article className="reference-card">
              <h3>Arguments</h3>
              <dl className="reference-arguments">
                <div>
                  <dt><code>path</code></dt>
                  <dd>
                    Contract source directory. Defaults to{" "}
                    <code>{localFileGuides.audit.defaultPath}</code>.
                  </dd>
                </div>
                <div>
                  <dt><code>--strict</code></dt>
                  <dd>Treat warning-level findings as errors and exit non-zero.</dd>
                </div>
              </dl>
            </article>
            <article className="reference-card">
              <h3>Before you run it</h3>
              <ol>
                <li>Point the path at the directory that contains your <code>*.rs</code> source files.</li>
                <li>Review auth and storage warnings first — they surface the most critical privilege issues.</li>
                <li>Enable strict mode before release to make the audit gate your CI pipeline.</li>
              </ol>
              <p className="reference-note">
                {localFileGuides.audit.offlineGuarantee}
              </p>
            </article>
          </div>
        </section>

        <section
          className="command-reference"
          id="limits-reference"
          tabIndex={-1}
          aria-labelledby="limits-reference-heading"
        >
          <div className="reference-header">
            <p className="eyebrow">Command reference</p>
            <div className="reference-title-row">
              <h2 id="limits-reference-heading">Resource limits, at a glance.</h2>
              <a 
                href="https://github.com/soroban-testkit/testkit-interface/issues/new?title=Limits%20reference%20feedback&labels=documentation" 
                className="guide-feedback-link"
                aria-label="Provide feedback on Limits reference"
                target="_blank"
                rel="noopener noreferrer"
              >
                Feedback
              </a>
            </div>
            <p>
              Use <code>soroban-testkit limits</code> to ramp one contract input until the local WASM
              execution reaches its practical resource ceiling. The command is read-only and runs offline.
            </p>
          </div>
          <div className="reference-grid">
            <article className="reference-card">
              <h3>Command shape</h3>
              <pre aria-label="Resource limits command example"><code>{"soroban-testkit limits \\\n  --contract target/wasm32v1-none/release/contract.wasm \\\n  --fn batch_payout \\\n  --ramp recipients"}</code></pre>
              <p>Use the compiled WASM path and exported function and input names from your contract.</p>
            </article>
            <article className="reference-card">
              <h3>Arguments</h3>
              <dl className="reference-arguments">
                <div><dt><code>--contract</code></dt><dd>Compiled WASM artifact. Defaults to <code>{localFileGuides.limits.defaultPath}</code>.</dd></div>
                <div><dt><code>--fn</code></dt><dd>Exported function to probe. Defaults to <code>batch_payout</code>.</dd></div>
                <div><dt><code>--ramp</code></dt><dd>Input parameter to increase. Defaults to <code>recipients</code>.</dd></div>
              </dl>
            </article>
            <article className="reference-card">
              <h3>Before you run it</h3>
              <ol>
                <li>Build the contract for <code>wasm32v1-none</code> in release mode.</li>
                <li>Confirm the function is exported and the ramp input is accepted.</li>
                <li>Read the instruction and memory ceilings printed to stdout.</li>
              </ol>
              <p className="reference-note">Reads: local WASM and export metadata. Writes: none.</p>
            </article>
          </div>
          <article className="reference-card reference-example" aria-labelledby="limits-example-heading">
            <h3 id="limits-example-heading">Run a complete example</h3>
            <p>
              This uses the public Sororail batch-payout contract, whose <code>execute_equal</code> entry point
              ramps the <code>recipients</code> input. Install Rust 1.91 or later and
              {" "}<a href={INSTALL_GUIDE_URL}>install soroban-testkit</a> before starting.
            </p>
            <ol className="reference-example-steps">
              <li>
                <h4>Get the contract workspace</h4>
                <pre role="region" aria-label="Clone the Sororail contract workspace" tabIndex={0}>
                  <code>{"git clone https://github.com/Sororail/sororail-contracts.git\ncd sororail-contracts"}</code>
                </pre>
              </li>
              <li>
                <h4>Add the WASM target</h4>
                <pre role="region" aria-label="Add the wasm32v1-none target" tabIndex={0}>
                  <code>rustup target add wasm32v1-none</code>
                </pre>
              </li>
              <li>
                <h4>Build the batch-payout contract</h4>
                <pre role="region" aria-label="Build the batch-payout contract" tabIndex={0}>
                  <code>
                    cargo build --release --target wasm32v1-none --manifest-path contracts/batch_payout/Cargo.toml
                  </code>
                </pre>
              </li>
              <li>
                <h4>Run the limits workflow from the workspace root</h4>
                <pre role="region" aria-label="Run the limits example" tabIndex={0}>
                  <code>
                    {"soroban-testkit limits \\\n  --contract target/wasm32v1-none/release/sororail_batch_payout.wasm \\\n  --fn execute_equal \\\n  --ramp recipients"}
                  </code>
                </pre>
              </li>
            </ol>
            <p className="reference-note">
              The result reports the last successful recipient count along with instruction and memory usage;
              measured limits can vary with the contract build and runtime.
            </p>
          </article>
        </section>
      </section>

      <footer>
        <span>Built for the Stellar developer ecosystem.</span>
        <span className="footer-links">
          <a href={CORE_REPO_URL}>Soroban Testkit core repository</a>
          {/* #119 — changelog link */}
          <a href={`${CORE_REPO_URL}/releases`}>Changelog</a>
          {/* #174 — release notes link */}
          <button type="button" className="footer-a11y-link" onClick={() => setReleaseNotesOpen(true)}>
            Release notes
          </button>
          {/* #116 — accessibility statement */}
          <button type="button" className="footer-a11y-link" onClick={() => setA11yOpen(true)}>
            Accessibility statement
          </button>
        </span>
        <span>Apache-2.0</span>
      </footer>

      {/* #174 — release notes dialog */}
      {releaseNotesOpen && (
        <div className="a11y-overlay" role="dialog" aria-modal="true" aria-labelledby="release-notes-title" onClick={() => setReleaseNotesOpen(false)}>
          <div className="a11y-dialog" onClick={(e) => e.stopPropagation()}>
            <h2 id="release-notes-title">Interface Release Notes</h2>
            <p>
              This interface evolves alongside the Soroban Testkit CLI. Interface-visible changes track CLI
              capabilities, new workflow guides, and accessibility enhancements.
            </p>
            
            <div className="release-notes-list">
              <article className="release-note-item">
                <h3>v0.4.0 — October 2026</h3>
                <ul>
                  <li><strong>Quick reference:</strong> Added printable command reference for coverage, limits, and audit workflows with examples including paths with spaces.</li>
                  <li><strong>Documentation feedback:</strong> Added feedback links beside each workflow guide for direct issue reporting.</li>
                  <li><strong>Path examples:</strong> Added comprehensive examples for handling contract paths containing spaces across all commands.</li>
                  <li><strong>Release notes:</strong> Added this interface-visible CLI changes section.</li>
                </ul>
              </article>

              <article className="release-note-item">
                <h3>v0.3.0 — September 2026</h3>
                <ul>
                  <li><strong>Limits workflow:</strong> Added complete standalone reference with default arguments and offline behavior explanation.</li>
                  <li><strong>Audit prerequisites:</strong> Expandable preflight checklist helps users prepare source audit scans.</li>
                  <li><strong>Advanced editor:</strong> Multiline command editor supports complex argument combinations.</li>
                </ul>
              </article>

              <article className="release-note-item">
                <h3>v0.2.0 — August 2026</h3>
                <ul>
                  <li><strong>Configuration comparison:</strong> Side-by-side comparison panel for different workflow settings.</li>
                  <li><strong>Required vs Optional:</strong> Visual badges distinguish mandatory parameters from optional flags.</li>
                  <li><strong>Effective defaults:</strong> Preview panel shows which empty fields fall back to default values.</li>
                </ul>
              </article>

              <article className="release-note-item">
                <h3>v0.1.0 — July 2026</h3>
                <ul>
                  <li><strong>Initial release:</strong> Command builder for coverage, limits, and audit workflows.</li>
                  <li><strong>Module documentation:</strong> Seven focused testing modules with category filtering.</li>
                  <li><strong>Installation guide:</strong> Step-by-step setup from clean machine to first command.</li>
                  <li><strong>Accessibility:</strong> Keyboard navigation, screen reader support, and WCAG 2.1 AA compliance.</li>
                </ul>
              </article>
            </div>

            <p className="release-notes-footer">
              For complete CLI changelog including internal implementation details, see the{" "}
              <a href={`${CORE_REPO_URL}/releases`}>core repository releases</a>.
            </p>
            <button type="button" className="button primary" onClick={() => setReleaseNotesOpen(false)} autoFocus>
              Close
            </button>
          </div>
        </div>
      )}

      {/* #116 — accessibility statement dialog */}
      {a11yOpen && (
        <div className="a11y-overlay" role="dialog" aria-modal="true" aria-labelledby="a11y-title" onClick={() => setA11yOpen(false)}>
          <div className="a11y-dialog" onClick={(e) => e.stopPropagation()}>
            <h2 id="a11y-title">Accessibility Statement</h2>
            <p>
              The Soroban Testkit Interface is committed to WCAG 2.1 AA compliance. We aim to make every
              feature keyboard-accessible, screen-reader friendly, and usable across devices.
            </p>
            <ul>
              <li>All interactive controls are reachable via keyboard (Tab, Enter, Space, Escape).</li>
              <li>ARIA labels and live regions announce dynamic state changes.</li>
              <li>Color contrast meets or exceeds 4.5:1 for body text.</li>
              <li>Responsive layout supports mobile and desktop viewports.</li>
            </ul>
            <p>
              Found an accessibility issue? Open an issue on{" "}
              <a href={INTERFACE_REPO_URL}>GitHub</a> or contact{" "}
              <a href="mailto:accessibility@soroban-testkit.dev">accessibility@soroban-testkit.dev</a>.
            </p>
            <button type="button" className="button primary" onClick={() => setA11yOpen(false)} autoFocus>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Back-to-top control (#125) */}
      <button
        type="button"
        className={`back-to-top ${showBackToTop ? "visible" : ""}`}
        onClick={scrollToTop}
        aria-label="Back to top"
        tabIndex={showBackToTop ? 0 : -1}
        aria-hidden={!showBackToTop}
      >
        ↑ Top
      </button>
    </main>
  );
}
