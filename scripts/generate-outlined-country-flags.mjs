#!/usr/bin/env node
/* global console, process, URL */
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

const defaultSourceManifestPath = path.resolve("public/flag-assets.json");
const defaultOutputDirectory = path.resolve("public/flags/outlined");
const defaultOutputManifestPath = path.resolve("public/outlined-flag-assets.json");
const countryCodePattern = /^[A-Z]{2}$/;
const svgExtension = ".svg";

const sourcePolicy =
  "Generated from public/flags SVG assets by injecting SVG-local outline CSS around paintable flag artwork. Non-SVG assets are rejected so country cards do not silently mix outlined and fallback treatments.";

const outlineStyle = `<style data-country-ranking-outline="true">
path, rect, circle, ellipse, polygon, polyline, line, text, use {
  paint-order: stroke fill markers;
  stroke: #000 !important;
  stroke-width: var(--country-ranking-flag-outline-width, 2px) !important;
  stroke-linecap: round !important;
  stroke-linejoin: round !important;
  vector-effect: non-scaling-stroke !important;
}
</style>`;

const usage = `Usage:
  npm run generate:outlined-country-flags
  npm run generate:outlined-country-flags -- --manifest public/flag-assets.json --out-dir public/flags/outlined --out-manifest public/outlined-flag-assets.json

Behavior:
  Reads the local flag asset manifest, creates deterministic outlined variants,
  and writes a separate manifest for runtime use. SVG flags receive native
  paint-order/stroke styling on visible paintable elements so internal SVG
  shapes can show black outlines. Non-SVG assets fail generation so runtime use
  stays catalog-wide and deterministic.
`;

const parseOption = (argv, name, defaultValue) => {
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

  return {
    mode: "generate",
    sourceManifestPath: path.resolve(
      parseOption(argv, "--manifest", defaultSourceManifestPath),
    ),
    outputDirectory: path.resolve(parseOption(argv, "--out-dir", defaultOutputDirectory)),
    outputManifestPath: path.resolve(
      parseOption(argv, "--out-manifest", defaultOutputManifestPath),
    ),
  };
};

const validateManifestFlags = (manifest) => {
  if (
    manifest === null ||
    typeof manifest !== "object" ||
    manifest.flags === null ||
    typeof manifest.flags !== "object" ||
    Array.isArray(manifest.flags)
  ) {
    throw new Error("Flag manifest must contain a flags object.");
  }

  return Object.entries(manifest.flags).map(([code, publicPath]) => {
    if (!countryCodePattern.test(code)) {
      throw new Error(`${code} is not a valid ISO alpha-2 country code.`);
    }

    if (typeof publicPath !== "string" || !publicPath.startsWith("/flags/")) {
      throw new Error(`${code} flag manifest path must start with /flags/.`);
    }

    const extension = path.extname(publicPath).toLowerCase();

    if (extension !== svgExtension) {
      throw new Error(
        `${code} flag asset ${publicPath} is not an SVG. Outlined variants require SVG-native source assets.`,
      );
    }

    return {
      code,
      publicPath,
    };
  });
};

const toOutlinedPublicPath = (sourcePublicPath) =>
  `/flags/outlined/${path.basename(sourcePublicPath)}`;

export const outlineSvg = (svg) => {
  if (!/<svg[\s>]/i.test(svg)) {
    throw new Error("SVG asset does not contain an <svg> root.");
  }

  if (!/<\/svg>\s*$/i.test(svg)) {
    throw new Error("SVG asset does not end with a closing </svg> tag.");
  }

  return svg.replace(/<\/svg>\s*$/i, `${outlineStyle}\n</svg>`);
};

