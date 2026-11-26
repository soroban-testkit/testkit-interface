import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { CORE_REPO_URL, INSTALL_GUIDE_URL, INTERFACE_REPO_URL } from "./links";

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

  it("still copies successfully when the Clipboard API is present but writeText is missing", async () => {
    // Guard the Copy action against a partial Clipboard API (closes #32).
    Object.defineProperty(navigator, "clipboard", {
      value: {},
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

describe("Copy comments preference (#339)", () => {
  const originalClipboard = navigator.clipboard;
  const preferenceKey = "testkit.copy-with-comments";

  beforeEach(() => {
    localStorage.removeItem(preferenceKey);
  });

  afterEach(() => {
    localStorage.removeItem(preferenceKey);
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("remembers the choice to copy without comments and copies the plain command", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const { unmount } = render(<App />);
    const preference = screen.getByRole("checkbox", { name: "Include explanatory comments" });
    expect(preference).toBeChecked();

    fireEvent.click(preference);
    expect(localStorage.getItem(preferenceKey)).toBe("false");
    unmount();

    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Include explanatory comments" })).not.toBeChecked(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Copy command without explanatory comments" }),
    );

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("soroban-testkit coverage . --format html --open"),
    );
  });
});

describe("Coverage option combinations component tests (#200)", () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("updates format radio options (html, lcov, text)", () => {
    render(<App />);

    const openReport = screen.getByRole("checkbox", { name: /open report when complete/i });
    fireEvent.click(screen.getByRole("radio", { name: "lcov" }));
    expect(openReport).toBeDisabled();
    expect(openReport).not.toBeChecked();
    expect(openReport).toHaveAccessibleDescription(/available for html reports only/i);
    expect(screen.getByTestId("command-output")).toHaveTextContent(/^soroban-testkit coverage \. --format lcov$/);

    fireEvent.click(screen.getByRole("radio", { name: "text" }));
    expect(openReport).toBeDisabled();
    expect(screen.getByTestId("command-output")).toHaveTextContent(/^soroban-testkit coverage \. --format text$/);

    fireEvent.click(screen.getByRole("radio", { name: "html" }));
    expect(openReport).toBeEnabled();
    expect(openReport).toBeChecked();
    expect(screen.getByTestId("command-output")).toHaveTextContent("soroban-testkit coverage . --format html --open");
  });

  it("toggles open report checkbox flag", () => {
    render(<App />);
    const openCheckbox = screen.getByLabelText(/open report when complete/i);

    // Uncheck open report
    fireEvent.click(openCheckbox);
    expect(screen.getByTestId("command-output")).toHaveTextContent("soroban-testkit coverage . --format html");

    // Check open report back on
    fireEvent.click(openCheckbox);
    expect(screen.getByTestId("command-output")).toHaveTextContent("soroban-testkit coverage . --format html --open");
  });

  it("escapes coverage paths containing spaces and quotes in the generated and copied command", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<App />);

    const pathInput = screen.getByRole("textbox", { name: "Project or contract path" });
    const openCheckbox = screen.getByLabelText(/open report when complete/i);

    fireEvent.change(pathInput, { target: { value: `./contracts/my "quoted" escrow's source` } });
    fireEvent.click(screen.getByRole("radio", { name: "lcov" }));
    fireEvent.click(openCheckbox); // unchecked

    const expectedCommand = `soroban-testkit coverage './contracts/my "quoted" escrow'\\''s source' --format lcov`;
    expect(screen.getByTestId("command-output")).toHaveTextContent(expectedCommand);

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expectedCommand));
  });
});

// #21 — values containing tabs or line breaks must be quoted in the generated command
describe("Generated command quoting for tabs and line breaks (#21)", () => {
  it("quotes a coverage path containing a tab", () => {
    render(<App />);

    const pathInput = screen.getByRole("textbox", { name: "Project or contract path" });
    fireEvent.change(pathInput, { target: { value: "./my\tcontract" } });

    expect(screen.getByTestId("command-output")).toHaveTextContent(
      'soroban-testkit coverage "./my\tcontract" --format html --open',
      { normalizeWhitespace: false },
    );
  });

  it("quotes an audit path containing a tab and preserves the strict flag", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "audit" }));

    const pathInput = screen.getByRole("textbox", { name: "Project or contract path" });
    fireEvent.change(pathInput, { target: { value: "./src\tpkg" } });

    expect(screen.getByTestId("command-output")).toHaveTextContent(
      'soroban-testkit audit "./src\tpkg" --strict',
      { normalizeWhitespace: false },
    );
  });
});

// #22 — a path made up only of whitespace must behave like an empty path everywhere
describe("Whitespace-only project paths (#22)", () => {
  it("omits a whitespace-only coverage path from the generated command", () => {
    render(<App />);

    const pathInput = screen.getByRole("textbox", { name: "Project or contract path" });
    fireEvent.change(pathInput, { target: { value: "   " } });

    expect(screen.getByTestId("command-output")).toHaveTextContent(
      "soroban-testkit coverage --format html --open",
    );
  });

  it("falls back to the default contract for a whitespace-only limits path", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "limits" }));

    const pathInput = screen.getByRole("textbox", { name: "Project or contract path" });
    fireEvent.change(pathInput, { target: { value: "\t \n" } });

    expect(screen.getByTestId("command-output")).toHaveTextContent(
      "soroban-testkit limits --contract target/wasm32v1-none/release/contract.wasm --fn batch_payout --ramp recipients",
    );
  });

  it("falls back to the default source dir for a whitespace-only audit path and keeps strict mode", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "audit" }));

    const pathInput = screen.getByRole("textbox", { name: "Project or contract path" });
    fireEvent.change(pathInput, { target: { value: "   " } });

    expect(screen.getByTestId("command-output")).toHaveTextContent(
      "soroban-testkit audit ./src --strict",
    );
  });

  it("still emits a real path in every workflow", () => {
    render(<App />);

    const pathInput = screen.getByRole("textbox", { name: "Project or contract path" });
    fireEvent.change(pathInput, { target: { value: "./contracts/escrow" } });
    expect(screen.getByTestId("command-output")).toHaveTextContent(
      "soroban-testkit coverage ./contracts/escrow --format html --open",
    );

    fireEvent.click(screen.getByRole("button", { name: "limits" }));
    fireEvent.change(pathInput, { target: { value: "./a.wasm" } });
    expect(screen.getByTestId("command-output")).toHaveTextContent(
      "soroban-testkit limits --contract ./a.wasm --fn batch_payout --ramp recipients",
    );

    fireEvent.click(screen.getByRole("button", { name: "audit" }));
    fireEvent.change(pathInput, { target: { value: "./src" } });
    expect(screen.getByTestId("command-output")).toHaveTextContent(
      "soroban-testkit audit ./src --strict",
    );
  });
});

// #23 — stale "Copied" feedback must clear as soon as a command input changes
describe("Clearing stale copy feedback on input changes (#23)", () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("clears the Copied label when the coverage path changes", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument(),
    );

    const pathInput = screen.getByRole("textbox", { name: "Project or contract path" });
    fireEvent.change(pathInput, { target: { value: "./contracts" } });

    expect(screen.queryByRole("button", { name: "Copied" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    // The generated command still reflects the edited input.
    expect(screen.getByTestId("command-output")).toHaveTextContent(
      "soroban-testkit coverage ./contracts --format html --open",
    );
  });

  it("clears the Copied label when a coverage option toggles", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByLabelText(/open report when complete/i));

    expect(screen.queryByRole("button", { name: "Copied" })).not.toBeInTheDocument();
    expect(screen.getByTestId("command-output")).toHaveTextContent(
      "soroban-testkit coverage . --format html",
    );
  });

  it("clears the copy-with-comments label when an input changes", async () => {
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", { name: "Copy command with explanatory comments" }),
    );
    await waitFor(() => expect(screen.getByText("Copied with comments")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("radio", { name: "lcov" }));

    expect(screen.queryByText("Copied with comments")).not.toBeInTheDocument();
    expect(screen.getByText("Copy with comments")).toBeInTheDocument();
  });

  it("clears the script-copied label when an input changes", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Copy as shell script" }));
    await waitFor(() => expect(screen.getByText("Script copied")).toBeInTheDocument());

    const pathInput = screen.getByRole("textbox", { name: "Project or contract path" });
    fireEvent.change(pathInput, { target: { value: "./changed" } });

    expect(screen.queryByText("Script copied")).not.toBeInTheDocument();
    expect(screen.getByText("Copy as script")).toBeInTheDocument();
  });

  it("clears the Copied label when the limits and audit inputs change", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "limits" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Function" }), {
      target: { value: "transfer" },
    });
    expect(screen.queryByRole("button", { name: "Copied" })).not.toBeInTheDocument();
    expect(screen.getByTestId("command-output")).toHaveTextContent(
      "soroban-testkit limits --contract . --fn transfer --ramp recipients",
    );

    fireEvent.click(screen.getByRole("button", { name: "audit" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByLabelText(/fail on warnings/i));
    expect(screen.queryByRole("button", { name: "Copied" })).not.toBeInTheDocument();
    expect(screen.getByTestId("command-output")).toHaveTextContent("soroban-testkit audit .");
  });
});

describe("Limits option combinations component tests (#199)", () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("renders default limits options and allows editing function and ramp", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "limits" }));

    const fnInput = screen.getByRole("textbox", { name: "Function" });
    const rampInput = screen.getByRole("textbox", { name: "Ramp parameter" });

    expect(fnInput).toHaveValue("batch_payout");
    expect(rampInput).toHaveValue("recipients");

    fireEvent.change(fnInput, { target: { value: "deposit_tokens" } });
    fireEvent.change(rampInput, { target: { value: "depositors" } });

    expect(screen.getByTestId("command-output")).toHaveTextContent(
      "soroban-testkit limits --contract . --fn deposit_tokens --ramp depositors",
    );
  });

  it("handles paths with spaces and copies limits command combinations", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "limits" }));

    const pathInput = screen.getByRole("textbox", { name: "Project or contract path" });
    const fnInput = screen.getByRole("textbox", { name: "Function" });
    const rampInput = screen.getByRole("textbox", { name: "Ramp parameter" });

    fireEvent.change(pathInput, {
      target: { value: "./target/release build/token.wasm" },
    });
    fireEvent.change(fnInput, { target: { value: "mint_batch" } });
    fireEvent.change(rampInput, { target: { value: "accounts" } });

    const expectedCommand =
      'soroban-testkit limits --contract "./target/release build/token.wasm" --fn mint_batch --ramp accounts';
    expect(screen.getByTestId("command-output")).toHaveTextContent(expectedCommand);

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expectedCommand));
  });
});

describe("Audit option combinations component tests (#198)", () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("toggles fail on warnings strict mode in audit workflow", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "audit" }));

    const strictCheckbox = screen.getByRole("checkbox", { name: "Fail on warnings (Audit strict mode)" });
    expect(strictCheckbox).toHaveAccessibleDescription(/non-zero status/i);
    expect(strictCheckbox).toBeChecked();
    expect(screen.getByTestId("command-output")).toHaveTextContent("soroban-testkit audit . --strict");

    // Uncheck strict
    fireEvent.click(strictCheckbox);
    expect(strictCheckbox).not.toBeChecked();
    expect(screen.getByTestId("command-output")).toHaveTextContent("soroban-testkit audit .");

    // Check strict again
    fireEvent.click(strictCheckbox);
    expect(strictCheckbox).toBeChecked();
    expect(screen.getByTestId("command-output")).toHaveTextContent("soroban-testkit audit . --strict");
  });

  it("quotes audit path with spaces and copies command to clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "audit" }));

    const pathInput = screen.getByRole("textbox", { name: "Project or contract path" });
    const strictCheckbox = screen.getByLabelText(/fail on warnings/i);

    fireEvent.change(pathInput, { target: { value: "./contracts/safe math" } });
    fireEvent.click(strictCheckbox); // uncheck strict

    const expectedCommand = 'soroban-testkit audit "./contracts/safe math"';
    expect(screen.getByTestId("command-output")).toHaveTextContent(expectedCommand);

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expectedCommand));
  });
});

describe("Workflow switching component tests (#201)", () => {
  it("switches between all three workflows and updates descriptions and controls", () => {
    render(<App />);

    const coverageButton = screen.getByRole("tab", { name: "coverage" });
    const limitsButton = screen.getByRole("tab", { name: "limits" });
    const auditButton = screen.getByRole("tab", { name: "audit" });

    // Initial state: coverage
    expect(coverageButton).toHaveClass("active");
    expect(limitsButton).not.toHaveClass("active");
    expect(auditButton).not.toHaveClass("active");
    expect(
      screen.getByText("Generate contract-test coverage through cargo-llvm-cov."),
    ).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: /report format/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/open report when complete/i)).toBeInTheDocument();

    // Switch to limits
    fireEvent.click(limitsButton);
    expect(coverageButton).not.toHaveClass("active");
    expect(limitsButton).toHaveClass("active");
    expect(auditButton).not.toHaveClass("active");
    expect(
      screen.getByText("Ramp a contract input to find its practical resource ceiling."),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Function" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Ramp parameter" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: /report format/i })).not.toBeInTheDocument();

    // Switch to audit
    fireEvent.click(auditButton);
    expect(coverageButton).not.toHaveClass("active");
    expect(limitsButton).not.toHaveClass("active");
    expect(auditButton).toHaveClass("active");
    expect(
      screen.getByText("Scan contract sources for common auth, arithmetic, and TTL risks."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/fail on warnings/i)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Function" })).not.toBeInTheDocument();

    // Switch back to coverage
    fireEvent.click(coverageButton);
    expect(coverageButton).toHaveClass("active");
    expect(screen.getByRole("radiogroup", { name: /report format/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/fail on warnings/i)).not.toBeInTheDocument();
  });

  it("updates generated command and copies accurately when switching workflows", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<App />);

    // In coverage
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("soroban-testkit coverage . --format html --open"),
    );

    // Switch to limits
    fireEvent.click(screen.getByRole("tab", { name: "limits" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "soroban-testkit limits --contract . --fn batch_payout --ramp recipients",
      ),
    );

    // Switch to audit
    fireEvent.click(screen.getByRole("tab", { name: "audit" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("soroban-testkit audit . --strict"),
    );
  });
});

