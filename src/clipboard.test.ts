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

  it("rejects empty and whitespace commands without writing to the Clipboard API", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    await expect(copyToClipboard("")).rejects.toThrow("Cannot copy an empty command");
    await expect(copyToClipboard("  \n\t")).rejects.toThrow("Cannot copy an empty command");

    expect(writeText).not.toHaveBeenCalled();
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("rejects a blank command without invoking the legacy fallback", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    await expect(copyToClipboard("  ")).rejects.toThrow("Cannot copy an empty command");

    expect(execCommand).not.toHaveBeenCalled();
    expect(document.querySelector("textarea")).toBeNull();
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

  it("falls back to execCommand when the Clipboard API exists but writeText is missing", async () => {
    // Some browsers expose a partial `navigator.clipboard` (e.g. only `read`),
    // which used to make the Copy action throw instead of falling back.
    Object.defineProperty(navigator, "clipboard", {
      value: {},
      configurable: true,
    });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    await expect(
      copyToClipboard("soroban-testkit audit . --strict"),
    ).resolves.toBeUndefined();

    expect(execCommand).toHaveBeenCalledWith("copy");
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
