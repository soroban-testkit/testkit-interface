import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

describe("App command copy", () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("copies the currently generated command to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("soroban-testkit coverage . --format html --open"),
    );
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("copies the command for the selected tab, not the default one", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "audit" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("soroban-testkit audit . --strict"),
    );
  });

  it("still copies successfully when the browser has no Clipboard API", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => expect(execCommand).toHaveBeenCalledWith("copy"));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });
});

describe("App accessibility assertions (#203)", () => {
  it("provides proper ARIA tablist, tab, and tabpanel roles and relationships", () => {
    render(<App />);

    const tablist = screen.getByRole("tablist", { name: "CLI commands" });
    expect(tablist).toBeInTheDocument();

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);

    const coverageTab = screen.getByRole("tab", { name: "coverage" });
    const limitsTab = screen.getByRole("tab", { name: "limits" });
    const auditTab = screen.getByRole("tab", { name: "audit" });

    expect(coverageTab).toHaveAttribute("aria-selected", "true");
    expect(coverageTab).toHaveAttribute("id", "tab-coverage");
    expect(coverageTab).toHaveAttribute("aria-controls", "panel-coverage");
    expect(coverageTab).toHaveAttribute("tabindex", "0");

    expect(limitsTab).toHaveAttribute("aria-selected", "false");
    expect(limitsTab).toHaveAttribute("id", "tab-limits");
    expect(limitsTab).toHaveAttribute("aria-controls", "panel-limits");
    expect(limitsTab).toHaveAttribute("tabindex", "-1");

    expect(auditTab).toHaveAttribute("aria-selected", "false");
    expect(auditTab).toHaveAttribute("id", "tab-audit");
    expect(auditTab).toHaveAttribute("aria-controls", "panel-audit");
    expect(auditTab).toHaveAttribute("tabindex", "-1");

    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("id", "panel-coverage");
    expect(panel).toHaveAttribute("aria-labelledby", "tab-coverage");
  });

  it("associates all builder inputs with accessible form labels", () => {
    render(<App />);

    expect(screen.getByLabelText("Project or contract path")).toBeInTheDocument();
    expect(screen.getByLabelText("Report format")).toBeInTheDocument();
    expect(screen.getByLabelText("Open report when complete")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "limits" }));
    expect(screen.getByLabelText("Project or contract path")).toBeInTheDocument();
    expect(screen.getByLabelText("Function")).toBeInTheDocument();
    expect(screen.getByLabelText("Ramp parameter")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "audit" }));
    expect(screen.getByLabelText("Project or contract path")).toBeInTheDocument();
    expect(screen.getByLabelText("Fail on warnings")).toBeInTheDocument();
  });

  it("includes an accessible polite live region for screen-reader announcements", () => {
    const { container } = render(<App />);
    const liveRegion = container.querySelector('[role="status"][aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
  });
});

describe("App keyboard workflow navigation (#204)", () => {
  it("cycles through tabs using ArrowRight and ArrowLeft keys", () => {
    render(<App />);

    const coverageTab = screen.getByRole("tab", { name: "coverage" });
    const limitsTab = screen.getByRole("tab", { name: "limits" });
    const auditTab = screen.getByRole("tab", { name: "audit" });

    coverageTab.focus();
    expect(coverageTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(coverageTab, { key: "ArrowRight" });
    expect(limitsTab).toHaveAttribute("aria-selected", "true");
    expect(coverageTab).toHaveAttribute("aria-selected", "false");
    expect(limitsTab).toHaveAttribute("tabindex", "0");
    expect(coverageTab).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "panel-limits");

    fireEvent.keyDown(limitsTab, { key: "ArrowRight" });
    expect(auditTab).toHaveAttribute("aria-selected", "true");
    expect(auditTab).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "panel-audit");

    // Wrap around to the first tab
    fireEvent.keyDown(auditTab, { key: "ArrowRight" });
    expect(coverageTab).toHaveAttribute("aria-selected", "true");
    expect(coverageTab).toHaveAttribute("tabindex", "0");

    // Wrap backwards to the last tab with ArrowLeft
    fireEvent.keyDown(coverageTab, { key: "ArrowLeft" });
    expect(auditTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(auditTab, { key: "ArrowLeft" });
    expect(limitsTab).toHaveAttribute("aria-selected", "true");
  });

  it("jumps to first and last tabs using Home and End keys", () => {
    render(<App />);

    const coverageTab = screen.getByRole("tab", { name: "coverage" });
    const auditTab = screen.getByRole("tab", { name: "audit" });

    coverageTab.focus();

    fireEvent.keyDown(coverageTab, { key: "End" });
    expect(auditTab).toHaveAttribute("aria-selected", "true");
    expect(auditTab).toHaveAttribute("tabindex", "0");
    expect(coverageTab).toHaveAttribute("tabindex", "-1");

    fireEvent.keyDown(auditTab, { key: "Home" });
    expect(coverageTab).toHaveAttribute("aria-selected", "true");
    expect(coverageTab).toHaveAttribute("tabindex", "0");
  });
});

