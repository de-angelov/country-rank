#!/usr/bin/env node
/* global Buffer, URL, console, fetch, process, setTimeout */
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
import vm from "node:vm";

const countryCodePattern = /^[A-Z]{2}$/;
const defaultDelayMs = 500;
const defaultMaxAttempts = 4;
const maxRetryDelayMs = 10_000;
const defaultCatalogPath = "app/countries/fixtures.ts";
const defaultFlagsDirectory = path.resolve("public/flags");
const defaultManifestPath = path.resolve("public/flag-assets.json");
const sourcePolicy =
  "Downloaded from flagImageUrl values in app/countries/fixtures.ts, which are sourced from Wikidata Commons flag image metadata.";

const extensionsByContentType = new Map([
  ["image/svg+xml", ".svg"],
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
]);

const supportedExtensions = new Map([
  [".svg", ".svg"],
  [".png", ".png"],
  [".jpg", ".jpg"],
  [".jpeg", ".jpg"],
  [".webp", ".webp"],
  [".gif", ".gif"],
]);
const retryableStatuses = new Set([429, 500, 502, 503, 504]);

const usage = `Usage:
  npm run download:country-flags
  npm run download:country-flags -- --flags-dir public/flags --manifest public/flag-assets.json

Behavior:
  Reads the checked-in country catalog, downloads each existing flagImageUrl,
  writes deterministic assets under public/flags, and generates a JSON manifest
  with local public paths keyed by ISO alpha-2 country code.
`;

const wait = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const normalizeContentType = (contentType) =>
  contentType.split(";")[0]?.trim().toLowerCase() ?? "";

const extensionFromUrl = (url) => {
  const extension = path.extname(new URL(url).pathname).toLowerCase();

  return supportedExtensions.get(extension) ?? null;
};

export const parseArgs = (argv) => {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { mode: "help" };
  }

  const readOption = (name, defaultValue) => {
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

  const args = {
    mode: "download",
    flagsDirectory: path.resolve(readOption("--flags-dir", defaultFlagsDirectory)),
    manifestPath: path.resolve(readOption("--manifest", defaultManifestPath)),
  };

  if (argv.includes("--delay-ms")) {
    const delayMs = Number(readOption("--delay-ms", String(defaultDelayMs)));

    if (!Number.isFinite(delayMs) || delayMs < 0) {
      throw new Error("--delay-ms must be a non-negative number.");
    }

    args.delayMs = delayMs;
  }

  return args;
};

export const normalizeCountryFlags = (countries) => {
  const seenCodes = new Set();

  return countries.map((country, index) => {
    const code = String(country.code ?? "").trim().toUpperCase();
    const flagImageUrl = String(country.flagImageUrl ?? "").trim();

    if (!countryCodePattern.test(code)) {
      throw new Error(`countryFixtures[${index}].code must be an ISO alpha-2 code.`);
    }

    if (seenCodes.has(code)) {
      throw new Error(`countryFixtures[${index}].code duplicates ${code}.`);
    }

    if (!flagImageUrl.startsWith("https://")) {
      throw new Error(
        `countryFixtures[${index}].flagImageUrl must be an HTTPS URL.`,
      );
    }

    seenCodes.add(code);

    return {
      code,
      flagImageUrl,
    };
  });
};

export const getFlagExtension = ({ contentType, finalUrl }) => {
  const normalizedContentType = normalizeContentType(contentType);
  const extension =
    extensionsByContentType.get(normalizedContentType) ??
    extensionFromUrl(finalUrl);

  if (!extension) {
    throw new Error(
      `Unsupported flag content type "${contentType || "unknown"}" from ${finalUrl}.`,
    );
  }

  return extension;
};

export const toFlagFileName = ({ code, extension }) => {
  const normalizedCode = code.trim().toUpperCase();

  if (!countryCodePattern.test(normalizedCode)) {
    throw new Error(`${code} is not a valid ISO alpha-2 country code.`);
  }

  if (!supportedExtensions.has(extension)) {
    throw new Error(`${extension} is not a supported flag extension.`);
  }

  return `${normalizedCode}${supportedExtensions.get(extension)}`;
};

