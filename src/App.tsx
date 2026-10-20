import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildCommand,
  formatCommandLine,
  modules,
  moduleCategories,
  type CommandName,
  type ModuleCategory,
  type OptionalArgKey,
  localFileGuides,
} from "./testkit";
import { copyToClipboard } from "./clipboard";
import { CORE_REPO_URL, INSTALL_GUIDE_URL, INTERFACE_REPO_URL } from "./links";
import { useActiveSection } from "./useActiveSection";
import "./styles.css";

const navSections = [
  { id: "install", label: "Install" },
  { id: "modules", label: "Modules" },
  { id: "commands", label: "Commands" },
  { id: "audit-reference", label: "Audit reference" },
  { id: "limits-reference", label: "Limits reference" },
] as const;
const navSectionIds = navSections.map((section) => section.id);

// Which CLI workflows are most useful for each module (#130). Keyed by module
// name so adding a module without a mapping fails type-checking.
const moduleRelatedWorkflows: Record<(typeof modules)[number][0], CommandName[]> = {
  core: ["coverage"],
  ledger: ["audit"],
  money: ["audit", "limits"],
  events: ["coverage"],
  tokens: ["limits"],
  auth: ["audit"],
  ttl: ["audit"],
};

const descriptions: Record<CommandName, string> = {
  coverage: "Generate contract-test coverage through cargo-llvm-cov.",
  limits: "Ramp a contract input to find its practical resource ceiling.",
  audit: "Scan contract sources for common auth, arithmetic, and TTL risks.",
};

const defaultCoverageOrder: OptionalArgKey[] = ["format", "open"];

const optionalArgumentRows = [
  { key: "format" as const, label: "Format", summary: "--format html" },
  { key: "open" as const, label: "Open report", summary: "--open" },
];

const workflowTabs = [
  { id: "coverage", label: "Coverage workflow" },
  { id: "workspace", label: "Cargo workspace" },
  { id: "limits", label: "Resource limits" },
] as const;

type WorkflowTabId = (typeof workflowTabs)[number]["id"];

interface CommandOptions {
  command: CommandName;
  path: string;
  format: "html" | "lcov" | "text";
  open: boolean;
  fn: string;
  ramp: string;
  strict: boolean;
  shell?: "bash" | "zsh" | "fish" | "sh";
  optionalArgOrder?: OptionalArgKey[];
}

interface SummaryRow {
  label: string;
  value: string;
}

interface DefaultRow {
  key: string;
  label: string;
  value: string;
  applied: boolean;
}

interface ComparisonRow {
  key: string;
  label: string;
  a: string;
  b: string;
  changed: boolean;
}

const installationSteps = [
  {
    title: "Install Rust",
    description: "Download and install the Rust toolchain",
    command: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
  },
  {
    title: "Add wasm32 target",
    description: "Install the WebAssembly compilation target",
    command: "rustup target add wasm32v1-none",
  },
  {
    title: "Install Soroban CLI",
    description: "Get the Stellar command-line tools",
    command: "cargo install stellar-cli",
  },
  {
    title: "Install cargo-llvm-cov",
    description: "Tool for generating coverage reports",
    command: "cargo install cargo-llvm-cov",
  },
  {
    title: "Clone Testkit",
    description: "Get the latest Soroban Testkit repository",
    command: "git clone https://github.com/soroban-testkit/testkit-blockchain",
  },
  {
    title: "Install Testkit CLI",
    description: "Build and install the testkit command",
    command: "cargo install --path testkit-blockchain/crates/cli",
  },
];

// Things worth confirming before running an audit scan (#91). Local-only
// checklist state; nothing here is persisted or sent anywhere.
const auditPrerequisites = [
  { id: "rust", label: "Rust toolchain installed via rustup" },
  { id: "wasm-target", label: "wasm32v1-none compilation target added" },
  { id: "testkit-cli", label: "Testkit CLI installed and on your PATH" },
  { id: "builds-clean", label: "Contract builds without warnings before scanning" },
];

function summarizeConfiguration(options: CommandOptions): SummaryRow[] {
  const rows: SummaryRow[] = [{ label: "Workflow", value: options.command }];
  if (options.path) rows.push({ label: "Path", value: options.path });
  if (options.command === "coverage" && options.format) {
    rows.push({ label: "Format", value: options.format });
    if (options.open) rows.push({ label: "Open report", value: "Yes" });
  }
  if (options.command === "limits") {
    rows.push({ label: "Function", value: options.fn });
    rows.push({ label: "Ramp", value: options.ramp });
  }
  if (options.command === "audit" && options.strict) {
    rows.push({ label: "Strict mode", value: "Enabled" });
  }
  return rows;
}

function effectiveDefaults(options: CommandOptions): DefaultRow[] {
  const rows: DefaultRow[] = [];
  if (options.command === "coverage") {
    if (!options.format) {
      rows.push({ key: "format", label: "Format", value: "html", applied: true });
    }
  }
  if (options.command === "limits") {
    if (!options.path) {
      rows.push({
        key: "contract",
        label: "Contract",
        value: "target/wasm32v1-none/release/contract.wasm",
        applied: true,
      });
    }
    if (!options.fn) {
      rows.push({ key: "fn", label: "Function", value: "batch_payout", applied: true });
    }
    if (!options.ramp) {
      rows.push({ key: "ramp", label: "Ramp", value: "recipients", applied: true });
    }
  }
  if (options.command === "audit" && !options.path) {
    rows.push({ key: "path", label: "Path", value: "./src", applied: true });
  }
  return rows;
}

function compareConfigurations(a: CommandOptions, b: CommandOptions): ComparisonRow[] {
  return [
    { key: "command", label: "Workflow", a: a.command, b: b.command, changed: a.command !== b.command },
    { key: "path", label: "Path", a: a.path, b: b.path, changed: a.path !== b.path },
    { key: "format", label: "Format", a: a.format, b: b.format, changed: a.format !== b.format },
    { key: "shell", label: "Shell", a: a.shell || "default", b: b.shell || "default", changed: a.shell !== b.shell },
  ];
}

