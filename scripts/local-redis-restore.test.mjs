import { describe, expect, it, vi } from "vitest";

import {
  resolveLocalRedisUrl,
  runLocalRedisRestore,
} from "./local-redis-restore.mjs";

describe("resolveLocalRedisUrl", () => {
  it("defaults to the local Compose Redis port", () => {
    expect(resolveLocalRedisUrl({})).toBe("redis://localhost:4000");
  });

  it("uses REDIS_URL when it is provided", () => {
    expect(
      resolveLocalRedisUrl({
        REDIS_HOST_PORT: "4001",
        REDIS_URL: " redis://localhost:6381 ",
      }),
    ).toBe("redis://localhost:6381");
  });

  it("builds a local Redis URL from REDIS_HOST_PORT", () => {
    expect(resolveLocalRedisUrl({ REDIS_HOST_PORT: "4001" })).toBe(
      "redis://localhost:4001",
    );
  });

  it("fails clearly when REDIS_HOST_PORT is invalid", () => {
    expect(() => resolveLocalRedisUrl({ REDIS_HOST_PORT: "nope" })).toThrow(
      "REDIS_HOST_PORT must be an integer between 1 and 65535.",
    );
  });
});

describe("runLocalRedisRestore", () => {
  it("calls the existing restore command with the resolved local Redis URL", async () => {
    const commandRunner = vi.fn(() => Promise.resolve(0));
    const logger = {
      log: vi.fn(),
    };

    await expect(
      runLocalRedisRestore({
        argv: ["tmp/redis-backups/example-country-votes.json"],
        env: { REDIS_HOST_PORT: "4001", PATH: "/bin" },
        commandRunner,
        logger,
      }),
    ).resolves.toBe(0);

    expect(commandRunner).toHaveBeenCalledWith(
      "npm",
      [
        "run",
        "restore:redis",
        "--",
        "tmp/redis-backups/example-country-votes.json",
      ],
      {
        env: {
          REDIS_HOST_PORT: "4001",
          PATH: "/bin",
          REDIS_URL: "redis://localhost:4001",
        },
      },
    );
    expect(logger.log).toHaveBeenCalledWith(
      "Restoring Redis vote totals into redis://localhost:4001.",
    );
  });
});
