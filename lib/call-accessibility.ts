export type CallKeyboardAction =
  | "toggle-microphone"
  | "toggle-camera"
  | "show-shortcuts"
  | "push-to-talk-start"
  | "push-to-talk-stop";

export function isEditableCallShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function getCallKeyboardAction(
  event: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "repeat">,
  options: { connected: boolean; muted: boolean; keyUp?: boolean }
): CallKeyboardAction | null {
  if (!options.connected) return null;
  const command = event.ctrlKey || event.metaKey;
  if (!options.keyUp && command && event.key.toLowerCase() === "d") return "toggle-microphone";
  if (!options.keyUp && command && event.key.toLowerCase() === "e") return "toggle-camera";
  if (!options.keyUp && event.shiftKey && event.key === "?") return "show-shortcuts";
  if (event.code === "Space" && options.muted) {
    if (options.keyUp) return "push-to-talk-stop";
    if (!event.repeat) return "push-to-talk-start";
  }
  return null;
}
