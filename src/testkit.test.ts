import { describe, expect, it } from "vitest";
import {
  buildCommand,
  cliCompatibility,
  compareConfigurations,
  effectiveDefaults,
  formatCommandLine,
  formatCommandWithComments,
  formatCommandAsScript,
  installationSteps,
  localFileGuides,
  summarizeConfiguration,
  type CommandOptions,
} from "./testkit";

describe("buildCommand", () => {
  it("builds a coverage command", () => {
    expect(buildCommand({ command: "coverage", path: ".", format: "html", open: true, fn: "", ramp: "", strict: false }))
      .toBe("soroban-testkit coverage . --format html --open");
  });

  it("quotes paths containing spaces", () => {
    expect(buildCommand({ command: "audit", path: "./my contract/src", format: "text", open: false, fn: "", ramp: "", strict: true }))
      .toBe('soroban-testkit audit "./my contract/src" --strict');
  });

  it("does not quote a coverage path with no spaces", () => {
    expect(buildCommand({ command: "coverage", path: "./contracts/escrow", format: "lcov", open: false, fn: "", ramp: "", strict: false }))
      .toBe("soroban-testkit coverage ./contracts/escrow --format lcov");
  });

  it("quotes a coverage path containing spaces", () => {
    expect(buildCommand({ command: "coverage", path: "./my contract", format: "html", open: false, fn: "", ramp: "", strict: false }))
      .toBe('soroban-testkit coverage "./my contract" --format html');
  });

  it("quotes the limits --contract path when it contains spaces", () => {
    expect(buildCommand({ command: "limits", path: "./target/my build/contract.wasm", format: "html", open: false, fn: "batch_payout", ramp: "recipients", strict: false }))
      .toBe('soroban-testkit limits --contract "./target/my build/contract.wasm" --fn batch_payout --ramp recipients');
  });

  it("falls back to the default contract path for limits, unquoted", () => {
    expect(buildCommand({ command: "limits", path: "", format: "html", open: false, fn: "", ramp: "", strict: false }))
      .toBe("soroban-testkit limits --contract target/wasm32v1-none/release/contract.wasm --fn batch_payout --ramp recipients");
  });

  it("does not quote an audit path with no spaces", () => {
    expect(buildCommand({ command: "audit", path: "./src", format: "text", open: false, fn: "", ramp: "", strict: false }))
      .toBe("soroban-testkit audit ./src");
  });

  it("falls back to the default audit path, unquoted, when none is given", () => {
    expect(buildCommand({ command: "audit", path: "", format: "text", open: false, fn: "", ramp: "", strict: false }))
      .toBe("soroban-testkit audit ./src");
  });

  it("quotes a path with multiple spaces as a single argument", () => {
    expect(buildCommand({ command: "audit", path: "./a b c", format: "text", open: false, fn: "", ramp: "", strict: false }))
      .toBe('soroban-testkit audit "./a b c"');
  });
});

describe("formatCommandLine", () => {
  it("returns single-line identical to buildCommand when multiline is false", () => {
    const options = {
      command: "coverage" as const,
      path: ".",
      format: "html" as const,
      open: true,
      fn: "",
      ramp: "",
      strict: false,
    };
    expect(formatCommandLine(options, false)).toBe(buildCommand(options));
  });

  it("formats multi-line coverage command with POSIX line continuations", () => {
    const formatted = formatCommandLine(
      {
        command: "coverage",
        path: "./contracts/escrow",
        format: "lcov",
        open: true,
        fn: "",
        ramp: "",
        strict: false,
      },
      true,
    );

    expect(formatted).toBe(
      [
        "soroban-testkit coverage \\",
        "  ./contracts/escrow \\",
        "  --format lcov \\",
        "  --open",
      ].join("\n"),
    );
  });

  it("formats multi-line limits command with quoted paths if needed", () => {
    const formatted = formatCommandLine(
      {
        command: "limits",
        path: "target/release/my contract.wasm",
        format: "html",
        open: false,
        fn: "execute_equal",
        ramp: "recipients",
        strict: false,
      },
      true,
    );

    expect(formatted).toBe(
      [
        "soroban-testkit limits \\",
        '  --contract "target/release/my contract.wasm" \\',
        "  --fn execute_equal \\",
        "  --ramp recipients",
      ].join("\n"),
    );
  });

  it("formats multi-line audit command with strict flag", () => {
    const formatted = formatCommandLine(
      {
        command: "audit",
        path: "./my-contract/src",
        format: "text",
        open: false,
        fn: "",
        ramp: "",
        strict: true,
      },
      true,
    );

    expect(formatted).toBe(
      [
        "soroban-testkit audit \\",
        "  ./my-contract/src \\",
        "  --strict",
      ].join("\n"),
    );
  });

  it("formats multi-line audit command without strict flag", () => {
    const formatted = formatCommandLine(
      {
        command: "audit",
        path: "./src",
        format: "text",
        open: false,
        fn: "",
        ramp: "",
        strict: false,
      },
      true,
    );

    expect(formatted).toBe(
      [
        "soroban-testkit audit \\",
        "  ./src",
      ].join("\n"),
    );
  });
});