describe("App reset behavior after customized inputs (#205)", () => {
  it("resets coverage inputs to default values and updates the generated command", () => {
    render(<App />);

    const pathInput = screen.getByLabelText("Project or contract path") as HTMLInputElement;
    const formatSelect = screen.getByLabelText("Report format") as HTMLSelectElement;
    const openCheckbox = screen.getByLabelText("Open report when complete") as HTMLInputElement;

    fireEvent.change(pathInput, { target: { value: "./contracts/escrow" } });
    fireEvent.change(formatSelect, { target: { value: "lcov" } });
    fireEvent.click(openCheckbox);

    expect(
      screen.getByText("soroban-testkit coverage ./contracts/escrow --format lcov"),
    ).toBeInTheDocument();

    const resetButton = screen.getByRole("button", { name: "Reset" });
    fireEvent.click(resetButton);

    expect(pathInput.value).toBe(".");
    expect(formatSelect.value).toBe("html");
    expect(openCheckbox.checked).toBe(true);
    expect(
      screen.getByText("soroban-testkit coverage . --format html --open"),
    ).toBeInTheDocument();

    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toHaveTextContent("Reset coverage configuration to default settings");
  });

  it("resets limits inputs to default values", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "limits" }));

    const pathInput = screen.getByLabelText("Project or contract path") as HTMLInputElement;
    const fnInput = screen.getByLabelText("Function") as HTMLInputElement;
    const rampInput = screen.getByLabelText("Ramp parameter") as HTMLInputElement;

    fireEvent.change(pathInput, { target: { value: "./custom/path.wasm" } });
    fireEvent.change(fnInput, { target: { value: "custom_fn" } });
    fireEvent.change(rampInput, { target: { value: "custom_ramp" } });

    expect(
      screen.getByText(
        'soroban-testkit limits --contract "./custom/path.wasm" --fn custom_fn --ramp custom_ramp',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(pathInput.value).toBe("target/wasm32v1-none/release/contract.wasm");
    expect(fnInput.value).toBe("batch_payout");
    expect(rampInput.value).toBe("recipients");
    expect(
      screen.getByText(
        "soroban-testkit limits --contract target/wasm32v1-none/release/contract.wasm --fn batch_payout --ramp recipients",
      ),
    ).toBeInTheDocument();
  });

  it("resets audit inputs to default values and clears validation errors", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "audit" }));

    const pathInput = screen.getByLabelText("Project or contract path") as HTMLInputElement;
    const strictCheckbox = screen.getByLabelText("Fail on warnings") as HTMLInputElement;

    // Introduce invalid empty path
    fireEvent.change(pathInput, { target: { value: "" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Project or contract path cannot be empty.");

    // Uncheck strict
    fireEvent.click(strictCheckbox);

    // Reset
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(pathInput.value).toBe("./src");
    expect(strictCheckbox.checked).toBe(true);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("soroban-testkit audit ./src --strict")).toBeInTheDocument();
  });
});

