/**
 * Returns true when keyboard/wheel shortcuts for the graph should be ignored
 * (user is typing in a dialog, input, or textarea).
 */
export function shouldIgnoreGraphShortcuts(target) {
  if (!target || typeof target.closest !== "function") {
    return false;
  }

  const tag = target.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") {
    return true;
  }
  if (target.isContentEditable) {
    return true;
  }

  return Boolean(
    target.closest('[role="dialog"]') ||
      target.closest("[data-auto-diagnostics]") ||
      target.closest("[data-headlessui-state]") ||
      target.closest(".modal"),
  );
}
