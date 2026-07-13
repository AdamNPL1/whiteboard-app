import "server-only";

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { getSupabaseServiceRoleClient } from "@/lib/supabase-server";
import { reportOperationalMessage } from "@/lib/monitoring";

type RateLimitOptions = {
  action: string;
  limit: number;
  windowSeconds: number;
  identifiers?: string[];
};

type RateLimitResult = {
  allowed: boolean;
  retryAfter: number;
  limit: number;
};

type MemoryEntry = { count: number; resetAt: number };

const memoryBuckets = new Map<string, MemoryEntry>();

const hashIdentifier = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const getClientIp = (request: NextRequest) => {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
};

const consumeMemoryBucket = (
  key: string,
  limit: number,
  windowSeconds: number
): RateLimitResult => {
  const now = Date.now();
  const existing = memoryBuckets.get(key);
  const entry = !existing || existing.resetAt <= now
    ? { count: 1, resetAt: now + windowSeconds * 1000 }
    : { count: existing.count + 1, resetAt: existing.resetAt };
  memoryBuckets.set(key, entry);

  if (memoryBuckets.size > 5_000) {
    for (const [bucketKey, bucket] of memoryBuckets) {
      if (bucket.resetAt <= now) memoryBuckets.delete(bucketKey);
    }
  }

  return {
    allowed: entry.count <= limit,
    retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    limit,
  };
};

const consumeBucket = async (
  action: string,
  identifierHash: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> => {
  try {
    const { data, error } = await getSupabaseServiceRoleClient().rpc(
      "consume_rate_limit",
      {
        p_action: action,
        p_identifier_hash: identifierHash,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      }
    );
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (row && typeof row.allowed === "boolean") {
      return {
        allowed: row.allowed,
        retryAfter: Math.max(1, Number(row.retry_after_seconds) || 1),
        limit,
      };
    }
  } catch (error) {
    console.warn("Durable rate limiter unavailable; using local fallback", error);
  }

  return consumeMemoryBucket(`${action}:${identifierHash}`, limit, windowSeconds);
};

export const enforceRateLimit = async (
  request: NextRequest,
  options: RateLimitOptions
): Promise<RateLimitResult> => {
  const normalizedIdentifiers = [
    `ip:${getClientIp(request)}`,
    ...(options.identifiers ?? [])
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
      .map((value) => `subject:${value}`),
  ];

  for (const identifier of new Set(normalizedIdentifiers)) {
    const result = await consumeBucket(
      options.action,
      hashIdentifier(identifier),
      options.limit,
      options.windowSeconds
    );
    if (!result.allowed) {
      if (options.action.startsWith("auth-")) {
        reportOperationalMessage("Authentication rate limit exceeded", {
          area: "security",
          operation: options.action,
          level: "warning",
        });
      }
      return result;
    }
  }

  return { allowed: true, retryAfter: 0, limit: options.limit };
};

export const rateLimitResponse = (result: RateLimitResult) =>
  NextResponse.json(
    { error: "Too many requests. Please wait and try again." },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfter),
        "X-RateLimit-Limit": String(result.limit),
        "Cache-Control": "no-store",
      },
    }
  );