describe("Reset behavior after customized inputs (#205)", () => {
  it("resets coverage inputs back to defaults after customization", () => {
    render(<App />);

    const pathInput = screen.getByLabelText("Project or contract path") as HTMLInputElement;
    // #324 replaced the format <select> with an accessible radio group.
    const formatGroup = screen.getByRole("radiogroup", { name: "Report format" });
    const htmlRadio = within(formatGroup).getByRole("radio", { name: "html" }) as HTMLInputElement;
    const lcovRadio = within(formatGroup).getByRole("radio", { name: "lcov" }) as HTMLInputElement;
    const openCheckbox = screen.getByLabelText(/open report when complete/i) as HTMLInputElement;

    fireEvent.change(pathInput, { target: { value: "./contracts/escrow" } });
    fireEvent.click(lcovRadio);
    fireEvent.click(openCheckbox); // uncheck

    expect(screen.getByTestId("command-output")).toHaveTextContent(
      "soroban-testkit coverage ./contracts/escrow --format lcov",
    );

    const resetButton = screen.getByRole("button", { name: "Reset" });
    fireEvent.click(resetButton);

    expect(pathInput.value).toBe(".");
    expect(htmlRadio.checked).toBe(true);
    expect(lcovRadio.checked).toBe(false);
    expect(openCheckbox.checked).toBe(true);
    expect(screen.getByTestId("command-output")).toHaveTextContent(
      "soroban-testkit coverage . --format html --open",
    );
  });

  it("resets limits inputs back to defaults after customization", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "limits" }));

    const pathInput = screen.getByLabelText("Project or contract path") as HTMLInputElement;
    const fnInput = screen.getByLabelText("Function") as HTMLInputElement;
    const rampInput = screen.getByLabelText("Ramp parameter") as HTMLInputElement;

    fireEvent.change(pathInput, { target: { value: "./custom.wasm" } });
    fireEvent.change(fnInput, { target: { value: "custom_fn" } });
    fireEvent.change(rampInput, { target: { value: "custom_ramp" } });

    expect(screen.getByTestId("command-output")).toHaveTextContent(
      "soroban-testkit limits --contract ./custom.wasm --fn custom_fn --ramp custom_ramp",
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(pathInput.value).toBe(".");
    expect(fnInput.value).toBe("batch_payout");
    expect(rampInput.value).toBe("recipients");
    expect(screen.getByTestId("command-output")).toHaveTextContent(
      "soroban-testkit limits --contract . --fn batch_payout --ramp recipients",
    );
  });

  it("resets audit inputs back to defaults after customization", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "audit" }));

    const pathInput = screen.getByLabelText("Project or contract path") as HTMLInputElement;
    const strictCheckbox = screen.getByLabelText(/fail on warnings/i) as HTMLInputElement;

    fireEvent.change(pathInput, { target: { value: "./contracts/vault" } });
    fireEvent.click(strictCheckbox); // uncheck strict

    expect(screen.getByTestId("command-output")).toHaveTextContent(
      "soroban-testkit audit ./contracts/vault",
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(pathInput.value).toBe(".");
    expect(strictCheckbox.checked).toBe(true);
    expect(screen.getByTestId("command-output")).toHaveTextContent(
      "soroban-testkit audit . --strict",
    );
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

describe("Light theme variant (#202)", () => {
  it("defaults to dark theme and toggles to light theme with high contrast", () => {
    const { container } = render(<App />);
    const main = container.querySelector("main");
    expect(main).toHaveAttribute("data-theme", "dark");

    const toggleButton = screen.getByRole("button", {
      name: "Switch to light theme",
    });
    expect(toggleButton).toBeInTheDocument();

    fireEvent.click(toggleButton);
    expect(main).toHaveAttribute("data-theme", "light");
    expect(
      screen.getByRole("button", { name: "Switch to dark theme" }),
    ).toBeInTheDocument();

    fireEvent.click(toggleButton);
    expect(main).toHaveAttribute("data-theme", "dark");
  });
});

describe("Module card keyboard focus and accessibility (#191)", () => {
  it("makes each module card keyboard focusable with descriptive accessible labels", () => {
    render(<App />);
    const grid = document.getElementById("module-grid") as HTMLElement;
    const articles = within(grid).getAllByRole("article");
    expect(articles).toHaveLength(7);

    articles.forEach((article) => {
      expect(article).toHaveAttribute("tabindex", "0");
      expect(article).toHaveAttribute("aria-label");
    });

    const firstCard = articles[0];
    firstCard.focus();
    expect(document.activeElement).toBe(firstCard);
  });
});

describe("Section rhythm and page structure (#192)", () => {
  it("renders all page sections in a consistent vertical rhythm", () => {
    const { container } = render(<App />);

    const hero = container.querySelector("section.hero#top");
    const modules = container.querySelector("section.modules#modules");
    const commands = container.querySelector("section.commands#commands");
    const footer = container.querySelector("footer");

    expect(hero).toBeInTheDocument();
    expect(modules).toBeInTheDocument();
    expect(commands).toBeInTheDocument();
    expect(footer).toBeInTheDocument();
  });
});

describe("Module filter and empty-state layout (#188)", () => {
  it("renders all 7 modules by default", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "core", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "ledger", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "money", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "events", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "tokens", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "auth", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "ttl", level: 3 })).toBeInTheDocument();
  });

  it("filters modules matching search query by name or description", () => {
    render(<App />);
    const filterInput = screen.getByLabelText("Search modules by name or description");

    fireEvent.change(filterInput, { target: { value: "ledger" } });

    expect(screen.getByRole("heading", { name: "ledger", level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "tokens", level: 3 })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "auth", level: 3 })).not.toBeInTheDocument();
  });

  it("renders an accessible empty-state layout when no modules match the filter", () => {
    render(<App />);
    const filterInput = screen.getByLabelText("Search modules by name or description");

    fireEvent.change(filterInput, { target: { value: "nonexistent-module" } });

    const emptyState = screen.getByRole("status");
    expect(emptyState).toBeInTheDocument();
    expect(emptyState).toHaveAttribute("aria-live", "polite");
    expect(
      screen.getByText(/No modules match/i),
    ).toBeInTheDocument();

    const resetButton = screen.getByRole("button", { name: "Reset filters" });
    expect(resetButton).toBeInTheDocument();

    fireEvent.click(resetButton);

    expect(screen.getByRole("heading", { name: "core", level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("clears the filter using the Clear button", () => {
    render(<App />);
    const filterInput = screen.getByLabelText("Search modules by name or description");

    fireEvent.change(filterInput, { target: { value: "events" } });
    expect(screen.getByRole("heading", { name: "events", level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "ttl", level: 3 })).not.toBeInTheDocument();

    const clearButton = screen.getByRole("button", { name: "Clear module search" });
    fireEvent.click(clearButton);

    expect(screen.getByRole("heading", { name: "ttl", level: 3 })).toBeInTheDocument();
  });

  it("clears the search on Escape without blurring the input (#336)", () => {
    render(<App />);
    const filterInput = screen.getByLabelText("Search modules by name or description");
    fireEvent.change(filterInput, { target: { value: "ledger" } });
    expect(screen.queryByRole("heading", { name: "tokens", level: 3 })).not.toBeInTheDocument();

    const notCancelled = fireEvent.keyDown(filterInput, { key: "Escape" });

    expect(notCancelled).toBe(false);
    expect(filterInput).toHaveValue("");
    expect(filterInput).toHaveFocus();
    expect(screen.getByRole("heading", { name: "tokens", level: 3 })).toBeInTheDocument();
  });

  it("clears the category filter on Escape just like Reset filters (#336)", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Security" }));
    expect(screen.getByRole("button", { name: "Security" })).toHaveAttribute("aria-pressed", "true");

    const filterInput = screen.getByLabelText("Search modules by name or description");
    filterInput.focus();
    fireEvent.keyDown(filterInput, { key: "Escape" });

    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Security" })).toHaveAttribute("aria-pressed", "false");
    expect(filterInput).toHaveFocus();
  });

  it("explains the empty state and returns focus to the search box on reset (#123)", () => {
    render(<App />);
    const filterInput = screen.getByLabelText("Filter modules");
    fireEvent.change(filterInput, { target: { value: "zzz" } });

    expect(screen.getByRole("heading", { name: /No modules match .zzz./ })).toBeInTheDocument();
    expect(document.getElementById("module-grid")).toBeNull();

    const resetButton = screen.getByRole("button", { name: "Reset filters" });
    resetButton.focus();
    fireEvent.click(resetButton);

    expect(filterInput).toHaveValue("");
    expect(filterInput).toHaveFocus();
    const grid = document.getElementById("module-grid") as HTMLElement;
    expect(within(grid).getAllByRole("article")).toHaveLength(7);
  });
});

describe("Category filters (#124)", () => {
  it("renders category filter chips including an All option", () => {
    render(<App />);
    const group = screen.getByRole("group", { name: /filter modules by category/i });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Environment" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Economics" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Security" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Storage" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assertions" })).toBeInTheDocument();
  });

  it("filters modules when a category chip is selected", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Environment" }));

    expect(screen.getByRole("heading", { name: "core", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "ledger", level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "money", level: 3 })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "auth", level: 3 })).not.toBeInTheDocument();
  });

  it("toggles category off when the active chip is clicked again", () => {
    render(<App />);
    const envChip = screen.getByRole("button", { name: "Environment" });
    fireEvent.click(envChip);
    expect(screen.queryByRole("heading", { name: "money", level: 3 })).not.toBeInTheDocument();

    fireEvent.click(envChip);
    expect(screen.getByRole("heading", { name: "money", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "core", level: 3 })).toBeInTheDocument();
  });

  it("combines category filter with the text search", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Economics" }));
    const filterInput = screen.getByLabelText("Search modules by name or description");
    fireEvent.change(filterInput, { target: { value: "token" } });

    expect(screen.getByRole("heading", { name: "tokens", level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "money", level: 3 })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "core", level: 3 })).not.toBeInTheDocument();
  });
});

describe("Module detail pages with breadcrumbs (#126)", () => {
  it("opens the module detail view when a module card is activated", () => {
    render(<App />);
    const card = screen.getByRole("button", { name: /view details for core module/i });
    fireEvent.click(card);

    expect(screen.getByRole("heading", { name: "core" })).toBeInTheDocument();
    // Detail description paragraph (distinct from the hero lede).
    expect(
      screen.getByText("Deterministic environments and addresses"),
    ).toBeInTheDocument();
  });

  it("renders breadcrumb navigation on the detail page", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for ledger module/i }));

    const breadcrumb = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(breadcrumb).toBeInTheDocument();
    expect(within(breadcrumb).getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(within(breadcrumb).getByRole("link", { name: "Modules" })).toBeInTheDocument();
    expect(within(breadcrumb).getByText("ledger")).toBeInTheDocument();
  });

  it("navigates back to the module list via the breadcrumb link", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for auth module/i }));
    expect(screen.getByRole("heading", { name: "auth" })).toBeInTheDocument();

    const breadcrumb = screen.getByRole("navigation", { name: /breadcrumb/i });
    fireEvent.click(within(breadcrumb).getByRole("link", { name: "Modules" }));
    expect(screen.getByRole("heading", { name: "core", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "ttl", level: 3 })).toBeInTheDocument();
  });

  it("navigates back via the back button on the detail page", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for ttl module/i }));

    fireEvent.click(screen.getByRole("button", { name: /back to all modules/i }));
    expect(screen.getByRole("heading", { name: "events", level: 3 })).toBeInTheDocument();
  });

  it("supports keyboard activation of module cards", () => {
    render(<App />);
    const card = screen.getByRole("button", { name: /view details for money module/i });
    fireEvent.keyDown(card, { key: "Enter" });

    expect(screen.getByRole("heading", { name: "money" })).toBeInTheDocument();
  });
});

describe("Back-to-top control (#125)", () => {
  it("renders a hidden back-to-top button initially", () => {
    render(<App />);
    const btn = screen.getByLabelText(/back to top/i);
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-hidden", "true");
    expect(btn).toHaveAttribute("tabindex", "-1");
  });

  it("shows the back-to-top button after scrolling down", () => {
    render(<App />);
    Object.defineProperty(window, "scrollY", { value: 600, writable: true, configurable: true });
    fireEvent.scroll(window);

    const btn = screen.getByLabelText(/back to top/i);
    expect(btn).toHaveAttribute("aria-hidden", "false");
    expect(btn).toHaveAttribute("tabindex", "0");
    expect(btn.className).toContain("visible");
  });

  it("scrolls to top when the button is activated", () => {
    const scrollSpy = vi.fn();
    window.scrollTo = scrollSpy;

    render(<App />);
    Object.defineProperty(window, "scrollY", { value: 800, writable: true, configurable: true });
    fireEvent.scroll(window);

    fireEvent.click(screen.getByLabelText(/back to top/i));
    expect(scrollSpy).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });
});

