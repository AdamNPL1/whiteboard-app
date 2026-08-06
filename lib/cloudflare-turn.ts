import "server-only";

import { createHash } from "crypto";

type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

type CloudflareCredentialResponse = {
  iceServers?: IceServer | IceServer[];
  username?: string;
  credential?: string;
};

const getRequiredTurnEnv = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`TURN_ENV_MISSING:${name}`);
  return value;
};

const browserSafeUrls = [
  "stun:stun.cloudflare.com:3478",
  "turn:turn.cloudflare.com:3478?transport=udp",
  "turn:turn.cloudflare.com:3478?transport=tcp",
  "turn:turn.cloudflare.com:80?transport=tcp",
  "turns:turn.cloudflare.com:5349?transport=tcp",
  "turns:turn.cloudflare.com:443?transport=tcp",
];

const filterPort53 = (server: IceServer): IceServer => ({
  ...server,
  urls: Array.isArray(server.urls)
    ? server.urls.filter((url) => !url.includes(":53"))
    : server.urls.includes(":53")
      ? []
      : server.urls,
});

export const generateCloudflareTurnCredentials = async ({
  callId,
  userId,
  ttlSeconds,
}: {
  callId: string;
  userId: string;
  ttlSeconds: number;
}) => {
  const keyId = getRequiredTurnEnv("CLOUDFLARE_TURN_KEY_ID");
  const apiToken = getRequiredTurnEnv("CLOUDFLARE_TURN_API_TOKEN");
  const ttl = Math.max(60, Math.min(4 * 60 * 60, Math.floor(ttlSeconds)));
  const customIdentifier = createHash("sha256")
    .update(`${callId}:${userId}`)
    .digest("hex")
    .slice(0, 32);

  const response = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl, customIdentifier }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!response.ok) {
    throw new Error(`TURN_PROVIDER_ERROR:${response.status}`);
  }

  const payload = (await response.json()) as CloudflareCredentialResponse;
  const providerServers = payload.iceServers
    ? Array.isArray(payload.iceServers)
      ? payload.iceServers
      : [payload.iceServers]
    : [];
  let iceServers = providerServers.map(filterPort53).filter((server) =>
    Array.isArray(server.urls) ? server.urls.length > 0 : Boolean(server.urls)
  );

  if (!iceServers?.length && payload.username && payload.credential) {
    iceServers = [
      { urls: browserSafeUrls[0] },
      {
        urls: browserSafeUrls.slice(1),
        username: payload.username,
        credential: payload.credential,
      },
    ];
  }

  if (!iceServers?.length) throw new Error("TURN_PROVIDER_INVALID_RESPONSE");
  if (
    !iceServers.some((server) =>
      (Array.isArray(server.urls) ? server.urls : [server.urls]).some((url) =>
        url.startsWith("stun:")
      )
    )
  ) {
    iceServers = [{ urls: browserSafeUrls[0] }, ...iceServers];
  }

  return {
    iceServers,
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
  };
};
