import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  generateOutlinedCountryFlags,
  outlineSvg,
  parseArgs,
} from "./generate-outlined-country-flags.mjs";

const tempDirectories = [];

const createTempDirectory = async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "outlined-flags-test-"));
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
  it("uses the local flag manifest and outlined output paths by default", () => {
    expect(parseArgs([])).toEqual({
      mode: "generate",
      sourceManifestPath: path.resolve("public/flag-assets.json"),
      outputDirectory: path.resolve("public/flags/outlined"),
      outputManifestPath: path.resolve("public/outlined-flag-assets.json"),
    });
  });

  it("accepts explicit source and output paths", () => {
    expect(
      parseArgs([
        "--manifest",
        "tmp/flags.json",
        "--out-dir",
        "tmp/outlined",
        "--out-manifest",
        "tmp/outlined.json",
      ]),
    ).toEqual({
      mode: "generate",
      sourceManifestPath: path.resolve("tmp/flags.json"),
      outputDirectory: path.resolve("tmp/outlined"),
      outputManifestPath: path.resolve("tmp/outlined.json"),
    });
  });
});

describe("outlineSvg", () => {
  it("adds SVG-local outline styling to paintable shapes", () => {
    const outlinedSvg = outlineSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M0 0h1v1z"/></svg>',
    );

    expect(outlinedSvg).toContain('data-country-ranking-outline="true"');
    expect(outlinedSvg).toContain("paint-order: stroke fill markers");
    expect(outlinedSvg).toContain("stroke: #000 !important");
    expect(outlinedSvg).toContain("vector-effect: non-scaling-stroke");
    expect(outlinedSvg).toContain(
      '<path fill="#fff" d="M0 0h1v1z"/>',
    );
  });

  it("rejects malformed SVG input clearly", () => {
    expect(() => outlineSvg("<path />")).toThrow(
      "SVG asset does not contain an <svg> root.",
    );
  });
});

describe("generateOutlinedCountryFlags", () => {
  it("writes outlined SVG assets and a complete manifest", async () => {
    const directory = await createTempDirectory();
    const flagsDirectory = path.join(directory, "flags");
    const outlinedDirectory = path.join(flagsDirectory, "outlined");
    const manifestPath = path.join(directory, "flag-assets.json");
    const outlinedManifestPath = path.join(directory, "outlined-flag-assets.json");

    await mkdir(flagsDirectory, { recursive: true });
    await writeFile(
      manifestPath,
      `${JSON.stringify({
        schemaVersion: 1,
        generatedAt: "2026-07-18T00:00:00.000Z",
        flags: {
          BT: "/flags/BT.svg",
          JP: "/flags/JP.svg",
        },
      })}\n`,
    );
    await writeFile(
      path.join(flagsDirectory, "BT.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#ffcd00" d="M0 0h900v600H0z"/><path fill="#ff671f" d="M0 600h900V0z"/></svg>',
    );
    await writeFile(
      path.join(flagsDirectory, "JP.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg"><circle fill="#bc002d" cx="50" cy="50" r="30"/></svg>',
    );

    const result = await generateOutlinedCountryFlags({
      sourceManifestPath: manifestPath,
      outputDirectory: outlinedDirectory,
      outputManifestPath: outlinedManifestPath,
      logger: {
        log: vi.fn(),
      },
      now: () => new Date("2026-07-18T00:00:00.000Z"),
    });

    await expect(readdir(outlinedDirectory)).resolves.toEqual([
      "BT.svg",
      "JP.svg",
    ]);
    await expect(readFile(path.join(outlinedDirectory, "BT.svg"), "utf8"))
      .resolves.toContain("stroke: #000 !important");
    await expect(readFile(outlinedManifestPath, "utf8")).resolves.toBe(
      `${JSON.stringify(
        {
          schemaVersion: 1,
          generatedAt: "2026-07-18T00:00:00.000Z",
          sourceManifest: "flag-assets.json",
          sourcePolicy:
            "Generated from public/flags SVG assets by injecting SVG-local outline CSS around paintable flag artwork. Non-SVG assets are rejected so country cards do not silently mix outlined and fallback treatments.",
          fallbackBehavior:
            "No non-SVG runtime fallback is used for country cards. Generation fails if any catalog source flag is not SVG; unusually structured SVGs still receive the scoped stroke CSS, but browser SVG support determines how deeply cloned symbols and masks expose internal boundaries.",
          flags: {
            BT: "/flags/outlined/BT.svg",
            JP: "/flags/outlined/JP.svg",
          },
        },
        null,
        2,
      )}\n`,
    );
    expect(result).toMatchObject({
      assetCount: 2,
    });
  });

  it("rejects non-SVG source assets instead of mixing outlined and fallback flags", async () => {
    const directory = await createTempDirectory();
    const manifestPath = path.join(directory, "flag-assets.json");

    await writeFile(
      manifestPath,
      `${JSON.stringify({
        schemaVersion: 1,
        flags: {
          BR: "/flags/BR.png",
        },
      })}\n`,
    );

    await expect(
      generateOutlinedCountryFlags({
        sourceManifestPath: manifestPath,
        outputDirectory: path.join(directory, "outlined"),
        outputManifestPath: path.join(directory, "outlined-flag-assets.json"),
      }),
    ).rejects.toThrow(
      "BR flag asset /flags/BR.png is not an SVG. Outlined variants require SVG-native source assets.",
    );
  });
});
