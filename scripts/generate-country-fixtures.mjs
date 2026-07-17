#!/usr/bin/env node
/* global console, process, fetch */
import { writeFile } from "node:fs/promises";
import { fileURLToPath, URLSearchParams } from "node:url";

export const wikidataSparqlEndpoint = "https://query.wikidata.org/sparql";
export const isoCountryListEndpoint =
  "https://datahub.io/core/country-list/_r/-/data.csv";

// Sources: DataHub's ISO 3166-1 country-list CSV supplies the current official
// short names and alpha-2 codes. Wikidata Query Service enriches those records
// with capital (P36) and Commons flag image (P41), joined by alpha-2 code (P297).
export const countryMetadataQuery = `
SELECT ?country ?iso ?countryLabel ?capitalLabel ?flag WHERE {
  ?country wdt:P297 ?iso.
  OPTIONAL { ?country wdt:P36 ?capital. }
  OPTIONAL { ?country wdt:P41 ?flag. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
`;

const usage = `Usage:
  npm run generate:country-fixtures -- --output app/countries/generated-country-fixtures.json
  npm run --silent generate:country-fixtures

Behavior:
  Fetches ISO country names/codes from DataHub and capital/flag metadata from
  Wikidata Query Service, then writes deterministic JSON fixture metadata sorted
  by ISO 3166-1 alpha-2 code.
`;

const countryCodePattern = /^[A-Z]{2}$/;
export const countrySnippetMaxLength = 80;

const displayNameOverrides = new Map([
  ["AE", "United Arab Emirates"],
  ["AX", "Aland Islands"],
  ["BL", "Saint Barthelemy"],
  ["BO", "Bolivia"],
  ["BQ", "Bonaire and friends"],
  ["CC", "Cocos Islands"],
  ["CD", "D.R. Congo"],
  ["CI", "Cote d'Ivoire"],
  ["CW", "Curacao"],
  ["DO", "Dominican Republic"],
  ["FK", "Falklands"],
  ["FM", "Micronesia"],
  ["GB", "United Kingdom"],
  ["GS", "South Georgia"],
  ["HM", "Heard and McDonald Islands"],
  ["IO", "British Indian Ocean Territory"],
  ["IR", "Iran"],
  ["KP", "North Korea"],
  ["KR", "South Korea"],
  ["LA", "Laos"],
  ["MD", "Moldova"],
  ["MP", "Northern Marianas"],
  ["NL", "Netherlands"],
  ["PH", "Philippines"],
  ["PS", "Palestine"],
  ["RE", "Reunion"],
  ["RU", "Russia"],
  ["SH", "Saint Helena"],
  ["SJ", "Svalbard"],
  ["ST", "Sao Tome and Principe"],
  ["SX", "Sint Maarten"],
  ["SY", "Syria"],
  ["TC", "Turks and Caicos"],
  ["TF", "French Southern Lands"],
  ["TR", "Turkiye"],
  ["TW", "Taiwan"],
  ["TZ", "Tanzania"],
  ["UM", "U.S. Outlying Islands"],
  ["US", "United States"],
  ["VA", "Vatican City"],
  ["VE", "Venezuela"],
  ["VG", "British Virgin Islands"],
  ["VI", "U.S. Virgin Islands"],
  ["VN", "Vietnam"],
  ["WF", "Wallis and Futuna"],
  ["YT", "Mayotte"],
  ["ZA", "South Africa"],
]);

const snippetThemes = [
  "postcard mischief",
  "market-day color",
  "harbor breeze",
  "mountain-map energy",
  "sunny cafe plans",
  "flag-quiz flair",
  "passport-stamp drama",
  "rain-or-shine charm",
  "airport-layover dreams",
  "capital-city cameos",
  "island-hop plans",
  "snack-stop curiosity",
];

const compareText = (left, right) => left.localeCompare(right, "en");

const uniqueSorted = (values) =>
  [...new Set(values.filter((value) => value.length > 0))].sort(compareText);

const requiredBindingValue = ({ binding, fieldName, rowIndex }) => {
  const value = binding[fieldName]?.value?.trim();

  if (!value) {
    throw new Error(`Wikidata row ${rowIndex} is missing ${fieldName}.`);
  }

  return value;
};

const optionalBindingValue = (binding, fieldName) =>
  binding[fieldName]?.value?.trim() ?? "";

const toHttpsUrl = (value) => {
  if (!value) {
    return "";
  }

  if (value.startsWith("http://")) {
    return `https://${value.slice("http://".length)}`;
  }

  return value;
};

