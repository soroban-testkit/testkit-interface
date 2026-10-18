import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

    fireEvent.click(screen.getByRole("button", { name: "audit" }));
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

describe("Reset behavior after customized inputs (#205)", () => {
  it("resets coverage inputs back to defaults after customization", () => {
    render(<App />);

    const pathInput = screen.getByLabelText(/project or contract path/i) as HTMLInputElement;
    const formatSelect = screen.getByLabelText(/report format/i) as HTMLSelectElement;
    const openCheckbox = screen.getByLabelText(/open report when complete/i) as HTMLInputElement;

    fireEvent.change(pathInput, { target: { value: "./contracts/escrow" } });
    fireEvent.change(formatSelect, { target: { value: "lcov" } });
    fireEvent.click(openCheckbox); // uncheck

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
  });

  it("resets limits inputs back to defaults after customization", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "limits" }));

    const pathInput = screen.getByLabelText(/project or contract path/i) as HTMLInputElement;
    const fnInput = screen.getByLabelText(/function/i) as HTMLInputElement;
    const rampInput = screen.getByLabelText(/ramp parameter/i) as HTMLInputElement;

    fireEvent.change(pathInput, { target: { value: "./custom.wasm" } });
    fireEvent.change(fnInput, { target: { value: "custom_fn" } });
    fireEvent.change(rampInput, { target: { value: "custom_ramp" } });

    expect(
      screen.getByText(
        "soroban-testkit limits --contract ./custom.wasm --fn custom_fn --ramp custom_ramp",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(pathInput.value).toBe(".");
    expect(fnInput.value).toBe("batch_payout");
    expect(rampInput.value).toBe("recipients");
    expect(
      screen.getByText(
        "soroban-testkit limits --contract . --fn batch_payout --ramp recipients",
      ),
    ).toBeInTheDocument();
  });

  it("resets audit inputs back to defaults after customization", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "audit" }));

    const pathInput = screen.getByLabelText(/project or contract path/i) as HTMLInputElement;
    const strictCheckbox = screen.getByLabelText(/fail on warnings/i) as HTMLInputElement;

    fireEvent.change(pathInput, { target: { value: "./contracts/vault" } });
    fireEvent.click(strictCheckbox); // uncheck strict

    expect(screen.getByText("soroban-testkit audit ./contracts/vault")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(pathInput.value).toBe(".");
    expect(strictCheckbox.checked).toBe(true);
    expect(screen.getByText("soroban-testkit audit . --strict")).toBeInTheDocument();
  });
});

describe("Responsive footer layout (#195)", () => {
  it("renders wrapping footer columns with links and metadata", () => {
    render(<App />);

    expect(screen.getByText("Soroban Testkit", { selector: ".footer-brand" })).toBeInTheDocument();
    expect(screen.getByText("Built for the Stellar developer ecosystem.")).toBeInTheDocument();
    expect(screen.getByText("Apache-2.0")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CLI Workbench" })).toBeInTheDocument();
  });
});
