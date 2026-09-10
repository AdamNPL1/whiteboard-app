export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const INTERNAL_REDIRECT_BASE = "https://scriboo.invalid";

export const getSafeInternalRedirectPath = (
  value: string | null | undefined,
  fallback = "/custom"
) => {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(value, INTERNAL_REDIRECT_BASE);
    if (parsed.origin !== INTERNAL_REDIRECT_BASE) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
};
