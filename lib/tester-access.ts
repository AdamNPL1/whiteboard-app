export const TESTER_ACCESS_COOKIE = "scriboo_tester_access";

export const getTesterAccessSignature = async (secret: string) => {
  const bytes = new TextEncoder().encode(`scriboo-tester-access:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const hasValidTesterAccess = async (cookieValue?: string) => {
  const secret = process.env.TESTER_ACCESS_PASSWORD?.trim();

  if (!secret || !cookieValue) return false;

  return cookieValue === (await getTesterAccessSignature(secret));
};
