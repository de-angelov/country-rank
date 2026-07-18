import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addViewportStrokeToSvg,
  getSvgViewport,
  parseArgs,
  strokeCountryFlags,
} from "./stroke-country-flags.mjs";

const tempDirectories = [];

const createTempDirectory = async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "stroked-flags-test-"));
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
  it("uses the checked-in flag paths by default", () => {
    expect(parseArgs([])).toEqual({
      mode: "stroke",
      flagsDirectory: path.resolve("public/flags"),
      outputDirectory: path.resolve("public/flags/stroked"),
      manifestPath: path.resolve("public/flag-assets.json"),
      strokeWidth: 4,
    });
  });

  it("accepts explicit paths and stroke width", () => {
    expect(
      parseArgs([
        "--flags-dir",
        "tmp/flags",
        "--output-dir",
        "tmp/stroked",
        "--manifest",
        "tmp/flag-assets.json",
        "--stroke-width",
        "3",
      ]),
    ).toEqual({
      mode: "stroke",
      flagsDirectory: path.resolve("tmp/flags"),
      outputDirectory: path.resolve("tmp/stroked"),
      manifestPath: path.resolve("tmp/flag-assets.json"),
      strokeWidth: 3,
    });
  });
});

describe("getSvgViewport", () => {
  it("prefers the root viewBox for the viewport stroke rectangle", () => {
    expect(
      getSvgViewport('<svg width="900" height="600" viewBox="-72 -48 144 96"></svg>'),
    ).toEqual({
      x: -72,
      y: -48,
      width: 144,
      height: 96,
    });
  });

  it("falls back to numeric root dimensions", () => {
    expect(getSvgViewport('<svg width="900" height="600"></svg>')).toEqual({
      x: 0,
      y: 0,
      width: 900,
      height: 600,
    });
  });
});

describe("addViewportStrokeToSvg", () => {
  it("appends one non-scaling viewport rect after the flag artwork", () => {
    const strokedSvg = addViewportStrokeToSvg({
      svg: '<svg width="900" height="600"><rect fill="#fff" width="900" height="600"/><circle fill="#bc002d" cx="450" cy="300" r="180"/></svg>',
      strokeWidth: 4,
    });

    expect(strokedSvg).toContain(
      '<circle fill="#bc002d" cx="450" cy="300" r="180"/><rect x="0" y="0" width="900" height="600" fill="none" stroke="#000" stroke-width="4" vector-effect="non-scaling-stroke"/></svg>',
    );
    expect(strokedSvg.match(/stroke="#000"/g)).toHaveLength(1);
    expect(strokedSvg).not.toContain('<rect fill="#fff" stroke="#000"');
  });
});

describe("strokeCountryFlags", () => {
  it("writes staged stroked SVG files and updates the manifest after every flag succeeds", async () => {
    const directory = await createTempDirectory();
    const flagsDirectory = path.join(directory, "flags");
    const outputDirectory = path.join(flagsDirectory, "stroked");
    const manifestPath = path.join(directory, "flag-assets.json");

    await mkdir(flagsDirectory, { recursive: true });
    await writeFile(
      path.join(directory, "flag-assets.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          generatedAt: "2026-07-18T00:00:00.000Z",
          sourcePolicy: "Downloaded from fixtures.",
          flags: {
            JP: "/flags/JP.svg",
            PL: "/flags/PL.svg",
          },
        },
        null,
        2,
      )}\n`,
    );
    await writeFile(
      path.join(directory, "flags", "JP.svg"),
      '<svg width="900" height="600"><rect fill="#fff" width="900" height="600"/><circle fill="#bc002d" cx="450" cy="300" r="180"/></svg>',
    );
    await writeFile(
      path.join(directory, "flags", "PL.svg"),
      '<svg width="640" height="400" viewBox="0 0 8 5"><rect width="8" height="5" fill="#dc143c"/><rect width="8" height="2.5" fill="#fff"/></svg>',
    );

    const result = await strokeCountryFlags({
      flagsDirectory,
      outputDirectory,
      manifestPath,
      logger: {
        log: vi.fn(),
      },
      now: () => new Date("2026-07-18T01:00:00.000Z"),
    });

    await expect(readdir(outputDirectory)).resolves.toEqual(["JP.svg", "PL.svg"]);
    await expect(readFile(path.join(outputDirectory, "JP.svg"), "utf8")).resolves.toContain(
      '<circle fill="#bc002d" cx="450" cy="300" r="180"/><rect x="0" y="0" width="900" height="600" fill="none" stroke="#000" stroke-width="4" vector-effect="non-scaling-stroke"/></svg>',
    );
    await expect(readFile(path.join(outputDirectory, "PL.svg"), "utf8")).resolves.toContain(
      '<rect width="8" height="2.5" fill="#fff"/><rect x="0" y="0" width="8" height="5" fill="none" stroke="#000" stroke-width="4" vector-effect="non-scaling-stroke"/></svg>',
    );
    await expect(readFile(manifestPath, "utf8")).resolves.toBe(
      `${JSON.stringify(
        {
          schemaVersion: 1,
          generatedAt: "2026-07-18T00:00:00.000Z",
          sourcePolicy: "Downloaded from fixtures.",
          flags: {
            JP: "/flags/JP.svg",
            PL: "/flags/PL.svg",
          },
          strokedFlagsGeneratedAt: "2026-07-18T01:00:00.000Z",
          strokedFlags: {
            JP: "/flags/stroked/JP.svg",
            PL: "/flags/stroked/PL.svg",
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
});
