import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { findBashSyntaxErrors, isBashScriptSyntaxValid } from "../src/bashSyntax";
import { formatCommandAsScript, type CommandOptions } from "../src/testkit";

const baseOptions: CommandOptions = {
  command: "coverage",
  path: ".",
  format: "html",
  open: true,
  fn: "batch_payout",
  ramp: "recipients",
  strict: true,
};

const scriptCases: Array<[string, Partial<CommandOptions>]> = [
  ["coverage with every optional argument", { command: "coverage", path: "./contracts" }],
  ["coverage without --open", { command: "coverage", path: ".", open: false }],
  ["coverage with reordered optional arguments", {
    command: "coverage",
    path: ".",
    optionalArgOrder: ["open", "format"],
  }],
  ["limits with defaults", { command: "limits", path: "", fn: "", ramp: "" }],
  ["audit in strict mode", { command: "audit", path: "", strict: true }],
  ["audit without --strict", { command: "audit", path: "./src", strict: false }],
  ["path with shell metacharacters", { command: "coverage", path: 'my "$(project)" dir' }],
  ["function and ramp with quotes", { command: "limits", fn: 'my "fn"', ramp: 'ra"mp' }],
];

describe("Copy as Script bash syntax (#262)", () => {
  it("flags unterminated quotes and dangling continuations", () => {
    expect(findBashSyntaxErrors('echo "unterminated')).toContain("Unterminated quote at end of script");
    expect(findBashSyntaxErrors('echo "ok" \\')).toContain("Dangling line continuation at end of script");
    expect(isBashScriptSyntaxValid('echo "ok"')).toBe(true);
  });

  it.each(scriptCases)("generates statically valid bash for %s", (_name, overrides) => {
    const script = formatCommandAsScript({ ...baseOptions, ...overrides });
    expect(findBashSyntaxErrors(script)).toEqual([]);
    expect(isBashScriptSyntaxValid(script)).toBe(true);
  });

  it("ends the coverage command before the final echo when --open is off", () => {
    const script = formatCommandAsScript({ ...baseOptions, open: false });
    expect(script).toContain('  --format "$FORMAT"\n\necho "Command completed successfully"');
  });

  it("keeps --strict on the audit command instead of starting a new command", () => {
    const script = formatCommandAsScript({ ...baseOptions, command: "audit", strict: true });
    expect(script).toContain('soroban-testkit audit \\\n  "$SOURCE_PATH" \\\n  --strict');
  });

  it("escapes command substitution in user-supplied values", () => {
    const script = formatCommandAsScript({ ...baseOptions, path: 'project-$(touch /tmp/testkit-script)' });
    expect(script).toContain('PROJECT_PATH="project-\\$(touch /tmp/testkit-script)"');
  });

  const bashVersion = spawnSync("bash", ["--version"], { encoding: "utf8" });
  const describeWithBash = bashVersion.status === 0 && !bashVersion.error ? describe : describe.skip;

  describeWithBash("authoritative bash -n check", () => {
    it.each(scriptCases)("accepts the generated script for %s", (_name, overrides) => {
      const script = formatCommandAsScript({ ...baseOptions, ...overrides });
      const result = spawnSync("bash", ["-n"], { input: script, encoding: "utf8" });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
    });
  });
});