const validateGeneratedAssets = async ({
  outputDirectory,
  manifest,
  expectedCodes,
}) => {
  const manifestCodes = Object.keys(manifest.flags).sort();

  if (JSON.stringify(manifestCodes) !== JSON.stringify([...expectedCodes].sort())) {
    throw new Error("Outlined flag manifest country codes do not match source flags.");
  }

  const fileCodes = (await readdir(outputDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.basename(entry.name, path.extname(entry.name)))
    .sort();

  if (JSON.stringify(fileCodes) !== JSON.stringify(manifestCodes)) {
    throw new Error("Outlined flag files do not match the generated manifest.");
  }

  await Promise.all(
    Object.entries(manifest.flags).map(async ([code, publicPath]) => {
      const fileStat = await stat(path.join(outputDirectory, path.basename(publicPath)));

      if (!fileStat.isFile() || fileStat.size === 0) {
        throw new Error(`${code} outlined flag asset ${publicPath} is missing or empty.`);
      }
    }),
  );
};

export const generateOutlinedCountryFlags = async ({
  sourceManifestPath = defaultSourceManifestPath,
  outputDirectory = defaultOutputDirectory,
  outputManifestPath = defaultOutputManifestPath,
  now = () => new Date(),
  logger = console,
} = {}) => {
  const manifest = JSON.parse(await readFile(sourceManifestPath, "utf8"));
  const flags = validateManifestFlags(manifest);
  const outputFlags = {};
  const sourceBaseDirectory = path.dirname(sourceManifestPath);
  const stagedOutputDirectory = `${outputDirectory}.tmp-${process.pid}-${Date.now()}`;

  await rm(stagedOutputDirectory, { recursive: true, force: true });
  await mkdir(stagedOutputDirectory, { recursive: true });
  await mkdir(path.dirname(outputManifestPath), { recursive: true });

  try {
    for (const flag of flags) {
      const sourcePath = path.join(sourceBaseDirectory, flag.publicPath.replace(/^\//, ""));
      const outputPublicPath = toOutlinedPublicPath(flag.publicPath);
      const outputPath = path.join(stagedOutputDirectory, path.basename(outputPublicPath));

      await writeFile(outputPath, outlineSvg(await readFile(sourcePath, "utf8")));

      outputFlags[flag.code] = outputPublicPath;
    }

    const outlinedManifest = {
      schemaVersion: 1,
      generatedAt: now().toISOString(),
      sourceManifest: path.relative(path.dirname(outputManifestPath), sourceManifestPath),
      sourcePolicy,
      fallbackBehavior:
        "No non-SVG runtime fallback is used for country cards. Generation fails if any catalog source flag is not SVG; unusually structured SVGs still receive the scoped stroke CSS, but browser SVG support determines how deeply cloned symbols and masks expose internal boundaries.",
      flags: Object.fromEntries(
        Object.entries(outputFlags).sort(([leftCode], [rightCode]) =>
          leftCode.localeCompare(rightCode),
        ),
      ),
    };

    await validateGeneratedAssets({
      outputDirectory: stagedOutputDirectory,
      manifest: outlinedManifest,
      expectedCodes: flags.map((flag) => flag.code),
    });
    await writeFile(
      `${outputManifestPath}.tmp`,
      `${JSON.stringify(outlinedManifest, null, 2)}\n`,
    );
    await rm(outputDirectory, { recursive: true, force: true });
    await rename(stagedOutputDirectory, outputDirectory);
    await rename(`${outputManifestPath}.tmp`, outputManifestPath);

    logger.log(`Generated ${flags.length} outlined country flag asset(s).`);
    logger.log(`Wrote outlined flag manifest to ${outputManifestPath}.`);

    return {
      assetCount: flags.length,
      outputDirectory,
      outputManifestPath,
      manifest: outlinedManifest,
    };
  } catch (error) {
    await rm(stagedOutputDirectory, { recursive: true, force: true });
    await rm(`${outputManifestPath}.tmp`, { force: true });
    throw error;
  }
};

export const runGenerateOutlinedCountryFlags = async ({
  argv = process.argv.slice(2),
  logger = console,
} = {}) => {
  const args = parseArgs(argv);

  if (args.mode === "help") {
    logger.log(usage);
    return;
  }

  await generateOutlinedCountryFlags({
    sourceManifestPath: args.sourceManifestPath,
    outputDirectory: args.outputDirectory,
    outputManifestPath: args.outputManifestPath,
    logger,
  });
};

if (process.argv[1] === new URL(import.meta.url).pathname) {
  runGenerateOutlinedCountryFlags().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
