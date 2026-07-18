import { describe, expect, it, vi } from "vitest";

import {
  parseDotEnvContent,
  resolveAppUrl,
  resolveComposeEnv,
  resolveRedisEndpoint,
  runComposeDevSeed,
} from "./compose-dev-seed.mjs";

const createPortAvailabilityChecker = (availablePorts) => {
  const checker = vi.fn((redisHostPort) =>
    Promise.resolve(availablePorts.has(redisHostPort)),
  );

  return checker;
};

describe("resolveRedisEndpoint", () => {
  it("uses the default Redis host port when it is available", async () => {
    const isPortAvailable = createPortAvailabilityChecker(new Set([6379]));

    await expect(
      resolveRedisEndpoint({
        env: {},
        isPortAvailable,
      }),
    ).resolves.toEqual({
      redisHostPort: 6379,
      redisUrl: "redis://localhost:6379",
    });

    expect(isPortAvailable).toHaveBeenCalledWith(6379);
  });

  it("selects the next available Redis host port when the default is busy", async () => {
    const isPortAvailable = createPortAvailabilityChecker(new Set([6381]));

    await expect(
      resolveRedisEndpoint({
        env: {},
        isPortAvailable,
      }),
    ).resolves.toEqual({
      redisHostPort: 6381,
      redisUrl: "redis://localhost:6381",
    });

    expect(isPortAvailable).toHaveBeenNthCalledWith(1, 6379);
    expect(isPortAvailable).toHaveBeenNthCalledWith(2, 6380);
    expect(isPortAvailable).toHaveBeenNthCalledWith(3, 6381);
  });

  it("fails clearly when an explicit Redis host port is busy", async () => {
    await expect(
      resolveRedisEndpoint({
        env: { REDIS_HOST_PORT: "6380" },
        isPortAvailable: createPortAvailabilityChecker(new Set()),
      }),
    ).rejects.toThrow(
      "REDIS_HOST_PORT=6380 is already in use on 127.0.0.1. Choose another free port and rerun npm run compose:dev:seed.",
    );
  });
});

describe("resolveAppUrl", () => {
  it("uses localhost port 3000 by default", () => {
    expect(resolveAppUrl({})).toBe("http://localhost:3000");
  });

  it("uses an explicit app host port override", () => {
    expect(resolveAppUrl({ APP_HOST_PORT: "5174" })).toBe(
      "http://localhost:5174",
    );
  });
});

describe("Compose env resolution", () => {
  it("parses simple Compose .env content", () => {
    expect(
      parseDotEnvContent(`
# comment
APP_HOST_PORT=5174
REDIS_HOST_PORT="6380"
IGNORED_LINE
EMPTY=
`),
    ).toEqual({
      APP_HOST_PORT: "5174",
      REDIS_HOST_PORT: "6380",
      EMPTY: "",
    });
  });

  it("uses shell env over Compose .env values", () => {
    expect(
      resolveComposeEnv({
        env: { APP_HOST_PORT: "3000", PATH: "/bin" },
        dotEnv: { APP_HOST_PORT: "5174", REDIS_HOST_PORT: "6380" },
      }),
    ).toEqual({
      APP_HOST_PORT: "3000",
      PATH: "/bin",
      REDIS_HOST_PORT: "6380",
    });
  });
});

describe("runComposeDevSeed", () => {
  it("starts Compose with an optional host Redis port and seeds through the host-mapped Redis endpoint", async () => {
    const commandRunner = vi.fn(() => Promise.resolve(0));
    const logger = {
      log: vi.fn(),
    };

    await expect(
      runComposeDevSeed({
        env: { APP_HOST_PORT: "5174", PATH: "/bin" },
        commandRunner,
        isPortAvailable: createPortAvailabilityChecker(new Set([6380])),
        logger,
      }),
    ).resolves.toBe(0);

    expect(commandRunner).toHaveBeenNthCalledWith(
      1,
      "docker",
      ["compose", "up", "-d", "app", "redis"],
      {
        env: {
          APP_HOST_PORT: "5174",
          PATH: "/bin",
          REDIS_HOST_PORT: "6380",
        },
      },
    );
    expect(commandRunner).toHaveBeenNthCalledWith(
      2,
      "npm",
      ["run", "seed:redis:votes"],
      {
        env: {
          APP_HOST_PORT: "5174",
          PATH: "/bin",
          REDIS_HOST_PORT: "6380",
          REDIS_URL: "redis://localhost:6380",
        },
      },
    );
    expect(logger.log).toHaveBeenCalledWith(
      "Compose dev app: http://localhost:5174",
    );
    expect(logger.log).toHaveBeenCalledWith(
      "Compose dev Redis for optional local tooling: redis://localhost:6380",
    );
    expect(logger.log).toHaveBeenCalledWith(
      "Seeding Redis vote totals at redis://localhost:6380.",
    );
  });

  it("uses Compose .env values when starting and seeding", async () => {
    const commandRunner = vi.fn(() => Promise.resolve(0));
    const logger = {
      log: vi.fn(),
    };

    await expect(
      runComposeDevSeed({
        env: { PATH: "/bin" },
        dotEnv: { APP_HOST_PORT: "5174", REDIS_HOST_PORT: "6380" },
        commandRunner,
        isPortAvailable: createPortAvailabilityChecker(new Set([6380])),
        logger,
      }),
    ).resolves.toBe(0);

    expect(commandRunner).toHaveBeenNthCalledWith(
      1,
      "docker",
      ["compose", "up", "-d", "app", "redis"],
      {
        env: {
          APP_HOST_PORT: "5174",
          PATH: "/bin",
          REDIS_HOST_PORT: "6380",
        },
      },
    );
    expect(commandRunner).toHaveBeenNthCalledWith(
      2,
      "npm",
      ["run", "seed:redis:votes"],
      {
        env: {
          APP_HOST_PORT: "5174",
          PATH: "/bin",
          REDIS_HOST_PORT: "6380",
          REDIS_URL: "redis://localhost:6380",
        },
      },
    );
    expect(logger.log).toHaveBeenCalledWith(
      "Compose dev app: http://localhost:5174",
    );
  });
});
