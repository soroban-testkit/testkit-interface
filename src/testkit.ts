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
