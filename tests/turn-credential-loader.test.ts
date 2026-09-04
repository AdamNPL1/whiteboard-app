import { describe, expect, it, vi } from "vitest";

import { TurnCredentialLoader, type TurnCredentials } from "@/lib/turn-credential-loader";

const credentials = (suffix: string): TurnCredentials => ({
  iceServers: [{ urls: `turn:relay.example.com/${suffix}` }],
  expiresAt: "2099-01-01T00:00:00.000Z",
});

describe("TurnCredentialLoader", () => {
  it("coalesces overlapping requests for the same active call", async () => {
    let resolveRequest!: (value: TurnCredentials) => void;
    const request = vi.fn(
      () => new Promise<TurnCredentials>((resolve) => (resolveRequest = resolve))
    );
    const loader = new TurnCredentialLoader(request);
    const first = loader.loadFresh("call-a");
    const second = loader.loadFresh("call-a");
    expect(request).toHaveBeenCalledTimes(1);
    resolveRequest(credentials("one"));
    await expect(first).resolves.toEqual(credentials("one"));
    await expect(second).resolves.toEqual(credentials("one"));
  });

  it("requests new credentials for every later recovery cycle", async () => {
    const request = vi
      .fn<() => Promise<TurnCredentials>>()
      .mockResolvedValueOnce(credentials("one"))
      .mockResolvedValueOnce(credentials("two"));
    const loader = new TurnCredentialLoader(request);
    await loader.loadFresh("call-a");
    await loader.loadFresh("call-a");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does not retain a failed credential request", async () => {
    const request = vi
      .fn<() => Promise<TurnCredentials>>()
      .mockRejectedValueOnce(new Error("relay unavailable"))
      .mockResolvedValueOnce(credentials("recovered"));
    const loader = new TurnCredentialLoader(request);
    await expect(loader.loadFresh("call-a")).rejects.toThrow("relay unavailable");
    await expect(loader.loadFresh("call-a")).resolves.toEqual(credentials("recovered"));
    expect(request).toHaveBeenCalledTimes(2);
  });
});