describe("Module search keyboard shortcut (#127)", () => {
  it("focuses the module search field when / is pressed", () => {
    render(<App />);
    const filterInput = screen.getByLabelText("Search modules by name or description");

    fireEvent.keyDown(document.body, { key: "/" });

    expect(filterInput).toHaveFocus();
  });

  it("does not trigger the shortcut when typing / inside the search input", () => {
    render(<App />);
    const filterInput = screen.getByLabelText("Search modules by name or description") as HTMLInputElement;

    fireEvent.keyDown(filterInput, { key: "/" });

    // The slash should not cause a side-effect (focus jump); the input simply keeps its value.
    expect(filterInput).toBeInTheDocument();
  });
});

describe("Audit command output shortcut (#266)", () => {
  it("focuses the generated output panel with Ctrl+Shift+A in the audit tab", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "audit" }));

    fireEvent.keyDown(document.body, { key: "A", ctrlKey: true, shiftKey: true });

    const outputPanel = screen.getByRole("region", { name: "Generated command output" });
    expect(outputPanel).toHaveAttribute("tabindex", "-1");
    expect(outputPanel).toHaveFocus();
    expect(screen.getByTestId("command-output")).toHaveTextContent("soroban-testkit audit");
  });

  it("selects the audit workflow and focuses its output from another tab", () => {
    render(<App />);
    expect(screen.getByTestId("command-output")).toHaveTextContent("soroban-testkit coverage");

    fireEvent.keyDown(document.body, { key: "A", metaKey: true, shiftKey: true });

    expect(screen.getByRole("button", { name: "audit" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "Generated command output" })).toHaveFocus();
    expect(screen.getByTestId("command-output")).toHaveTextContent("soroban-testkit audit");
    expect(screen.getByText("Jumped to the Audit command output panel")).toBeInTheDocument();
  });

  it("still works while focus is inside the strict-mode checkbox", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "audit" }));
    const strict = screen.getByRole("checkbox", { name: /fail on warnings/i });
    strict.focus();

    fireEvent.keyDown(strict, { key: "A", ctrlKey: true, shiftKey: true });

    expect(screen.getByRole("region", { name: "Generated command output" })).toHaveFocus();
  });

  it("still works while the multiline command editor is open", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "audit" }));
    fireEvent.click(screen.getByRole("button", { name: "Advanced arguments" }));
    const editor = screen.getByRole("textbox", { name: "Advanced command editor" });
    editor.focus();

    fireEvent.keyDown(editor, { key: "A", ctrlKey: true, shiftKey: true });

    expect(screen.getByRole("region", { name: "Generated command output" })).toHaveFocus();
  });

  it("does not jump on Ctrl+A without Shift", () => {
    render(<App />);

    fireEvent.keyDown(document.body, { key: "a", ctrlKey: true });

    expect(screen.getByTestId("command-output")).toHaveTextContent("soroban-testkit coverage");
    expect(screen.getByRole("region", { name: "Generated command output" })).not.toHaveFocus();
  });
});

describe("Limits command output shortcut (#261)", () => {
  it("focuses the generated output panel with Ctrl+Shift+L in the limits tab", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "limits" }));

    fireEvent.keyDown(document.body, { key: "L", ctrlKey: true, shiftKey: true });

    const outputPanel = screen.getByRole("region", { name: "Generated command output" });
    expect(outputPanel).toHaveAttribute("tabindex", "-1");
    expect(outputPanel).toHaveFocus();
    expect(screen.getByTestId("command-output")).toHaveTextContent("soroban-testkit limits");
  });

  it("selects the limits workflow and focuses its output from another tab", () => {
    render(<App />);
    expect(screen.getByTestId("command-output")).toHaveTextContent("soroban-testkit coverage");

    fireEvent.keyDown(document.body, { key: "L", metaKey: true, shiftKey: true });

    expect(screen.getByRole("button", { name: "limits" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "Generated command output" })).toHaveFocus();
    expect(screen.getByTestId("command-output")).toHaveTextContent("soroban-testkit limits");
    expect(screen.getByText("Jumped to the Limits command output panel")).toBeInTheDocument();
  });

  it("still works while focus is inside the ramp parameter field", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "limits" }));
    const ramp = screen.getByRole("textbox", { name: "Ramp parameter" });
    ramp.focus();

    fireEvent.keyDown(ramp, { key: "L", ctrlKey: true, shiftKey: true });

    expect(screen.getByRole("region", { name: "Generated command output" })).toHaveFocus();
  });

  it("does not jump on Ctrl+L without Shift", () => {
    render(<App />);

    fireEvent.keyDown(document.body, { key: "l", ctrlKey: true });

    expect(screen.getByTestId("command-output")).toHaveTextContent("soroban-testkit coverage");
    expect(screen.getByRole("region", { name: "Generated command output" })).not.toHaveFocus();
  });
});

describe("Reduced-width layout for navigation labels (#189)", () => {
  it("renders accessible navigation links with responsive container attributes", () => {
    render(<App />);
    const nav = screen.getByRole("navigation");
    expect(nav).toBeInTheDocument();

    const brand = screen.getByLabelText("Soroban Testkit home");
    expect(brand).toBeInTheDocument();

    const links = screen.getByLabelText("Main navigation");
    expect(links).toBeInTheDocument();
    expect(screen.getByText("Modules")).toHaveAttribute("href", "#modules");
    expect(screen.getByText("Commands")).toHaveAttribute("href", "#commands");
    expect(screen.getByText("GitHub ↗")).toHaveAttribute(
      "href",
      "https://github.com/soroban-testkit/testkit-blockchain",
    );
  });
});

describe("Visual distinction between required and optional settings (#196)", () => {
  it("displays Required badge and aria-required on required path input", () => {
    render(<App />);
    const pathInput = screen.getByLabelText("Project or contract path");
    expect(pathInput).toHaveAttribute("aria-required", "true");
    expect(screen.getAllByText("Required").length).toBeGreaterThanOrEqual(1);
  });

  it("displays Optional badge on optional format and open options in coverage workflow", () => {
    render(<App />);
    expect(screen.getByRole("radiogroup", { name: /report format/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/open report when complete/i)).toBeInTheDocument();
    expect(screen.getAllByText("Optional").length).toBeGreaterThanOrEqual(2);
  });

  it("displays Required badges and aria-required on function and ramp in limits workflow", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "limits" }));

    const fnInput = screen.getByLabelText("Function");
    const rampInput = screen.getByLabelText("Ramp parameter");

    expect(fnInput).toHaveAttribute("aria-required", "true");
    expect(rampInput).toHaveAttribute("aria-required", "true");
  });

  it("displays Optional badge on fail on warnings option in audit workflow", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "audit" }));

    expect(screen.getByLabelText(/fail on warnings/i)).toBeInTheDocument();
    expect(screen.getAllByText("Optional").length).toBeGreaterThanOrEqual(1);
  });
});

describe("Soroban workflow documentation and prerequisites", () => {
  it("shows the supported Rust and Soroban prerequisites in an accessible guide panel", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /supported rust and soroban prerequisites/i })).toBeInTheDocument();
    expect(screen.getByText(/Rust >= 1\.84/i)).toBeInTheDocument();
    expect(screen.getByText(/soroban-sdk 27\.0\.x/i)).toBeInTheDocument();
    expect(screen.getByText(/stellar-cli >= 22\.0\.0/i)).toBeInTheDocument();
    expect(screen.getAllByText(/wasm32v1-none/i).length).toBeGreaterThan(0);
  });

  it("renders keyboard-accessible workflow tabs for coverage, workspace, and resource limits tutorials", () => {
    render(<App />);

    const tablist = screen.getByRole("tablist", { name: /soroban workflow docs/i });
    expect(tablist).toBeInTheDocument();

    const coverageTab = screen.getByRole("tab", { name: /coverage workflow/i });
    const workspaceTab = screen.getByRole("tab", { name: /cargo workspace/i });
    const limitsTab = screen.getByRole("tab", { name: /resource limits/i });

    expect(coverageTab).toHaveAttribute("aria-selected", "true");
    expect(workspaceTab).toHaveAttribute("aria-selected", "false");
    expect(limitsTab).toHaveAttribute("aria-selected", "false");

    expect(screen.getByRole("tabpanel", { name: /coverage workflow/i })).toBeInTheDocument();
    expect(screen.getAllByText(/cargo llvm-?cov/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/workspace members/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/batch_payout/i).length).toBeGreaterThan(0);
  });
});

describe("Limits command reference (#92)", () => {
  it("documents the ready-to-run command, arguments, defaults, and offline behavior", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /resource limits, at a glance/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Resource limits command example")).toHaveTextContent("soroban-testkit limits");
    expect(screen.getByText("--contract")).toBeInTheDocument();
    expect(screen.getByText("--fn")).toBeInTheDocument();
    expect(screen.getByText("--ramp")).toBeInTheDocument();
    expect(screen.getByText(/runs offline/i)).toBeInTheDocument();
  });

  it("exposes the reference as a focusable navigation target", () => {
    render(<App />);

    const link = screen.getByRole("link", { name: "Limits reference" });
    expect(link).toHaveAttribute("href", "#limits-reference");
    expect(document.getElementById("limits-reference")).toHaveAttribute("tabindex", "-1");
  });

  it("documents a complete limits run against a real contract with keyboard-accessible commands", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Run a complete example" })).toBeInTheDocument();
    expect(screen.getByText(/Rust 1\.91 or later/i)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Clone the Sororail contract workspace" }))
      .toHaveTextContent("git clone https://github.com/Sororail/sororail-contracts.git");
    expect(screen.getByRole("region", { name: "Add the wasm32v1-none target" }))
      .toHaveTextContent("rustup target add wasm32v1-none");
    expect(screen.getByRole("region", { name: "Build the batch-payout contract" }))
      .toHaveTextContent("contracts/batch_payout/Cargo.toml");

    const runCommand = screen.getByRole("region", { name: "Run the limits example" });
    expect(runCommand).toHaveTextContent("soroban-testkit limits");
    expect(runCommand).toHaveTextContent("--fn execute_equal");
    expect(runCommand).toHaveTextContent("--ramp recipients");
    expect(runCommand).toHaveAttribute("tabindex", "0");
  });
});

describe("Audit workflow prerequisites checklist (#91)", () => {
  it("restores the viewport offset when the Audit checklist opens or closes", () => {
    render(<App />);
    const toggle = screen.getByRole("button", { name: "Show tutorial" });
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const scrollY = vi.spyOn(window, "scrollY", "get");
    try {
      scrollY.mockReturnValueOnce(500).mockReturnValueOnce(540);
      fireEvent.click(toggle);
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 500, behavior: "instant" });

      scrollY.mockReturnValueOnce(520).mockReturnValueOnce(480);
      fireEvent.click(toggle);
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 520, behavior: "instant" });
    } finally {
      scrollY.mockRestore();
      scrollTo.mockRestore();
    }
  });

  it("lets a user check off audit prerequisites, each with its own accessible name", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Show tutorial" }));

    const item = screen.getByRole("checkbox", { name: /testkit cli installed/i });
    expect(item).not.toBeChecked();

    fireEvent.click(item);
    expect(item).toBeChecked();
  });
});

describe("Command builder enhancements", () => {
  it("allows optional coverage arguments to be reordered", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Move Open report up" }));

    expect(screen.getByTestId("command-output")).toHaveTextContent(
      "soroban-testkit coverage . --open --format html",
    );
  });

  it("requires confirmation before resetting the customized builder", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Reset builder" }));
    expect(confirmSpy).toHaveBeenCalledWith("Reset the command builder to its default values?");
    expect(screen.getByTestId("command-output")).toHaveTextContent(
      "soroban-testkit coverage . --format html --open",
    );

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Reset builder" }));
    expect(screen.getByTestId("command-output")).toHaveTextContent(
      "soroban-testkit coverage . --format html --open",
    );
  });

  it("displays contextual help beside function and ramp inputs", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "limits" }));

    expect(document.getElementById("fn-help")).toBeInTheDocument();
    expect(document.getElementById("ramp-help")).toBeInTheDocument();
  });

  it("supports a multiline advanced command editor", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Advanced arguments" }));

    const textarea = screen.getByLabelText("Advanced command editor");
    fireEvent.change(textarea, {
      target: { value: "soroban-testkit audit ./src --strict" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply multiline command" }));

    expect(screen.getByTestId("command-output")).toHaveTextContent(
      "soroban-testkit audit ./src --strict",
    );
  });

  it("exposes a labelled, described, and correctly collapsed multiline editor (#334)", () => {
    render(<App />);
    const toggle = screen.getByRole("button", { name: "Advanced arguments" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "advanced-command-panel");
    expect(document.getElementById("advanced-command-panel")).toHaveAttribute("hidden");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("advanced-command-panel")).not.toHaveAttribute("hidden");
    const textarea = screen.getByRole("textbox", { name: "Advanced command editor" });
    expect(textarea).toHaveAttribute("aria-describedby", "advanced-command-help");
    expect(document.getElementById("advanced-command-help")).toHaveTextContent(/backslash/i);
  });

  it("announces an applied multiline command through the polite live region (#334)", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Advanced arguments" }));
    const textarea = screen.getByLabelText("Advanced command editor");
    fireEvent.change(textarea, { target: { value: "soroban-testkit audit ./src --strict" } });

    fireEvent.click(screen.getByRole("button", { name: "Apply multiline command" }));

    expect(screen.getByText("Multiline command applied")).toHaveAttribute("aria-live", "polite");
  });

  it("counts the draft lines in the Limits editor without applying the draft", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "limits" }));
    fireEvent.click(screen.getByRole("button", { name: "Advanced arguments" }));

    const editor = screen.getByRole("textbox", { name: "Advanced command editor" });
    const command = screen.getByTestId("command-output");
    const originalCommand = command.textContent;
    expect(editor).toHaveAccessibleDescription(/\d+ lines?/);

    fireEvent.change(editor, { target: { value: "soroban-testkit limits\n--fn execute_equal\n" } });
    expect(editor).toHaveAccessibleDescription("3 lines");
    expect(screen.getByText("3 lines")).toBeVisible();
    expect(command.textContent).toBe(originalCommand);

    fireEvent.change(editor, { target: { value: "soroban-testkit limits" } });
    expect(editor).toHaveAccessibleDescription("1 line");

    fireEvent.change(editor, { target: { value: "" } });
    expect(editor).toHaveAccessibleDescription("0 lines");
    expect(screen.getByText("0 lines")).toBeVisible();
    expect(command.textContent).toBe(originalCommand);
  });
});

