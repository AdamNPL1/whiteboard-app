export const CALL_DEVICE_SESSION_HEADER = "x-scriboo-call-session";
export const CALL_OWNERSHIP_CHANNEL = "scriboo-call-ownership-v1";

export const getBrowserCallSessionId = () => {
  const key = "scriboo-call-session-id";
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const sessionId = crypto.randomUUID();
  window.sessionStorage.setItem(key, sessionId);
  return sessionId;
};

export const isValidCallSessionId = (value: string | null | undefined) =>
  Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
