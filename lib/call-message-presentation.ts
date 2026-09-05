export type FriendlyCallMessageKind =
  | "busy"
  | "rate-limited"
  | "microphone-permission"
  | "microphone-unavailable"
  | "participant-unavailable"
  | "connection-failed"
  | "offline"
  | "original";

export type PresentedCallMessage = {
  kind: FriendlyCallMessageKind;
  original: string;
  cleaned: string;
  technicalDetails: string | null;
};

const technicalCodePattern = /\b(?:ICE-R\d+|CALL_[A-Z0-9_]+)\b/g;

export const presentCallMessage = (message: string): PresentedCallMessage => {
  const original = message.trim();
  const codes = [...new Set(original.match(technicalCodePattern) ?? [])];
  const cleaned = original
    .replace(/\s*\((?:ICE-R\d+|CALL_[A-Z0-9_]+)\)\s*/g, " ")
    .replace(technicalCodePattern, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();
  const normalized = original.toLowerCase();
  let kind: FriendlyCallMessageKind = "original";

  if (normalized.includes("too many requests") || normalized.includes("rate limit")) {
    kind = "rate-limited";
  } else if (normalized.includes("already busy") || normalized.includes("another call") || normalized.includes("call_participant_busy")) {
    kind = "busy";
  } else if (normalized.includes("microphone") && (normalized.includes("permission") || normalized.includes("denied") || normalized.includes("blocked"))) {
    kind = "microphone-permission";
  } else if (normalized.includes("microphone") && (normalized.includes("unavailable") || normalized.includes("missing") || normalized.includes("disconnected"))) {
    kind = "microphone-unavailable";
  } else if (normalized.includes("offline")) {
    kind = "offline";
  } else if (normalized.includes("other person is unavailable") || normalized.includes("participant unavailable")) {
    kind = "participant-unavailable";
  } else if (codes.some((code) => code.startsWith("ICE-R")) || normalized.includes("could not connect") || normalized.includes("could not be established")) {
    kind = "connection-failed";
  }

  return {
    kind,
    original,
    cleaned,
    technicalDetails: codes.length > 0 ? codes.join(", ") : null,
  };
};