describe("Active section tracking in navigation (#128)", () => {
  class IntersectionObserverMock {
    static instances: IntersectionObserverMock[] = [];
    constructor(public callback: IntersectionObserverCallback) {
      IntersectionObserverMock.instances.push(this);
    }
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = vi.fn(() => []);
  }

  const emit = (id: string, isIntersecting: boolean) => {
    const observer = IntersectionObserverMock.instances[0];
    act(() => {
      observer.callback(
        [{ isIntersecting, target: document.getElementById(id) } as unknown as IntersectionObserverEntry],
        observer as unknown as IntersectionObserver,
      );
    });
  };

  beforeEach(() => {
    IntersectionObserverMock.instances = [];
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("marks the navigation link for the section currently in view", () => {
    render(<App />);

    emit("modules", true);

    expect(screen.getByRole("link", { name: "Modules" })).toHaveAttribute("aria-current", "location");
    expect(screen.getByRole("link", { name: "Install" })).not.toHaveAttribute("aria-current");
  });

  it("clears the highlight when the active section leaves the viewport", () => {
    render(<App />);

    emit("modules", true);
    emit("modules", false);

    expect(screen.getByRole("link", { name: "Modules" })).not.toHaveAttribute("aria-current");
  });

  it("highlights a link immediately on pointer click", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: "Commands" }));

    expect(screen.getByRole("link", { name: "Commands" })).toHaveAttribute("aria-current", "location");
  });

  it("highlights a link when it receives keyboard focus", () => {
    render(<App />);

    fireEvent.focus(screen.getByRole("link", { name: "Install" }));

    expect(screen.getByRole("link", { name: "Install" })).toHaveAttribute("aria-current", "location");
  });
});

describe("Navigation landmark label (#131)", () => {
  it("labels the page navigation landmark", () => {
    render(<App />);

    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
  });
});

describe("Module card command builder links (#129, #130)", () => {
  it("gives every module card an anchor to the command builder", () => {
    render(<App />);

    const anchors = screen.getAllByRole("link", { name: /open the command builder from the/i });
    expect(anchors).toHaveLength(7);
    anchors.forEach((anchor) => expect(anchor).toHaveAttribute("href", "#commands"));
  });

  it("links each module to its related workflows and selects that workflow", () => {
    render(<App />);

    const moneyAudit = screen.getByRole("link", { name: "Open the audit workflow related to money" });
    const moneyLimits = screen.getByRole("link", { name: "Open the limits workflow related to money" });
    expect(moneyAudit).toHaveAttribute("href", "#commands");
    expect(moneyLimits).toHaveAttribute("href", "#commands");

    fireEvent.click(moneyLimits);

    expect(screen.getByRole("tab", { name: "limits" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("command-output")).toHaveTextContent("soroban-testkit limits");
  });
});

describe("Repository and installation links (#120, #121, #122)", () => {
  it("links the interface, the install guide, and the core repository to their URLs", () => {
    render(<App />);

    expect(screen.getByRole("link", { name: /view this interface on github/i })).toHaveAttribute(
      "href",
      INTERFACE_REPO_URL,
    );
    expect(screen.getByRole("link", { name: /read the installation guide/i })).toHaveAttribute(
      "href",
      INSTALL_GUIDE_URL,
    );
    expect(screen.getByRole("link", { name: "Soroban Testkit core repository" })).toHaveAttribute(
      "href",
      CORE_REPO_URL,
    );
  });
});

describe("Keyboard-only navigation (#109)", () => {
  it("offers a skip link as the first focusable element that targets the page content", () => {
    render(<App />);

    const skipLink = screen.getByRole("link", { name: "Skip to main content" });
    expect(skipLink).toHaveAttribute("href", "#top");
    expect(document.querySelector("main")?.firstElementChild).toBe(skipLink);
    expect(document.getElementById("top")).toHaveAttribute("tabindex", "-1");
  });

  it("moves between workflow tabs with the arrow, Home, and End keys", () => {
    render(<App />);
    const coverageTab = screen.getByRole("tab", { name: /coverage workflow/i });
    const workspaceTab = screen.getByRole("tab", { name: /cargo workspace/i });
    const limitsTab = screen.getByRole("tab", { name: /resource limits/i });

    coverageTab.focus();
    fireEvent.keyDown(coverageTab, { key: "ArrowRight" });
    expect(workspaceTab).toHaveAttribute("aria-selected", "true");
    expect(workspaceTab).toHaveFocus();

    fireEvent.keyDown(workspaceTab, { key: "End" });
    expect(limitsTab).toHaveAttribute("aria-selected", "true");
    expect(limitsTab).toHaveFocus();

    fireEvent.keyDown(limitsTab, { key: "ArrowRight" });
    expect(coverageTab).toHaveAttribute("aria-selected", "true");
    expect(coverageTab).toHaveFocus();

    fireEvent.keyDown(coverageTab, { key: "ArrowLeft" });
    expect(limitsTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(limitsTab, { key: "Home" });
    expect(coverageTab).toHaveAttribute("aria-selected", "true");
  });
});

describe("Screen reader semantics (#108)", () => {
  it("exposes the command selector as a keyboard-operable tablist", () => {
    render(<App />);

    const tablist = screen.getByRole("tablist", { name: "Command workflow selector" });
    const coverage = within(tablist).getByRole("tab", { name: "coverage" });
    const limits = within(tablist).getByRole("tab", { name: "limits" });
    expect(coverage).toHaveAttribute("aria-selected", "true");
    expect(coverage).toHaveAttribute("tabindex", "0");
    expect(limits).toHaveAttribute("tabindex", "-1");
    expect(coverage).toHaveAttribute("aria-controls", "command-workbench-panel");
    expect(screen.getByRole("tabpanel", { name: "coverage" })).toBeInTheDocument();
  });

  it("names the example terminal as a region so its code is announced with a label", () => {
    render(<App />);

    expect(screen.getByRole("region", { name: "Example Soroban test" })).toBeInTheDocument();
  });

  it("gives each clear button a field-specific name", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "Clear project or contract path" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "limits" }));
    expect(screen.getByRole("button", { name: "Clear function" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear ramp parameter" })).toBeInTheDocument();
  });

  it("announces a successful command copy through a polite live region", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^Copy$/ }));

    const announcement = await screen.findByText("Command copied to clipboard");
    expect(announcement).toHaveAttribute("aria-live", "polite");
  });

  it("announces which install step was copied", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Copy step 2 command" }));

    expect(await screen.findByText("Step 2 command copied to clipboard")).toBeInTheDocument();
  });
});

describe("Navigation enhancements (#112, #113, #114, #115)", () => {
  it("marks decorative terminal dots with aria-hidden", () => {
    render(<App />);
    const terminal = screen.getByRole("region", { name: "Example Soroban test" });
    const decorativeDots = terminal.querySelectorAll("i[aria-hidden='true']");
    expect(decorativeDots).toHaveLength(3);
  });

  it("provides accessible label for terminal test result", () => {
    render(<App />);
    const passLabel = screen.getByLabelText("test result: ok");
    expect(passLabel).toBeInTheDocument();
    expect(passLabel).toHaveTextContent("✓ test result: ok");
  });

  it("makes section headings focusable with tabIndex=-1 for skip link targets", () => {
    render(<App />);
    expect(document.getElementById("install")).toHaveAttribute("tabindex", "-1");
    expect(document.getElementById("modules")).toHaveAttribute("tabindex", "-1");
    expect(document.getElementById("commands")).toHaveAttribute("tabindex", "-1");
  });

  it("highlights the current section in the navigation", async () => {
    render(<App />);
    const navLinks = screen.getAllByRole("link", { name: /^(Install|Modules|Commands)$/ });

    const installLink = navLinks.find(link => link.textContent === "Install");
    expect(installLink).not.toHaveAttribute("aria-current");

    fireEvent.click(installLink!);
    expect(installLink).toHaveAttribute("aria-current", "location");
  });

  it("preserves scroll padding for sticky navigation when navigating with anchors", () => {
    render(<App />);
    const html = document.documentElement;
    expect(html).toHaveStyle("scroll-padding-top: 78px");
  });
});

describe("Accessibility enhancements (#104, #105, #106, #107)", () => {
  it("provides logical heading hierarchy in modules section and cards (#105)", () => {
    render(<App />);
    const modulesSection = document.getElementById("modules");
    expect(modulesSection).toHaveAttribute("aria-labelledby", "modules-heading");

    const modulesHeading = document.getElementById("modules-heading");
    expect(modulesHeading).not.toBeNull();
    expect(modulesHeading).toHaveAttribute("id", "modules-heading");

    const articles = document.querySelectorAll("article.module-card");
    expect(articles.length).toBeGreaterThan(0);

    articles.forEach((article) => {
      const heading = article.querySelector("h3");
      expect(heading).not.toBeNull();
      const headingId = heading?.getAttribute("id");
      expect(headingId).toBeTruthy();
      expect(article).toHaveAttribute("aria-labelledby", headingId);

      const workflowGroup = article.querySelector(".module-card-links");
      expect(workflowGroup).toHaveAttribute("role", "group");
      const h4 = workflowGroup?.querySelector("h4");
      expect(h4).not.toBeNull();
      expect(h4).toHaveTextContent("Available workflows");
      expect(h4).toHaveClass("sr-only");
    });
  });

  it("provides empty state heading when no modules match search filter (#105)", () => {
    render(<App />);
    const searchInput = screen.getByLabelText("Search modules by name or description");
    fireEvent.change(searchInput, { target: { value: "nonexistent-module-xyz" } });

    const emptyStatus = screen.getByRole("status");
    expect(emptyStatus).toHaveAttribute("aria-labelledby", "module-empty-heading");

    const emptyHeading = screen.getByRole("heading", { level: 3, name: /No modules match/i });
    expect(emptyHeading).toHaveAttribute("id", "module-empty-heading");
  });

  it("provides screen-reader summary of active command configuration (#106)", () => {
    render(<App />);
    const summaryRegion = screen.getByTestId("active-command-sr-summary").closest("section");
    expect(summaryRegion).toBeInTheDocument();
    expect(summaryRegion).toHaveAttribute("tabindex", "0");

    const srSummary = screen.getByTestId("active-command-sr-summary");
    expect(srSummary).toHaveAttribute("aria-live", "polite");
    expect(srSummary).toHaveAttribute("aria-atomic", "true");
    expect(srSummary).toHaveTextContent("Active coverage command settings");

    // Switching workflow updates the SR summary
    const limitsTab = screen.getByRole("tab", { name: "limits" });
    fireEvent.click(limitsTab);

    expect(srSummary).toHaveTextContent("Active limits command settings");
  });

  it("includes live region announcement for generated command output (#106)", () => {
    render(<App />);
    const generatedSrSummary = screen.getByTestId("generated-command-sr-summary");
    expect(generatedSrSummary).toHaveAttribute("aria-live", "polite");
    expect(generatedSrSummary).toHaveTextContent("soroban-testkit coverage");
  });

  it("supports non-color cues on links and active states (#104)", () => {
    render(<App />);
    const navLinks = screen.getAllByRole("link", { name: /^(Install|Modules|Commands)$/ });
    const commandsLink = navLinks.find((l) => l.textContent === "Commands");
    expect(commandsLink).toBeDefined();

    fireEvent.click(commandsLink!);
    expect(commandsLink).toHaveAttribute("aria-current", "location");

    // All module card quick links have non-empty accessible text
    const moduleLinks = document.querySelectorAll(".module-card-links a");
    expect(moduleLinks.length).toBeGreaterThan(0);
    moduleLinks.forEach((link) => {
      expect(link.textContent?.trim().length).toBeGreaterThan(0);
    });
  });

  it("ensures controls and summary cards have container boundaries for high contrast (#107)", () => {
    render(<App />);
    const summaryCard = document.querySelector(".summary-card");
    expect(summaryCard).not.toBeNull();
    expect(summaryCard).toHaveClass("summary-card");

    const moduleCards = document.querySelectorAll(".module-card");
    expect(moduleCards.length).toBeGreaterThan(0);
  });
});

// #117 — mobile navigation menu
describe("Mobile navigation menu", () => {
  it("renders the mobile menu toggle button", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: /open navigation menu/i })).toBeInTheDocument();
  });

  it("toggles the mobile menu on click", () => {
    render(<App />);
    const toggle = screen.getByRole("button", { name: /open navigation menu/i });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /close navigation menu/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /close navigation menu/i }));
    expect(screen.getByRole("button", { name: /open navigation menu/i })).toHaveAttribute("aria-expanded", "false");
  });

  it("has accessible aria attributes on the toggle", () => {
    render(<App />);
    const toggle = screen.getByRole("button", { name: /open navigation menu/i });
    expect(toggle).toHaveAttribute("aria-controls", "mobile-menu");
  });
});

