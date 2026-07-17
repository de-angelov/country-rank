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
SELECT ?country ?iso ?countryLabel ?capitalLabel ?flag ?continentLabel ?officialLanguageLabel ?currencyLabel WHERE {
  ?country wdt:P297 ?iso.
  OPTIONAL { ?country wdt:P36 ?capital. }
  OPTIONAL { ?country wdt:P41 ?flag. }
  OPTIONAL { ?country wdt:P30 ?continent. }
  OPTIONAL { ?country wdt:P37 ?officialLanguage. }
  OPTIONAL { ?country wdt:P38 ?currency. }
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
export const countrySnippetMaxLength = 190;

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

const curatedCountryFactSnippets = new Map([
  [
    "AE",
    "Gulf federation of desert cities and ports shaped by Bedouin heritage, oil wealth, global aviation, finance, and ambitious urban design.",
  ],
  [
    "AU",
    "Island-continent of vast deserts, reefs, and coastal cities shaped by First Nations cultures, migration, mining, science, and Pacific ties.",
  ],
  [
    "BR",
    "Atlantic giant spanning Amazon rainforest, cerrado, and megacities, with Portuguese colonial roots, Afro-Indigenous cultures, agribusiness, music, and football.",
  ],
  [
    "CA",
    "Northern federation of forests, prairies, Arctic coast, and multicultural cities shaped by Indigenous nations, French and British legacies, energy, and technology.",
  ],
  [
    "DE",
    "Central European power of rivers, forests, and industrial cities, marked by reunification, federal states, engineering, philosophy, music, and export manufacturing.",
  ],
  [
    "EG",
    "Nile crossroads linking Africa and the Middle East, known for ancient kingdoms, Arab culture, Suez trade, desert landscapes, and dense urban life.",
  ],
  [
    "IN",
    "South Asian subcontinent of monsoon plains, Himalayan frontiers, and crowded megacities, shaped by ancient civilizations, many languages, technology, cinema, and democracy.",
  ],
  [
    "IS",
    "North Atlantic island of glaciers, volcanoes, sagas, and geothermal towns, with a small Nordic society known for fisheries, energy, and design.",
  ],
  [
    "IT",
    "Mediterranean peninsula of Alps, islands, and historic city-states, renowned for Roman heritage, Catholic influence, regional cuisine, fashion, design, and manufacturing.",
  ],
  [
    "JP",
    "Pacific archipelago of mountains, dense cities, and coastal plains, blending imperial traditions, Shinto and Buddhist heritage, precision manufacturing, pop culture, and high-speed rail.",
  ],
  [
    "MX",
    "North American bridge of deserts, highlands, and Pacific-Caribbean coasts, shaped by Indigenous civilizations, Spanish colonial cities, manufacturing, foodways, and migration.",
  ],
  [
    "ZA",
    "Southern African crossroads of coasts, plateau, and mining cities, defined by diverse nations, anti-apartheid history, constitutional democracy, wine, finance, and wildlife tourism.",
  ],
]);

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

const toSnippetText = (value) => value.replaceAll(".", "");

const normalizedSnippetText = (value) =>
  value.toLocaleLowerCase("en").replace(/[^a-z]/g, "");

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isCountryNameEcho = ({ country, value }) => {
  const countryName = normalizedSnippetText(toDisplayCountryName(country));
  const candidate = normalizedSnippetText(value);

  return countryName.length > 0 && candidate.includes(countryName);
};

const stripCountryNamePrefix = ({ country, value }) => {
  const displayName = toDisplayCountryName(country);
  const prefixPattern = new RegExp(`^${escapeRegExp(displayName)}\\s+`, "i");

  return value.replace(prefixPattern, "").trim();
};

const toProfilePart = (value) =>
  toSnippetText(value)
    .replace(/^the\s+/i, "")
    .replace(/\s+region$/i, "")
    .trim();

const toReadableRegion = (country) => {
  const rawRegion =
    country.subregion || country.region || country.continents?.[0] || "its region";
  const region = isCountryNameEcho({ country, value: rawRegion })
    ? rawRegion === "Antarctica"
      ? "Antarctic"
      : "regional"
    : toProfilePart(rawRegion);

  return region || "regional";
};

const toCapitalDetail = (country) => {
  const primaryCapital = toSnippetText(toPrimaryCapital(country.capital));

  if (
    primaryCapital &&
    primaryCapital !== "Unknown" &&
    !primaryCapital.startsWith("Q") &&
    !isCountryNameEcho({ country, value: primaryCapital })
  ) {
    return `${primaryCapital}-centered`;
  }

  return "locally administered";
};

const toLanguageDetail = (country) => {
  const language =
    country.languages?.[0] &&
    !isCountryNameEcho({ country, value: country.languages[0] })
      ? toProfilePart(country.languages[0])
      : "";

  if (language) {
    return `${language}-speaking institutions`;
  }

  return "multilingual communities";
};

const toCurrencyDetail = (country) => {
  const strippedCurrency = country.currencies?.[0]
    ? stripCountryNamePrefix({ country, value: country.currencies[0] })
    : "";
  const currency =
    strippedCurrency && !isCountryNameEcho({ country, value: strippedCurrency })
      ? toProfilePart(strippedCurrency)
      : "";

  if (currency) {
    return `${currency}-based markets`;
  }

  return "service and trade networks";
};

const toBorderDetail = (country) => {
  if (Number.isInteger(country.borderCount) && country.borderCount > 0) {
    return `${country.borderCount} land neighbor${
      country.borderCount === 1 ? "" : "s"
    }`;
  }

  if (country.landlocked === false) {
    return "maritime routes";
  }

  return "regional routes";
};

const profileTextures = [
  "a compact civic profile",
  "a trade-focused outlook",
  "a layered local identity",
  "a distinctive diplomatic role",
  "a resilient island-facing culture",
  "a metropolitan public life",
  "a crossroads economy",
];

const toProfileTexture = (country) =>
  profileTextures[
    (country.code.charCodeAt(0) * 3 + country.code.charCodeAt(1) * 5) %
      profileTextures.length
  ];

const toSentenceCase = (value) => `${value[0].toUpperCase()}${value.slice(1)}`;

export const createCountryFactSnippet = (country) => {
  const curatedSnippet = curatedCountryFactSnippets.get(country.code);

  if (curatedSnippet) {
    return curatedSnippet;
  }

  const region = toReadableRegion(country);
  const geography =
    country.landlocked === true
      ? `landlocked ${region}`
      : country.landlocked === false
        ? `coastal ${region}`
        : `${region}`;
  const capitalDetail = toCapitalDetail(country);
  const languageDetail = toLanguageDetail(country);
  const currencyDetail = toCurrencyDetail(country);
  const borderDetail = toBorderDetail(country);
  const profileTexture = toProfileTexture(country);
  const variant =
    country.code.charCodeAt(0) + country.code.charCodeAt(1) + country.name.length;
  const candidates = [
    `${capitalDetail} ${geography} profile shaped by ${languageDetail}, ${currencyDetail}, ${borderDetail}, and ${profileTexture}.`,
    `${geography[0].toUpperCase()}${geography.slice(1)} setting with ${capitalDetail} civic life, ${languageDetail}, ${currencyDetail}, ${borderDetail}, and ${profileTexture}.`,
    `${capitalDetail} society in ${region}, balancing ${languageDetail}, ${currencyDetail}, ${borderDetail}, and ${profileTexture}.`,
  ];

  const orderedCandidates = [
    candidates[variant % candidates.length],
    ...candidates,
  ];
  const snippet = orderedCandidates.find(
    (candidate) => candidate.length <= countrySnippetMaxLength,
  );

  if (!snippet) {
    throw new Error(`${country.code} is missing a compact profile summary.`);
  }

  return toSentenceCase(snippet);
};

export const addCountryFactSnippets = (countries) =>
  countries.map(
    ({
      region,
      subregion,
      continents,
      landlocked,
      borderCount,
      languages,
      currencies,
      ...country
    }) => ({
      ...country,
      factSnippet: createCountryFactSnippet({
        ...country,
        region,
        subregion,
        continents,
        landlocked,
        borderCount,
        languages,
        currencies,
      }),
    }),
  );

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
    const continent = optionalBindingValue(binding, "continentLabel");
    const officialLanguage = optionalBindingValue(
      binding,
      "officialLanguageLabel",
    );
    const currency = optionalBindingValue(binding, "currencyLabel");
    const existing = metadataByCode.get(code) ?? {
      capitals: [],
      flagImageUrls: [],
      continents: [],
      languages: [],
      currencies: [],
    };

    existing.capitals.push(capital);
    existing.flagImageUrls.push(flagImageUrl);
    existing.continents.push(continent);
    existing.languages.push(officialLanguage);
    existing.currencies.push(currency);
    metadataByCode.set(code, existing);
  });

  return new Map(
    [...metadataByCode.entries()]
      .map(([code, metadata]) => [
        code,
        {
          capital: uniqueSorted(metadata.capitals).join(", "),
          flagImageUrl: uniqueSorted(metadata.flagImageUrls)[0] ?? "",
          continents: uniqueSorted(metadata.continents),
          languages: uniqueSorted(metadata.languages),
          currencies: uniqueSorted(metadata.currencies),
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
      capital: metadata?.capital || "Unknown",
      flagImageUrl,
      continents: metadata?.continents ?? [],
      languages: metadata?.languages ?? [],
      currencies: metadata?.currencies ?? [],
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
