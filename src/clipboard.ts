/**
 * Copies `text` to the clipboard, falling back to the `document.execCommand`
 * path for browsers (or embedded/non-HTTPS contexts) where the Clipboard API
 * is unavailable. The guard treats a missing `navigator.clipboard` *and* a
 * present-but-incomplete one (no callable `writeText`) as unavailable, so the
 * Copy action never throws just because the browser exposes a partial API.
 */
export async function copyToClipboard(text: string): Promise<void> {
  // A blank command must not overwrite the clipboard or report success.
  if (text.trim().length === 0) {
    throw new Error("Cannot copy an empty command");
  }

  if (typeof navigator.clipboard?.writeText === "function") {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    const succeeded = document.execCommand("copy");
    if (!succeeded) {
      throw new Error("execCommand('copy') was rejected by the browser");
    }
  } finally {
    document.body.removeChild(textarea);
  }
}