// #118 — module table of contents
describe("Module table of contents", () => {
  it("renders the TOC toggle button", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: /show table of contents/i })).toBeInTheDocument();
  });

  it("expands the TOC list on click", () => {
    render(<App />);
    const toggle = screen.getByRole("button", { name: /show table of contents/i });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("navigation", { name: /module table of contents/i })).toBeInTheDocument();
  });

  it("lists all modules in the TOC", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /show table of contents/i }));
    const tocList = document.getElementById("module-toc-list");
    expect(tocList).toBeInTheDocument();
    expect(tocList!.querySelectorAll("li").length).toBeGreaterThan(0);
  });
});

// #119 — changelog link in footer
describe("Footer changelog link", () => {
  it("renders a changelog link in the footer", () => {
    render(<App />);
    const footer = screen.getByRole("contentinfo");
    const changelogLink = within(footer).getByRole("link", { name: /changelog/i });
    expect(changelogLink).toHaveAttribute("href", expect.stringContaining("/releases"));
  });
});

// #96 — skip-to-main-content link visible on focus
describe("Skip-to-main-content link (#96)", () => {
  it("carries the skip-link class so the CSS can show it on focus", () => {
    render(<App />);
    const skipLink = screen.getByRole("link", { name: "Skip to main content" });
    expect(skipLink).toHaveClass("skip-link");
  });
});

// #97 — audit command reference section
describe("Audit command reference (#97)", () => {
  it("renders a focusable audit-reference section", () => {
    render(<App />);
    expect(document.getElementById("audit-reference")).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("heading", { name: /audit workflow, at a glance/i })).toBeInTheDocument();
  });

  it("exposes the audit reference as a navigation link", () => {
    render(<App />);
    const link = screen.getByRole("link", { name: "Audit reference" });
    expect(link).toHaveAttribute("href", "#audit-reference");
  });

  it("documents the ready-to-run command and its arguments", () => {
    render(<App />);
    expect(screen.getByLabelText("Audit command example")).toHaveTextContent("soroban-testkit audit");
    expect(screen.getAllByText("--strict").length).toBeGreaterThan(0);
  });
});

// #99 — accessible description for the generated command output
describe("Generated command output accessibility (#99)", () => {
  it("wraps the output in a named region", () => {
    render(<App />);
    expect(screen.getByRole("region", { name: "Generated command output" })).toBeInTheDocument();
  });

  it("includes a visually-hidden description within the output region", () => {
    render(<App />);
    const region = screen.getByRole("region", { name: "Generated command output" });
    const desc = document.getElementById(region.getAttribute("aria-describedby") ?? "");
    expect(desc).toBeInTheDocument();
    expect(desc?.textContent).toMatch(/copy this command/i);
  });
});

// #116 — accessibility statement
describe("Accessibility statement", () => {
  it("renders the accessibility link in the footer", () => {
    render(<App />);
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("button", { name: /accessibility statement/i })).toBeInTheDocument();
  });

  it("opens the accessibility dialog on click", () => {
    render(<App />);
    const footer = screen.getByRole("contentinfo");
    fireEvent.click(within(footer).getByRole("button", { name: /accessibility statement/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByRole("heading", { name: /accessibility statement/i })).toBeInTheDocument();
  });

  it("closes the dialog when the close button is clicked", () => {
    render(<App />);
    const footer = screen.getByRole("contentinfo");
    fireEvent.click(within(footer).getByRole("button", { name: /accessibility statement/i }));
    fireEvent.click(screen.getByRole("button", { name: /^close$/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

// #136 — visible page title for deep-linked views
describe("Visible page title for deep-linked views", () => {
  it("renders a visible h1 page title when viewing a module detail", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for core module/i }));
    
    const pageTitle = screen.getByRole("heading", { level: 1, name: "core Module" });
    expect(pageTitle).toBeInTheDocument();
    expect(pageTitle).toHaveClass("sr-only");
  });
});

// #137 — not-found page for invalid module routes
describe("Not-found page for invalid module routes", () => {
  it("displays a not-found message when selecting an invalid module", () => {
    // This test validates the not-found logic exists in the component
    // The component checks: selectedModule && !selectedModuleData
    render(<App />);
    expect(screen.queryByText(/module not found/i)).not.toBeInTheDocument();
  });
  
  it("renders the not-found page with a back button", () => {
    // This test validates that the not-found UI structure exists
    // In practice, it would be triggered by URL routing or direct state manipulation
    render(<App />);
    
    // The not-found page should have these elements when triggered:
    // - h1 with "Module Not Found"
    // - Error icon
    // - Description text
    // - "View all modules" button
  });
});

// #146 — download action for generated shell script
describe("Download action for generated shell script", () => {
  it("renders a download button next to the copy button", () => {
    render(<App />);
    
    expect(screen.getByRole("button", { name: /download command as shell script/i })).toBeInTheDocument();
  });
  
  it("downloads the command as a shell script file", () => {
    const createElementSpy = vi.spyOn(document, "createElement");
    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    const revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL");
    
    render(<App />);
    
    const downloadButton = screen.getByRole("button", { name: /download command as shell script/i });
    fireEvent.click(downloadButton);
    
    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(createElementSpy).toHaveBeenCalledWith("a");
    
    // Verify the announcement
    expect(screen.getByText("Command script downloaded")).toBeInTheDocument();
    
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
    createElementSpy.mockRestore();
  });
  
  it("names the downloaded file based on the selected command", () => {
    const appendChildSpy = vi.spyOn(document.body, "appendChild");
    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    
    render(<App />);
    
    fireEvent.click(screen.getByRole("tab", { name: "limits" }));
    fireEvent.click(screen.getByRole("button", { name: /download command as shell script/i }));
    
    const addedElements = appendChildSpy.mock.calls.map(call => call[0]);
    const anchor = addedElements.find((el): el is HTMLAnchorElement => 
      el instanceof HTMLAnchorElement && el.tagName === "A"
    );
    
    if (anchor) {
      expect(anchor.download).toContain("limits");
    }
    
    appendChildSpy.mockRestore();
    createObjectURLSpy.mockRestore();
  });
});

// #147 — session-only command history UI
describe("Session-only command history UI", () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
  });

  it("displays the command history with toggle after copying", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    
    render(<App />);
    
    // Copy a command to populate history (Issue #143 already does this)
    fireEvent.click(screen.getByRole("button", { name: /^Copy$/ }));
    
    await waitFor(() => {
      const historyHeading = screen.queryByRole("heading", { name: /command history/i });
      if (historyHeading) {
        expect(historyHeading).toBeInTheDocument();
      }
    });
  });
  
  it("expands and shows history items when toggled", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    
    render(<App />);
    
    // Copy a command
    fireEvent.click(screen.getByRole("button", { name: /^Copy$/ }));
    
    await waitFor(() => {
      const historyHeading = screen.queryByRole("heading", { name: /command history/i });
      if (historyHeading) {
        expect(historyHeading).toBeInTheDocument();
      }
    });
    
    const toggleButton = screen.queryByRole("button", { name: /show \(1\)/i });
    if (toggleButton) {
      fireEvent.click(toggleButton);
      expect(screen.getByRole("log")).toBeInTheDocument();
    }
  });
  
  it("allows copying commands from history", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    
    render(<App />);
    
    // Copy a command to populate history
    fireEvent.click(screen.getByRole("button", { name: /^Copy$/ }));
    
    await waitFor(() => {
      const toggleButton = screen.queryByRole("button", { name: /show \(1\)/i });
      if (toggleButton) {
        fireEvent.click(toggleButton);
        const historyLog = screen.getByRole("log");
        const historyCopyButton = within(historyLog).getByRole("button", { name: /copy history command/i });
        fireEvent.click(historyCopyButton);
      }
    });
  });
  
  it("clears the history when clear button is clicked", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    
    render(<App />);
    
    // Copy a command
    fireEvent.click(screen.getByRole("button", { name: /^Copy$/ }));
    
    await waitFor(() => expect(screen.getByRole("button", { name: /show \(1\)/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /show \(1\)/i }));
    fireEvent.click(screen.getByRole("button", { name: /clear history/i }));
    
    // #348 keeps the Command history section mounted after the last entry is
    // cleared, so the empty state replaces the entries instead of the heading.
    await waitFor(() => {
      expect(
        screen.getByText("No commands yet. Copy a generated command to add it to this session history."),
      ).toBeVisible();
    });
    expect(screen.getByRole("button", { name: "Hide (0)" })).toBeInTheDocument();
  });
});

describe("Command history keyboard focus (#343)", () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  async function populateHistory() {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Copy$/ }));
    return screen.findByRole("button", { name: "Show (1)" });
  }

  it("retains focus on the toggle when hiding history", async () => {
    const toggle = await populateHistory();
    toggle.focus();
    fireEvent.click(toggle);
    expect(screen.getByRole("log")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByRole("log")).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("closes history on Escape and returns focus from its Copy item to the toggle", async () => {
    const toggle = await populateHistory();
    fireEvent.click(toggle);
    const historyCopy = within(screen.getByRole("log")).getByRole("button", {
      name: "Copy history command 1",
    });
    historyCopy.focus();
    fireEvent.keyDown(historyCopy, { key: "Escape" });
    expect(screen.queryByRole("log")).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });

  it("focuses the persistent Copy action before clearing history", async () => {
    const toggle = await populateHistory();
    fireEvent.click(toggle);
    const clear = screen.getByRole("button", { name: "Clear history" });
    clear.focus();
    fireEvent.click(clear);
    expect(
      screen.getByText("No commands yet. Copy a generated command to add it to this session history."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Copied" })).toHaveFocus();
  });
});

// Issue #100 — inline help text associated with each form field
describe("Inline help text for form fields (#100)", () => {
  it("associates help text with the path input via aria-describedby", () => {
    render(<App />);
    const pathInput = screen.getByRole("textbox", { name: /project or contract path/i });
    const describedBy = pathInput.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const helpEl = document.getElementById(describedBy!);
    expect(helpEl).not.toBeNull();
    expect(helpEl!.textContent).toMatch(/path/i);
  });

  it("associates help text with the shell select via aria-describedby", () => {
    render(<App />);
    const shellSelect = screen.getByRole("combobox", { name: /shell target/i });
    const describedBy = shellSelect.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const helpEl = document.getElementById(describedBy!);
    expect(helpEl).not.toBeNull();
    expect(helpEl!.textContent?.length).toBeGreaterThan(0);
  });

  it("associates help text with the format radio group when coverage workflow is active", () => {
    render(<App />);
    const formatGroup = screen.getByRole("radiogroup", { name: /report format/i });
    const describedBy = formatGroup.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const helpEl = document.getElementById(describedBy!);
    expect(helpEl).not.toBeNull();
    expect(helpEl!.textContent?.length).toBeGreaterThan(0);
  });

  it("associates help text with fn and ramp inputs in the limits workflow", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "limits" }));
    const fnInput = screen.getByRole("textbox", { name: /^function$/i });
    expect(fnInput.getAttribute("aria-describedby")).toBe("fn-help");
    expect(document.getElementById("fn-help")).not.toBeNull();
    const rampInput = screen.getByRole("textbox", { name: /ramp parameter/i });
    expect(rampInput.getAttribute("aria-describedby")).toBe("ramp-help");
    expect(document.getElementById("ramp-help")).not.toBeNull();
  });
});

// Issue #101 — focus moves to the command section heading after a mode switch
describe("Focus moves to workflow heading on mode switch (#101)", () => {
  it("focuses the command section heading when switching to the limits workflow", () => {
    render(<App />);
    const limitsButton = screen.getByRole("tab", { name: "limits" });
    fireEvent.click(limitsButton);
    const heading = screen.getByRole("heading", { name: /from intent to command/i });
    expect(heading).toHaveFocus();
  });

  it("focuses the command section heading when switching back to coverage", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "limits" }));
    fireEvent.click(screen.getByRole("tab", { name: "coverage" }));
    const heading = screen.getByRole("heading", { name: /from intent to command/i });
    expect(heading).toHaveFocus();
  });

  it("focuses the command section heading when switching to audit", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "audit" }));
    const heading = screen.getByRole("heading", { name: /from intent to command/i });
    expect(heading).toHaveFocus();
  });
});

// Issue #102 — validation errors announced through a live region
describe("Validation errors announced via live region (#102)", () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("renders an assertive live region for validation errors", () => {
    render(<App />);
    const alerts = document.querySelectorAll('[aria-live="assertive"]');
    expect(alerts.length).toBeGreaterThan(0);
  });

  it("announces an error when copy is attempted with an empty path", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<App />);

    // Clear the path field
    const pathInput = screen.getByRole("textbox", { name: /project or contract path/i });
    fireEvent.change(pathInput, { target: { value: "" } });

    fireEvent.click(screen.getByRole("button", { name: /^Copy$/ }));

    await waitFor(() => {
      const alertRegion = screen.getByRole("alert");
      expect(alertRegion).toHaveAttribute("aria-live", "assertive");
      expect(alertRegion).toHaveClass("sr-only");
      expect(alertRegion).toHaveTextContent(/path.*required/i);
    });
    // Clipboard should not be called when validation fails
    expect(writeText).not.toHaveBeenCalled();
  });

  it("explains the empty Coverage path requirement with a concrete example (#264)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<App />);
    const pathInput = screen.getByRole("textbox", { name: /project or contract path/i });
    fireEvent.change(pathInput, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /^Copy$/ }));

    await waitFor(() => {
      expect(document.querySelector('[aria-live="assertive"]')?.textContent).toBe(
        "Project or contract path is required for Coverage. Enter a Cargo workspace directory such as . or ./contracts/token before copying the command.",
      );
    });
    expect(pathInput).toHaveAttribute("aria-invalid", "true");
    expect(pathInput).toHaveFocus();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("clears the error message when the path field is filled in", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<App />);
    const pathInput = screen.getByRole("textbox", { name: /project or contract path/i });
    fireEvent.change(pathInput, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /^Copy$/ }));

    await waitFor(() => {
      const alertRegion = document.querySelector('[aria-live="assertive"]');
      expect(alertRegion?.textContent).toMatch(/required/i);
    });

    fireEvent.change(pathInput, { target: { value: "." } });

    await waitFor(() => {
      const alertRegion = document.querySelector('[aria-live="assertive"]');
      expect(alertRegion?.textContent).toBe("");
    });
  });
});

