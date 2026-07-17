import { describe, expect, it, vi } from "vitest";

import {
  countryCatalogKey,
  runSeedRedisVotes,
} from "./seed-redis-votes.mjs";

const countryFixtures = [
  {
    code: "BR",
    name: "Brazil",
    capital: "Brasilia",
    factSnippet: "Taco precision, mural swagger, and sauces that check your ego.",
    flagImageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Brazil.svg",
    likes: 7,
    dislikes: 3,
  },
  {
    code: "JP",
    name: "Japan",
    capital: "Tokyo",
    factSnippet: "Vending machines, bullet trains, and stationery with main-character energy.",
    flagImageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Japan.svg",
    likes: 11,
    dislikes: 1,
  },
];

const createClientFactory = () => {
  const client = {
    close: vi.fn(() => Promise.resolve()),
    connect: vi.fn(() => Promise.resolve()),
    hSet: vi.fn(() => Promise.resolve()),
    set: vi.fn(() => Promise.resolve()),
  };
  const clientFactory = vi.fn(() => client);

  return {
    client,
    clientFactory,
  };
};

describe("runSeedRedisVotes", () => {
  it("writes the country catalog document and vote hashes from the same fixtures", async () => {
    const { client, clientFactory } = createClientFactory();
    const logger = {
      log: vi.fn(),
    };

    await runSeedRedisVotes({
      env: { REDIS_URL: "redis://localhost:6379" },
      logger,
      countryFixtureLoader: () => Promise.resolve(countryFixtures),
      clientFactory,
    });

    expect(clientFactory).toHaveBeenCalledWith({
      url: "redis://localhost:6379",
    });
    expect(client.set).toHaveBeenCalledWith(
      countryCatalogKey,
      JSON.stringify(countryFixtures),
    );
    expect(client.hSet).toHaveBeenNthCalledWith(1, "country:votes:BR", {
      likes: "7",
      dislikes: "3",
    });
    expect(client.hSet).toHaveBeenNthCalledWith(2, "country:votes:JP", {
      likes: "11",
      dislikes: "1",
    });
    expect(logger.log).toHaveBeenCalledWith(
      "Seeded Redis country catalog and 2 country vote total(s).",
    );
  });

  it("rejects country records that cannot seed vote totals", async () => {
    const { client, clientFactory } = createClientFactory();

    await expect(
      runSeedRedisVotes({
        env: { REDIS_URL: "redis://localhost:6379" },
        countryFixtureLoader: () =>
          Promise.resolve([
            {
              code: "USA",
              likes: 1,
              dislikes: 0,
            },
          ]),
        clientFactory,
      }),
    ).rejects.toThrow(
      "Country fixtures must include two-letter codes and integer vote totals.",
    );
    expect(client.connect).not.toHaveBeenCalled();
  });
});
