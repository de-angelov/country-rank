/* global Buffer */
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  downloadCountryFlags,
  downloadFlagAsset,
  getFlagExtension,
  normalizeCountryFlags,
  parseArgs,
  toFlagFileName,
} from "./download-country-flags.mjs";

const tempDirectories = [];

const createTempDirectory = async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "country-flags-test-"));
  tempDirectories.push(directory);

  return directory;
};

const createResponse = ({
  ok = true,
  status = 200,
  contentType = "image/svg+xml; charset=utf-8",
  retryAfter = null,
  body = "<svg />",
  url = "https://upload.wikimedia.org/flag.svg",
} = {}) => ({
  ok,
  status,
  url,
  headers: {
    get: (name) =>
      name.toLowerCase() === "content-type"
        ? contentType
        : name.toLowerCase() === "retry-after"
          ? retryAfter
          : null,
  },
  arrayBuffer: () => {
    const bytes = Buffer.from(body);

    return Promise.resolve(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
  },
});

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("parseArgs", () => {
  it("uses the public flags directory and public manifest by default", () => {
    expect(parseArgs([])).toEqual({
      mode: "download",
      flagsDirectory: path.resolve("public/flags"),
      manifestPath: path.resolve("public/flag-assets.json"),
    });
  });

  it("accepts explicit output paths", () => {
    expect(
      parseArgs(["--flags-dir", "tmp/flags", "--manifest", "tmp/manifest.json"]),
    ).toEqual({
      mode: "download",
      flagsDirectory: path.resolve("tmp/flags"),
      manifestPath: path.resolve("tmp/manifest.json"),
    });
  });
});

describe("normalizeCountryFlags", () => {
  it("keeps deterministic ISO codes and HTTPS flag URLs", () => {
    expect(
      normalizeCountryFlags([
        {
          code: "JP",
          flagImageUrl:
            "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Japan.svg",
        },
      ]),
    ).toEqual([
      {
        code: "JP",
        flagImageUrl:
          "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Japan.svg",
      },
    ]);
  });

  it("rejects duplicate country codes before downloading", () => {
    expect(() =>
      normalizeCountryFlags([
        { code: "JP", flagImageUrl: "https://example.com/jp.svg" },
        { code: "JP", flagImageUrl: "https://example.com/japan.svg" },
      ]),
    ).toThrow("countryFixtures[1].code duplicates JP.");
  });
});

describe("getFlagExtension", () => {
  it("prefers supported image content types for stable file extensions", () => {
    expect(
      getFlagExtension({
        contentType: "image/svg+xml; charset=utf-8",
        finalUrl: "https://example.com/download",
      }),
    ).toBe(".svg");
    expect(
      getFlagExtension({
        contentType: "image/jpeg",
        finalUrl: "https://example.com/download",
      }),
    ).toBe(".jpg");
  });

  it("falls back to a supported redirected URL extension when content type is generic", () => {
    expect(
      getFlagExtension({
        contentType: "application/octet-stream",
        finalUrl: "https://upload.wikimedia.org/Flag.png",
      }),
    ).toBe(".png");
  });

  it("rejects unsupported content types clearly", () => {
    expect(() =>
      getFlagExtension({
        contentType: "text/html",
        finalUrl: "https://commons.wikimedia.org/wiki/File:Flag",
      }),
    ).toThrow(
      'Unsupported flag content type "text/html" from https://commons.wikimedia.org/wiki/File:Flag.',
    );
  });
});

describe("downloadFlagAsset", () => {
  it("uses the country code for deterministic filenames and public paths", async () => {
    const fetchImplementation = vi.fn(() =>
      Promise.resolve(
        createResponse({
          contentType: "image/png",
          url: "https://upload.wikimedia.org/Flag_of_Japan.png",
        }),
      ),
    );

    await expect(
      downloadFlagAsset({
        flag: {
          code: "JP",
          flagImageUrl:
            "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Japan.svg",
        },
        fetchImplementation,
      }),
    ).resolves.toMatchObject({
      code: "JP",
      fileName: "JP.png",
      publicPath: "/flags/JP.png",
      finalUrl: "https://upload.wikimedia.org/Flag_of_Japan.png",
    });
    expect(toFlagFileName({ code: "BR", extension: ".svg" })).toBe("BR.svg");
  });

  it("reports non-200 responses with country code and source URL", async () => {
    await expect(
      downloadFlagAsset({
        flag: {
          code: "BR",
          flagImageUrl:
            "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Brazil.svg",
        },
        fetchImplementation: () =>
          Promise.resolve(
            createResponse({
              ok: false,
              status: 404,
            }),
          ),
      }),
    ).rejects.toThrow(
      "BR flag download failed with HTTP 404 from https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Brazil.svg.",
    );
  });

  it("retries retryable HTTP responses before failing the country", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        createResponse({
          ok: false,
          status: 429,
          retryAfter: "0",
        }),
      )
      .mockResolvedValueOnce(createResponse());
    const waitImplementation = vi.fn(() => Promise.resolve());

    await expect(
      downloadFlagAsset({
        flag: {
          code: "AI",
          flagImageUrl:
            "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Anguilla.svg",
        },
        fetchImplementation,
        waitImplementation,
      }),
    ).resolves.toMatchObject({
      code: "AI",
      fileName: "AI.svg",
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(waitImplementation).toHaveBeenCalledWith(0);
  });
});

describe("downloadCountryFlags", () => {
  it("writes staged flag files and a manifest for every catalog country", async () => {
    const directory = await createTempDirectory();
    const flagsDirectory = path.join(directory, "flags");
    const manifestPath = path.join(directory, "flag-assets.json");
    const fetchImplementation = vi.fn((url) =>
      Promise.resolve(
        createResponse({
          contentType: url.includes("Japan") ? "image/svg+xml" : "image/png",
          body: url,
          url: url.includes("Japan")
            ? "https://upload.wikimedia.org/jp.svg"
            : "https://upload.wikimedia.org/br.png",
        }),
      ),
    );

    const result = await downloadCountryFlags({
      countryFixtures: [
        {
          code: "BR",
          flagImageUrl:
            "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Brazil.svg",
        },
        {
          code: "JP",
          flagImageUrl:
            "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Japan.svg",
        },
      ],
      flagsDirectory,
      manifestPath,
      fetchImplementation,
      delayMs: 0,
      logger: {
        log: vi.fn(),
      },
      now: () => new Date("2026-07-18T00:00:00.000Z"),
    });

    await expect(readdir(flagsDirectory)).resolves.toEqual(["BR.png", "JP.svg"]);
    await expect(readFile(manifestPath, "utf8")).resolves.toBe(
      `${JSON.stringify(
        {
          schemaVersion: 1,
          generatedAt: "2026-07-18T00:00:00.000Z",
          sourcePolicy:
            "Downloaded from flagImageUrl values in app/countries/fixtures.ts, which are sourced from Wikidata Commons flag image metadata.",
          flags: {
            BR: "/flags/BR.png",
            JP: "/flags/JP.svg",
          },
        },
        null,
        2,
      )}\n`,
    );
    expect(result).toMatchObject({
      assetCount: 2,
      duplicateSourceCount: 0,
    });
  });

  it("reuses duplicate source URL downloads while writing one file per country code", async () => {
    const directory = await createTempDirectory();
    const sourceUrl = "https://commons.wikimedia.org/wiki/Special:FilePath/Shared.svg";
    const fetchImplementation = vi.fn(() =>
      Promise.resolve(
        createResponse({
          contentType: "image/svg+xml",
          url: "https://upload.wikimedia.org/shared.svg",
        }),
      ),
    );

    const result = await downloadCountryFlags({
      countryFixtures: [
        { code: "AA", flagImageUrl: sourceUrl },
        { code: "BB", flagImageUrl: sourceUrl },
      ],
      flagsDirectory: path.join(directory, "flags"),
      manifestPath: path.join(directory, "flag-assets.json"),
      fetchImplementation,
      delayMs: 0,
      logger: {
        log: vi.fn(),
      },
      now: () => new Date("2026-07-18T00:00:00.000Z"),
    });

    await expect(readdir(path.join(directory, "flags"))).resolves.toEqual([
      "AA.svg",
      "BB.svg",
    ]);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(result.duplicateSourceCount).toBe(1);
  });
});