export const downloadFlagAsset = async ({
  flag,
  fetchImplementation = fetch,
  delayImplementation = wait,
  waitImplementation = delayImplementation,
  maxAttempts = defaultMaxAttempts,
}) => {
  let response;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    response = await fetchImplementation(flag.flagImageUrl, {
      headers: {
        accept: "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.9,*/*;q=0.1",
        "user-agent":
          "country-ranking-flag-downloader/1.0 (https://github.com/openai/country-ranking)",
      },
      redirect: "follow",
    });

    if (!retryableStatuses.has(response.status) || attempt === maxAttempts) {
      break;
    }

    const retryAfterSeconds = Number(response.headers?.get?.("retry-after"));
    const retryDelayMs = Math.min(
      Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds * 1000
        : attempt * 5000,
      maxRetryDelayMs,
    );

    await waitImplementation(retryDelayMs);
  }

  if (!response.ok) {
    throw new Error(
      `${flag.code} flag download failed with HTTP ${response.status} from ${flag.flagImageUrl}.`,
    );
  }

  const contentType = response.headers?.get?.("content-type") ?? "";
  const finalUrl = response.url || flag.flagImageUrl;
  const extension = getFlagExtension({ contentType, finalUrl });
  const fileName = toFlagFileName({ code: flag.code, extension });
  const body = Buffer.from(await response.arrayBuffer());

  if (body.length === 0) {
    throw new Error(`${flag.code} flag download returned an empty response body.`);
  }

  return {
    code: flag.code,
    body,
    contentType: normalizeContentType(contentType),
    fileName,
    publicPath: `/flags/${fileName}`,
    sourceUrl: flag.flagImageUrl,
    finalUrl,
  };
};

const writeFlagFile = async ({ flagsDirectory, asset }) => {
  const destination = path.join(flagsDirectory, asset.fileName);
  const temporaryDestination = `${destination}.tmp`;

  await writeFile(temporaryDestination, asset.body);
  await rename(temporaryDestination, destination);
};