describe("cliCompatibility", () => {
  it("provides version entries with required compatibility targets", () => {
    expect(cliCompatibility.length).toBeGreaterThanOrEqual(3);

    const current = cliCompatibility.find((c) => c.status === "Current");
    expect(current).toBeDefined();
    expect(current?.sorobanSdk).toBe("27.0.x");
    expect(current?.rustTarget).toContain("wasm32v1-none");

    for (const row of cliCompatibility) {
      expect(row.version).toBeTruthy();
      expect(row.sorobanSdk).toBeTruthy();
      expect(row.stellarCli).toBeTruthy();
      expect(row.rustTarget).toBeTruthy();
      expect(row.status).toBeTruthy();
      expect(row.notes).toBeTruthy();
    }
  });
});

describe("localFileGuides", () => {
  it("covers all commands with input/output documentation", () => {
    for (const cmd of ["coverage", "limits", "audit"] as const) {
      const guide = localFileGuides[cmd];
      expect(guide).toBeDefined();
      expect(guide.filesRead.length).toBeGreaterThan(0);
      expect(guide.filesWritten.length).toBeGreaterThan(0);
      expect(guide.offlineGuarantee).toContain("offline");
      expect(guide.resolvedPathExample("test-path")).toBeTruthy();
    }
  });
});

const baseOptions: CommandOptions = {
  command: "coverage",
  path: ".",
  format: "html",
  open: true,
  fn: "",
  ramp: "",
  strict: false,
};

const options = (overrides: Partial<CommandOptions> = {}): CommandOptions => ({
  ...baseOptions,
  ...overrides,
});

describe("installationSteps", () => {
  it("documents the first-time installation workflow in order", () => {
    expect(installationSteps.length).toBeGreaterThanOrEqual(4);
    expect(installationSteps[0].command).toBe("rustup target add wasm32v1-none");

    for (const step of installationSteps) {
      expect(step.title).toBeTruthy();
      expect(step.description).toBeTruthy();
      expect(step.command).toBeTruthy();
    }

    const commands = installationSteps.map((step) => step.command);
    expect(commands).toContain("cargo install soroban-testkit-cli --locked");
    expect(commands).toContain("cargo install cargo-llvm-cov");
    expect(commands).toContain("cargo add --dev soroban-testkit");
    expect(commands).toContain("soroban-testkit --help");
  });

  it("ends on the command the workbench generates by default", () => {
    const last = installationSteps[installationSteps.length - 1];
    expect(last.command).toBe(buildCommand(options()));
  });
});

describe("effectiveDefaults", () => {
  it("returns no fallback rows for coverage", () => {
    expect(effectiveDefaults(options())).toEqual([]);
  });

  it("previews every limits fallback when the inputs are empty", () => {
    const rows = effectiveDefaults(
      options({ command: "limits", path: "", fn: "", ramp: "" }),
    );

    expect(rows.map((row) => row.value)).toEqual([
      "target/wasm32v1-none/release/contract.wasm",
      "batch_payout",
      "recipients",
    ]);
    expect(rows.every((row) => row.applied)).toBe(true);
  });

  it("marks typed limits values as coming from the input", () => {
    const rows = effectiveDefaults(
      options({
        command: "limits",
        path: "target/release/my_contract.wasm",
        fn: "execute_equal",
        ramp: "",
      }),
    );

    expect(rows.find((row) => row.key === "path")).toMatchObject({
      value: "target/release/my_contract.wasm",
      applied: false,
    });
    expect(rows.find((row) => row.key === "fn")).toMatchObject({
      input: "execute_equal",
      value: "execute_equal",
      applied: false,
    });
    expect(rows.find((row) => row.key === "ramp")).toMatchObject({
      value: "recipients",
      applied: true,
    });
  });

  it("previews the audit source fallback only when the path is empty", () => {
    expect(effectiveDefaults(options({ command: "audit", path: "" }))).toEqual([
      {
        key: "path",
        label: "Project path",
        input: "",
        value: "./src",
        applied: true,
      },
    ]);

    const rows = effectiveDefaults(
      options({ command: "audit", path: "./contracts" }),
    );
    expect(rows[0]).toMatchObject({ value: "./contracts", applied: false });
  });
});

