import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { URLSearchParams } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addCountryFactSnippets,
  countrySnippetMaxLength,
  createCountryFactSnippet,
  mergeCountryFixtureSources,
  normalizeIsoCountryListCsv,
  normalizeWikidataBindings,
  normalizeWikidataMetadataBindings,
  parseArgs,
  readWikidataCountryFixtures,
  runGenerateCountryFixtures,
} from "./generate-country-fixtures.mjs";

const tempDirectories = [];

const binding = ({ code, name, capital, flagImageUrl, continent, language, currency }) => ({
  iso: { value: code },
  ...(name ? { countryLabel: { value: name } } : {}),
  ...(capital ? { capitalLabel: { value: capital } } : {}),
  ...(flagImageUrl ? { flag: { value: flagImageUrl } } : {}),
  ...(continent ? { continentLabel: { value: continent } } : {}),
  ...(language ? { officialLanguageLabel: { value: language } } : {}),
  ...(currency ? { currencyLabel: { value: currency } } : {}),
});

const createTempDirectory = async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "country-fixtures-test-"));
  tempDirectories.push(directory);

  return directory;
};

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("parseArgs", () => {
  it("uses stdout by default", () => {
    expect(parseArgs([])).toEqual({ mode: "stdout" });
  });

  it("accepts a single output path", () => {
    expect(parseArgs(["--output", "countries.json"])).toEqual({
      mode: "file",
      outputPath: "countries.json",
    });
  });
});

describe("normalizeWikidataBindings", () => {
  it("returns deterministic fixture metadata sorted by ISO code", () => {
    expect(
      normalizeWikidataBindings([
        binding({
          code: "ca",
          name: "Canada",
          capital: "Ottawa",
          flagImageUrl: "http://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Canada.svg",
        }),
        binding({
          code: "US",
          name: "United States",
          capital: "Washington, D.C.",
          flagImageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20the%20United%20States.svg",
        }),
      ]),
    ).toEqual([
      {
        code: "CA",
        name: "Canada",
        capital: "Ottawa",
        flagImageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Canada.svg",
      },
      {
        code: "US",
        name: "United States",
        capital: "Washington, D.C.",
        flagImageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20the%20United%20States.svg",
      },
    ]);
  });

  it("deduplicates multi-row country data and uses explicit fallbacks", () => {
    expect(
      normalizeWikidataBindings([
        binding({
          code: "AQ",
          name: "Antarctica",
          flagImageUrl: "",
        }),
        binding({
          code: "AQ",
          name: "Antarctica",
          flagImageUrl: "",
        }),
      ]),
    ).toEqual([
      {
        code: "AQ",
        name: "Antarctica",
        capital: "",
        flagImageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Antarctica.svg",
      },
    ]);
  });

  it("rejects invalid ISO country codes", () => {
    expect(() =>
      normalizeWikidataBindings([
        binding({
          code: "USA",
          name: "United States",
          capital: "Washington, D.C.",
          flagImageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20the%20United%20States.svg",
        }),
      ]),
    ).toThrow("Wikidata row 0.iso must be a two-letter ISO country code.");
  });
});

describe("normalizeIsoCountryListCsv", () => {
  it("parses quoted country names and sorts by ISO code", () => {
    expect(
      normalizeIsoCountryListCsv(
        'Name,Code\nCanada,CA\n"Bonaire, Sint Eustatius and Saba",BQ\n',
      ),
    ).toEqual([
      {
        code: "BQ",
        name: "Bonaire, Sint Eustatius and Saba",
      },
      {
        code: "CA",
        name: "Canada",
      },
    ]);
  });
});

describe("normalizeWikidataMetadataBindings", () => {
  it("keeps deterministic capital and HTTPS flag metadata per ISO code", () => {
    expect(
      normalizeWikidataMetadataBindings([
        binding({
          code: "US",
          capital: "Washington, D.C.",
          flagImageUrl: "http://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20the%20United%20States.svg",
          continent: "North America",
          language: "English",
          currency: "United States dollar",
        }),
        binding({
          code: "US",
          capital: "Washington, D.C.",
          flagImageUrl: "http://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20the%20United%20States.svg",
          continent: "North America",
          language: "English",
          currency: "United States dollar",
        }),
      ]),
    ).toEqual(
      new Map([
        [
          "US",
          {
            capital: "Washington, D.C.",
            flagImageUrl:
              "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20the%20United%20States.svg",
            continents: ["North America"],
            languages: ["English"],
            currencies: ["United States dollar"],
          },
        ],
      ]),
    );
  });
});

describe("mergeCountryFixtureSources", () => {
  it("adds Wikidata flag URLs and derives a Commons fallback when absent", () => {
    expect(
      mergeCountryFixtureSources({
        countries: [
          {
            code: "CA",
            name: "Canada",
          },
          {
            code: "EH",
            name: "Western Sahara",
          },
        ],
        metadataByCode: new Map([
          [
            "CA",
            {
              capital: "Ottawa",
              flagImageUrl:
                "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Canada.svg",
            },
          ],
        ]),
      }),
    ).toEqual([
      {
        code: "CA",
        name: "Canada",
        capital: "Ottawa",
        flagImageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Canada.svg",
        continents: [],
        languages: [],
        currencies: [],
      },
      {
        code: "EH",
        name: "Western Sahara",
        capital: "",
        flagImageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Western%20Sahara.svg",
        continents: [],
        languages: [],
        currencies: [],
      },
    ]);
  });
});