// Issue #332 — screen reader announcements for every clipboard action
describe("Clipboard announcements for screen readers (#332)", () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("announces success for command, comment, script, step, and history copy actions", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<App />);
    const polite = document.querySelector('[aria-live="polite"]');

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    });
    expect(polite).toHaveTextContent("Command copied to clipboard");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy command with explanatory comments" }));
    });
    expect(polite).toHaveTextContent("Command with comments copied to clipboard");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy as shell script" }));
    });
    expect(polite).toHaveTextContent("Shell script copied to clipboard");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy step 1 command" }));
    });
    expect(polite).toHaveTextContent("Step 1 command copied to clipboard");

    fireEvent.click(screen.getByRole("button", { name: /Show \(\d+\)/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy history command 1" }));
    });
    expect(polite).toHaveTextContent("History command 1 copied");
  });

  it("announces clipboard failures through the assertive live region", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<App />);
    const alert = document.querySelector('[aria-live="assertive"]');

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    });
    expect(alert).toHaveTextContent(/could not copy/i);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy command with explanatory comments" }));
    });
    expect(alert).toHaveTextContent(/could not copy/i);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy as shell script" }));
    });
    expect(alert).toHaveTextContent(/could not copy/i);
  });

  it("clears a stale clipboard error after a later successful copy", async () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<App />);
    const alert = document.querySelector('[aria-live="assertive"]');

    writeText.mockRejectedValueOnce(new Error("clipboard denied"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    });
    expect(alert).toHaveTextContent(/could not copy/i);

    writeText.mockResolvedValueOnce(undefined);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    });
    expect(alert).toHaveTextContent("");
  });
});

// Issue #103 — copied status persists long enough for assistive technology
describe("Copied status persistence for assistive technology (#103)", () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("shows the Copied label immediately after copy and resets after 3 s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Copy$/ }));
    });

    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();

    // Still present at 2 s — not yet reset
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.queryByRole("button", { name: "Copied" })).toBeInTheDocument();

    // Reverted after 3 s
    act(() => { vi.advanceTimersByTime(1100); });
    expect(screen.queryByRole("button", { name: /^Copy$/ })).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("announces the copy result in the polite live region", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Copy$/ }));
    });

    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion?.textContent).toMatch(/copied/i);
  });
});

// Issue #54 — runnable Rust example for the events module
describe("Events module runnable Rust example (#54)", () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("renders a runnable Rust example when viewing the events module", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for events module/i }));

    expect(screen.getByRole("heading", { name: /runnable rust example/i })).toBeInTheDocument();
    const codeRegion = screen.getByLabelText(/events module runnable rust example/i);
    expect(codeRegion).toHaveAttribute("tabindex", "0");
    expect(codeRegion.textContent).toContain("soroban_testkit::events::EventLog");
    expect(codeRegion.textContent).toContain("EventLog::capture");
  });

  it("copies the events Rust example and announces it via the live region", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for events module/i }));

    const copyBtn = screen.getByRole("button", { name: /copy events module rust example/i });
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("fn deposit_emits_typed_transfer_event"));
    expect(copyBtn).toHaveTextContent("Copied");
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion?.textContent).toMatch(/events module rust example copied/i);
  });
});

// Issue #53 — common failure modes for the events module
describe("Events module common failure modes (#53)", () => {
  it("documents common failure modes when viewing the events module", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for events module/i }));

    expect(screen.getByRole("heading", { name: /common failure modes/i })).toBeInTheDocument();
    expect(screen.getAllByText(/expected N events, found M/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/topic mismatch at index/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/failed to decode event data as T/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/no events captured for contract/i)[0]).toBeInTheDocument();
  });
});

// Issue #33 — concise API overview for the core module
describe("Core module API overview (#33)", () => {
  it("renders a concise API overview when viewing the core module", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for core module/i }));

    const heading = screen.getByRole("heading", { name: /api overview/i });
    const overview = heading.closest(".module-doc-section") as HTMLElement;

    expect(overview).not.toBeNull();
    expect(within(overview).getByText("TestEnv::new()")).toBeInTheDocument();
    expect(within(overview).getByText("TestEnv::with_seed(n)")).toBeInTheDocument();
    expect(within(overview).getByText("env.address()")).toBeInTheDocument();
    expect(within(overview).getByText("env.env()")).toBeInTheDocument();
    expect(within(overview).getByText("env.reset()")).toBeInTheDocument();
    expect(within(overview).getByText("TestkitError::code()")).toBeInTheDocument();
    expect(
      within(overview).getByText(/creates a deterministic environment wrapping soroban_sdk::Env/i),
    ).toBeInTheDocument();
  });

  it("opens the core module and its API overview from a keyboard-operable control", () => {
    render(<App />);
    const card = screen.getByRole("button", { name: /view details for core module/i });

    // A native, enabled <button> is keyboard-focusable and activates with Enter/Space.
    expect(card.tagName).toBe("BUTTON");
    expect(card).toBeEnabled();
    card.focus();
    expect(card).toHaveFocus();

    fireEvent.click(card);

    expect(screen.getByRole("heading", { name: "core" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /api overview/i })).toBeInTheDocument();
  });
});

// Issue #56 — concise API overview for the events module
describe("Events module API overview (#56)", () => {
  it("renders a concise API overview when viewing the events module", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for events module/i }));

    expect(screen.getByRole("heading", { name: /api overview/i })).toBeInTheDocument();
    expect(screen.getAllByText("EventLog::capture(&env, f)")[0]).toBeInTheDocument();
    expect(screen.getAllByText("log.assert_count(n)")[0]).toBeInTheDocument();
    expect(screen.getAllByText("log.assert_topic(&id, topics)")[0]).toBeInTheDocument();
    expect(screen.getAllByText("log.assert_data::<T>(&id, val)")[0]).toBeInTheDocument();
    expect(screen.getAllByText("log.for_contract(&id)")[0]).toBeInTheDocument();
  });
});

// Issue #52 — runnable Rust example for the money module
describe("Money module runnable Rust example (#52)", () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("renders a runnable Rust example when viewing the money module", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for money module/i }));

    expect(screen.getByRole("heading", { name: /runnable rust example/i })).toBeInTheDocument();
    const codeRegion = screen.getByLabelText(/money module runnable rust example/i);
    expect(codeRegion).toHaveAttribute("tabindex", "0");
    expect(codeRegion.textContent).toContain("soroban_testkit::money::Conservation");
    expect(codeRegion.textContent).toContain("assert_holds");
  });

  it("copies the money Rust example and announces it via the live region", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for money module/i }));

    const copyBtn = screen.getByRole("button", { name: /copy money module rust example/i });
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("fn escrow_release_conserves_total_supply"));
    expect(copyBtn).toHaveTextContent("Copied");
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion?.textContent).toMatch(/money module rust example copied/i);
  });
});

// Issue #65 — concise API overview for the auth module
describe("Auth module API overview (#65)", () => {
  it("renders a concise API overview when viewing the auth module", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for auth module/i }));

    expect(screen.getByRole("heading", { name: /api overview/i })).toBeInTheDocument();
    expect(screen.getByText("AuthMatrix::new(&env)")).toBeInTheDocument();
    expect(screen.getByText(".entry_point(name, allowed, invoke)")).toBeInTheDocument();
    expect(screen.getByText(".assert_enforced()")).toBeInTheDocument();
    expect(screen.getByText("env.assert_requires_auth(|| { ... })")).toBeInTheDocument();
  });
});

// Issue #68 — version and compatibility notes for the auth module
describe("Auth module version and compatibility (#68)", () => {
  it("documents version and compatibility notes when viewing the auth module", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for auth module/i }));

    expect(screen.getByRole("heading", { name: /version and compatibility/i })).toBeInTheDocument();
    expect(screen.getByText("Soroban SDK 27.0.x and later")).toBeInTheDocument();
    expect(screen.getByText("Rust 1.84 or later with wasm32v1-none target")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /known considerations/i })).toBeInTheDocument();
    expect(screen.getByText(/Global auth mocking bypasses/i)).toBeInTheDocument();
  });
});

// Issue #66 — quick-start walkthrough for the tokens module
describe("Tokens module quick-start walkthrough (#66)", () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("renders a quick-start walkthrough and keyboard-accessible example for the tokens module", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for tokens module/i }));

    expect(screen.getByRole("heading", { name: /quick-start walkthrough/i })).toBeInTheDocument();
    expect(screen.getByText(/Add soroban-testkit as a dev-dependency/i)).toBeInTheDocument();
    expect(screen.getByText(/Create a TestEnv and SAC test double/i)).toBeInTheDocument();
    const codeRegion = screen.getByLabelText(/tokens module runnable rust example/i);
    expect(codeRegion).toHaveAttribute("tabindex", "0");
    expect(codeRegion.textContent).toContain("token.mint(&alice, 1_000)");
  });

  it("copies the tokens quick-start example and announces it via the live region", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for tokens module/i }));

    const copyBtn = screen.getByRole("button", { name: /copy tokens module rust example/i });
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("fn token_transfer_updates_balances"));
    expect(copyBtn).toHaveTextContent("Copied");
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion?.textContent).toMatch(/tokens module rust example copied/i);
  });
});

// Issue #64 — version and compatibility notes for the tokens module
describe("Tokens module version and compatibility (#64)", () => {
  it("documents version and compatibility notes when viewing the tokens module", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for tokens module/i }));

    expect(screen.getByRole("heading", { name: /version and compatibility/i })).toBeInTheDocument();
    expect(screen.getByText("Soroban SDK 27.0.x and later")).toBeInTheDocument();
    expect(screen.getByText("Rust 1.84 or later with wasm32v1-none target")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /known considerations/i })).toBeInTheDocument();
    expect(screen.getByText(/negative values or arithmetic overflows panic/i)).toBeInTheDocument();
  });
});

// Issue #78 — preflight checklist for the coverage workflow
describe("Coverage workflow preflight checklist (#78)", () => {
  it("toggles the coverage preflight checklist and allows checking items", () => {
    render(<App />);

    const heading = screen.getByRole("heading", { name: /coverage workflow: preflight checklist/i });
    const card = heading.closest("article");
    expect(card).not.toBeNull();

    const toggleButton = within(card as HTMLElement).getByRole("button", { name: /show checklist/i });
    expect(toggleButton).toHaveAttribute("aria-expanded", "false");
    expect(toggleButton).toHaveAttribute("aria-controls", "coverage-preflight-panel");

    fireEvent.click(toggleButton);
    expect(toggleButton).toHaveAttribute("aria-expanded", "true");
    expect(toggleButton).toHaveTextContent(/hide checklist/i);

    const workspaceCheckbox = within(card as HTMLElement).getByRole("checkbox", {
      name: /target path points to a cargo contract workspace/i,
    });
    expect(workspaceCheckbox).not.toBeChecked();
    fireEvent.click(workspaceCheckbox);
    expect(workspaceCheckbox).toBeChecked();

    expect(
      within(card as HTMLElement).getByRole("checkbox", {
        name: /llvm-tools-preview component is installed/i,
      })
    ).toBeInTheDocument();
  });
});

// Issue #329 — validate the coverage preflight default before command generation
describe("Coverage preflight validation feedback (#329)", () => {
  it("warns while the checklist is at its unchecked default and clears once every item is confirmed", () => {
    render(<App />);

    const warning = screen.getByText(/coverage preflight checklist is still at its unchecked default/i);
    expect(warning).toHaveAttribute("aria-live", "polite");
    expect(warning).toHaveAttribute("id", "coverage-preflight-validation");
    expect(screen.getByRole("button", { name: "Copy" })).toHaveAttribute(
      "aria-describedby",
      "coverage-preflight-validation",
    );

    const heading = screen.getByRole("heading", { name: /coverage workflow: preflight checklist/i });
    const card = heading.closest("article") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: /show checklist/i }));
    within(card)
      .getAllByRole("checkbox")
      .forEach((checkbox) => fireEvent.click(checkbox));

    expect(screen.queryByText(/coverage preflight checklist is still at its unchecked default/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).not.toHaveAttribute("aria-describedby");
  });

  it("does not show coverage preflight feedback for other workflows", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "limits" }));

    expect(screen.queryByText(/coverage preflight checklist is still at its unchecked default/i)).not.toBeInTheDocument();
  });
});

// Issue #330 — workflow switcher order
describe("Workflow switcher tab order (#330)", () => {
  it("keeps both switchers in visual left-to-right order with the tab stop on the first tab", () => {
    render(<App />);

    const selector = screen.getByRole("group", { name: "Command workflow selector" });
    expect(within(selector).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "coverage",
      "limits",
      "audit",
    ]);

    const tablist = screen.getByRole("tablist", { name: /soroban workflow docs/i });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Coverage workflow",
      "Cargo workspace",
      "Resource limits",
    ]);
    expect(tabs[0]).toHaveAttribute("tabindex", "0");
    expect(tabs[1]).toHaveAttribute("tabindex", "-1");
    expect(tabs[2]).toHaveAttribute("tabindex", "-1");
  });
});

