import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import { describe, expect, it } from "vitest";
import { resolveFocusReturnTarget, useFocusReturn } from "./focusReturn";

// A dialog that moves focus into itself from an effect, as the rule requires.
function Dialog(props: {
  onClose: () => void;
  onDisableTrigger: () => void;
  onRemoveTrigger: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-label="Reset builder"
      onKeyDown={(event) => {
        if (event.key === "Escape") props.onClose();
      }}
    >
      <button ref={confirmRef} type="button" onClick={props.onClose}>
        Confirm
      </button>
      <button type="button" onClick={props.onClose}>
        Cancel
      </button>
      <button type="button" onClick={props.onDisableTrigger}>
        Disable trigger
      </button>
      <button type="button" onClick={props.onRemoveTrigger}>
        Remove trigger
      </button>
    </div>
  );
}

function Harness() {
  const [open, setOpen] = useState(false);
  const [triggerEnabled, setTriggerEnabled] = useState(true);
  const [triggerPresent, setTriggerPresent] = useState(true);
  const fallbackRef = useRef<HTMLButtonElement>(null);
  useFocusReturn(open, fallbackRef);

  return (
    <>
      <button ref={fallbackRef} type="button">
        Fallback target
      </button>
      {triggerPresent && (
        <button type="button" disabled={!triggerEnabled} onClick={() => setOpen(true)}>
          Open dialog
        </button>
      )}
      {open && (
        <Dialog
          onClose={() => setOpen(false)}
          onDisableTrigger={() => setTriggerEnabled(false)}
          onRemoveTrigger={() => setTriggerPresent(false)}
        />
      )}
    </>
  );
}

function openDialogFromTrigger() {
  const trigger = screen.getByRole("button", { name: "Open dialog" });
  trigger.focus();
  fireEvent.click(trigger);
  expect(screen.getByRole("button", { name: "Confirm" })).toHaveFocus();
  return trigger;
}

describe("Focus return for dialogs (#111)", () => {
  it("returns focus to the trigger after the dialog is confirmed", () => {
    render(<Harness />);
    const trigger = openDialogFromTrigger();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(trigger).toHaveFocus();
  });

  it("returns focus to the trigger after the dialog is cancelled", () => {
    render(<Harness />);
    const trigger = openDialogFromTrigger();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(trigger).toHaveFocus();
  });

  it("returns focus to the trigger when the dialog is dismissed with Escape", () => {
    render(<Harness />);
    const trigger = openDialogFromTrigger();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("falls back to the fallback target when the trigger is disabled while open", () => {
    render(<Harness />);
    openDialogFromTrigger();

    fireEvent.click(screen.getByRole("button", { name: "Disable trigger" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(screen.getByRole("button", { name: "Open dialog" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Fallback target" })).toHaveFocus();
  });

  it("falls back to the fallback target when the trigger is removed while open", () => {
    render(<Harness />);
    openDialogFromTrigger();

    fireEvent.click(screen.getByRole("button", { name: "Remove trigger" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(screen.queryByRole("button", { name: "Open dialog" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fallback target" })).toHaveFocus();
  });

  it("does not move focus while the dialog has never been opened", () => {
    render(<Harness />);

    expect(document.activeElement).toBe(document.body);
  });
});

describe("resolveFocusReturnTarget", () => {
  const makeButton = (disabled = false) => {
    const button = document.createElement("button");
    button.disabled = disabled;
    document.body.appendChild(button);
    return button;
  };

  it("returns the trigger when it is still attached and enabled", () => {
    const trigger = makeButton();
    const fallback = makeButton();

    expect(resolveFocusReturnTarget(trigger, fallback)).toBe(trigger);

    trigger.remove();
    fallback.remove();
  });

  it("returns the fallback when the trigger is detached or disabled", () => {
    const trigger = makeButton();
    const fallback = makeButton();
    trigger.remove();
    expect(resolveFocusReturnTarget(trigger, fallback)).toBe(fallback);

    const disabledTrigger = makeButton(true);
    expect(resolveFocusReturnTarget(disabledTrigger, fallback)).toBe(fallback);

    disabledTrigger.remove();
    fallback.remove();
  });

  it("returns null when neither element can receive focus", () => {
    const disabledFallback = makeButton(true);

    expect(resolveFocusReturnTarget(null, disabledFallback)).toBeNull();

    disabledFallback.remove();
  });
});