describe("summarizeConfiguration", () => {
  it("summarizes the coverage settings", () => {
    expect(summarizeConfiguration(options())).toEqual([
      { label: "Project or contract path", value: "." },
      { label: "Report format", value: "html" },
      { label: "Open report when complete", value: "On" },
    ]);
  });

  it("marks an omitted coverage path", () => {
    expect(summarizeConfiguration(options({ path: "" }))[0]).toEqual({
      label: "Project or contract path",
      value: "(omitted)",
    });
  });

  it("summarizes limits fallbacks with a default marker", () => {
    expect(
      summarizeConfiguration(
        options({ command: "limits", path: "", fn: "", ramp: "" }),
      ),
    ).toEqual([
      {
        label: "Contract artifact",
        value: "target/wasm32v1-none/release/contract.wasm (default)",
      },
      { label: "Function", value: "batch_payout (default)" },
      { label: "Ramp parameter", value: "recipients (default)" },
    ]);
  });

  it("summarizes audit settings", () => {
    expect(
      summarizeConfiguration(
        options({ command: "audit", path: "./src", strict: true }),
      ),
    ).toEqual([
      { label: "Project path", value: "./src" },
      { label: "Fail on warnings", value: "On" },
    ]);
  });
});

describe("compareConfigurations", () => {
  it("marks identical configurations as matching", () => {
    const rows = compareConfigurations(options(), options());

    expect(rows.map((row) => row.key)).toEqual([
      "command",
      "path",
      "format",
      "open",
    ]);
    expect(rows.every((row) => !row.changed)).toBe(true);
  });

  it("flags the settings that differ between two configurations", () => {
    const rows = compareConfigurations(
      options(),
      options({ path: "./contracts/escrow" }),
    );

    expect(rows.find((row) => row.key === "path")).toMatchObject({
      a: ".",
      b: "./contracts/escrow",
      changed: true,
    });
    expect(rows.find((row) => row.key === "format")?.changed).toBe(false);
  });

  it("includes a setting once either workflow uses it", () => {
    const rows = compareConfigurations(options(), options({ command: "limits" }));

    expect(rows.map((row) => row.key)).toEqual([
      "command",
      "path",
      "format",
      "open",
      "fn",
      "ramp",
    ]);
    expect(rows.find((row) => row.key === "command")?.changed).toBe(true);
    expect(rows.find((row) => row.key === "format")).toMatchObject({
      a: "html",
      b: "n/a",
      changed: true,
    });
  });

  it("shows audit-only rows when either side audits", () => {
    const rows = compareConfigurations(
      options({ command: "audit", path: "./src", strict: true }),
      options({ command: "audit", path: "./contracts", strict: false }),
    );

    expect(rows.map((row) => row.key)).toEqual(["command", "path", "strict"]);
    expect(rows.find((row) => row.key === "strict")).toMatchObject({
      a: "On",
      b: "Off",
      changed: true,
    });
  });

  it("renders empty values as (empty) instead of blank cells", () => {
    const rows = compareConfigurations(
      options({ command: "limits", path: "", fn: "", ramp: "" }),
      options({ command: "limits", path: "", fn: "", ramp: "" }),
    );

    expect(rows.find((row) => row.key === "path")).toMatchObject({
      a: "(empty)",
      b: "(empty)",
      changed: false,
    });
  });
});