const toDerivedCommonsFlagUrl = (countryName) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
    `Flag of ${countryName}.svg`,
  )}`;

const toDisplayCountryName = ({ code, name }) =>
  displayNameOverrides.get(code) ??
  name
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s*\[[^\]]*]/g, "")
    .replace(/\*$/g, "")
    .replace(/^(.+), State of$/, "$1")
    .replace(/^(.+), the United Republic of$/, "$1")
    .replace(/^(.+), Sint Eustatius and Saba$/, "$1")
    .replace(/\s+/g, " ")
    .trim();

const toPrimaryCapital = (capital) => capital.split(",")[0]?.trim() ?? "";

const countrySnippetTheme = (countryCode) =>
  snippetThemes[
    (countryCode.charCodeAt(0) * 7 + countryCode.charCodeAt(1) * 11) %
      snippetThemes.length
  ];

export const createCountryFactSnippet = (country) => {
  const displayName = toDisplayCountryName(country);
  const capital = toPrimaryCapital(country.capital);
  const theme = countrySnippetTheme(country.code);
  const candidates =
    capital && capital !== "Unknown" && !capital.startsWith("Q")
      ? [
          `${displayName}: ${capital} brings ${theme}.`,
          `${displayName}: ${capital} has ${theme}.`,
          `${displayName}: ${theme} from the atlas.`,
          `${country.code}: ${theme} from the atlas.`,
        ]
      : [
          `${displayName}: world-map tiny print with ${theme}.`,
          `${displayName}: ${theme} from the atlas.`,
          `${country.code}: ${theme} from the atlas.`,
        ];

  const snippet = candidates.find(
    (candidate) => candidate.length <= countrySnippetMaxLength,
  );

  if (!snippet) {
    throw new Error(`${country.code} is missing a short fact snippet.`);
  }

  return snippet;
};

export const addCountryFactSnippets = (countries) =>
  countries.map((country) => ({
    ...country,
    factSnippet: createCountryFactSnippet(country),
  }));

export const parseArgs = (argv) => {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { mode: "help" };
  }

  const outputIndex = argv.indexOf("--output");

  if (outputIndex === -1) {
    return { mode: "stdout" };
  }

  const outputPath = argv[outputIndex + 1]?.trim();

  if (!outputPath || outputPath.startsWith("-")) {
    throw new Error("--output requires a file path.");
  }

  if (argv.filter((arg) => arg === "--output").length > 1) {
    throw new Error("--output can only be provided once.");
  }

  return { mode: "file", outputPath };
};

const parseCountryCode = ({ code, path }) => {
  const normalizedCode = code?.trim().toUpperCase() ?? "";

  if (!countryCodePattern.test(normalizedCode)) {
    throw new Error(`${path} must be a two-letter ISO country code.`);
  }

  return normalizedCode;
};

export const parseCsvRows = (csv) => {
  const rows = [];
  let row = [];
  let field = "";
  let isQuoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const nextChar = csv[index + 1];

    if (isQuoted) {
      if (char === '"' && nextChar === '"') {
        field += '"';
        index += 1;
        continue;
      }

      if (char === '"') {
        isQuoted = false;
        continue;
      }

      field += char;
      continue;
    }

    if (char === '"') {
      isQuoted = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
};

export const normalizeIsoCountryListCsv = (csv) => {
  const rows = parseCsvRows(csv);
  const [header, ...countries] = rows;

  if (header?.[0] !== "Name" || header?.[1] !== "Code") {
    throw new Error("ISO country list CSV must start with Name,Code.");
  }

  return countries
    .filter((row) => row.some((field) => field.trim().length > 0))
    .map(([nameValue, codeValue], index) => {
      const rowNumber = index + 2;
      const name = nameValue?.trim() ?? "";
      const code = parseCountryCode({
        code: codeValue,
        path: `ISO country list row ${rowNumber}.Code`,
      });

      if (!name) {
        throw new Error(
          `ISO country list row ${rowNumber}.Name must be a non-empty string.`,
        );
      }

      return {
        code,
        name,
      };
    })
    .sort((left, right) => left.code.localeCompare(right.code));
};

export const normalizeWikidataMetadataBindings = (bindings) => {
  const metadataByCode = new Map();

  bindings.forEach((binding, rowIndex) => {
    const code = parseCountryCode({
      code: requiredBindingValue({
        binding,
        fieldName: "iso",
        rowIndex,
      }),
      path: `Wikidata row ${rowIndex}.iso`,
    });
    const capital = optionalBindingValue(binding, "capitalLabel");
    const flagImageUrl = toHttpsUrl(optionalBindingValue(binding, "flag"));
    const existing = metadataByCode.get(code) ?? {
      capitals: [],
      flagImageUrls: [],
    };

    existing.capitals.push(capital);
    existing.flagImageUrls.push(flagImageUrl);
    metadataByCode.set(code, existing);
  });

  return new Map(
    [...metadataByCode.entries()]
      .map(([code, metadata]) => [
        code,
        {
          capital: uniqueSorted(metadata.capitals).join(", "),
          flagImageUrl: uniqueSorted(metadata.flagImageUrls)[0] ?? "",
        },
      ])
      .sort(([leftCode], [rightCode]) => leftCode.localeCompare(rightCode)),
  );
};

export const mergeCountryFixtureSources = ({ countries, metadataByCode }) =>
  countries.map((country) => {
    const metadata = metadataByCode.get(country.code);
    const flagImageUrl =
      metadata?.flagImageUrl || toDerivedCommonsFlagUrl(country.name);

    if (!flagImageUrl.startsWith("https://")) {
      throw new Error(`${country.code} is missing an HTTPS flag image URL.`);
    }

    return {
      ...country,
      capital: metadata?.capital ?? "",
      flagImageUrl,
    };
  });

export const normalizeWikidataBindings = (bindings) => {
  const countriesByCode = new Map();

  bindings.forEach((binding, rowIndex) => {
    const code = parseCountryCode({
      code: requiredBindingValue({
        binding,
        fieldName: "iso",
        rowIndex,
      }),
      path: `Wikidata row ${rowIndex}.iso`,
    });
    const name = requiredBindingValue({
      binding,
      fieldName: "countryLabel",
      rowIndex,
    });
    const capital = optionalBindingValue(binding, "capitalLabel");
    const flagImageUrl = toHttpsUrl(optionalBindingValue(binding, "flag"));

    const existing = countriesByCode.get(code) ?? {
      code,
      names: [],
      capitals: [],
      flagImageUrls: [],
    };

    existing.names.push(name);
    existing.capitals.push(capital);
    existing.flagImageUrls.push(flagImageUrl);
    countriesByCode.set(code, existing);
  });

  return [...countriesByCode.values()]
    .map((country) => {
      const names = uniqueSorted(country.names);
      const capitals = uniqueSorted(country.capitals);
      const flagImageUrls = uniqueSorted(country.flagImageUrls);

      if (!names[0]) {
        throw new Error(`${country.code} is missing a country name.`);
      }

      const flagImageUrl = flagImageUrls[0] ?? toDerivedCommonsFlagUrl(names[0]);

      if (!flagImageUrl.startsWith("https://")) {
        throw new Error(`${country.code} is missing an HTTPS flag image URL.`);
      }

      return {
        code: country.code,
        name: names[0],
        capital: capitals.join(", "),
        flagImageUrl,
      };
    })
    .sort((left, right) => left.code.localeCompare(right.code));
};

export const readIsoCountries = async ({
  endpoint = isoCountryListEndpoint,
  fetchImplementation = fetch,
} = {}) => {
  const response = await fetchImplementation(endpoint, {
    headers: {
      accept: "text/csv",
      "user-agent": "country-ranking-fixture-generator/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`ISO country list query failed with HTTP ${response.status}.`);
  }

  return normalizeIsoCountryListCsv(await response.text());
};

export const readWikidataCountryMetadata = async ({
  endpoint = wikidataSparqlEndpoint,
  fetchImplementation = fetch,
} = {}) => {
  const response = await fetchImplementation(endpoint, {
    method: "POST",
    headers: {
      accept: "application/sparql-results+json",
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "country-ranking-fixture-generator/1.0",
    },
    body: new URLSearchParams({
      query: countryMetadataQuery,
      format: "json",
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Wikidata country metadata query failed with HTTP ${response.status}.`,
    );
  }

  const data = await response.json();

  if (!Array.isArray(data?.results?.bindings)) {
    throw new Error("Wikidata response did not include result bindings.");
  }

  return normalizeWikidataMetadataBindings(data.results.bindings);
};

export const readWikidataCountryFixtures = async ({
  fetchImplementation = fetch,
} = {}) => {
  const [countries, metadataByCode] = await Promise.all([
    readIsoCountries({ fetchImplementation }),
    readWikidataCountryMetadata({ fetchImplementation }),
  ]);

  return addCountryFactSnippets(
    mergeCountryFixtureSources({ countries, metadataByCode }),
  );
};

export const serializeCountryFixtures = (countries) =>
  `${JSON.stringify(countries, null, 2)}\n`;

export const runGenerateCountryFixtures = async ({
  argv = process.argv.slice(2),
  fetchImplementation = fetch,
  logger = console,
} = {}) => {
  const args = parseArgs(argv);

  if (args.mode === "help") {
    logger.log(usage);
    return;
  }

  const countries = await readWikidataCountryFixtures({ fetchImplementation });
  const serialized = serializeCountryFixtures(countries);

  if (args.mode === "file") {
    await writeFile(args.outputPath, serialized);
    logger.log(`Wrote ${countries.length} country fixture record(s).`);
    return;
  }

  logger.log(serialized.trimEnd());
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runGenerateCountryFixtures().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