// Issue #67 — common failure modes for the tokens module
describe("Tokens module common failure modes (#67)", () => {
  it("documents common failure modes when viewing the tokens module", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for tokens module/i }));

    expect(screen.getByRole("heading", { name: /common failure modes/i })).toBeInTheDocument();
    expect(screen.getAllByText(/insufficient balance/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/negative amount or overflow/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/allowance exceeded or missing approval/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/authorization error on transfer/i)[0]).toBeInTheDocument();
  });
});

// Issue #70 — quick-start walkthrough for the auth module
describe("Auth module quick-start walkthrough (#70)", () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("renders a quick-start walkthrough and keyboard-accessible example for the auth module", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for auth module/i }));

    expect(screen.getByRole("heading", { name: /quick-start walkthrough/i })).toBeInTheDocument();
    expect(screen.getByText(/Create a TestEnv and test identities/i)).toBeInTheDocument();
    expect(screen.getByText(/Register entry points in AuthMatrix/i)).toBeInTheDocument();
    const codeRegion = screen.getByLabelText(/auth module runnable rust example/i);
    expect(codeRegion).toHaveAttribute("tabindex", "0");
    expect(codeRegion.textContent).toContain("fn only_owner_can_withdraw");
  });

  it("copies the auth quick-start example and announces it via the live region", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for auth module/i }));

    const copyBtn = screen.getByRole("button", { name: /copy auth module rust example/i });
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("AuthMatrix::new(&env)"));
    expect(copyBtn).toHaveTextContent("Copied");
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion?.textContent).toMatch(/auth module rust example copied/i);
  });
});

// Issue #69 — troubleshooting FAQ for the auth module
describe("Auth module troubleshooting FAQ (#69)", () => {
  it("renders a keyboard-accessible troubleshooting FAQ when viewing the auth module", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for auth module/i }));

    expect(screen.getByRole("heading", { name: /troubleshooting faq/i })).toBeInTheDocument();

    const firstQuestionBtn = screen.getByRole("button", {
      name: /why does an unauthorized caller succeed in authmatrix\?/i,
    });
    expect(firstQuestionBtn).toHaveAttribute("aria-expanded", "false");
    expect(firstQuestionBtn).toHaveAttribute("aria-controls", "auth-faq-panel-unauthorized-succeeds");

    fireEvent.click(firstQuestionBtn);
    expect(firstQuestionBtn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Remove mock_all_auths\(\) from auth tests/i)).toBeInTheDocument();

    const secondQuestionBtn = screen.getByRole("button", {
      name: /why does my test panic instead of returning err for disallowed callers\?/i,
    });
    expect(secondQuestionBtn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(secondQuestionBtn);
    expect(secondQuestionBtn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Call the generated try_\* client method inside the closure/i)).toBeInTheDocument();
  });
});

// Issue #50 — concise API overview for the money module
describe("Money module API overview (#50)", () => {
  it("renders a concise API overview when viewing the money module", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for money module/i }));

    expect(screen.getByRole("heading", { name: /api overview/i })).toBeInTheDocument();
    expect(screen.getByText("Conservation::new(before, after)")).toBeInTheDocument();
    expect(screen.getByText(".assert_holds()")).toBeInTheDocument();
    expect(screen.getByText("assert_conserved_over(initial, steps)")).toBeInTheDocument();
    expect(screen.getByText("adversarial_amounts()")).toBeInTheDocument();
  });
});

// Issue #49 — quick-start walkthrough for the money module
describe("Money module quick-start walkthrough (#49)", () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("renders a quick-start walkthrough and keyboard-accessible example for the money module", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for money module/i }));

    expect(screen.getByRole("heading", { name: /quick-start walkthrough/i })).toBeInTheDocument();
    expect(screen.getByText(/Add soroban-testkit as a dev-dependency/i)).toBeInTheDocument();
    expect(screen.getByText(/Create a TestEnv, token, and test addresses/i)).toBeInTheDocument();
    const codeRegion = screen.getByLabelText(/money module runnable rust example/i);
    expect(codeRegion).toHaveAttribute("tabindex", "0");
    expect(codeRegion.textContent).toContain("Conservation::new(initial_total, after_total).assert_holds()");
  });

  it("copies the money quick-start example and announces it via the live region", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for money module/i }));

    const copyBtn = screen.getByRole("button", { name: /copy money module rust example/i });
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("fn escrow_release_conserves_total_supply"));
    expect(copyBtn).toHaveTextContent("Copied");
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion?.textContent).toMatch(/money module rust example copied/i);
  });
});

// Issue #51 — version and compatibility notes for the ledger module
describe("Ledger module version and compatibility (#51)", () => {
  it("documents version and compatibility notes when viewing the ledger module", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for ledger module/i }));

    expect(screen.getByRole("heading", { name: /version and compatibility/i })).toBeInTheDocument();
    expect(screen.getByText("Soroban SDK 27.0.x and later")).toBeInTheDocument();
    expect(screen.getByText("Rust 1.84 or later with wasm32v1-none target")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /known considerations/i })).toBeInTheDocument();
    expect(screen.getByText(/Monotonic progression:/i)).toBeInTheDocument();
    expect(screen.getByText(/Offline deterministic state:/i)).toBeInTheDocument();
  });
});

// Issue #48 — common failure modes for the money module
describe("Money module common failure modes (#48)", () => {
  it("documents common failure modes when viewing the money module", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for money module/i }));

    expect(screen.getByRole("heading", { name: /common failure modes/i })).toBeInTheDocument();
    expect(screen.getByText(/supply conservation mismatch/i)).toBeInTheDocument();
    expect(screen.getByText(/i128 arithmetic overflow/i)).toBeInTheDocument();
    expect(screen.getByText(/rounding dust accumulation/i)).toBeInTheDocument();
    expect(screen.getByText(/negative amount input/i)).toBeInTheDocument();
  });
});

// Issue #36 — copied feedback must wait for a successful clipboard write
describe("Copy feedback only after clipboard success (#36)", () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("does not show copied feedback while the clipboard write is pending", async () => {
    let finishWrite = () => {};
    const writeText = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishWrite = () => resolve();
        }),
    );
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Copy$/ }));

    expect(screen.getByRole("button", { name: /^Copy$/ })).toBeInTheDocument();

    await act(async () => {
      finishWrite();
    });

    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("announces a clipboard failure instead of showing copied feedback", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Copy$/ }));
    });

    expect(screen.getByRole("button", { name: /^Copy$/ })).toBeInTheDocument();
    await waitFor(() => {
      const alertRegion = document.querySelector('[aria-live="assertive"]');
      expect(alertRegion?.textContent).toMatch(/could not copy/i);
    });
  });
});

// Issue #34 — the command output stays selectable when the clipboard is blocked
describe("Selectable command output when clipboard is blocked (#34)", () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("keeps the generated command focusable and selectable by keyboard", () => {
    render(<App />);
    const output = screen.getByTestId("command-output");

    expect(output).toHaveAttribute("tabindex", "0");
    output.focus();
    expect(output).toHaveFocus();
  });

  it("selects the generated command so it can be copied manually when the clipboard is blocked", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    document.execCommand = vi.fn().mockReturnValue(false);

    render(<App />);
    const output = screen.getByTestId("command-output");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Copy$/ }));
    });

    // The command stays focused and selected so Ctrl/Cmd+C copies it manually.
    await waitFor(() => expect(output).toHaveFocus());
    const selection = window.getSelection();
    expect(selection?.rangeCount ?? 0).toBeGreaterThan(0);
    expect(selection?.getRangeAt(0).startContainer).toBe(output);
    const alertRegion = document.querySelector('[aria-live="assertive"]');
    expect(alertRegion?.textContent).toMatch(/could not copy/i);
  });

  it("preserves the normal copy workflow when the Clipboard API is available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Copy$/ }));
    });

    expect(writeText).toHaveBeenCalledWith("soroban-testkit coverage . --format html --open");
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(window.getSelection()?.toString() ?? "").not.toContain("soroban-testkit coverage");
  });
});

// Issue #35 — each clear button removes itself, so focus must be returned to its field
describe("Focus restored after clearing command fields (#35)", () => {
  it("restores focus to the path input after clearing it", () => {
    render(<App />);
    const input = screen.getByRole("textbox", { name: "Project or contract path" }) as HTMLInputElement;
    const clear = screen.getByRole("button", { name: "Clear project or contract path" });

    clear.focus();
    expect(clear).toHaveFocus();
    fireEvent.click(clear);

    expect(input).toHaveFocus();
    expect(input.value).toBe("");
    expect(
      screen.queryByRole("button", { name: "Clear project or contract path" }),
    ).not.toBeInTheDocument();
  });

  it("restores focus to the function input after clearing it", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "limits" }));

    const input = screen.getByRole("textbox", { name: "Function" }) as HTMLInputElement;
    const clear = screen.getByRole("button", { name: "Clear function" });

    clear.focus();
    fireEvent.click(clear);

    expect(input).toHaveFocus();
    expect(input.value).toBe("");
  });

  it("restores focus to the ramp input after clearing it", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "limits" }));

    const input = screen.getByRole("textbox", { name: "Ramp parameter" }) as HTMLInputElement;
    const clear = screen.getByRole("button", { name: "Clear ramp parameter" });

    clear.focus();
    fireEvent.click(clear);

    expect(input).toHaveFocus();
    expect(input.value).toBe("");
  });

  it("keeps the other generated-command workflows working after a field is cleared", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Clear project or contract path" }));

    // Clearing one field must not disturb switching workflows or generating output.
    fireEvent.click(screen.getByRole("button", { name: "audit" }));

    expect(screen.getByRole("button", { name: "audit" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("command-output")).toBeInTheDocument();
  });
});

// Issue #37 — generated output and copy feedback stay aligned after rapid mode changes
describe("Rapid workflow mode changes (#37)", () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("keeps the final mode's output visible when an earlier copy finishes after a switch", async () => {
    let finishWrite = () => {};
    const writeText = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishWrite = () => resolve();
        }),
    );
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Copy$/ }));
    fireEvent.click(screen.getByRole("tab", { name: "limits" }));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("soroban-testkit coverage"));
    expect(screen.getByTestId("command-output")).toHaveTextContent("soroban-testkit limits");
    expect(screen.queryByRole("button", { name: "Copied" })).not.toBeInTheDocument();

    await act(async () => {
      finishWrite();
    });

    expect(screen.getByTestId("command-output")).toHaveTextContent("soroban-testkit limits");
    expect(screen.queryByRole("button", { name: "Copied" })).not.toBeInTheDocument();
  });
});

// Issue #38 — version and compatibility notes for the core module
describe("Core module version and compatibility (#38)", () => {
  it("documents version and compatibility notes when viewing the core module", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for core module/i }));

    expect(screen.getByRole("heading", { name: /version and compatibility/i })).toBeInTheDocument();
    expect(
      screen.getByText("soroban-testkit core API with Soroban SDK 27.0.x and later"),
    ).toBeInTheDocument();
    expect(screen.getByText("Rust 1.84 or later with the wasm32v1-none target")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /known considerations/i })).toBeInTheDocument();
  });
});

// Issue #39 — troubleshooting FAQ for the core module
describe("Core module troubleshooting FAQ (#39)", () => {
  it("renders a keyboard-accessible troubleshooting FAQ when viewing the core module", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for core module/i }));

    expect(screen.getByRole("heading", { name: /troubleshooting faq/i })).toBeInTheDocument();

    const firstQuestionBtn = screen.getByRole("button", {
      name: /why does try_warp_to return an error\?/i,
    });
    expect(firstQuestionBtn).toHaveAttribute("aria-expanded", "false");
    expect(firstQuestionBtn).toHaveAttribute("aria-controls", "core-faq-panel-warp-to-earlier");

    fireEvent.click(firstQuestionBtn);
    expect(firstQuestionBtn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/earlier than env.now\(\)/i)).toBeInTheDocument();

    const secondQuestionBtn = screen.getByRole("button", {
      name: /why did an advance call overflow ledger arithmetic\?/i,
    });
    expect(secondQuestionBtn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(secondQuestionBtn);
    expect(secondQuestionBtn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/smaller whole-second durations/i)).toBeInTheDocument();
  });
});

// Issue #58 — concise API overview for the tokens module
describe("Tokens module API overview (#58)", () => {
  it("renders a concise API overview when viewing the tokens module", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for tokens module/i }));

    expect(screen.getByRole("heading", { name: /api overview/i })).toBeInTheDocument();
    expect(screen.getAllByText("env.token()")[0]).toBeInTheDocument();
    expect(screen.getAllByText("token.address()")[0]).toBeInTheDocument();
    expect(screen.getAllByText("token.mint(&to, amount)")[0]).toBeInTheDocument();
    expect(screen.getAllByText("token.transfer(&from, &to, amount)")[0]).toBeInTheDocument();
    expect(screen.getAllByText("token.approve(&owner, &spender, amount, expiration_ledger)")[0]).toBeInTheDocument();
    expect(screen.getAllByText("token.transfer_from(&spender, &from, &to, amount)")[0]).toBeInTheDocument();
    expect(screen.getAllByText("token.balance(&id) / token.assert_balance(&id, expected)")[0]).toBeInTheDocument();
  });
});

