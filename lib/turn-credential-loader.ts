export type TurnCredentials = {
  iceServers: RTCIceServer[];
  expiresAt: string;
};

type CredentialRequest = (callId: string) => Promise<TurnCredentials>;

/**
 * Issues a new request for every recovery cycle while coalescing only requests
 * that overlap for the same call. Credentials are never cached after a request
 * settles, so a later ICE restart always receives a fresh set.
 */
export class TurnCredentialLoader {
  private inFlight: { callId: string; promise: Promise<TurnCredentials> } | null = null;

  constructor(private readonly requestCredentials: CredentialRequest) {}

  loadFresh(callId: string) {
    if (this.inFlight?.callId === callId) return this.inFlight.promise;

    const promise = this.requestCredentials(callId);
    this.inFlight = { callId, promise };
    void promise.finally(() => {
      if (this.inFlight?.promise === promise) this.inFlight = null;
    }).catch(() => undefined);
    return promise;
  }
}
