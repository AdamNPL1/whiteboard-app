export type AudioDeviceState =
  | "ready"
  | "permission-denied"
  | "missing"
  | "disconnected"
  | "busy"
  | "unavailable";

export const classifyAudioDeviceError = (error: unknown): AudioDeviceState => {
  if (!(error instanceof DOMException)) return "unavailable";
  if (["NotAllowedError", "SecurityError"].includes(error.name)) {
    return "permission-denied";
  }
  if (["NotFoundError", "DevicesNotFoundError"].includes(error.name)) {
    return "missing";
  }
  if (["NotReadableError", "TrackStartError", "AbortError"].includes(error.name)) {
    return "busy";
  }
  if (["OverconstrainedError", "ConstraintNotSatisfiedError"].includes(error.name)) {
    return "disconnected";
  }
  return "unavailable";
};

export const chooseAvailableDevice = (
  selectedDeviceId: string,
  availableDeviceIds: string[]
) => {
  if (selectedDeviceId && availableDeviceIds.includes(selectedDeviceId)) {
    return { deviceId: selectedDeviceId, changed: false };
  }
  return {
    deviceId: availableDeviceIds[0] ?? "",
    changed: Boolean(selectedDeviceId),
  };
};

export const audioPacketsAreStalled = ({
  previousPackets,
  currentPackets,
  consecutiveStalls,
  muted,
}: {
  previousPackets: number | null;
  currentPackets: number;
  consecutiveStalls: number;
  muted: boolean;
}) =>
  !muted &&
  previousPackets !== null &&
  currentPackets <= previousPackets &&
  consecutiveStalls >= 2;
