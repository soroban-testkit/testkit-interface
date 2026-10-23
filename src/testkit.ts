export type CommandName = "coverage" | "limits" | "audit";
export type OptionalArgKey = "format" | "open" | "strict";

export interface CommandOptions {
  command: CommandName;
  path: string;
  format: "html" | "lcov" | "text";
  open: boolean;
  fn: string;
  ramp: string;
  strict: boolean;
  optionalArgOrder?: OptionalArgKey[];
}

// Issue #142: Flag explanations
export const flagExplanations: Record<string, string> = {
  // coverage flags
  "coverage.path": "Path to your contract project directory (default: current directory)",
  "coverage.format": "Output format: html (interactive report), lcov (machine-readable), or text (terminal summary)",
  "coverage.open": "Automatically open the HTML coverage report in your default browser",

  // limits flags
  "limits.path": "Path to compiled contract WASM artifact (default: target/wasm32v1-none/release/contract.wasm)",
  "limits.fn": "Function name to probe for resource limits (default: batch_payout)",
  "limits.ramp": "Parameter to ramp up (default: recipients)",

  // audit flags
  "audit.path": "Path to contract source code directory (default: ./src)",
  "audit.strict": "Enable strict mode for stricter security checks",
};

// Issue #139: Presets for common project layouts
export interface ConfigPreset {
  name: string;
  description: string;
  options: Partial<CommandOptions>;
}

export const configPresets: ConfigPreset[] = [
  {
    name: "monorepo-contracts",
    description: "Typical monorepo structure with /contracts subdirectory",
    options: {
      path: "./contracts",
      command: "coverage",
      format: "html",
      open: true,
    },
  },
  {
    name: "single-contract",
    description: "Single contract in repository root",
    options: {
      path: ".",
      command: "coverage",
      format: "html",
      open: true,
    },
  },
  {
    name: "workspace-contract",
    description: "Rust workspace with contract as member",
    options: {
      path: "./contracts/my-contract",
      command: "coverage",
      format: "html",
      open: true,
    },
  },
  {
    name: "audit-strict",
    description: "Run security audit in strict mode",
    options: {
      command: "audit",
      path: "./src",
      strict: true,
    },
  },
  {
    name: "limits-custom-function",
    description: "Test custom function limits with ramped parameter",
    options: {
      command: "limits",
      path: "target/wasm32v1-none/release/contract.wasm",
      fn: "transfer",
      ramp: "amount",
    },
  },
];

export const moduleCategories = [
  "Environment",
  "Economics",
  "Assertions",
  "Security",
  "Storage",
] as const;

export type ModuleCategory = (typeof moduleCategories)[number];

export const modules: ReadonlyArray<{
  name: string;
  description: string;
  category: ModuleCategory;
}> = [
  { name: "core", description: "Deterministic environments and addresses", category: "Environment" },
  { name: "ledger", description: "Time, sequence, and clock control", category: "Environment" },
  { name: "money", description: "Adversarial values and conservation checks", category: "Economics" },
  { name: "events", description: "Typed capture and event assertions", category: "Assertions" },
  { name: "tokens", description: "Stellar Asset Contract test doubles", category: "Economics" },
  { name: "auth", description: "Privilege and authorization matrices", category: "Security" },
  { name: "ttl", description: "Storage lifetime and expiry simulation", category: "Storage" },
];

const quote = (value: string) => (value.includes(" ") ? `"${value}"` : value);

const getOptionalArgOrder = (options: CommandOptions): OptionalArgKey[] => {
  if (options.command === "coverage") {
    return options.optionalArgOrder && options.optionalArgOrder.length > 0
      ? options.optionalArgOrder
      : ["format", "open"];
  }

  if (options.command === "audit") {
    return options.optionalArgOrder && options.optionalArgOrder.length > 0
      ? options.optionalArgOrder
      : ["strict"];
  }

  return [];
};

const buildOptionalArgs = (options: CommandOptions): string[] => {
  const order = getOptionalArgOrder(options);
  const args: string[] = [];

  for (const key of order) {
    if (key === "format") {
      args.push(`--format ${options.format}`);
    }
    if (key === "open") {
      if (options.open) args.push("--open");
    }
    if (key === "strict") {
      if (options.strict) args.push("--strict");
    }
  }

  return args;
};

