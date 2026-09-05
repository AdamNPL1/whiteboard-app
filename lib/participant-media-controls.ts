export const normalizeParticipantVolume = (volume: number) =>
  Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 1));

export const shouldOpenParticipantMenuFromKey = (key: string, shiftKey: boolean) =>
  key === "ContextMenu" || (shiftKey && key === "F10");

export const toggleVideoFit = (fit: "cover" | "contain") =>
  fit === "cover" ? "contain" as const : "cover" as const;