describe("App clipboard success and failure states (#206)", () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("displays success state and announces to live region when copy succeeds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<App />);

    const copyButton = screen.getByRole("button", { name: "Copy" });
    fireEvent.click(copyButton);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument(),
    );

    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toHaveTextContent("Command copied to clipboard");
  });

  it("displays failure state and announces failure when copy throws", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Clipboard write rejected"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<App />);

    const copyButton = screen.getByRole("button", { name: "Copy" });
    fireEvent.click(copyButton);

    const failedButton = await screen.findByRole("button", { name: "Failed" });
    expect(failedButton).toBeInTheDocument();
    expect(failedButton).toHaveClass("error");

    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toHaveTextContent("Failed to copy command to clipboard");
  });

  it("recovers from failure state back to Copy after timeout", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const writeText = vi.fn().mockRejectedValue(new Error("Clipboard write rejected"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<App />);

    const copyButton = screen.getByRole("button", { name: "Copy" });
    fireEvent.click(copyButton);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Failed" })).toBeInTheDocument(),
    );

    act(() => {
      vi.advanceTimersByTime(2100);
    });

    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).not.toHaveClass("error");
  });
});

describe("App invalid builder input states (#207)", () => {
  it("shows error alert, marks aria-invalid, and disables Copy button when path is empty", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<App />);

    const pathInput = screen.getByLabelText("Project or contract path");
    const copyButton = screen.getByRole("button", { name: "Copy" });

    expect(pathInput).toHaveAttribute("aria-invalid", "false");
    expect(copyButton).not.toBeDisabled();

    fireEvent.change(pathInput, { target: { value: "   " } });

    expect(pathInput).toHaveAttribute("aria-invalid", "true");
    expect(pathInput).toHaveAttribute("aria-describedby", "error-path");

    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("id", "error-path");
    expect(alert).toHaveTextContent("Project or contract path cannot be empty.");

    expect(copyButton).toBeDisabled();

    // Clicking disabled Copy button should not copy
    fireEvent.click(copyButton);
    expect(writeText).not.toHaveBeenCalled();

    // Restoring valid value clears error state
    fireEvent.change(pathInput, { target: { value: "./src" } });
    expect(pathInput).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(copyButton).not.toBeDisabled();
  });

  it("shows error alert and disables Copy button for invalid limits function identifier", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "limits" }));

    const fnInput = screen.getByLabelText("Function");
    const copyButton = screen.getByRole("button", { name: "Copy" });

    fireEvent.change(fnInput, { target: { value: "123-bad-fn" } });

    expect(fnInput).toHaveAttribute("aria-invalid", "true");
    expect(fnInput).toHaveAttribute("aria-describedby", "error-fn");

    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("id", "error-fn");
    expect(alert).toHaveTextContent(
      "Function name must be a valid Rust identifier (e.g. batch_payout).",
    );
    expect(copyButton).toBeDisabled();

    fireEvent.change(fnInput, { target: { value: "valid_function" } });
    expect(fnInput).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(copyButton).not.toBeDisabled();
  });

  it("shows error alert and disables Copy button for invalid limits ramp parameter", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "limits" }));

    const rampInput = screen.getByLabelText("Ramp parameter");
    const copyButton = screen.getByRole("button", { name: "Copy" });

    fireEvent.change(rampInput, { target: { value: "invalid param!" } });

    expect(rampInput).toHaveAttribute("aria-invalid", "true");
    expect(rampInput).toHaveAttribute("aria-describedby", "error-ramp");

    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("id", "error-ramp");
    expect(alert).toHaveTextContent(
      "Ramp parameter must be a valid Rust identifier (e.g. recipients).",
    );
    expect(copyButton).toBeDisabled();

    fireEvent.change(rampInput, { target: { value: "amount" } });
    expect(rampInput).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(copyButton).not.toBeDisabled();
  });
});