// Issue #144: Tests for formatCommandWithComments
describe("formatCommandWithComments", () => {
  it("formats coverage command with explanatory comments", () => {
    const formatted = formatCommandWithComments({
      command: "coverage",
      path: "./contracts",
      format: "html",
      open: true,
      fn: "",
      ramp: "",
      strict: false,
    });

    expect(formatted).toContain("# Generate contract-test coverage");
    expect(formatted).toContain("soroban-testkit coverage");
    expect(formatted).toContain("# Project or contract path");
    expect(formatted).toContain("# Output format");
    expect(formatted).toContain("# Open report in browser");
  });

  it("formats limits command with explanatory comments", () => {
    const formatted = formatCommandWithComments({
      command: "limits",
      path: "target/wasm32v1-none/release/contract.wasm",
      format: "html",
      open: false,
      fn: "batch_payout",
      ramp: "recipients",
      strict: false,
    });

    expect(formatted).toContain("# Ramp a contract input to find its practical resource ceiling");
    expect(formatted).toContain("soroban-testkit limits");
    expect(formatted).toContain("# Path to compiled WASM artifact");
    expect(formatted).toContain("# Function to probe for limits");
    expect(formatted).toContain("# Parameter to increase");
  });

  it("formats audit command with explanatory comments", () => {
    const formatted = formatCommandWithComments({
      command: "audit",
      path: "./src",
      format: "text",
      open: false,
      fn: "",
      ramp: "",
      strict: true,
    });

    expect(formatted).toContain("# Scan contract sources for auth, arithmetic, and TTL risks");
    expect(formatted).toContain("soroban-testkit audit");
    expect(formatted).toContain("# Contract source directory");
    expect(formatted).toContain("# Fail on warnings");
  });

  it("handles empty paths with defaults", () => {
    const formatted = formatCommandWithComments({
      command: "limits",
      path: "",
      format: "html",
      open: false,
      fn: "",
      ramp: "",
      strict: false,
    });

    expect(formatted).toContain("target/wasm32v1-none/release/contract.wasm");
    expect(formatted).toContain("batch_payout");
    expect(formatted).toContain("recipients");
  });
});

// Issue #145: Tests for formatCommandAsScript
describe("formatCommandAsScript", () => {
  it("generates a valid bash script for coverage command", () => {
    const script = formatCommandAsScript({
      command: "coverage",
      path: "./contracts",
      format: "html",
      open: true,
      fn: "",
      ramp: "",
      strict: false,
    });

    expect(script).toContain("#!/usr/bin/env bash");
    expect(script).toContain("set -e");
    expect(script).toContain("# Coverage workflow configuration");
    expect(script).toContain('PROJECT_PATH="./contracts"');
    expect(script).toContain('FORMAT="html"');
    expect(script).toContain("OPEN_REPORT=true");
    expect(script).toContain("soroban-testkit coverage");
    expect(script).toContain('echo "Command completed successfully"');
  });

  it("generates a valid bash script for limits command", () => {
    const script = formatCommandAsScript({
      command: "limits",
      path: "target/wasm32v1-none/release/contract.wasm",
      format: "html",
      open: false,
      fn: "execute_equal",
      ramp: "recipients",
      strict: false,
    });

    expect(script).toContain("#!/usr/bin/env bash");
    expect(script).toContain("# Resource limits configuration");
    expect(script).toContain('CONTRACT="target/wasm32v1-none/release/contract.wasm"');
    expect(script).toContain('FUNCTION="execute_equal"');
    expect(script).toContain('RAMP_PARAM="recipients"');
    expect(script).toContain("soroban-testkit limits");
    expect(script).toContain('--contract "$CONTRACT"');
    expect(script).toContain('--fn "$FUNCTION"');
    expect(script).toContain('--ramp "$RAMP_PARAM"');
  });

  it("generates a valid bash script for audit command", () => {
    const script = formatCommandAsScript({
      command: "audit",
      path: "./src",
      format: "text",
      open: false,
      fn: "",
      ramp: "",
      strict: true,
    });

    expect(script).toContain("#!/usr/bin/env bash");
    expect(script).toContain("# Audit workflow configuration");
    expect(script).toContain('SOURCE_PATH="./src"');
    expect(script).toContain("STRICT_MODE=true");
    expect(script).toContain("soroban-testkit audit");
    expect(script).toContain("--strict");
  });

  it("includes timestamp and workflow metadata", () => {
    const script = formatCommandAsScript({
      command: "coverage",
      path: ".",
      format: "html",
      open: true,
      fn: "",
      ramp: "",
      strict: false,
    });

    expect(script).toContain("# Generated:");
    expect(script).toContain("# Workflow: coverage");
    expect(script).toMatch(/# Generated: \d{4}-\d{2}-\d{2}/);
  });

  it("uses default values when fields are empty", () => {
    const script = formatCommandAsScript({
      command: "limits",
      path: "",
      format: "html",
      open: false,
      fn: "",
      ramp: "",
      strict: false,
    });

    expect(script).toContain('CONTRACT="target/wasm32v1-none/release/contract.wasm"');
    expect(script).toContain('FUNCTION="batch_payout"');
    expect(script).toContain('RAMP_PARAM="recipients"');
  });
});
