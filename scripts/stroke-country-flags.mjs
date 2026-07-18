#!/usr/bin/env node
/* global URL, console, process */
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const defaultFlagsDirectory = path.resolve("public/flags");
const defaultOutputDirectory = path.resolve("public/flags/stroked");
const defaultManifestPath = path.resolve("public/flag-assets.json");
const defaultStrokeWidth = 4;
const countryCodePattern = /^[A-Z]{2}$/;

const usage = `Usage:
  npm run stroke:country-flags
  npm run stroke:country-flags -- --flags-dir public/flags --output-dir public/flags/stroked --manifest public/flag-assets.json

Behavior:
  Reads public/flag-assets.json, generates SVG variants under public/flags/stroked,
  appends one black rectangular viewport stroke after each flag's existing artwork,
  and updates the manifest only after every catalog flag has a generated stroked
  variant. If generation is incomplete, CountryCard keeps using the original
  local flag asset paths.
`;

const parseNumericAttribute = (value) => {
  const match = String(value ?? "").trim().match(/^-?\d+(?:\.\d+)?/);

  return match ? Number(match[0]) : null;
};

const readOption = (argv, name, defaultValue) => {
  const indexes = argv
    .map((arg, index) => (arg === name ? index : -1))
    .filter((index) => index !== -1);

  if (indexes.length > 1) {
    throw new Error(`${name} can only be provided once.`);
  }

  if (indexes.length === 0) {
    return defaultValue;
  }

  const value = argv[indexes[0] + 1]?.trim();

  if (!value || value.startsWith("-")) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
};

export const parseArgs = (argv) => {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { mode: "help" };
  }

  const strokeWidth = Number(
    readOption(argv, "--stroke-width", String(defaultStrokeWidth)),
  );

  if (!Number.isFinite(strokeWidth) || strokeWidth <= 0) {
    throw new Error("--stroke-width must be a positive number.");
  }

  return {
    mode: "stroke",
    flagsDirectory: path.resolve(
      readOption(argv, "--flags-dir", defaultFlagsDirectory),
    ),
    outputDirectory: path.resolve(
      readOption(argv, "--output-dir", defaultOutputDirectory),
    ),
    manifestPath: path.resolve(readOption(argv, "--manifest", defaultManifestPath)),
    strokeWidth,
  };
};