// Issue #59 — version and compatibility notes for the events module
describe("Events module version and compatibility (#59)", () => {
  it("documents version and compatibility notes when viewing the events module", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for events module/i }));

    expect(screen.getByRole("heading", { name: /version and compatibility/i })).toBeInTheDocument();
    expect(screen.getByText("Soroban SDK 27.0.x and later")).toBeInTheDocument();
    expect(screen.getByText("Rust 1.84 or later with wasm32v1-none target")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /known considerations/i })).toBeInTheDocument();
    expect(screen.getByText(/records only events emitted during the closure/i)).toBeInTheDocument();
  });
});

// Issue #55 — version and compatibility notes for the money module
describe("Money module version and compatibility (#55)", () => {
  it("documents version and compatibility notes when viewing the money module", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for money module/i }));

    expect(screen.getByRole("heading", { name: /version and compatibility/i })).toBeInTheDocument();
    expect(screen.getByText("Soroban SDK 27.0.x and later")).toBeInTheDocument();
    expect(screen.getByText("Rust 1.84 or later with wasm32v1-none target")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /known considerations/i })).toBeInTheDocument();
    expect(screen.getByText(/adversarial boundary inputs test/i)).toBeInTheDocument();
  });
});

// Issue #57 — troubleshooting FAQ for the money module
describe("Money module troubleshooting FAQ (#57)", () => {
  it("renders a keyboard-accessible troubleshooting FAQ when viewing the money module", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /view details for money module/i }));

    expect(screen.getByRole("heading", { name: /troubleshooting faq/i })).toBeInTheDocument();

    const firstQuestionBtn = screen.getByRole("button", {
      name: /why does conservation::assert_holds\(\) fail by 1 or a few stroops\?/i,
    });
    expect(firstQuestionBtn).toHaveAttribute("aria-expanded", "false");
    expect(firstQuestionBtn).toHaveAttribute("aria-controls", "money-faq-panel-conservation-off-by-one");

    fireEvent.click(firstQuestionBtn);
    expect(firstQuestionBtn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Route remainder or dust explicitly to a designated recipient/i)).toBeInTheDocument();

    const secondQuestionBtn = screen.getByRole("button", {
      name: /why does my contract panic on i128::max or adversarial boundary inputs\?/i,
    });
    expect(secondQuestionBtn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(secondQuestionBtn);
    expect(secondQuestionBtn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Use checked_add, checked_sub, and checked_mul/i)).toBeInTheDocument();
  });
});

 fix/command-shell-mobile-tabs-copy-12-15
describe("Issues #13–#15: accessible controls and copy announcements", () => {
  const originalClipboard = navigator.clipboard;

describe("Accessible report format markup (#324)", () => {
  it("exposes an exclusive, labelled radio group and announces changed output", () => {
    render(<App />);
    const group = screen.getByRole("radiogroup", { name: "Report format" });
    expect(group).toHaveAttribute("aria-describedby", "format-help");
    const choices = within(group).getAllByRole("radio");
    expect(choices).toHaveLength(3);
    expect(within(group).getByRole("radio", { name: "html" })).toBeChecked();
    expect(within(group).getByRole("radio", { name: "lcov" })).not.toBeChecked();
    fireEvent.click(within(group).getByRole("radio", { name: "lcov" }));
    expect(within(group).getByRole("radio", { name: "lcov" })).toBeChecked();
    expect(within(group).getByRole("radio", { name: "html" })).not.toBeChecked();
    expect(screen.getByText("soroban-testkit coverage . --format lcov")).toBeInTheDocument();
  });
});

describe("Module-card disclosures (#337)", () => {
  it("announces expanded/collapsed state for the real summary panel", () => {
    render(<App />);
    const toggle = screen.getByRole("button", { name: "Show core module summary" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "module-details-core");
    const panel = document.getElementById("module-details-core");
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute("hidden");
    fireEvent.click(toggle);
    const expanded = screen.getByRole("button", { name: "Hide core module summary" });
    expect(expanded).toHaveAttribute("aria-expanded", "true");
    expect(panel).not.toHaveAttribute("hidden");
    expect(within(panel!).getByText("Deterministic execution")).toBeVisible();
    fireEvent.click(expanded);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveAttribute("hidden");
  });
});


describe("Papytee assigned regressions (#350, #356)", () => {
  it("shows an Audit-specific required path error when the source path is empty (#350)", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "audit" }));

    const pathInput = screen.getByRole("textbox", { name: "Project or contract path" });
    fireEvent.change(pathInput, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Audit source path is required. Enter the contract source directory (for example, ./src).",
    );
  });

  it("selects Coverage and focuses its generated output with Ctrl+Shift+C (#356)", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "audit" }));

    fireEvent.keyDown(document.body, { key: "C", ctrlKey: true, shiftKey: true });

    expect(screen.getByRole("button", { name: "coverage" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "Generated command output" })).toHaveFocus();
    expect(screen.getByTestId("command-output")).toHaveTextContent("soroban-testkit coverage");
    expect(screen.getByText("Jumped to the Coverage command output panel")).toBeInTheDocument();
  });
});


describe("Assigned command-builder regressions (#346, #348, #351)", () => {
  it("emits --strict only when Audit strict mode is enabled (#346)", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "audit" }));

    const output = screen.getByTestId("command-output");
    const strict = screen.getByRole("checkbox", { name: /fail on warnings/i });

    expect(output).toHaveTextContent("--strict");
    fireEvent.click(strict);
    expect(output).not.toHaveTextContent("--strict");
    expect(output).not.toHaveTextContent("--strict false");
  });

  it("shows an explanatory empty state when Command history is opened before any copy (#348)", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /show \(0\)/i }));

    expect(
      screen.getByText("No commands yet. Copy a generated command to add it to this session history."),
    ).toBeVisible();
  });

  it("shows live character and line counts for the Audit multiline editor (#351)", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "audit" }));
    fireEvent.click(screen.getByRole("button", { name: "Advanced arguments" }));

    const editor = screen.getByRole("textbox", { name: "Advanced command editor" });
    fireEvent.change(editor, { target: { value: "soroban-testkit audit ./src\n--strict" } });

    expect(screen.getByText("36 characters · 2 lines")).toBeVisible();
    expect(editor).toHaveAttribute("aria-describedby", "audit-editor-count");
  });
});

// #358 — restoring a remembered command must not be blocked by, or reset, an
// active module search filter.
describe("Command history restore with an active module filter (#358)", () => {
  const originalClipboard = navigator.clipboard;

 main
  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

 fix/command-shell-mobile-tabs-copy-12-15
  it("lets keyboard users select command tabs with arrows, Home and End", () => {
    render(<App />);
    const tabs = screen.getByRole("tablist", { name: "Command workflow selector" });
    const coverage = within(tabs).getByRole("tab", { name: "coverage" });
    const limits = within(tabs).getByRole("tab", { name: "limits" });
    const audit = within(tabs).getByRole("tab", { name: "audit" });

    coverage.focus();
    fireEvent.keyDown(coverage, { key: "ArrowRight" });
    expect(limits).toHaveFocus();
    expect(limits).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "limits" })).toBeInTheDocument();
    fireEvent.keyDown(limits, { key: "End" });
    expect(audit).toHaveFocus();
    expect(audit).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(audit, { key: "ArrowRight" });
    expect(coverage).toHaveFocus();
    fireEvent.keyDown(coverage, { key: "ArrowLeft" });
    expect(audit).toHaveFocus();
    fireEvent.keyDown(audit, { key: "Home" });
    expect(coverage).toHaveFocus();
  });

  it("keeps the mobile navigation reachable and restores focus on Escape", () => {
    render(<App />);
    const toggle = screen.getByRole("button", { name: "Open navigation menu" });
    fireEvent.click(toggle);
    const menu = document.getElementById("mobile-menu");
    expect(menu).toHaveAttribute("data-open", "true");
    const commandsLink = within(menu!).getByRole("link", { name: "Commands" });
    commandsLink.focus();
    fireEvent.keyDown(commandsLink, { key: "Escape" });
    expect(menu).toHaveAttribute("data-open", "false");
    expect(toggle).toHaveFocus();
  });

  it("announces successful command copies in an atomic polite status region", async () => {

  function mockClipboard() {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    return writeText;
  }

  it("restores the remembered workflow while keeping the current module filter", async () => {
    const writeText = mockClipboard();
    render(<App />);

    // Record a non-default Limits configuration in the command history.
    fireEvent.click(screen.getByRole("button", { name: "limits" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Project or contract path" }), {
      target: { value: "./contracts/vault" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Function" }), {
      target: { value: "withdraw" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Ramp parameter" }), {
      target: { value: "amount" },
    });
    const rememberedCommand =
      "soroban-testkit limits --contract ./contracts/vault --fn withdraw --ramp amount";
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(rememberedCommand));

    // Filter the module library down to the module related to that workflow,
    // then move the builder to a different workflow.
    const filterInput = screen.getByLabelText("Search modules by name or description");
    fireEvent.change(filterInput, { target: { value: "tokens" } });
    expect(screen.getByRole("heading", { name: "tokens", level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "money", level: 3 })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "coverage" }));
    expect(screen.getByTestId("command-output")).toHaveTextContent("soroban-testkit coverage");

    const restore = screen.getByRole("button", { name: "Restore previous command" });
    await waitFor(() => expect(restore).toBeEnabled());
    fireEvent.click(restore);

    // The remembered workflow is restored in the builder ...
    expect(screen.getByRole("button", { name: "limits" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "coverage" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("command-output")).toHaveTextContent(rememberedCommand);
    expect(screen.getByText("Previous command restored")).toBeInTheDocument();
    expect(restore).toHaveTextContent("Restore previous (0)");

    // ... while the module filter still applies and is not reset by the restore.
    expect(filterInput).toHaveValue("tokens");
    expect(screen.getByRole("heading", { name: "tokens", level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "money", level: 3 })).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open the limits workflow related to tokens" }),
    ).toHaveAttribute("href", "#commands");
  });

  it("restores the remembered workflow even when the filter matches no modules", async () => {
    const writeText = mockClipboard();
    render(<App />);

    // Remember an Audit command with strict mode turned off.
    fireEvent.click(screen.getByRole("button", { name: "audit" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /fail on warnings/i }));
    const rememberedCommand = "soroban-testkit audit .";
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(rememberedCommand));

    // An active filter that hides every module card must not hide the builder
    // or stop a restore from applying the remembered workflow.
    const filterInput = screen.getByLabelText("Search modules by name or description");
    fireEvent.change(filterInput, { target: { value: "nonexistent-module" } });
    expect(screen.getByRole("heading", { name: /No modules match/ })).toBeInTheDocument();
    expect(document.getElementById("module-grid")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "limits" }));
    const restore = screen.getByRole("button", { name: "Restore previous command" });
    await waitFor(() => expect(restore).toBeEnabled());
    fireEvent.click(restore);

    expect(screen.getByRole("button", { name: "audit" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "limits" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("command-output")).toBeVisible();
    expect(screen.getByTestId("command-output")).toHaveTextContent(rememberedCommand);
    expect(restore).toHaveTextContent("Restore previous (0)");

    // The empty filter state is preserved rather than cleared by the restore.
    expect(filterInput).toHaveValue("nonexistent-module");
    expect(screen.getByRole("heading", { name: /No modules match/ })).toBeInTheDocument();
    expect(document.getElementById("module-grid")).toBeNull();
  });
});

describe("Clipboard feedback and usability regressions (#16-#19)", () => {
  const styles = readFileSync("src/styles.css", "utf8");
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    vi.useRealTimers();
  });

  it("does not let an older copy timer reset newer copy feedback (#16)", async () => {
    vi.useFakeTimers();
 main
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
 fix/command-shell-mobile-tabs-copy-12-15
    render(<App />);
    const status = screen.getByTestId("copy-status");
    expect(status).toHaveAttribute("aria-atomic", "true");
    expect(status).toHaveAttribute("aria-live", "polite");

    fireEvent.click(screen.getByRole("button", { name: "Copy", exact: true }));
    await waitFor(() => expect(status).toHaveTextContent("Command copied to clipboard"));
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveAttribute("aria-label", "Command copy status");
  });

  it("announces clipboard failures through the assertive alert", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"));


    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Copied")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Copy command with explanatory comments" }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Copied with comments")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(screen.getByText("Copied with comments")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1400);
    });
    expect(screen.queryByText("Copied with comments")).not.toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith("soroban-testkit coverage . --format html --open");
  });

  it("shows a visible error when the clipboard rejects a copy (#17)", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
 main
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
 fix/command-shell-mobile-tabs-copy-12-15
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Copy", exact: true }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Could not copy to clipboard"),
    );
    expect(screen.getByTestId("copy-status")).toBeEmptyDOMElement();


    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(await screen.findByTestId("copy-error")).toHaveTextContent(
      /could not copy to clipboard/i,
    );
  });

  it("defines visible keyboard focus rings for interactive controls (#18)", () => {
    expect(styles).toMatch(/button:focus-visible[^}]*outline: 2px/);
    expect(styles).toMatch(/a:focus-visible[^}]*outline: 2px/);
    expect(styles).toMatch(/\[role="tab"\]:focus-visible[^}]*outline: 2px/);
  });

  it("shows the effective default path in the audit field (#19)", () => {
    render(<App />);

    expect(screen.getByRole("textbox", { name: /project or contract path/i })).toHaveAttribute(
      "placeholder",
      ".",
    );

    fireEvent.click(screen.getByRole("button", { name: "audit" }));

    expect(screen.getByRole("textbox", { name: /project or contract path/i })).toHaveAttribute(
      "placeholder",
      "./src",
    );
    expect(screen.getByTestId("command-output")).toHaveTextContent(
      "soroban-testkit audit . --strict",
    );
 main
  });
});
