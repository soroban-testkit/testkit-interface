/**
 * Lightweight, dependency-free syntax assertion for generated shell scripts.
 * It is intentionally conservative: it only reports constructs that are
 * always invalid in bash (an unterminated quote or a line continuation at the
 * very end of the script). `bash -n` remains the authoritative check in tests.
 */
export function findBashSyntaxErrors(script: string): string[] {
  const errors: string[] = [];
  const lines = script.split("\n");
  let quote: "'" | '"' | null = null;

  for (const line of lines) {
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];

      if (character === "\\" && quote !== "'") {
        index += 1;
      } else if (character === "'" && quote !== '"') {
        quote = quote === "'" ? null : "'";
      } else if (character === '"' && quote !== "'") {
        quote = quote === '"' ? null : '"';
      }
    }
  }

  if (quote !== null) {
    errors.push("Unterminated quote at end of script");
  }

  const lastLine = lines[lines.length - 1];
  if (lastLine.endsWith("\\") && quote !== "'") {
    errors.push("Dangling line continuation at end of script");
  }

  return errors;
}

export function isBashScriptSyntaxValid(script: string): boolean {
  return findBashSyntaxErrors(script).length === 0;
}