describe("createCountryFactSnippet", () => {
  it("creates a compact profile summary from country metadata", () => {
    const snippet = createCountryFactSnippet({
      code: "JP",
      name: "Japan",
      capital: "Tokyo",
      subregion: "Eastern Asia",
      landlocked: false,
      borderCount: 0,
      languages: ["Japanese"],
      currencies: ["Japanese yen"],
    });

    expect(snippet).not.toContain("Japan");
    expect(snippet).toContain("Tokyo");
    expect(snippet).toContain("Eastern Asia");
    expect(snippet).toContain("local-language public life");
    expect(snippet).toMatch(/\.$/);
    expect(snippet.length).toBeLessThanOrEqual(countrySnippetMaxLength);
  });

  it("keeps long and capital-less countries within the card budget", () => {
    expect(
      createCountryFactSnippet({
        code: "HM",
        name: "Heard Island and McDonald Islands",
        capital: "Unknown",
        subregion: "Antarctic",
        landlocked: false,
        borderCount: 0,
        languages: ["English"],
        currencies: ["Australian dollar"],
      }).length,
    ).toBeLessThanOrEqual(countrySnippetMaxLength);
  });
});

describe("addCountryFactSnippets", () => {
  it("adds distinct snippets to fixture records", () => {
    const countries = addCountryFactSnippets([
      {
        code: "BR",
        name: "Brazil",
        capital: "Brasilia",
        subregion: "South America",
        landlocked: false,
        borderCount: 10,
        languages: ["Portuguese"],
        currencies: ["Brazilian real"],
        flagImageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Brazil.svg",
      },
      {
        code: "JP",
        name: "Japan",
        capital: "Tokyo",
        subregion: "Eastern Asia",
        landlocked: false,
        borderCount: 0,
        languages: ["Japanese"],
        currencies: ["Japanese yen"],
        flagImageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Japan.svg",
      },
    ]);

    expect(countries.map((country) => country.factSnippet)).toEqual([
      "Set in coastal South America with Brasilia as its capital, it connects Portuguese-language public life, service and trade networks, and 10 neighbors.",
      "Set in coastal Eastern Asia with Tokyo as its capital, it connects local-language public life, JP reference identity, and regional and global links.",
    ]);
  });
});

describe("readWikidataCountryFixtures", () => {
  it("fetches country metadata and Wikidata flags before merging", async () => {
    const fetchImplementation = vi.fn((url) => {
      if (url.startsWith("https://datahub.io/")) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve("Name,Code\nJapan,JP\n"),
        });
      }

      if (url.startsWith("https://query.wikidata.org/")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              results: {
                bindings: [
                  binding({
                    code: "JP",
                    capital: "Tokyo",
                    flagImageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Japan.svg",
                    continent: "Asia",
                    language: "Japanese",
                    currency: "Japanese yen",
                  }),
                ],
              },
            }),
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    await expect(
      readWikidataCountryFixtures({ fetchImplementation }),
    ).resolves.toEqual([
      {
        code: "JP",
        name: "Japan",
        capital: "Tokyo",
        flagImageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Japan.svg",
        factSnippet:
          "Set in the Asia region with Tokyo as its capital, it connects local-language public life, JP reference identity, and regional and global links.",
      },
    ]);

    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://datahub.io/core/country-list/_r/-/data.csv",
      expect.objectContaining({
        headers: expect.objectContaining({
          accept: "text/csv",
        }),
      }),
    );
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://query.wikidata.org/sparql",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          accept: "application/sparql-results+json",
        }),
        body: expect.any(URLSearchParams),
      }),
    );
  });
});

describe("runGenerateCountryFixtures", () => {
  it("writes fixture metadata to the requested output path", async () => {
    const directory = await createTempDirectory();
    const outputPath = path.join(directory, "countries.json");
    const logger = {
      log: vi.fn(),
    };
    const fetchImplementation = vi.fn((url) => {
      if (url.startsWith("https://datahub.io/")) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve("Name,Code\nBrazil,BR\n"),
        });
      }

      if (url.startsWith("https://query.wikidata.org/")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              results: {
                bindings: [
                  binding({
                    code: "BR",
                    capital: "Brasilia",
                    flagImageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Brazil.svg",
                    continent: "South America",
                    language: "Portuguese",
                    currency: "Brazilian real",
                  }),
                ],
              },
            }),
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    await runGenerateCountryFixtures({
      argv: ["--output", outputPath],
      fetchImplementation,
      logger,
    });

    await expect(readFile(outputPath, "utf8")).resolves.toBe(
      `${JSON.stringify(
        [
          {
            code: "BR",
            name: "Brazil",
            capital: "Brasilia",
            flagImageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Brazil.svg",
            factSnippet:
              "Set in the South America region with Brasilia as its capital, it connects Portuguese-language public life, service and trade networks, and regional and global links.",
          },
        ],
        null,
        2,
      )}\n`,
    );
    expect(logger.log).toHaveBeenCalledWith(
      "Wrote 1 country fixture record(s).",
    );
  });
});
