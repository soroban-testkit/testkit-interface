import { useMemo, useState } from "react";
import { buildCommand, modules, type CommandName } from "./testkit";

const descriptions: Record<CommandName, string> = {
  coverage: "Generate contract-test coverage through cargo-llvm-cov.",
  limits: "Ramp a contract input to find its practical resource ceiling.",
  audit: "Scan contract sources for common auth, arithmetic, and TTL risks.",
};

export default function App() {
  const [command, setCommand] = useState<CommandName>("coverage");
  const [path, setPath] = useState(".");
  const [format, setFormat] = useState<"html" | "lcov" | "text">("html");
  const [open, setOpen] = useState(true);
  const [fn, setFn] = useState("batch_payout");
  const [ramp, setRamp] = useState("recipients");
  const [strict, setStrict] = useState(true);
  const [copied, setCopied] = useState(false);

  const generated = useMemo(
    () => buildCommand({ command, path, format, open, fn, ramp, strict }),
    [command, path, format, open, fn, ramp, strict],
  );

  const copy = async () => {
    await navigator.clipboard.writeText(generated);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
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
          <div className="command-tabs" role="tablist">
            {(["coverage", "limits", "audit"] as const).map((name) => (
              <button key={name} className={command === name ? "active" : ""} onClick={() => setCommand(name)}>{name}</button>
            ))}
          </div>
          <p className="description">{descriptions[command]}</p>
        </div>
        <div className="builder">
          <label>Project or contract path<input value={path} onChange={(event) => setPath(event.target.value)} /></label>
          {command === "coverage" && <>
            <label>Report format<select value={format} onChange={(event) => setFormat(event.target.value as typeof format)}><option>html</option><option>lcov</option><option>text</option></select></label>
            <label className="check"><input type="checkbox" checked={open} onChange={(event) => setOpen(event.target.checked)} /> Open report when complete</label>
          </>}
          {command === "limits" && <div className="row"><label>Function<input value={fn} onChange={(event) => setFn(event.target.value)} /></label><label>Ramp parameter<input value={ramp} onChange={(event) => setRamp(event.target.value)} /></label></div>}
          {command === "audit" && <label className="check"><input type="checkbox" checked={strict} onChange={(event) => setStrict(event.target.checked)} /> Fail on warnings</label>}
          <div className="output"><code>{generated}</code><button onClick={copy}>{copied ? "Copied" : "Copy"}</button></div>
        </div>
      </section>

      <footer><span>Built for the Stellar developer ecosystem.</span><span>Apache-2.0</span></footer>
    </main>
  );
}