const readSvgAttributes = (svg) => {
  const svgTagMatch = svg.match(/<svg\b([^>]*)>/i);

  if (!svgTagMatch) {
    throw new Error("SVG root element was not found.");
  }

  return Object.fromEntries(
    [...svgTagMatch[1].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map(
      ([, name, , value]) => [name.toLowerCase(), value],
    ),
  );
};

export const getSvgViewport = (svg) => {
  const attributes = readSvgAttributes(svg);
  const viewBox = attributes.viewbox?.trim().split(/[\s,]+/).map(Number);

  if (viewBox?.length === 4 && viewBox.every((value) => Number.isFinite(value))) {
    const [x, y, width, height] = viewBox;

    if (width > 0 && height > 0) {
      return { x, y, width, height };
    }
  }

  const width = parseNumericAttribute(attributes.width);
  const height = parseNumericAttribute(attributes.height);

  if (width && height && width > 0 && height > 0) {
    return { x: 0, y: 0, width, height };
  }

  throw new Error("SVG root must include a valid viewBox or width and height.");
};

export const addViewportStrokeToSvg = ({
  svg,
  strokeWidth = defaultStrokeWidth,
} = {}) => {
  const viewport = getSvgViewport(svg);
  const closingSvgIndex = svg.toLowerCase().lastIndexOf("</svg>");

  if (closingSvgIndex === -1) {
    throw new Error("SVG closing tag was not found.");
  }

  const stroke = `<rect x="${viewport.x}" y="${viewport.y}" width="${viewport.width}" height="${viewport.height}" fill="none" stroke="#000" stroke-width="${strokeWidth}" vector-effect="non-scaling-stroke"/>`;

  return `${svg.slice(0, closingSvgIndex)}${stroke}${svg.slice(closingSvgIndex)}`;
};

const validateManifest = (manifest) => {
  const flags = manifest?.flags;

  if (!flags || typeof flags !== "object" || Array.isArray(flags)) {
    throw new Error("Flag manifest must include a flags object.");
  }

  return Object.entries(flags)
    .map(([code, publicPath]) => {
      if (!countryCodePattern.test(code)) {
        throw new Error(`${code} is not a valid ISO alpha-2 country code.`);
      }

      if (typeof publicPath !== "string" || !publicPath.endsWith(".svg")) {
        throw new Error(`${code} must point to a local SVG flag asset.`);
      }

      return [code, publicPath];
    })
    .sort(([leftCode], [rightCode]) => leftCode.localeCompare(rightCode));
};

const validateGeneratedAssets = async ({ outputDirectory, strokedFlags }) => {
  const manifestCodes = Object.keys(strokedFlags).sort();
  const fileCodes = (await readdir(outputDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.basename(entry.name, ".svg"))
    .sort();

  if (JSON.stringify(fileCodes) !== JSON.stringify(manifestCodes)) {
    throw new Error("Stroked flag files do not match the flag manifest.");
  }

  await Promise.all(
    Object.entries(strokedFlags).map(async ([code, publicPath]) => {
      const fileStat = await stat(path.join(outputDirectory, path.basename(publicPath)));

      if (!fileStat.isFile() || fileStat.size === 0) {
        throw new Error(`${code} stroked flag asset ${publicPath} is missing or empty.`);
      }
    }),
  );
};

export const strokeCountryFlags = async ({
  flagsDirectory = defaultFlagsDirectory,
  outputDirectory = defaultOutputDirectory,
  manifestPath = defaultManifestPath,
  strokeWidth = defaultStrokeWidth,
  now = () => new Date(),
  logger = console,
} = {}) => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const flags = validateManifest(manifest);
  const stagedOutputDirectory = `${outputDirectory}.tmp-${process.pid}-${Date.now()}`;
  const strokedFlags = {};

  await rm(stagedOutputDirectory, { recursive: true, force: true });
  await mkdir(stagedOutputDirectory, { recursive: true });

  try {
    for (const [code, publicPath] of flags) {
      const sourcePath = path.join(flagsDirectory, path.basename(publicPath));
      const strokedFileName = `${code}.svg`;
      const strokedPublicPath = `/flags/stroked/${strokedFileName}`;
      const svg = await readFile(sourcePath, "utf8");

      await writeFile(
        path.join(stagedOutputDirectory, strokedFileName),
        addViewportStrokeToSvg({ svg, strokeWidth }),
      );
      strokedFlags[code] = strokedPublicPath;
    }

    await validateGeneratedAssets({
      outputDirectory: stagedOutputDirectory,
      strokedFlags,
    });

    const nextManifest = {
      ...manifest,
      strokedFlagsGeneratedAt: now().toISOString(),
      strokedFlags: Object.fromEntries(
        Object.entries(strokedFlags).sort(([leftCode], [rightCode]) =>
          leftCode.localeCompare(rightCode),
        ),
      ),
    };

    await writeFile(`${manifestPath}.tmp`, `${JSON.stringify(nextManifest, null, 2)}\n`);
    await rm(outputDirectory, { recursive: true, force: true });
    await rename(stagedOutputDirectory, outputDirectory);
    await rename(`${manifestPath}.tmp`, manifestPath);

    logger.log(`Generated ${flags.length} stroked SVG flag asset(s) to ${outputDirectory}.`);
    logger.log(`Updated stroked flag paths in ${manifestPath}.`);

    return {
      assetCount: flags.length,
      outputDirectory,
      manifestPath,
      manifest: nextManifest,
    };
  } catch (error) {
    await rm(stagedOutputDirectory, { recursive: true, force: true });
    await rm(`${manifestPath}.tmp`, { force: true });
    throw error;
  }
};

export const runStrokeCountryFlags = async ({
  argv = process.argv.slice(2),
  logger = console,
} = {}) => {
  const args = parseArgs(argv);

  if (args.mode === "help") {
    logger.log(usage);
    return;
  }

  await strokeCountryFlags({
    flagsDirectory: args.flagsDirectory,
    outputDirectory: args.outputDirectory,
    manifestPath: args.manifestPath,
    strokeWidth: args.strokeWidth,
    logger,
  });
};

if (process.argv[1] === new URL(import.meta.url).pathname) {
  runStrokeCountryFlags().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
