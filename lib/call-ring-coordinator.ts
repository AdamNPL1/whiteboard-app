const RING_LEASE_KEY = "scriboo-incoming-ring-lease-v1";
type RingLease = { callId: string; ownerId: string; expiresAt: number };
type RingStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function claimIncomingRing(storage: RingStorage, callId: string, ownerId: string, now = Date.now()) {
  try {
    const current = JSON.parse(storage.getItem(RING_LEASE_KEY) || "null") as RingLease | null;
    if (current && current.expiresAt > now && current.ownerId !== ownerId) return false;
    storage.setItem(RING_LEASE_KEY, JSON.stringify({ callId, ownerId, expiresAt: now + 4_000 }));
    const confirmed = JSON.parse(storage.getItem(RING_LEASE_KEY) || "null") as RingLease | null;
    return confirmed?.ownerId === ownerId && confirmed.callId === callId;
  } catch { return true; }
}

export function releaseIncomingRing(storage: RingStorage, ownerId: string) {
  try {
    const current = JSON.parse(storage.getItem(RING_LEASE_KEY) || "null") as RingLease | null;
    if (current?.ownerId === ownerId) storage.removeItem(RING_LEASE_KEY);
  } catch { /* Storage failure must not prevent a call. */ }
}
