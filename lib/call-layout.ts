export type CallPanelDock = "free" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type CallLayoutMode = "standard" | "video" | "audio" | "whiteboard";

export type StoredCallLayout = {
  dock: CallPanelDock;
  mode: CallLayoutMode;
  position: { left: number; top: number } | null;
  videoHeight: number;
};

const docks = new Set<CallPanelDock>([
  "free", "top-left", "top-right", "bottom-left", "bottom-right",
]);
const modes = new Set<CallLayoutMode>(["standard", "video", "audio", "whiteboard"]);

export const clampCallPanelPosition = (
  position: { left: number; top: number },
  panel: { width: number; height: number },
  viewport: { width: number; height: number },
  margin = 8,
  toolbarOffset = 52
) => ({
  left: Math.min(Math.max(margin, position.left), Math.max(margin, viewport.width - panel.width - margin)),
  top: Math.min(
    Math.max(toolbarOffset, position.top),
    Math.max(toolbarOffset, viewport.height - panel.height - margin)
  ),
});

export const readStoredCallLayout = (value: string | null): StoredCallLayout | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredCallLayout>;
    if (!parsed.dock || !docks.has(parsed.dock) || !parsed.mode || !modes.has(parsed.mode)) {
      return null;
    }
    const position = parsed.position;
    if (
      position !== null &&
      position !== undefined &&
      (!Number.isFinite(position.left) || !Number.isFinite(position.top))
    ) return null;
    return {
      dock: parsed.dock,
      mode: parsed.mode,
      position: position ?? null,
      videoHeight: Math.min(420, Math.max(140, Number(parsed.videoHeight) || 210)),
    };
  } catch {
    return null;
  }
};
