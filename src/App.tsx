import { useMemo, useState } from "react";
import {
  buildCommand,
  DEFAULT_OPTIONS,
  modules,
  validateCommandInputs,
  type CommandName,
} from "./testkit";
import { copyToClipboard } from "./clipboard";

const descriptions: Record<CommandName, string> = {
  coverage: "Generate contract-test coverage through cargo-llvm-cov.",
  limits: "Ramp a contract input to find its practical resource ceiling.",
  audit: "Scan contract sources for common auth, arithmetic, and TTL risks.",
};

const COMMANDS: CommandName[] = ["coverage", "limits", "audit"];

export default function App() {
  const [command, setCommand] = useState<CommandName>("coverage");
  const [path, setPath] = useState(".");
  const [format, setFormat] = useState<"html" | "lcov" | "text">("html");
  const [open, setOpen] = useState(true);
  const [fn, setFn] = useState("batch_payout");
  const [ramp, setRamp] = useState("recipients");
  const [strict, setStrict] = useState(true);
  const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "error">("idle");
  const [announcement, setAnnouncement] = useState("");

  const generated = useMemo(
    () => buildCommand({ command, path, format, open, fn, ramp, strict }),
    [command, path, format, open, fn, ramp, strict],
  );

  const errors = useMemo(
    () => validateCommandInputs({ command, path, format, open, fn, ramp, strict }),
    [command, path, format, open, fn, ramp, strict],
  );

  const hasErrors = Object.keys(errors).length > 0;

  const handleTabChange = (nextCommand: CommandName) => {
    setCommand(nextCommand);
    setCopyStatus("idle");
  };

  const handleTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    current: CommandName,
  ) => {
    const currentIndex = COMMANDS.indexOf(current);
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % COMMANDS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + COMMANDS.length) % COMMANDS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = COMMANDS.length - 1;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      const nextCommand = COMMANDS[nextIndex];
      handleTabChange(nextCommand);
      const nextButton = document.getElementById(`tab-${nextCommand}`);
      nextButton?.focus();
    }
  };

  const handleReset = () => {
    const defaults = DEFAULT_OPTIONS[command];
    setPath(defaults.path);
    setFormat(defaults.format);
    setOpen(defaults.open);
    setFn(defaults.fn);
    setRamp(defaults.ramp);
    setStrict(defaults.strict);
    setCopyStatus("idle");
    setAnnouncement(`Reset ${command} configuration to default settings`);
  };

  const copy = async () => {
    if (hasErrors) {
      return;
    }

    try {
      await copyToClipboard(generated);
      setCopyStatus("success");
      setAnnouncement("Command copied to clipboard");
      window.setTimeout(() => {
        setCopyStatus("idle");
        setAnnouncement("");
      }, 1600);
    } catch {
      setCopyStatus("error");
      setAnnouncement("Failed to copy command to clipboard");
      window.setTimeout(() => {
        setCopyStatus("idle");
        setAnnouncement("");
      }, 2000);
    }
  };

  return (
    <main>
      <nav>
        <a className="brand" href="#top" aria-label="Soroban Testkit home">
          <span className="brand-mark">S</span>
          <span>Soroban Testkit</span>
        </a>
        <div className="nav-links">
          <a href="#modules">Modules</a>
          <a href="#commands">Commands</a>
          <a href="https://github.com/soroban-testkit/testkit-blockchain">GitHub ↗</a>
        </div>
      </nav>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">Contract testing, without the repeated scaffolding</p>
          <h1>Break the contract<br />before users do.</h1>
          <p className="lede">
            Build precise Soroban tests with deterministic environments, adversarial
            money inputs, typed event assertions, and ledger-time control.
          </p>
          <div className="actions">
            <a className="button primary" href="#commands">Build a command</a>
            <a className="button secondary" href="#modules">Explore modules</a>
          </div>
        </div>
        <div className="terminal" aria-label="Example Soroban test">
          <div className="terminal-top"><i /><i /><i /><span>escrow_test.rs</span></div>
          <pre><code><span className="muted">use</span> soroban_testkit::prelude::*;{"\n\n"}<span className="muted">let</span> env = TestEnv::new();{"\n"}<span className="muted">let</span> token = env.token();{"\n"}<span className="muted">let</span> buyer = env.address();{"\n\n"}token.mint(&buyer, <b>100</b>);{"\n"}token.assert_balance(&buyer, <b>100</b>);</code></pre>
          <div className="pass">✓ test result: ok</div>
        </div>
      </section>

      <section className="modules" id="modules">
        <header><p className="eyebrow">One prelude. Seven focused modules.</p><h2>Everything a serious contract test needs.</h2></header>
        <div className="module-grid">
          {modules.map(([name, description], index) => (
            <article key={name}>
              <span>0{index + 1}</span><h3>{name}</h3><p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="commands" id="commands">
        <div className="command-copy">
          <p className="eyebrow">CLI workbench</p>
          <h2>From intent to command.</h2>
          <p>Configure a supported Testkit workflow and copy the exact command to your terminal.</p>
          <div className="command-tabs" role="tablist" aria-label="CLI commands">
            {COMMANDS.map((name) => (
              <button
                key={name}
                id={`tab-${name}`}
                role="tab"
                aria-selected={command === name}
                aria-controls={`panel-${name}`}
                tabIndex={command === name ? 0 : -1}
                className={command === name ? "active" : ""}
                onClick={() => handleTabChange(name)}
                onKeyDown={(event) => handleTabKeyDown(event, name)}
              >
                {name}
              </button>
            ))}
          </div>
          <p className="description">{descriptions[command]}</p>
        </div>
        <div
          className="builder"
          role="tabpanel"
          id={`panel-${command}`}
          aria-labelledby={`tab-${command}`}
          tabIndex={0}
        >
          <div className="field">
            <label htmlFor="builder-path">Project or contract path</label>
            <input
              id="builder-path"
              value={path}
              onChange={(event) => setPath(event.target.value)}
              aria-invalid={Boolean(errors.path)}
              aria-describedby={errors.path ? "error-path" : undefined}
            />
            {errors.path && (
              <span id="error-path" className="field-error" role="alert">
                {errors.path}
              </span>
            )}
          </div>

          {command === "coverage" && (
            <>
              <div className="field">
                <label htmlFor="builder-format">Report format</label>
                <select
                  id="builder-format"
                  value={format}
                  onChange={(event) => setFormat(event.target.value as typeof format)}
                >
                  <option value="html">html</option>
                  <option value="lcov">lcov</option>
                  <option value="text">text</option>
                </select>
              </div>
              <label className="check" htmlFor="builder-open">
                <input
                  id="builder-open"
                  type="checkbox"
                  checked={open}
                  onChange={(event) => setOpen(event.target.checked)}
                />
                <span>Open report when complete</span>
              </label>
            </>
          )}

          {command === "limits" && (
            <div className="row">
              <div className="field">
                <label htmlFor="builder-fn">Function</label>
                <input
                  id="builder-fn"
                  value={fn}
                  onChange={(event) => setFn(event.target.value)}
                  aria-invalid={Boolean(errors.fn)}
                  aria-describedby={errors.fn ? "error-fn" : undefined}
                />
                {errors.fn && (
                  <span id="error-fn" className="field-error" role="alert">
                    {errors.fn}
                  </span>
                )}
              </div>
              <div className="field">
                <label htmlFor="builder-ramp">Ramp parameter</label>
                <input
                  id="builder-ramp"
                  value={ramp}
                  onChange={(event) => setRamp(event.target.value)}
                  aria-invalid={Boolean(errors.ramp)}
                  aria-describedby={errors.ramp ? "error-ramp" : undefined}
                />
                {errors.ramp && (
                  <span id="error-ramp" className="field-error" role="alert">
                    {errors.ramp}
                  </span>
                )}
              </div>
            </div>
          )}

          {command === "audit" && (
            <label className="check" htmlFor="builder-strict">
              <input
                id="builder-strict"
                type="checkbox"
                checked={strict}
                onChange={(event) => setStrict(event.target.checked)}
              />
              <span>Fail on warnings</span>
            </label>
          )}

          <div className="output">
            <code>{generated}</code>
            <button
              type="button"
              className="button-reset"
              onClick={handleReset}
            >
              Reset
            </button>
            <button
              type="button"
              className={copyStatus === "error" ? "error" : ""}
              onClick={copy}
              disabled={hasErrors}
              aria-disabled={hasErrors}
            >
              {copyStatus === "success" ? "Copied" : copyStatus === "error" ? "Failed" : "Copy"}
            </button>
          </div>
          <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {announcement}
          </div>
        </div>
      </section>

      <footer><span>Built for the Stellar developer ecosystem.</span><span>Apache-2.0</span></footer>
    </main>
  );
}