function highlightCommand(command: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\s+|--|[^\s]+)/g;
  let match;
  let index = 0;

  while ((match = regex.exec(command)) !== null) {
    const text = match[0];
    if (/^\s+$/.test(text)) {
      parts.push(text);
    } else if (text.startsWith("--")) {
      parts.push(
        <span key={index} className="syntax-flag">
          {text}
        </span>
      );
    } else if (/^(soroban-testkit|coverage|limits|audit)$/.test(text)) {
      parts.push(
        <span key={index} className="syntax-command">
          {text}
        </span>
      );
    } else if (/^(html|lcov|text|batch_payout|recipients)$/.test(text)) {
      parts.push(
        <span key={index} className="syntax-value">
          {text}
        </span>
      );
    } else {
      parts.push(
        <span key={index} className="syntax-path">
          {text}
        </span>
      );
    }
    index++;
  }
  return parts;
}

export default function App() {
  const [command, setCommand] = useState<CommandName>("coverage");
  const [path, setPath] = useState(".");
  const [format, setFormat] = useState<"html" | "lcov" | "text">("html");
  const [open, setOpen] = useState(true);
  const [fn, setFn] = useState("batch_payout");
  const [ramp, setRamp] = useState("recipients");
  const [strict, setStrict] = useState(true);
  const [shell, setShell] = useState<"bash" | "zsh" | "fish" | "sh">("bash");
  const [copied, setCopied] = useState(false);
  const [copiedStep, setCopiedStep] = useState<number | null>(null);
  // Copy buttons change their label, which screen readers often skip; this
  // polite live region announces the result explicitly (#108).
  const [announcement, setAnnouncement] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const moduleSearchRef = useRef<HTMLInputElement>(null);

  // Resetting from the empty state removes the button that had focus, so move
  // focus back to the search box instead of dropping it to <body> (#123).
  const resetModuleFilter = () => {
    setModuleFilter("");
    moduleSearchRef.current?.focus();
  };
  const [coverageOrder, setCoverageOrder] = useState<OptionalArgKey[]>(defaultCoverageOrder);
  const [multilineEditor, setMultilineEditor] = useState(false);
  const [advancedCommand, setAdvancedCommand] = useState("");
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowTabId>("coverage");
  const [compareOpen, setCompareOpen] = useState(false);
  const [configB, setConfigB] = useState<CommandOptions | null>(null);
  const [coverageGuideOpen, setCoverageGuideOpen] = useState(false);
  const [auditGuideOpen, setAuditGuideOpen] = useState(false);
  const [checkedPrerequisites, setCheckedPrerequisites] = useState<Record<string, boolean>>({});
  const comparePanelRef = useRef<HTMLDivElement>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  // #117 — mobile nav toggle
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  // #118 — module table of contents
  const [tocOpen, setTocOpen] = useState(false);
  // #116 — accessibility statement modal
  const [a11yOpen, setA11yOpen] = useState(false);
  const [activeSection, setActiveSection] = useActiveSection(navSectionIds);

  useEffect(() => {
    document.documentElement.style.scrollPaddingTop = "78px";
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        // "/" focuses the module search field (#127)
        if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement)?.tagName ?? "")) {
          event.preventDefault();
          document.getElementById("module-search")?.focus();
        }
        return;
      }

      switch (event.key) {
        case "1":
          document.getElementById("top")?.scrollIntoView({ behavior: "smooth" });
          break;
        case "2":
          document.getElementById("install")?.scrollIntoView({ behavior: "smooth" });
          break;
        case "3":
          document.getElementById("modules")?.scrollIntoView({ behavior: "smooth" });
          break;
        case "4":
          document.getElementById("commands")?.scrollIntoView({ behavior: "smooth" });
          break;
        case "5":
          document.getElementById("limits-reference")?.scrollIntoView({ behavior: "smooth" });
          break;
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const options = useMemo<CommandOptions>(
    () => ({
      command,
      path,
      format,
      open,
      fn,
      ramp,
      strict,
      shell,
      optionalArgOrder:
        command === "coverage" ? coverageOrder : command === "audit" ? ["strict"] : undefined,
    }),
    [command, path, format, open, fn, ramp, strict, shell, coverageOrder]
  );

  const generated = useMemo(() => buildCommand(options), [options]);

  const toggleAdvancedEditor = () => {
    if (multilineEditor) {
      setMultilineEditor(false);
      return;
    }
    setAdvancedCommand(formatCommandLine(options, true));
    setMultilineEditor(true);
  };
  const summaryRows = useMemo(() => summarizeConfiguration(options), [options]);
  const defaultRows = useMemo(() => effectiveDefaults(options), [options]);
  const appliedDefaults = defaultRows.filter((row) => row.applied).length;
  const configBCommand = useMemo(() => (configB ? buildCommand(configB) : ""), [configB]);
  const comparisonRows = useMemo(
    () => (configB ? compareConfigurations(options, configB) : []),
    [options, configB]
  );

  useEffect(() => {
    if (compareOpen && comparePanelRef.current) {
      comparePanelRef.current.focus();
    }
  }, [compareOpen]);

  const filteredModules = useMemo(() => {
    const q = moduleFilter.trim().toLowerCase();
    return modules.filter((m) => {
      if (categoryFilter && m.category !== categoryFilter) return false;
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q);
    });
  }, [moduleFilter, categoryFilter]);

  const selectedModuleData = useMemo(
    () => (selectedModule ? modules.find((m) => m.name === selectedModule) ?? null : null),
    [selectedModule],
  );

  // Back-to-top visibility after long scrolling (#125)
  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 480);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.getElementById("top")?.focus?.();
  }, []);

  const moveOptionalArg = (key: OptionalArgKey, direction: "up" | "down") => {
    setCoverageOrder((current) => {
      const index = current.indexOf(key);
      if (index < 0) return current;
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const resetBuilder = () => {
    if (!window.confirm("Reset the command builder to its default values?")) return;
    setCommand("coverage");
    setPath(".");
    setFormat("html");
    setOpen(true);
    setFn("batch_payout");
    setRamp("recipients");
    setStrict(true);
    setShell("bash");
    setCoverageOrder(defaultCoverageOrder);
    setMultilineEditor(false);
  };

  const applyAdvancedCommand = () => {
    const tokens = advancedCommand.match(/"[^"]+"|'[^']+'|[^\s]+/g) ?? [];
    if (tokens.length === 0) return;

    const [tool, selectedCommand, ...args] = tokens;
    if (tool !== "soroban-testkit") return;

    if (selectedCommand === "coverage") setCommand("coverage");
    if (selectedCommand === "limits") setCommand("limits");
    if (selectedCommand === "audit") setCommand("audit");

    const stripQuotes = (value: string) => value.replace(/^["']|["']$/g, "");

    for (let index = 0; index < args.length; index += 1) {
      const token = args[index];
      if (token === "--format" && args[index + 1]) {
        setFormat(args[index + 1] as "html" | "lcov" | "text");
        index += 1;
      } else if (token === "--open") {
        setOpen(true);
      } else if ((token === "--contract" || token === "--path") && args[index + 1]) {
        setPath(stripQuotes(args[index + 1]));
        index += 1;
      } else if (token === "--fn" && args[index + 1]) {
        setFn(stripQuotes(args[index + 1]));
        index += 1;
      } else if (token === "--ramp" && args[index + 1]) {
        setRamp(stripQuotes(args[index + 1]));
        index += 1;
      } else if (token === "--strict") {
        setStrict(true);
      } else if (!token.startsWith("--")) {
        setPath(stripQuotes(token));
      }
    }
  };

  const copy = async () => {
    await copyToClipboard(generated);
    setCopied(true);
    setAnnouncement("Command copied to clipboard");
    window.setTimeout(() => {
      setCopied(false);
      setAnnouncement("");
    }, 1600);
  };

  const copyStep = async (index: number, stepCommand: string) => {
    await copyToClipboard(stepCommand);
    setCopiedStep(index);
    setAnnouncement(`Step ${index + 1} command copied to clipboard`);
    window.setTimeout(() => {
      setCopiedStep(null);
      setAnnouncement("");
    }, 1600);
  };

  const toggleComparison = () => {
    if (!compareOpen) {
      setConfigB({ ...options });
    }
    setCompareOpen(!compareOpen);
  };

  const updateConfigB = (updates: Partial<CommandOptions>) => {
    if (configB) {
      setConfigB({ ...configB, ...updates });
    }
  };

  const handleWorkflowKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const lastIndex = workflowTabs.length - 1;
    const nextIndex =
      event.key === "ArrowRight"
        ? (currentIndex + 1) % workflowTabs.length
        : event.key === "ArrowLeft"
          ? (currentIndex - 1 + workflowTabs.length) % workflowTabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? lastIndex
              : currentIndex;

    if (nextIndex !== currentIndex) {
      event.preventDefault();
      const nextTab = workflowTabs[nextIndex];
      setActiveWorkflow(nextTab.id);
      const button = document.getElementById(`workflow-tab-${nextTab.id}`) as HTMLButtonElement | null;
      button?.focus();
    }
  };

  const fieldClasses = "field-input";

  return (
    <main>
      <a className="skip-link" href="#top">
        Skip to main content
      </a>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <nav aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="Soroban Testkit home">
          <span className="brand-mark">S</span>
          <span>Soroban Testkit</span>
        </a>
        {/* #117 — accessible mobile nav toggle */}
        <button
          type="button"
          className="mobile-menu-toggle"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-menu"
          aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          <span aria-hidden="true">{mobileMenuOpen ? "✕" : "☰"}</span>
        </button>
        <div className="nav-links" id="mobile-menu" ref={mobileMenuRef} data-open={mobileMenuOpen}>
          {navSections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              aria-current={activeSection === section.id ? "location" : undefined}
              onClick={() => { setActiveSection(section.id); setMobileMenuOpen(false); }}
              onFocus={() => setActiveSection(section.id)}
            >
              {section.label}
            </a>
          ))}
          <a href="https://github.com/soroban-testkit/testkit-blockchain">GitHub ↗</a>
          {/* #116 — accessibility statement link */}
          <button type="button" className="nav-a11y-link" onClick={() => { setA11yOpen(true); setMobileMenuOpen(false); }}>
            Accessibility
          </button>
        </div>
      </nav>

      <section className="hero" id="top" tabIndex={-1}>
        <div>
          <p className="eyebrow">Contract testing, without the repeated scaffolding</p>
          <h1>
            Break the contract
            <br />
            before users do.
          </h1>
          <p className="lede">
            Build precise Soroban tests with deterministic environments, adversarial money inputs, typed event
            assertions, and ledger-time control.
          </p>
          <div className="actions">
            <a className="button primary" href="#commands">
              Build a command
            </a>
            <a className="button secondary" href="#modules">
              Explore modules
            </a>
          </div>
          <p className="repo-callout">
            <a className="repo-link" href={INTERFACE_REPO_URL}>
              View this interface on GitHub <span aria-hidden="true">↗</span>
            </a>
            <span className="repo-callout-note">Open source — report issues or contribute to the interface.</span>
          </p>
        </div>
        <div className="terminal" role="region" aria-label="Example Soroban test">
          <div className="terminal-top">
            <i aria-hidden="true" />
            <i aria-hidden="true" />
            <i aria-hidden="true" />
            <span>escrow_test.rs</span>
          </div>
          <pre>
            <code>
              <span className="muted">use</span> soroban_testkit::prelude::*;{"\n\n"}
              <span className="muted">let</span> env = TestEnv::new();{"\n"}
              <span className="muted">let</span> token = env.token();{"\n"}
              <span className="muted">let</span> buyer = env.address();{"\n\n"}
              token.mint(&buyer, <b>100</b>);{"\n"}
              token.assert_balance(&buyer, <b>100</b>);
            </code>
          </pre>
          <div className="pass" aria-label="test result: ok">✓ test result: ok</div>
        </div>
      </section>

      <section className="install" id="install" aria-labelledby="install-heading" tabIndex={-1}>
        <header>
          <p className="eyebrow">First-time setup</p>
          <h2 id="install-heading">From a clean machine to your first command.</h2>
          <p className="install-intro">
            Six ordered steps install the Testkit CLI and its prerequisites. Every step runs locally and keeps
            contract tests deterministic and offline.
          </p>
        </header>
        <ol className="install-steps">
          {installationSteps.map((step, index) => (
            <li key={step.title} className="install-step">
              <span className="install-step-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
              <div className="install-command">
                <code>{step.command}</code>
                <button
                  type="button"
                  aria-label={`Copy step ${index + 1} command`}
                  onClick={() => copyStep(index, step.command)}
                >
                  {copiedStep === index ? "Copied" : "Copy"}
                </button>
              </div>
            </li>
          ))}
        </ol>
        <aside className="install-guide" aria-labelledby="install-guide-heading">
          <h3 id="install-guide-heading">Full installation instructions</h3>
          <p>
            Need crates.io installs, workspace checkouts, or a clean-environment check? The core repository keeps the
            complete, up-to-date installation guide.
          </p>
          <a className="button secondary" href={INSTALL_GUIDE_URL}>
            Read the installation guide <span aria-hidden="true">↗</span>
          </a>
        </aside>
      </section>

      <section className="modules" id="modules" tabIndex={-1}>
        <header>
          <p className="eyebrow">One prelude. Seven focused modules.</p>
          <h2>Everything a serious contract test needs.</h2>
          {/* #118 — module table of contents */}
          <nav className="module-toc" aria-label="Module table of contents">
            <button
              type="button"
              className="module-toc-toggle"
              aria-expanded={tocOpen}
              aria-controls="module-toc-list"
              onClick={() => setTocOpen(!tocOpen)}
            >
              {tocOpen ? "Hide" : "Show"} table of contents
            </button>
            {tocOpen && (
              <ol id="module-toc-list" className="module-toc-list">
                {modules.map(([name, description]) => (
                  <li key={name}>
                    <a
                      href={`#module-${name}`}
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById(`module-${name}`)?.scrollIntoView({ behavior: "smooth" });
                      }}
                    >
                      <strong>{name}</strong> — {description}
                    </a>
                  </li>
                ))}
              </ol>
            )}
          </nav>
          <div className="module-filter-bar">
            <label htmlFor="module-search" className="sr-only">
              Filter modules
            </label>
            <input
              id="module-search"
              ref={moduleSearchRef}
              type="search"
              className="module-filter-input"
              placeholder="Filter modules by name or description..."
              value={moduleFilter}
              onChange={(event) => setModuleFilter(event.target.value)}
              aria-label="Filter modules"
            />
            {moduleFilter && (
              <button
                type="button"
                className="button secondary"
                onClick={() => setSelectedModule(null)}
              >
                ← Back to all modules
              </button>
            )}
          </div>
        </header>

        {filteredModules.length > 0 ? (
          <div className="module-grid" id="module-grid">
            {filteredModules.map(([name, description], index) => (
              <article key={name}>
                <span aria-hidden="true">0{index + 1}</span>
                <h3>{name}</h3>
                <p>{description}</p>
                <div className="module-card-links">
                  <a href="#commands" aria-label={`Open the command builder from the ${name} module`}>
                    Command builder
                  </a>
                  {moduleRelatedWorkflows[name].map((workflow) => (
                    <a
                      key={workflow}
                      href="#commands"
                      aria-label={`Open the ${workflow} workflow related to ${name}`}
                      onClick={() => setCommand(workflow)}
                    >
                      {workflow}
                    </a>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="module-empty-state" role="status" aria-live="polite">
            <div className="module-empty-icon" aria-hidden="true">
              ∅
            </div>
            <h3>No modules match &ldquo;{moduleFilter}&rdquo;</h3>
            <p>No testing modules found matching your filter criteria. Try adjusting your search term.</p>
            <button type="button" className="button secondary" onClick={resetModuleFilter}>
              Reset filter
            </button>
          </div>
        ) : (
          <>
            <header>
              <p className="eyebrow">One prelude. Seven focused modules.</p>
              <h2>Everything a serious contract test needs.</h2>
              <div className="module-filter-bar">
                <label htmlFor="module-search" className="sr-only">
                  Search modules by name or description
                </label>
                <input
                  id="module-search"
                  type="search"
                  className="module-filter-input"
                  placeholder="Search modules by name or description… (press /)"
                  value={moduleFilter}
                  onChange={(event) => setModuleFilter(event.target.value)}
                  aria-label="Search modules by name or description"
                />
                {moduleFilter && (
                  <button
                    type="button"
                    className="module-filter-clear"
                    onClick={() => setModuleFilter("")}
                    aria-label="Clear module search"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="category-filter-bar" role="group" aria-label="Filter modules by category">
                <button
                  type="button"
                  className={`category-chip ${categoryFilter === null ? "active" : ""}`}
                  onClick={() => setCategoryFilter(null)}
                  aria-pressed={categoryFilter === null}
                >
                  All
                </button>
                {moduleCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`category-chip ${categoryFilter === cat ? "active" : ""}`}
                    onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
                    aria-pressed={categoryFilter === cat}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </header>

            {filteredModules.length > 0 ? (
              <div className="module-grid" id="module-grid">
                {filteredModules.map((mod, index) => (
                  <article
                    key={mod.name}
                    id={`module-${mod.name}`}
                    className="module-card"
                    tabIndex={0}
                    role="button"
                    aria-label={`View details for ${mod.name} module`}
                    onClick={() => setSelectedModule(mod.name)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedModule(mod.name);
                      }
                    }}
                  >
                    <span>0{index + 1}</span>
                    <h3>{mod.name}</h3>
                    <p>{mod.description}</p>
                    <span className="module-category-tag">{mod.category}</span>
                  </article>
                ))}
              </div>
            ) : (
              <div className="module-empty-state" role="status" aria-live="polite">
                <div className="module-empty-icon" aria-hidden="true">
                  ∅
                </div>
                <h3>No modules match your filters</h3>
                <p>
                  {moduleFilter
                    ? `No testing modules found matching “${moduleFilter}”${categoryFilter ? ` in ${categoryFilter}` : ""}.`
                    : `No testing modules in the ${categoryFilter} category.`}
                  {" "}Try adjusting your filters.
                </p>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setModuleFilter("");
                    setCategoryFilter(null);
                  }}
                >
                  Reset filters
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <section className="docs" aria-label="Soroban workflow documentation">
        <div className="docs-header">
          <p className="eyebrow">Prerequisites & tutorials</p>
          <h2>Supported Rust and Soroban prerequisites</h2>
        </div>

        <div className="requirements">
          <ul>
            <li>
              <strong>Rust:</strong> Rust &gt;= 1.84 with the <code>wasm32v1-none</code> target installed.
            </li>
            <li>
              <strong>Soroban SDK:</strong> soroban-sdk 27.0.x for current contract builds and tests.
            </li>
            <li>
              <strong>Stellar CLI:</strong> stellar-cli &gt;= 22.0.0 when you need local contract deploy or
              inspect flows.
            </li>
            <li>
              <strong>Build environment:</strong> Cargo workspace with a stable contract crate and optional
              `cargo llvm-cov` for coverage reports.
            </li>
          </ul>
        </div>

        <div className="workflow-tabs" role="tablist" aria-label="Soroban workflow docs">
          {workflowTabs.map((tab, index) => (
            <button
              key={tab.id}
              id={`workflow-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={activeWorkflow === tab.id}
              aria-controls={`workflow-panel-${tab.id}`}
              tabIndex={activeWorkflow === tab.id ? 0 : -1}
              className={activeWorkflow === tab.id ? "active" : ""}
              onClick={() => setActiveWorkflow(tab.id)}
              onKeyDown={(event) => handleWorkflowKeyDown(event, index)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {workflowTabs.map((tab) => (
          <div
            key={tab.id}
            id={`workflow-panel-${tab.id}`}
            role="tabpanel"
            aria-labelledby={`workflow-tab-${tab.id}`}
            hidden={activeWorkflow !== tab.id}
            className="workflow-panel"
          >
            {tab.id === "coverage" && (
              <>
                <h3>Coverage workflow</h3>
                <p>
                  Start in the contract workspace, install the LLVM coverage tooling, and run every relevant
                  Rust test before exporting HTML or LCOV reports.
                </p>
                <pre>
                  <code>
                    cargo llvm-cov --workspace --all-features --html{"\n"}
                    cargo llvm-cov --workspace --lcov --output-path lcov.info
                  </code>
                </pre>
              </>
            )}
            {tab.id === "workspace" && (
              <>
                <h3>Cargo workspace layout</h3>
                <p>Keep each Soroban contract crate in a single workspace with shared dependencies and explicit workspace members.</p>
                <pre>
                  <code>
                    [workspace]{"\n"}
                    members = [{"\n"}
                    {"  "}"contracts/asset",{"\n"}
                    {"  "}"contracts/escrow",{"\n"}
                    {"  "}"contracts/auction",{"\n"}
                    ]{"\n"}
                    resolver = "2"
                  </code>
                </pre>
              </>
            )}
            {tab.id === "limits" && (
              <>
                <h3>Resource limits workflow</h3>
                <p>
                  Compile once, then sweep the function and ramp argument to find the practical limit for
                  batch_payout or any other entrypoint.
                </p>
                <pre>
                  <code>
                    soroban-testkit limits \{"\n"}
                    {"  "}--contract target/wasm32v1-none/release/contract.wasm \{"\n"}
                    {"  "}--fn batch_payout \{"\n"}
                    {"  "}--ramp recipients
                  </code>
                </pre>
              </>
            )}
          </div>
        ))}
      </section>

      <section className="commands" id="commands" tabIndex={-1}>
        <div className="command-copy">
          <p className="eyebrow">CLI workbench</p>
          <h2>From intent to command.</h2>
          <p>Configure a supported Testkit workflow and copy the exact command to your terminal.</p>
          <div className="command-tabs" role="group" aria-label="Command workflow selector">
            {(["coverage", "limits", "audit"] as const).map((name) => (
              <button
                key={name}
                className={command === name ? "active" : ""}
                onClick={() => setCommand(name)}
                aria-pressed={command === name}
              >
                {name}
              </button>
            ))}
          </div>
          <p className="description">{descriptions[command]}</p>
          <div className="command-actions">
            <button type="button" className="button secondary" onClick={resetBuilder}>
              Reset builder
            </button>
          </div>

          <section className="summary-card" aria-labelledby="command-summary-heading">
            <h3 id="command-summary-heading">Command summary</h3>
            <p className="summary-workflow">{command}</p>
            <dl className="summary-settings">
              {summaryRows.map((row) => (
                <div className="summary-row" key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
            <p className="summary-note">
              Updates live from the builder. Values marked (default) apply when a field is left empty.
            </p>
          </section>

          <button
            type="button"
            className="comparison-toggle"
            aria-expanded={compareOpen}
            aria-controls="comparison-panel"
            onClick={toggleComparison}
          >
            Compare two configurations
          </button>
        </div>
        <div className="builder">
          <label>
            <div className="field-header">
              <span>Project or contract path</span>
              <span className="badge badge-required">Required</span>
            </div>
            <div className="field-with-clear">
              <input
                className={fieldClasses}
                value={path}
                onChange={(event) => setPath(event.target.value)}
                aria-label="Project or contract path"
                aria-required="true"
              />
              {path && (
                <button
                  type="button"
                  className="clear-field-button"
                  onClick={() => setPath("")}
                  aria-label="Clear project or contract path"
                >
                  Clear
                </button>
              )}
            </div>
          </label>
          {command === "coverage" && (
            <>
              <div className="field-group">
                <div className="field-header">
                  <span>Optional arguments</span>
                  <span className="badge badge-optional">Reorder</span>
                </div>
                <div className="argument-order-list" aria-label="Optional argument order">
                  {optionalArgumentRows.map((arg) => {
                    const selected = coverageOrder.includes(arg.key);
                    const currentIndex = coverageOrder.indexOf(arg.key);
                    const lastIndex = optionalArgumentRows.length - 1;
                    return (
                      <div key={arg.key} className="argument-order-row">
                        <span className="argument-order-name">{arg.label}</span>
                        <span className="argument-order-summary">{arg.summary}</span>
                        <div className="argument-order-controls">
                          <button
                            type="button"
                            onClick={() => moveOptionalArg(arg.key, "up")}
                            disabled={currentIndex <= 0 || !selected}
                            aria-label={`Move ${arg.label} up`}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveOptionalArg(arg.key, "down")}
                            disabled={currentIndex === -1 || currentIndex >= lastIndex}
                            aria-label={`Move ${arg.label} down`}
                          >
                            ↓
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <label>
                <div className="field-header">
                  <span>Report format</span>
                  <span className="badge badge-optional">Optional</span>
                </div>
                <select value={format} onChange={(event) => setFormat(event.target.value as typeof format)}>
                  <option>html</option>
                  <option>lcov</option>
                  <option>text</option>
                </select>
              </label>
              <label className="check">
                <span className="check-content">
                  <input type="checkbox" checked={open} onChange={(event) => setOpen(event.target.checked)} />
                  <span>Open report when complete</span>
                </span>
                <span className="badge badge-optional">Optional</span>
              </label>
            </>
          )}
          {command === "limits" && (
            <div className="row">
              <label>
                <div className="field-header">
                  <span>Function</span>
                  <span className="badge badge-required">Required</span>
                </div>
                <div id="fn-help" className="field-help">
                  Use the exported symbol name from your contract ABI, such as batch_payout.
                </div>
                <div className="field-with-clear">
                  <input
                    className={fieldClasses}
                    value={fn}
                    onChange={(event) => setFn(event.target.value)}
                    aria-label="Function"
                    aria-required="true"
                    aria-describedby="fn-help"
                  />
                  {fn && (
                    <button
                      type="button"
                      className="clear-field-button"
                      onClick={() => setFn("")}
                      aria-label="Clear function"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </label>
              <label>
                <div className="field-header">
                  <span>Ramp parameter</span>
                  <span className="badge badge-required">Required</span>
                </div>
                <div id="ramp-help" className="field-help">
                  Use the parameter you want to increase in the contract input set; recipients is the default.
                </div>
                <div className="field-with-clear">
                  <input
                    className={fieldClasses}
                    value={ramp}
                    onChange={(event) => setRamp(event.target.value)}
                    aria-label="Ramp parameter"
                    aria-required="true"
                    aria-describedby="ramp-help"
                  />
                  {ramp && (
                    <button
                      type="button"
                      className="clear-field-button"
                      onClick={() => setRamp("")}
                      aria-label="Clear ramp parameter"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </label>
            </div>
          )}
          {command === "audit" && (
            <label className="check">
              <span className="check-content">
                <input type="checkbox" checked={strict} onChange={(event) => setStrict(event.target.checked)} />
                <span>Fail on warnings</span>
              </span>
              <span className="badge badge-optional">Optional</span>
            </label>
          )}

          <label>
            <div className="field-header">
              <span>Shell target</span>
              <span className="badge badge-optional">Optional</span>
            </div>
            <select value={shell} onChange={(event) => setShell(event.target.value as typeof shell)}>
              <option value="bash">Bash</option>
              <option value="zsh">Zsh</option>
              <option value="fish">Fish</option>
              <option value="sh">POSIX sh</option>
            </select>
          </label>

          <section className="defaults-preview" aria-labelledby="defaults-preview-heading">
            <div className="defaults-preview-header">
              <h3 id="defaults-preview-heading">Effective defaults</h3>
              {defaultRows.length > 0 && (
                <span className="defaults-count">
                  {appliedDefaults} of {defaultRows.length} applied
                </span>
              )}
            </div>
            {defaultRows.length === 0 ? (
              <p className="defaults-empty">
                This workflow has no empty-field fallbacks. The copied command uses the values you set above,
                exactly.
              </p>
            ) : (
              <dl className="defaults-list">
                {defaultRows.map((row) => (
                  <div className="defaults-row" key={row.key}>
                    <dt>{row.label}</dt>
                    <dd>
                      <code>{row.applied ? `(empty) → ${row.value}` : row.value}</code>
                      <span className={`badge ${row.applied ? "badge-required" : "badge-optional"}`}>
                        {row.applied ? "Default applied" : "From your input"}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <div
            className="output"
            role="region"
            aria-label="Generated command output"
            aria-describedby="command-output-desc"
          >
            <span id="command-output-desc" className="sr-only">
              Copy this command to your terminal to run the selected workflow.
            </span>
            <code data-testid="command-output">{highlightCommand(generated)}</code>
            <button onClick={copy}>{copied ? "Copied" : "Copy"}</button>
          </div>

          <div className="advanced-command-block">
            <button type="button" className="button secondary" onClick={toggleAdvancedEditor}>
              {multilineEditor ? "Hide advanced editor" : "Advanced arguments"}
            </button>
            {multilineEditor && (
              <>
                <label>
                  <div className="field-header">
                    <span>Advanced command editor</span>
                    <span className="badge badge-optional">Multiline</span>
                  </div>
                  <textarea
                    value={advancedCommand}
                    rows={8}
                    onChange={(event) => setAdvancedCommand(event.target.value)}
                    aria-label="Advanced command arguments"
                  />
                </label>
                <button type="button" className="button primary" onClick={applyAdvancedCommand}>
                  Apply multiline command
                </button>
              </>
            )}
          </div>
        </div>

        {compareOpen && configB && (
          <section
            className="comparison"
            id="comparison-panel"
            ref={comparePanelRef}
            tabIndex={-1}
            aria-labelledby="comparison-heading"
          >
            <div className="comparison-header">
              <h3 id="comparison-heading">Compare two configurations</h3>
              <p>
                Configuration A is the workbench above. Edit configuration B and the table marks every setting
                that differs; both commands update as you type.
              </p>
            </div>

            <fieldset className="comparison-config">
              <legend>Configuration B</legend>
              <div className="row">
                <label>
                  <div className="field-header">
                    <span>Workflow</span>
                  </div>
                  <select
                    value={configB.command}
                    onChange={(event) => updateConfigB({ command: event.target.value as CommandName })}
                  >
                    <option value="coverage">coverage</option>
                    <option value="limits">limits</option>
                    <option value="audit">audit</option>
                  </select>
                </label>
                <label>
                  <div className="field-header">
                    <span>Project or contract path</span>
                    <span className="badge badge-required">Required</span>
                  </div>
                  <input
                    value={configB.path}
                    onChange={(event) => updateConfigB({ path: event.target.value })}
                    aria-required="true"
                  />
                </label>
              </div>
              {configB.command === "coverage" && (
                <div className="row">
                  <label>
                    <div className="field-header">
                      <span>Report format</span>
                      <span className="badge badge-optional">Optional</span>
                    </div>
                    <select
                      value={configB.format}
                      onChange={(event) => updateConfigB({ format: event.target.value as CommandOptions["format"] })}
                    >
                      <option>html</option>
                      <option>lcov</option>
                      <option>text</option>
                    </select>
                  </label>
                  <label className="check">
                    <span className="check-content">
                      <input
                        type="checkbox"
                        checked={configB.open}
                        onChange={(event) => updateConfigB({ open: event.target.checked })}
                      />
                      <span>Open report when complete</span>
                    </span>
                    <span className="badge badge-optional">Optional</span>
                  </label>
                </div>
              )}
              {configB.command === "limits" && (
                <div className="row">
                  <label>
                    <div className="field-header">
                      <span>Function</span>
                      <span className="badge badge-required">Required</span>
                    </div>
                    <input
                      value={configB.fn}
                      onChange={(event) => updateConfigB({ fn: event.target.value })}
                      aria-required="true"
                    />
                  </label>
                  <label>
                    <div className="field-header">
                      <span>Ramp parameter</span>
                      <span className="badge badge-required">Required</span>
                    </div>
                    <input
                      value={configB.ramp}
                      onChange={(event) => updateConfigB({ ramp: event.target.value })}
                      aria-required="true"
                    />
                  </label>
                </div>
              )}
              {configB.command === "audit" && (
                <label className="check">
                  <span className="check-content">
                    <input
                      type="checkbox"
                      checked={configB.strict}
                      onChange={(event) => updateConfigB({ strict: event.target.checked })}
                    />
                    <span>Fail on warnings</span>
                  </span>
                  <span className="badge badge-optional">Optional</span>
                </label>
              )}
              <label>
                <div className="field-header">
                  <span>Shell target</span>
                  <span className="badge badge-optional">Optional</span>
                </div>
                <select value={configB.shell || "bash"} onChange={(event) => updateConfigB({ shell: event.target.value as typeof shell })}>
                  <option value="bash">Bash</option>
                  <option value="zsh">Zsh</option>
                  <option value="fish">Fish</option>
                  <option value="sh">POSIX sh</option>
                </select>
              </label>
              <button
                type="button"
                className="button secondary comparison-sync"
                onClick={() => setConfigB({ ...options })}
              >
                Match B to A
              </button>
            </fieldset>

            <div className="comparison-table-wrap" role="region" aria-label="Configuration differences" tabIndex={0}>
              <table
                className="comparison-table"
                aria-label="Setting comparison between configuration A and configuration B"
              >
                <thead>
                  <tr>
                    <th scope="col">Setting</th>
                    <th scope="col">Configuration A</th>
                    <th scope="col">Configuration B</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => (
                    <tr key={row.key} data-changed={row.changed}>
                      <th scope="row">{row.label}</th>
                      <td>{row.a}</td>
                      <td>{row.b}</td>
                      <td>
                        {row.changed ? (
                          <span className="badge badge-required">Changed</span>
                        ) : (
                          <span className="comparison-status">Matches</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="comparison-commands">
              <div>
                <h4>Configuration A command</h4>
                <pre className="comparison-command">
                  <code>{highlightCommand(generated)}</code>
                </pre>
              </div>
              <div>
                <h4>Configuration B command</h4>
                <pre className="comparison-command">
                  <code>{highlightCommand(configBCommand)}</code>
                </pre>
              </div>
            </div>
          </section>
        )}
      </section>

      <section className="guides" aria-label="Workflow guides">
        <article className="guide-card">
          <div className="guide-header">
            <h3>Coverage report guide</h3>
            <button
              type="button"
              className="guide-toggle"
              aria-expanded={coverageGuideOpen}
              aria-controls="coverage-guide-panel"
              onClick={() => setCoverageGuideOpen((open) => !open)}
            >
              {coverageGuideOpen ? "Hide guide" : "Show guide"}
            </button>
          </div>
          {coverageGuideOpen && (
            <div id="coverage-guide-panel" className="guide-panel">
              <ol>
                <li>Start with the local project path so the tool can read the crate and tests in context.</li>
                <li>
                  Choose HTML output when you want a visual report and open it immediately after generation.
                </li>
                <li>
                  Read branch and line coverage together: low execution density usually explains weak confidence
                  more than raw percentages.
                </li>
                <li>
                  Use the report to prioritize untested edge cases before shipping a contract update.
                </li>
              </ol>
            </div>
          )}
        </article>

        <article className="guide-card">
          <div className="guide-header">
            <h3>Audit workflow tutorial</h3>
            <button
              type="button"
              className="guide-toggle"
              aria-expanded={auditGuideOpen}
              aria-controls="audit-guide-panel"
              onClick={() => setAuditGuideOpen((open) => !open)}
            >
              {auditGuideOpen ? "Hide tutorial" : "Show tutorial"}
            </button>
          </div>
          {auditGuideOpen && (
            <div id="audit-guide-panel" className="guide-panel">
              <fieldset className="audit-prerequisites">
                <legend>Prerequisites</legend>
                {auditPrerequisites.map((item) => (
                  <label key={item.id} className="check">
                    <span className="check-content">
                      <input
                        type="checkbox"
                        checked={checkedPrerequisites[item.id] ?? false}
                        onChange={(event) =>
                          setCheckedPrerequisites((prev) => ({ ...prev, [item.id]: event.target.checked }))
                        }
                      />
                      <span>{item.label}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <ol>
                <li>Point the audit at the contract source directory or workspace root most relevant to the change.</li>
                <li>
                  Review auth and storage access warnings first; they often explain failure modes and privilege
                  issues.
                </li>
                <li>
                  Use the strict mode toggle when you want warning-level findings to block release readiness.
                </li>
                <li>
                  Pair each finding with a focused regression test before finalizing the deployment checklist.
                </li>
              </ol>
            </div>
          )}
        </article>

        <section
          className="command-reference"
          id="audit-reference"
          tabIndex={-1}
          aria-labelledby="audit-reference-heading"
        >
          <div className="reference-header">
            <p className="eyebrow">Command reference</p>
            <h2 id="audit-reference-heading">Audit workflow, at a glance.</h2>
            <p>
              Use <code>soroban-testkit audit</code> to scan contract sources for authentication
              gaps, arithmetic pitfalls, and TTL misuse. The scan is read-only and runs entirely
              offline.
            </p>
          </div>
          <div className="reference-grid">
            <article className="reference-card">
              <h3>Ready-to-run command</h3>
              <pre aria-label="Audit command example"><code>{"soroban-testkit audit \\\n  ./src \\\n  --strict"}</code></pre>
              <p>
                Replace <code>./src</code> with the path to your contract source directory. Omit{" "}
                <code>--strict</code> to treat warnings as informational only.
              </p>
            </article>
            <article className="reference-card">
              <h3>Arguments</h3>
              <dl className="reference-arguments">
                <div>
                  <dt><code>path</code></dt>
                  <dd>
                    Contract source directory. Defaults to{" "}
                    <code>{localFileGuides.audit.defaultPath}</code>.
                  </dd>
                </div>
                <div>
                  <dt><code>--strict</code></dt>
                  <dd>Treat warning-level findings as errors and exit non-zero.</dd>
                </div>
              </dl>
            </article>
            <article className="reference-card">
              <h3>Before you run it</h3>
              <ol>
                <li>Point the path at the directory that contains your <code>*.rs</code> source files.</li>
                <li>Review auth and storage warnings first — they surface the most critical privilege issues.</li>
                <li>Enable strict mode before release to make the audit gate your CI pipeline.</li>
              </ol>
              <p className="reference-note">
                {localFileGuides.audit.offlineGuarantee}
              </p>
            </article>
          </div>
        </section>

        <section
          className="command-reference"
          id="limits-reference"
          tabIndex={-1}
          aria-labelledby="limits-reference-heading"
        >
          <div className="reference-header">
            <p className="eyebrow">Command reference</p>
            <h2 id="limits-reference-heading">Resource limits, at a glance.</h2>
            <p>
              Use <code>soroban-testkit limits</code> to ramp one contract input until the local WASM
              execution reaches its practical resource ceiling. The command is read-only and runs offline.
            </p>
          </div>
          <div className="reference-grid">
            <article className="reference-card">
              <h3>Ready-to-run command</h3>
              <pre aria-label="Resource limits command example"><code>{"soroban-testkit limits \\\n  --contract target/wasm32v1-none/release/contract.wasm \\\n  --fn batch_payout \\\n  --ramp recipients"}</code></pre>
              <p>Replace the function and ramp names with exported contract inputs from your ABI.</p>
            </article>
            <article className="reference-card">
              <h3>Arguments</h3>
              <dl className="reference-arguments">
                <div><dt><code>--contract</code></dt><dd>Compiled WASM artifact. Defaults to <code>{localFileGuides.limits.defaultPath}</code>.</dd></div>
                <div><dt><code>--fn</code></dt><dd>Exported function to probe. Defaults to <code>batch_payout</code>.</dd></div>
                <div><dt><code>--ramp</code></dt><dd>Input parameter to increase. Defaults to <code>recipients</code>.</dd></div>
              </dl>
            </article>
            <article className="reference-card">
              <h3>Before you run it</h3>
              <ol>
                <li>Build the contract for <code>wasm32v1-none</code> in release mode.</li>
                <li>Confirm the function is exported and the ramp input is accepted.</li>
                <li>Read the instruction and memory ceilings printed to stdout.</li>
              </ol>
              <p className="reference-note">Reads: local WASM and export metadata. Writes: none.</p>
            </article>
          </div>
        </section>
      </section>

      <footer>
        <span>Built for the Stellar developer ecosystem.</span>
        <span className="footer-links">
          <a href={CORE_REPO_URL}>Soroban Testkit core repository</a>
          {/* #119 — changelog link */}
          <a href={`${CORE_REPO_URL}/releases`}>Changelog</a>
          {/* #116 — accessibility statement */}
          <button type="button" className="footer-a11y-link" onClick={() => setA11yOpen(true)}>
            Accessibility statement
          </button>
        </span>
        <span>Apache-2.0</span>
      </footer>

      {/* #116 — accessibility statement dialog */}
      {a11yOpen && (
        <div className="a11y-overlay" role="dialog" aria-modal="true" aria-labelledby="a11y-title" onClick={() => setA11yOpen(false)}>
          <div className="a11y-dialog" onClick={(e) => e.stopPropagation()}>
            <h2 id="a11y-title">Accessibility Statement</h2>
            <p>
              The Soroban Testkit Interface is committed to WCAG 2.1 AA compliance. We aim to make every
              feature keyboard-accessible, screen-reader friendly, and usable across devices.
            </p>
            <ul>
              <li>All interactive controls are reachable via keyboard (Tab, Enter, Space, Escape).</li>
              <li>ARIA labels and live regions announce dynamic state changes.</li>
              <li>Color contrast meets or exceeds 4.5:1 for body text.</li>
              <li>Responsive layout supports mobile and desktop viewports.</li>
            </ul>
            <p>
              Found an accessibility issue? Open an issue on{" "}
              <a href={INTERFACE_REPO_URL}>GitHub</a> or contact{" "}
              <a href="mailto:accessibility@soroban-testkit.dev">accessibility@soroban-testkit.dev</a>.
            </p>
            <button type="button" className="button primary" onClick={() => setA11yOpen(false)} autoFocus>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Back-to-top control (#125) */}
      <button
        type="button"
        className={`back-to-top ${showBackToTop ? "visible" : ""}`}
        onClick={scrollToTop}
        aria-label="Back to top"
        tabIndex={showBackToTop ? 0 : -1}
        aria-hidden={!showBackToTop}
      >
        ↑ Top
      </button>
    </main>
  );
}
