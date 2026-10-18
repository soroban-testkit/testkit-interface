import { describe, expect, it } from "vitest";
import { buildCommand, validateCommandInputs } from "./testkit";

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

describe("validateCommandInputs", () => {
  it("returns no errors for valid coverage options", () => {
    const errors = validateCommandInputs({
      command: "coverage",
      path: ".",
      format: "html",
      open: true,
      fn: "",
      ramp: "",
      strict: false,
    });
    expect(errors).toEqual({});
  });

  it("returns an error when path is empty or whitespace only", () => {
    const emptyErrors = validateCommandInputs({
      command: "coverage",
      path: "",
      format: "html",
      open: true,
      fn: "",
      ramp: "",
      strict: false,
    });
    expect(emptyErrors.path).toBe("Project or contract path cannot be empty.");

    const whitespaceErrors = validateCommandInputs({
      command: "coverage",
      path: "   \t",
      format: "html",
      open: true,
      fn: "",
      ramp: "",
      strict: false,
    });
    expect(whitespaceErrors.path).toBe("Project or contract path cannot be empty.");
  });

  it("returns no errors for valid limits options", () => {
    const errors = validateCommandInputs({
      command: "limits",
      path: "target/wasm32v1-none/release/contract.wasm",
      format: "html",
      open: true,
      fn: "batch_payout",
      ramp: "recipients",
      strict: false,
    });
    expect(errors).toEqual({});
  });

  it("validates function name in limits as a valid Rust identifier", () => {
    const emptyFn = validateCommandInputs({
      command: "limits",
      path: "target.wasm",
      format: "html",
      open: true,
      fn: "",
      ramp: "recipients",
      strict: false,
    });
    expect(emptyFn.fn).toBe("Function name cannot be empty.");

    const invalidFn = validateCommandInputs({
      command: "limits",
      path: "target.wasm",
      format: "html",
      open: true,
      fn: "123_invalid-name!",
      ramp: "recipients",
      strict: false,
    });
    expect(invalidFn.fn).toBe(
      "Function name must be a valid Rust identifier (e.g. batch_payout).",
    );
  });

  it("validates ramp parameter in limits as a valid Rust identifier", () => {
    const emptyRamp = validateCommandInputs({
      command: "limits",
      path: "target.wasm",
      format: "html",
      open: true,
      fn: "batch_payout",
      ramp: "",
      strict: false,
    });
    expect(emptyRamp.ramp).toBe("Ramp parameter cannot be empty.");

    const invalidRamp = validateCommandInputs({
      command: "limits",
      path: "target.wasm",
      format: "html",
      open: true,
      fn: "batch_payout",
      ramp: "invalid ramp param",
      strict: false,
    });
    expect(invalidRamp.ramp).toBe(
      "Ramp parameter must be a valid Rust identifier (e.g. recipients).",
    );
  });

  it("returns no errors for valid audit options", () => {
    const errors = validateCommandInputs({
      command: "audit",
      path: "./src",
      format: "text",
      open: false,
      fn: "",
      ramp: "",
      strict: true,
    });
    expect(errors).toEqual({});
  });
});
