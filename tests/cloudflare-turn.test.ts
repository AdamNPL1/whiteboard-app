import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { generateCloudflareTurnCredentials } from "@/lib/cloudflare-turn";

describe("Cloudflare TURN credentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CLOUDFLARE_TURN_KEY_ID = "test-key-id";
    process.env.CLOUDFLARE_TURN_API_TOKEN = "private-test-token";
  });

  afterEach(() => {
    delete process.env.CLOUDFLARE_TURN_KEY_ID;
    delete process.env.CLOUDFLARE_TURN_API_TOKEN;
  });

  it("accepts Cloudflare's object-shaped iceServers response", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          iceServers: {
            urls: [
              "turn:turn.cloudflare.com:3478?transport=udp",
              "turn:turn.cloudflare.com:53?transport=udp",
            ],
            username: "temporary-user",
            credential: "temporary-credential",
          },
        }),
        { status: 201, headers: { "content-type": "application/json" } }
      )
    );

    const result = await generateCloudflareTurnCredentials({
      callId: "call-1",
      userId: "user-1",
      ttlSeconds: 600,
    });

    expect(result.iceServers).toHaveLength(2);
    expect(result.iceServers[0]).toEqual({
      urls: "stun:stun.cloudflare.com:3478",
    });
    expect(result.iceServers[1].urls).not.toContain(
      "turn:turn.cloudflare.com:53?transport=udp"
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/credentials/generate-ice-servers"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer private-test-token",
        }),
      })
    );
  });
});
