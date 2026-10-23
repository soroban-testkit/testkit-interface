import { afterEach, describe, expect, it, vi } from "vitest";
import { copyToClipboard } from "./clipboard";

describe("copyToClipboard", () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("uses the Clipboard API when the browser supports it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    await copyToClipboard("soroban-testkit audit .");

    expect(writeText).toHaveBeenCalledWith("soroban-testkit audit .");
  });

  it("falls back to execCommand when navigator.clipboard is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    await expect(
      copyToClipboard("soroban-testkit coverage . --format html"),
    ).resolves.toBeUndefined();

    expect(execCommand).toHaveBeenCalledWith("copy");
    // The off-screen textarea used for the fallback must not leak into the DOM.
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("surfaces an error when the fallback copy is rejected by the browser", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    document.execCommand = vi.fn().mockReturnValue(false);

    await expect(copyToClipboard("soroban-testkit audit .")).rejects.toThrow(
      "execCommand('copy') was rejected by the browser",
    );
    expect(document.querySelector("textarea")).toBeNull();
  });
});
