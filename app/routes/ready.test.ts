import { describe, expect, it, vi } from "vitest";

import { createReadyHandler } from "./ready.server";
import type { RedisConfig } from "~/lib/redis.server";

const envWithRedisUrl = {
  REDIS_URL: "redis://localhost:6379",
};

const readJson = async (response: Response) =>
  (await response.json()) as unknown;

const createClient = (
  ping: () => Promise<unknown> = () => Promise.resolve("PONG"),
) => ({
  connect: vi.fn(() => Promise.resolve()),
  ping: vi.fn(ping),
});

describe("ready route", () => {
  it("returns ready when Redis connects and responds to ping", async () => {
    const client = createClient();
    const clientFactory = vi.fn((config: RedisConfig) => {
      expect(config).toEqual({ url: envWithRedisUrl.REDIS_URL });
      return client;
    });
    const handleReady = createReadyHandler({
      env: envWithRedisUrl,
      clientFactory,
    });

    const response = await handleReady();

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      ok: true,
      status: "ready",
    });
    expect(clientFactory).toHaveBeenCalledTimes(1);
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.ping).toHaveBeenCalledTimes(1);
  });

  it("returns not ready when Redis config is missing", async () => {
    const clientFactory = vi.fn(() => createClient());
    const handleReady = createReadyHandler({
      env: {},
      clientFactory,
    });

    const response = await handleReady();

    expect(response.status).toBe(503);
    expect(await readJson(response)).toEqual({
      ok: false,
      status: "not_ready",
      error: {
        code: "missing_redis_config",
        message: "REDIS_URL must be set for readiness checks.",
      },
    });
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("returns a sanitized not ready response when Redis ping fails", async () => {
    const client = createClient(() =>
      Promise.reject(new Error("internal redis details")),
    );
    const handleReady = createReadyHandler({
      env: envWithRedisUrl,
      clientFactory: () => client,
    });

    const response = await handleReady();

    expect(response.status).toBe(503);
    expect(await readJson(response)).toEqual({
      ok: false,
      status: "not_ready",
      error: {
        code: "redis_command_failed",
        message: "Failed to ping Redis for readiness checks.",
      },
    });
  });
});