/**
 * Values `buildCommand` substitutes when a field is left empty. Exported so
 * the workbench can preview the effective command before copying it.
 */
export const fallbackValues = {
  limitsContract: "target/wasm32v1-none/release/contract.wasm",
  limitsFunction: "batch_payout",
  limitsRamp: "recipients",
  auditPath: "./src",
} as const;

export function buildCommand(options: CommandOptions): string {
  if (options.command === "coverage") {
    return [
      "soroban-testkit coverage",
      options.path && quote(options.path),
      ...buildOptionalArgs(options),
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (options.command === "limits") {
    return [
      "soroban-testkit limits",
      "--contract",
      quote(options.path || fallbackValues.limitsContract),
      "--fn",
      options.fn || fallbackValues.limitsFunction,
      "--ramp",
      options.ramp || fallbackValues.limitsRamp,
    ].join(" ");
  }

  return [
    "soroban-testkit audit",
    quote(options.path || fallbackValues.auditPath),
    ...buildOptionalArgs(options),
  ]
    .filter(Boolean)
    .join(" ");
}

export function formatCommandLine(
  options: CommandOptions,
  multiline = false,
): string {
  if (!multiline) {
    return buildCommand(options);
  }

  if (options.command === "coverage") {
    const args: string[] = [];
    if (options.path) args.push(quote(options.path));
    args.push(...buildOptionalArgs(options));

    if (args.length === 0) {
      return "soroban-testkit coverage";
    }

    return [
      "soroban-testkit coverage \\",
      ...args.map((arg, index) => `  ${arg}${index < args.length - 1 ? " \\" : ""}`),
    ].join("\n");
  }

  if (options.command === "limits") {
    const contractPath = quote(options.path || fallbackValues.limitsContract);
    const fn = options.fn || fallbackValues.limitsFunction;
    const ramp = options.ramp || fallbackValues.limitsRamp;

    return [
      "soroban-testkit limits \\",
      `  --contract ${contractPath} \\`,
      `  --fn ${fn} \\`,
      `  --ramp ${ramp}`,
    ].join("\n");
  }

  // audit
  const auditPath = quote(options.path || fallbackValues.auditPath);
  const auditArgs = buildOptionalArgs(options).map((arg) => `  ${arg}`);

  return [
    "soroban-testkit audit \\",
    `  ${auditPath}${auditArgs.length > 0 ? " \\" : ""}`,
    ...auditArgs.map((arg, index) => `${arg}${index < auditArgs.length - 1 ? " \\" : ""}`),
  ].join("\n");
}

// Issue #144: Format command with explanatory comments
export function formatCommandWithComments(options: CommandOptions): string {
  const comments: string[] = [];
  
  if (options.command === "coverage") {
    comments.push("# Generate contract-test coverage through cargo-llvm-cov");
    comments.push("soroban-testkit coverage \\");
    if (options.path) {
      comments.push(`  ${quote(options.path)} \\  # Project or contract path`);
    }
    const optionalArgs = buildOptionalArgs(options);
    optionalArgs.forEach((arg, index) => {
      const isLast = index === optionalArgs.length - 1;
      if (arg.includes("--format")) {
        comments.push(`  ${arg}${isLast ? "" : " \\"}  # Output format: html, lcov, or text`);
      } else if (arg.includes("--open")) {
        comments.push(`  ${arg}${isLast ? "" : " \\"}  # Open report in browser`);
      } else {
        comments.push(`  ${arg}${isLast ? "" : " \\"}`);
      }
    });
    if (optionalArgs.length === 0 && options.path) {
      comments[comments.length - 1] = comments[comments.length - 1].replace(" \\", "");
    }
  } else if (options.command === "limits") {
    comments.push("# Ramp a contract input to find its practical resource ceiling");
    const contractPath = quote(options.path || fallbackValues.limitsContract);
    const fn = options.fn || fallbackValues.limitsFunction;
    const ramp = options.ramp || fallbackValues.limitsRamp;
    
    comments.push("soroban-testkit limits \\");
    comments.push(`  --contract ${contractPath} \\  # Path to compiled WASM artifact`);
    comments.push(`  --fn ${fn} \\  # Function to probe for limits`);
    comments.push(`  --ramp ${ramp}  # Parameter to increase`);
  } else {
    comments.push("# Scan contract sources for auth, arithmetic, and TTL risks");
    const auditPath = quote(options.path || fallbackValues.auditPath);
    comments.push("soroban-testkit audit \\");
    
    const optionalArgs = buildOptionalArgs(options);
    if (optionalArgs.length > 0) {
      comments.push(`  ${auditPath} \\  # Contract source directory`);
      optionalArgs.forEach((arg, index) => {
        const isLast = index === optionalArgs.length - 1;
        if (arg.includes("--strict")) {
          comments.push(`  ${arg}${isLast ? "" : " \\"}  # Fail on warnings`);
        } else {
          comments.push(`  ${arg}${isLast ? "" : " \\"}`);
        }
      });
    } else {
      comments.push(`  ${auditPath}  # Contract source directory`);
    }
  }
  
  return comments.join("\n");
}

// Issue #145: Format command as a reusable shell script
export function formatCommandAsScript(options: CommandOptions): string {
  const lines: string[] = [];
  lines.push("#!/usr/bin/env bash");
  lines.push("");
  lines.push("# Soroban Testkit command script");
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push(`# Workflow: ${options.command}`);
  lines.push("");
  lines.push("set -e  # Exit on error");
  lines.push("");
  
  if (options.command === "coverage") {
    lines.push("# Coverage workflow configuration");
    lines.push(`PROJECT_PATH="${options.path || "."}"`);
    lines.push(`FORMAT="${options.format}"`);
    lines.push(`OPEN_REPORT=${options.open ? "true" : "false"}`);
    lines.push("");
    lines.push("# Generate coverage report");
    lines.push('soroban-testkit coverage \\');
    lines.push('  "$PROJECT_PATH" \\');
    const optionalArgs = buildOptionalArgs(options);
    optionalArgs.forEach((arg, index) => {
      const isLast = index === optionalArgs.length - 1;
      lines.push(`  ${arg}${isLast ? "" : " \\"}`);
    });
  } else if (options.command === "limits") {
    lines.push("# Resource limits configuration");
    lines.push(`CONTRACT="${options.path || fallbackValues.limitsContract}"`);
    lines.push(`FUNCTION="${options.fn || fallbackValues.limitsFunction}"`);
    lines.push(`RAMP_PARAM="${options.ramp || fallbackValues.limitsRamp}"`);
    lines.push("");
    lines.push("# Run resource limits test");
    lines.push('soroban-testkit limits \\');
    lines.push('  --contract "$CONTRACT" \\');
    lines.push('  --fn "$FUNCTION" \\');
    lines.push('  --ramp "$RAMP_PARAM"');
  } else {
    lines.push("# Audit workflow configuration");
    lines.push(`SOURCE_PATH="${options.path || fallbackValues.auditPath}"`);
    lines.push(`STRICT_MODE=${options.strict ? "true" : "false"}`);
    lines.push("");
    lines.push("# Run security audit");
    lines.push('soroban-testkit audit \\');
    lines.push('  "$SOURCE_PATH"');
    if (options.strict) {
      lines.push('  --strict');
    }
  }
  
  lines.push("");
  lines.push('echo "Command completed successfully"');
  
  return lines.join("\n");
}

// Issue #140: Export configuration as JSON
export interface ConfigurationExport {
  version: string;
  exportedAt: string;
  options: CommandOptions;
  command: string;
}

export function exportConfigAsJson(options: CommandOptions): string {
  const config: ConfigurationExport = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    options,
    command: buildCommand(options),
  };
  return JSON.stringify(config, null, 2);
}

// Issue #138: Import configuration with validation
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateConfiguration(data: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data || typeof data !== "object") {
    errors.push("Configuration must be a valid JSON object");
    return { valid: false, errors, warnings };
  }

  const config = data as Record<string, unknown>;

  // Validate required fields
  if (!config.options || typeof config.options !== "object") {
    errors.push("Configuration must contain 'options' object");
    return { valid: false, errors, warnings };
  }

  const options = config.options as Record<string, unknown>;

  // Validate command
  const validCommands = ["coverage", "limits", "audit"];
  if (!options.command || !validCommands.includes(String(options.command))) {
    errors.push(`command must be one of: ${validCommands.join(", ")}`);
  }

  // Validate path
  if (options.path && typeof options.path !== "string") {
    errors.push("path must be a string");
  }

  // Validate format for coverage
  if (options.command === "coverage") {
    const validFormats = ["html", "lcov", "text"];
    if (options.format && !validFormats.includes(String(options.format))) {
      errors.push(`format must be one of: ${validFormats.join(", ")}`);
    }
  }

  // Validate boolean fields
  if (options.open !== undefined && typeof options.open !== "boolean") {
    errors.push("open must be a boolean");
  }
  if (options.strict !== undefined && typeof options.strict !== "boolean") {
    errors.push("strict must be a boolean");
  }

  // Validate string fields
  if (options.fn && typeof options.fn !== "string") {
    errors.push("fn must be a string");
  }
  if (options.ramp && typeof options.ramp !== "string") {
    errors.push("ramp must be a string");
  }

  // Warnings for missing optional fields
  if (!options.path) {
    warnings.push("path is not set; default values will be used");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function importConfigFromJson(jsonString: string): {
  options: CommandOptions | null;
  validation: ValidationResult;
} {
  let data: unknown;
  try {
    data = JSON.parse(jsonString);
  } catch (e) {
    return {
      options: null,
      validation: {
        valid: false,
        errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`],
        warnings: [],
      },
    };
  }

  const validation = validateConfiguration(data);
  if (!validation.valid) {
    return { options: null, validation };
  }

  const config = data as Record<string, unknown>;
  const options = config.options as CommandOptions;

  return { options, validation };
}

export interface EffectiveDefaultRow {
  key: "path" | "fn" | "ramp";
  label: string;
  input: string;
  value: string;
  applied: boolean;
}

/**
 * Lists the fields of the active workflow whose empty input falls back to a
 * default, with the value the generated command will actually use.
 */
export function effectiveDefaults(options: CommandOptions): EffectiveDefaultRow[] {
  if (options.command === "limits") {
    return [
      {
        key: "path",
        label: "Contract artifact",
        input: options.path,
        value: options.path || fallbackValues.limitsContract,
        applied: options.path === "",
      },
      {
        key: "fn",
        label: "Function",
        input: options.fn,
        value: options.fn || fallbackValues.limitsFunction,
        applied: options.fn === "",
      },
      {
        key: "ramp",
        label: "Ramp parameter",
        input: options.ramp,
        value: options.ramp || fallbackValues.limitsRamp,
        applied: options.ramp === "",
      },
    ];
  }

  if (options.command === "audit") {
    return [
      {
        key: "path",
        label: "Project path",
        input: options.path,
        value: options.path || fallbackValues.auditPath,
        applied: options.path === "",
      },
    ];
  }

  return [];
}

export interface SettingSummaryRow {
  label: string;
  value: string;
}

/**
 * Human-readable recap of the settings the active workflow will run with.
 * Falls back to the same defaults `buildCommand` applies, marked "(default)".
 */
export function summarizeConfiguration(
  options: CommandOptions,
): SettingSummaryRow[] {
  if (options.command === "coverage") {
    return [
      { label: "Project or contract path", value: options.path || "(omitted)" },
      { label: "Report format", value: options.format },
      { label: "Open report when complete", value: options.open ? "On" : "Off" },
    ];
  }

  if (options.command === "limits") {
    return [
      {
        label: "Contract artifact",
        value: options.path || `${fallbackValues.limitsContract} (default)`,
      },
      {
        label: "Function",
        value: options.fn || `${fallbackValues.limitsFunction} (default)`,
      },
      {
        label: "Ramp parameter",
        value: options.ramp || `${fallbackValues.limitsRamp} (default)`,
      },
    ];
  }

  return [
    {
      label: "Project path",
      value: options.path || `${fallbackValues.auditPath} (default)`,
    },
    { label: "Fail on warnings", value: options.strict ? "On" : "Off" },
  ];
}

export interface ComparisonRow {
  key: string;
  label: string;
  a: string;
  b: string;
  changed: boolean;
}

/**
 * Compares two configurations setting by setting. Rows are included when the
 * setting applies to either side; sides that do not use the setting read
 * "n/a" and empty values read "(empty)".
 */
export function compareConfigurations(
  a: CommandOptions,
  b: CommandOptions,
): ComparisonRow[] {
  const usesCoverage = a.command === "coverage" || b.command === "coverage";
  const usesLimits = a.command === "limits" || b.command === "limits";
  const usesAudit = a.command === "audit" || b.command === "audit";

  const fields: Array<{
    key: string;
    label: string;
    applicable: boolean;
    value: (options: CommandOptions) => string;
  }> = [
    { key: "command", label: "Workflow", applicable: true, value: (o) => o.command },
    {
      key: "path",
      label: "Project or contract path",
      applicable: true,
      value: (o) => o.path || "(empty)",
    },
    {
      key: "format",
      label: "Report format",
      applicable: usesCoverage,
      value: (o) => (o.command === "coverage" ? o.format : "n/a"),
    },
    {
      key: "open",
      label: "Open report when complete",
      applicable: usesCoverage,
      value: (o) => (o.command === "coverage" ? (o.open ? "On" : "Off") : "n/a"),
    },
    {
      key: "fn",
      label: "Function",
      applicable: usesLimits,
      value: (o) => (o.command === "limits" ? o.fn || "(empty)" : "n/a"),
    },
    {
      key: "ramp",
      label: "Ramp parameter",
      applicable: usesLimits,
      value: (o) => (o.command === "limits" ? o.ramp || "(empty)" : "n/a"),
    },
    {
      key: "strict",
      label: "Fail on warnings",
      applicable: usesAudit,
      value: (o) => (o.command === "audit" ? (o.strict ? "On" : "Off") : "n/a"),
    },
  ];

  return fields
    .filter((field) => field.applicable)
    .map((field) => {
      const aValue = field.value(a);
      const bValue = field.value(b);
      return {
        key: field.key,
        label: field.label,
        a: aValue,
        b: bValue,
        changed: aValue !== bValue,
      };
    });
}

export interface CliCompatibility {
  version: string;
  sorobanSdk: string;
  stellarCli: string;
  rustTarget: string;
  status: "Current" | "Supported" | "Upcoming";
  notes: string;
}

export const cliCompatibility: readonly CliCompatibility[] = [
  {
    version: "v0.2.0",
    sorobanSdk: "27.0.x",
    stellarCli: ">= 22.0.0",
    rustTarget: "wasm32v1-none (Rust >= 1.84)",
    status: "Current",
    notes:
      "AuthMatrix multi-actor enforcement, auth-mocked limits ramp, SAC heuristic mocking, cargo-llvm-cov integration.",
  },
  {
    version: "v0.1.0",
    sorobanSdk: "22.x - 26.x",
    stellarCli: ">= 21.0.0",
    rustTarget: "wasm32-unknown-unknown / wasm32v1-none",
    status: "Supported",
    notes:
      "Deterministic TestEnv, ledger timestamp/sequence warping, conservation balance checks, AST source code audit scanner.",
  },
  {
    version: "v0.3.0",
    sorobanSdk: "28.0.x+",
    stellarCli: ">= 23.0.0",
    rustTarget: "wasm32v1-none (Rust 2024)",
    status: "Upcoming",
    notes:
      "Extended persistent TTL storage simulation, multi-contract cross-call limits ramp, and gas telemetry export.",
  },
];

export interface InstallStep {
  title: string;
  description: string;
  command: string;
}

/**
 * First-time installation workflow, mirrored from the CLI documentation in
 * `testkit-blockchain`. Ordered: each step builds on the previous one.
 */
export const installationSteps: readonly InstallStep[] = [
  {
    title: "Add the WebAssembly target",
    description:
      "Testkit probes compiled contracts on the pinned Rust stable toolchain, so the wasm32v1-none target has to be present.",
    command: "rustup target add wasm32v1-none",
  },
  {
    title: "Install the soroban-testkit CLI",
    description:
      "Installs the companion binary from crates.io. From a workspace checkout, install the local crate instead with: cargo install --path crates/cli --locked",
    command: "cargo install soroban-testkit-cli --locked",
  },
  {
    title: "Install the coverage wrapper",
    description:
      "The coverage workflow shells out to cargo-llvm-cov, which Testkit calls but does not bundle. Skip this step if you only use limits or audit.",
    command: "cargo install cargo-llvm-cov",
  },
  {
    title: "Add the crate to your contract",
    description:
      "Adds Testkit as a dev-dependency so contract tests can import the prelude and the focused testing modules.",
    command: "cargo add --dev soroban-testkit",
  },
  {
    title: "Verify the installation",
    description:
      "Confirms the binary resolves on your PATH and lists the supported subcommands.",
    command: "soroban-testkit --help",
  },
  {
    title: "Build your first command",
    description:
      "The workbench below generates coverage, limits, and audit commands, previews every default that will be applied, and copies the exact line to your terminal.",
    command: "soroban-testkit coverage . --format html --open",
  },
];

export interface LocalFileGuide {
  command: CommandName;
  title: string;
  summary: string;
  defaultPath: string;
  resolvedPathExample: (path: string) => string;
  filesRead: string[];
  filesWritten: string[];
  offlineGuarantee: string;
}

export const localFileGuides: Record<CommandName, LocalFileGuide> = {
  coverage: {
    command: "coverage",
    title: "Contract Coverage (cargo-llvm-cov)",
    summary:
      "Instruments contract crates and runs local test suites to compute exact source and branch coverage.",
    defaultPath: ".",
    resolvedPathExample: (p) => (p || ".").replace(/\/$/, "") + "/Cargo.toml",
    filesRead: [
      "Cargo.toml / Cargo.lock (crate dependencies and test harness)",
      "src/**/*.rs (contract source files)",
      "tests/**/*.rs (integration test suites)",
    ],
    filesWritten: [
      "target/llvm-cov/html/** (interactive report when --format html)",
      "target/llvm-cov/lcov.info (coverage trace when --format lcov)",
      "None (stdout summary only when --format text)",
    ],
    offlineGuarantee:
      "Execution is 100% offline. No contract bytecode or source files are ever transmitted remotely.",
  },
  limits: {
    command: "limits",
    title: "Resource Limit Ramp (soroban-testkit limits)",
    summary:
      "Probes compiled WASM bytecode across stepped parameter values to find exact instruction and memory boundaries.",
    defaultPath: "target/wasm32v1-none/release/contract.wasm",
    resolvedPathExample: (p) =>
      p || "target/wasm32v1-none/release/contract.wasm",
    filesRead: [
      "Pre-compiled contract WebAssembly bytecode (.wasm artifact)",
      "Local function export table and symbol signatures",
    ],
    filesWritten: [
      "None (metrics and resource ceilings stream directly to terminal stdout)",
    ],
    offlineGuarantee:
      "100% offline. Probes execute in isolated local child processes using in-memory mock ledger state with zero network RPC calls.",
  },
  audit: {
    command: "audit",
    title: "Static Source Audit (soroban-testkit audit)",
    summary:
      "Performs AST-level static security checks for authentication gating, arithmetic safety, and TTL state.",
    defaultPath: "./src",
    resolvedPathExample: (p) => (p || "./src").replace(/\/$/, "") + "/*.rs",
    filesRead: [
      "Rust source files (*.rs) in the specified project directory",
      "Syntax trees for require_auth, arithmetic operations, and storage keys",
    ],
    filesWritten: [
      "None (findings and warning locations stream directly to terminal stdout)",
    ],
    offlineGuarantee:
      "100% offline, read-only and non-destructive. Source code is parsed locally without external telemetry.",
  },
};
