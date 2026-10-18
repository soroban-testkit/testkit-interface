export type CommandName = "coverage" | "limits" | "audit";

export interface CommandOptions {
  command: CommandName;
  path: string;
  format: "html" | "lcov" | "text";
  open: boolean;
  fn: string;
  ramp: string;
  strict: boolean;
}

export const modules = [
  ["core", "Deterministic environments and addresses"],
  ["ledger", "Time, sequence, and clock control"],
  ["money", "Adversarial values and conservation checks"],
  ["events", "Typed capture and event assertions"],
  ["tokens", "Stellar Asset Contract test doubles"],
  ["auth", "Privilege and authorization matrices"],
  ["ttl", "Storage lifetime and expiry simulation"],
] as const;

const quote = (value: string) => (value.includes(" ") ? `"${value}"` : value);

export function buildCommand(options: CommandOptions): string {
  if (options.command === "coverage") {
    return [
      "soroban-testkit coverage",
      options.path && quote(options.path),
      `--format ${options.format}`,
      options.open && "--open",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (options.command === "limits") {
    return [
      "soroban-testkit limits",
      "--contract",
      quote(options.path || "target/wasm32v1-none/release/contract.wasm"),
      "--fn",
      options.fn || "batch_payout",
      "--ramp",
      options.ramp || "recipients",
    ].join(" ");
  }

  return [
    "soroban-testkit audit",
    quote(options.path || "./src"),
    options.strict && "--strict",
  ]
    .filter(Boolean)
    .join(" ");
}

export const DEFAULT_OPTIONS: Record<CommandName, CommandOptions> = {
  coverage: {
    command: "coverage",
    path: ".",
    format: "html",
    open: true,
    fn: "batch_payout",
    ramp: "recipients",
    strict: true,
  },
  limits: {
    command: "limits",
    path: "target/wasm32v1-none/release/contract.wasm",
    format: "html",
    open: true,
    fn: "batch_payout",
    ramp: "recipients",
    strict: true,
  },
  audit: {
    command: "audit",
    path: "./src",
    format: "text",
    open: false,
    fn: "batch_payout",
    ramp: "recipients",
    strict: true,
  },
};

export function validateCommandInputs(options: CommandOptions): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!options.path || options.path.trim() === "") {
    errors.path = "Project or contract path cannot be empty.";
  }

  if (options.command === "limits") {
    if (!options.fn || options.fn.trim() === "") {
      errors.fn = "Function name cannot be empty.";
    } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(options.fn.trim())) {
      errors.fn = "Function name must be a valid Rust identifier (e.g. batch_payout).";
    }

    if (!options.ramp || options.ramp.trim() === "") {
      errors.ramp = "Ramp parameter cannot be empty.";
    } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(options.ramp.trim())) {
      errors.ramp = "Ramp parameter must be a valid Rust identifier (e.g. recipients).";
    }
  }

  return errors;
}

