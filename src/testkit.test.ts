import { describe, expect, it } from "vitest";
import { buildCommand } from "./testkit";

describe("buildCommand", () => {
  it("builds a coverage command", () => {
    expect(buildCommand({ command: "coverage", path: ".", format: "html", open: true, fn: "", ramp: "", strict: false }))
      .toBe("soroban-testkit coverage . --format html --open");
  });

  it("quotes paths containing spaces", () => {
    expect(buildCommand({ command: "audit", path: "./my contract/src", format: "text", open: false, fn: "", ramp: "", strict: true }))
      .toBe('soroban-testkit audit "./my contract/src" --strict');
  });
});