const validateDownloadedAssets = async ({ flagsDirectory, manifest, expectedCodes }) => {
  const manifestCodes = Object.keys(manifest.flags).sort();

  if (JSON.stringify(manifestCodes) !== JSON.stringify([...expectedCodes].sort())) {
    throw new Error("Flag manifest country codes do not match the country catalog.");
  }

  const fileCodes = (await readdir(flagsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.basename(entry.name, path.extname(entry.name)))
    .sort();

  if (JSON.stringify(fileCodes) !== JSON.stringify(manifestCodes)) {
    throw new Error("Downloaded flag files do not match the country catalog.");
  }

  await Promise.all(
    Object.entries(manifest.flags).map(async ([code, publicPath]) => {
      const fileName = path.basename(publicPath);
      const fileStat = await stat(path.join(flagsDirectory, fileName));

      if (!fileStat.isFile() || fileStat.size === 0) {
        throw new Error(`${code} flag asset ${publicPath} is missing or empty.`);
      }
    }),
  );
};

export const downloadCountryFlags = async ({
  countryFixtures: fixtureRecords,
  flagsDirectory = defaultFlagsDirectory,
  manifestPath = defaultManifestPath,
  fetchImplementation = fetch,
  delayImplementation = wait,
  waitImplementation = delayImplementation,
  delayMs = defaultDelayMs,
  now = () => new Date(),
  logger = console,
} = {}) => {
  const catalog = fixtureRecords ?? (await readCountryCatalog());
  const flags = normalizeCountryFlags(catalog);
  const downloadedAssetsBySourceUrl = new Map();
  const manifestFlags = {};
  const failures = [];
  let duplicateSourceCount = 0;
  const stagedFlagsDirectory = `${flagsDirectory}.tmp-${process.pid}-${Date.now()}`;

  await rm(stagedFlagsDirectory, { recursive: true, force: true });
  await mkdir(stagedFlagsDirectory, { recursive: true });
  await mkdir(path.dirname(manifestPath), { recursive: true });

  try {
    for (const flag of flags) {
      try {
        let asset = downloadedAssetsBySourceUrl.get(flag.flagImageUrl);

        if (asset) {
          duplicateSourceCount += 1;
          const fileName = toFlagFileName({
            code: flag.code,
            extension: path.extname(asset.fileName),
          });

          asset = {
            ...asset,
            code: flag.code,
            fileName,
            publicPath: `/flags/${fileName}`,
          };
        } else {
          asset = await downloadFlagAsset({
            flag,
            fetchImplementation,
            waitImplementation,
          });
          downloadedAssetsBySourceUrl.set(flag.flagImageUrl, asset);
        }

        await writeFlagFile({ flagsDirectory: stagedFlagsDirectory, asset });
        manifestFlags[flag.code] = asset.publicPath;
      } catch (error) {
        failures.push(
          `${flag.code}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      if (delayMs > 0) {
        await waitImplementation(delayMs);
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `Failed to download ${failures.length} country flag asset(s):\n${failures.join("\n")}`,
      );
    }

    const manifest = {
      schemaVersion: 1,
      generatedAt: now().toISOString(),
      sourcePolicy,
      flags: Object.fromEntries(
        Object.entries(manifestFlags).sort(([leftCode], [rightCode]) =>
          leftCode.localeCompare(rightCode),
        ),
      ),
    };

    await validateDownloadedAssets({
      flagsDirectory: stagedFlagsDirectory,
      manifest,
      expectedCodes: flags.map((flag) => flag.code),
    });
    await writeFile(`${manifestPath}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`);
    await rm(flagsDirectory, { recursive: true, force: true });
    await rename(stagedFlagsDirectory, flagsDirectory);
    await rename(`${manifestPath}.tmp`, manifestPath);

    logger.log(`Downloaded ${flags.length} country flag asset(s) to ${flagsDirectory}.`);
    logger.log(`Wrote flag asset manifest to ${manifestPath}.`);

    return {
      assetCount: flags.length,
      duplicateSourceCount,
      flagsDirectory,
      manifestPath,
      manifest,
    };
  } catch (error) {
    await rm(stagedFlagsDirectory, { recursive: true, force: true });
    await rm(`${manifestPath}.tmp`, { force: true });
    throw error;
  }
};

export const readCountryCatalog = async ({ catalogPath } = {}) => {
  const source = await readFile(catalogPath ?? defaultCatalogPath, "utf8");
  const executableSource = source
    .replace(/^import type .*;\n/m, "")
    .replace("export const countryFixtures =", "const countryFixtures =")
    .replace(/\]\s+as const satisfies readonly Country\[];\s*$/m, "];")
    .concat("\ncountryFixtures;");

  const catalog = vm.runInNewContext(executableSource, {}, { filename: catalogPath });

  if (!Array.isArray(catalog)) {
    throw new Error(`${catalogPath ?? defaultCatalogPath} did not export a country catalog array.`);
  }

  return catalog;
};

export const runDownloadCountryFlags = async ({
  argv = process.argv.slice(2),
  fetchImplementation = fetch,
  logger = console,
} = {}) => {
  const args = parseArgs(argv);

  if (args.mode === "help") {
    logger.log(usage);
    return;
  }

  await downloadCountryFlags({
    countryFixtures: await readCountryCatalog(),
    delayMs: args.delayMs ?? defaultDelayMs,
    flagsDirectory: args.flagsDirectory,
    manifestPath: args.manifestPath,
    fetchImplementation,
    logger,
  });
};

if (process.argv[1] === new URL(import.meta.url).pathname) {
  runDownloadCountryFlags().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
