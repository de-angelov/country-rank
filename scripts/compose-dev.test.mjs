import { describe, expect, it, vi } from "vitest";

import { runComposeDev } from "./compose-dev.mjs";

const createPortAvailabilityChecker = (availablePorts) =>
  vi.fn((redisHostPort) =>
    Promise.resolve(availablePorts.has(redisHostPort)),
  );

describe("runComposeDev", () => {
  it("prints the default app URL on localhost port 3000", async () => {
    const commandRunner = vi.fn((_command, _args, options) => {
      options.onStart();
      return Promise.resolve(0);
    });
    const logger = {
      log: vi.fn(),
    };

    await expect(
      runComposeDev({
        env: { PATH: "/bin" },
        commandRunner,
        isPortAvailable: createPortAvailabilityChecker(new Set([4000])),
        logger,
      }),
    ).resolves.toBe(0);

    expect(commandRunner).toHaveBeenCalledWith(
      "docker",
      ["compose", "up", "app", "redis"],
      {
        env: {
          PATH: "/bin",
          REDIS_HOST_PORT: "4000",
        },
        onStart: expect.any(Function),
      },
    );
    expect(logger.log).toHaveBeenCalledWith(
      "Compose dev app: http://localhost:3000",
    );
  });

  it("passes the selected Redis host port to Compose and prints host URLs", async () => {
    const commandRunner = vi.fn((_command, _args, options) => {
      options.onStart();
      return Promise.resolve(0);
    });
    const logger = {
      log: vi.fn(),
    };

    await expect(
      runComposeDev({
        env: { APP_HOST_PORT: "3001", PATH: "/bin" },
        commandRunner,
        isPortAvailable: createPortAvailabilityChecker(new Set([4001])),
        logger,
      }),
    ).resolves.toBe(0);

    expect(commandRunner).toHaveBeenCalledWith(
      "docker",
      ["compose", "up", "app", "redis"],
      {
        env: {
          APP_HOST_PORT: "3001",
          PATH: "/bin",
          REDIS_HOST_PORT: "4001",
        },
        onStart: expect.any(Function),
      },
    );
    expect(logger.log).toHaveBeenCalledWith(
      "Compose dev app: http://localhost:3001",
    );
    expect(logger.log).toHaveBeenCalledWith(
      "Compose dev Redis: redis://localhost:4001",
    );
  });

  it("uses Compose .env values when shell env does not override them", async () => {
    const commandRunner = vi.fn((_command, _args, options) => {
      options.onStart();
      return Promise.resolve(0);
    });
    const logger = {
      log: vi.fn(),
    };

    await expect(
      runComposeDev({
        env: { PATH: "/bin" },
        dotEnv: { APP_HOST_PORT: "3001", REDIS_HOST_PORT: "4001" },
        commandRunner,
        isPortAvailable: createPortAvailabilityChecker(new Set([4001])),
        logger,
      }),
    ).resolves.toBe(0);

    expect(commandRunner).toHaveBeenCalledWith(
      "docker",
      ["compose", "up", "app", "redis"],
      {
        env: {
          APP_HOST_PORT: "3001",
          PATH: "/bin",
          REDIS_HOST_PORT: "4001",
        },
        onStart: expect.any(Function),
      },
    );
    expect(logger.log).toHaveBeenCalledWith(
      "Compose dev app: http://localhost:3001",
    );
    expect(logger.log).toHaveBeenCalledWith(
      "Compose dev Redis: redis://localhost:4001",
    );
  });

  it("lets shell env override Compose .env values", async () => {
    const commandRunner = vi.fn((_command, _args, options) => {
      options.onStart();
      return Promise.resolve(0);
    });
    const logger = {
      log: vi.fn(),
    };

    await expect(
      runComposeDev({
        env: { APP_HOST_PORT: "3000", PATH: "/bin" },
        dotEnv: { APP_HOST_PORT: "3001" },
        commandRunner,
        isPortAvailable: createPortAvailabilityChecker(new Set([4000])),
        logger,
      }),
    ).resolves.toBe(0);

    expect(commandRunner).toHaveBeenCalledWith(
      "docker",
      ["compose", "up", "app", "redis"],
      {
        env: {
          APP_HOST_PORT: "3000",
          PATH: "/bin",
          REDIS_HOST_PORT: "4000",
        },
        onStart: expect.any(Function),
      },
    );
    expect(logger.log).toHaveBeenCalledWith(
      "Compose dev app: http://localhost:3000",
    );
  });

  it("fails clearly when an explicit Redis host port is busy", async () => {
    await expect(
      runComposeDev({
        env: { REDIS_HOST_PORT: "4001" },
        commandRunner: vi.fn(),
        isPortAvailable: createPortAvailabilityChecker(new Set()),
      }),
    ).rejects.toThrow(
      "REDIS_HOST_PORT=4001 is already in use on 127.0.0.1. Choose another free port and rerun npm run compose:dev.",
    );
  });
});
