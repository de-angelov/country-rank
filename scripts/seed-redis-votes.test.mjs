import { describe, expect, it, vi } from "vitest";

import {
  countryCatalogKey,
  countryVoteDislikesKey,
  countryVoteLikesKey,
  runSeedRedisVotes,
} from "./seed-redis-votes.mjs";
import { countryFixtures as fullCountryFixtures } from "../app/countries/fixtures";

const sampleCountryFixtures = [
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
    del: vi.fn(() => Promise.resolve()),
    hSet: vi.fn(() => Promise.resolve()),
    set: vi.fn(() => Promise.resolve()),
  };
  const clientFactory = vi.fn(() => client);

  return {
    client,
    clientFactory,
  };
};

const getRedisPayload = (mock, expectedKey) => {
  const call = mock.mock.calls.find(([key]) => key === expectedKey);

  expect(call).toBeDefined();

  return call[1];
};

describe("runSeedRedisVotes", () => {
  it("writes a metadata-only country catalog document and aggregate vote hashes", async () => {
    const { client, clientFactory } = createClientFactory();
    const logger = {
      log: vi.fn(),
    };
    const expectedCatalog = sampleCountryFixtures.map(
      ({ code, name, capital, factSnippet, flagImageUrl }) => ({
        code,
        name,
        capital,
        factSnippet,
        flagImageUrl,
      }),
    );

    await runSeedRedisVotes({
      env: { REDIS_URL: "redis://localhost:6379" },
      logger,
      countryFixtureLoader: () => Promise.resolve(sampleCountryFixtures),
      clientFactory,
    });

    expect(clientFactory).toHaveBeenCalledWith({
      url: "redis://localhost:6379",
    });
    expect(client.set).toHaveBeenCalledWith(
      countryCatalogKey,
      JSON.stringify(expectedCatalog),
    );
    expect(JSON.parse(client.set.mock.calls[0][1])).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          likes: expect.any(Number),
        }),
      ]),
    );
    expect(JSON.parse(client.set.mock.calls[0][1])).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dislikes: expect.any(Number),
        }),
      ]),
    );
    expect(client.del).toHaveBeenCalledWith([
      countryVoteLikesKey,
      countryVoteDislikesKey,
      "country:votes:BR",
      "country:votes:JP",
    ]);
    expect(client.hSet).toHaveBeenNthCalledWith(1, countryVoteLikesKey, {
      BR: "7",
      JP: "11",
    });
    expect(client.hSet).toHaveBeenNthCalledWith(2, countryVoteDislikesKey, {
      BR: "3",
      JP: "1",
    });
    expect(client.hSet).not.toHaveBeenCalledWith(
      expect.stringMatching(/^country:votes:[A-Z]{2}$/),
      expect.anything(),
    );
    expect(logger.log).toHaveBeenCalledWith(
      "Seeded Redis country catalog and aggregate vote totals for 2 country record(s).",
    );
  });

  it("seeds metadata-only catalog records and vote hashes for every fixture country", async () => {
    const { client, clientFactory } = createClientFactory();
    const expectedCountryCodes = fullCountryFixtures
      .map((country) => country.code)
      .sort();

    await runSeedRedisVotes({
      env: { REDIS_URL: "redis://localhost:6379" },
      logger: {
        log: vi.fn(),
      },
      countryFixtureLoader: () => Promise.resolve(fullCountryFixtures),
      clientFactory,
    });

    const seededCatalog = JSON.parse(
      getRedisPayload(client.set, countryCatalogKey),
    );
    const seededLikes = getRedisPayload(client.hSet, countryVoteLikesKey);
    const seededDislikes = getRedisPayload(client.hSet, countryVoteDislikesKey);

    expect(seededCatalog).toHaveLength(fullCountryFixtures.length);
    expect(seededCatalog).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          likes: expect.any(Number),
        }),
      ]),
    );
    expect(seededCatalog).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dislikes: expect.any(Number),
        }),
      ]),
    );
    expect(seededCatalog.map((country) => country.code).sort()).toEqual(
      expectedCountryCodes,
    );
    expect(Object.keys(seededLikes).sort()).toEqual(expectedCountryCodes);
    expect(Object.keys(seededDislikes).sort()).toEqual(expectedCountryCodes);
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
      "Country fixtures must include metadata, two-letter codes, and integer vote totals.",
    );
    expect(client.connect).not.toHaveBeenCalled();
  });
});
