#!/usr/bin/env node
/* global Buffer, URL, console, process */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { createClient } from "redis";
import ts from "typescript";

const redisUrlEnvVar = "REDIS_URL";
const fixtureUrl = new URL("../app/countries/fixtures.ts", import.meta.url);

const usage = `Usage:
  REDIS_URL=redis://localhost:4000 npm run redis:seed

Environment:
  REDIS_URL    Redis connection URL.
`;

const requireRedisUrl = (env) => {
  const redisUrl = env[redisUrlEnvVar]?.trim();

  if (!redisUrl) {
    throw new Error(`${redisUrlEnvVar} must be set to seed Redis vote totals.`);
  }

  return redisUrl;
};

const loadCountryFixtures = async () => {
  const source = await readFile(fixtureUrl, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "fixtures.ts",
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(
    transpiled.outputText,
  ).toString("base64")}`;
  const fixturesModule = await import(moduleUrl);

  return fixturesModule.countryFixtures;
};

const assertSeedableCountryFixtures = (countryFixtures) => {
  if (!Array.isArray(countryFixtures)) {
    throw new Error("Country fixtures must export an array.");
  }

  for (const country of countryFixtures) {
    if (
      typeof country?.code !== "string" ||
      !/^[A-Z]{2}$/.test(country.code) ||
      typeof country.name !== "string" ||
      typeof country.capital !== "string" ||
      typeof country.factSnippet !== "string" ||
      typeof country.flagImageUrl !== "string" ||
      !Number.isInteger(country.likes) ||
      !Number.isInteger(country.dislikes)
    ) {
      throw new Error(
        "Country fixtures must include metadata, two-letter codes, and integer vote totals.",
      );
    }
  }
};

export const countryCatalogKey = "country:catalog";
export const countryVoteLikesKey = "country:votes:likes";
export const countryVoteDislikesKey = "country:votes:dislikes";

const legacyCountryVoteTotalsKey = (countryCode) => `country:votes:${countryCode}`;

const toCountryCatalogRecord = ({
  code,
  name,
  capital,
  factSnippet,
  flagImageUrl,
}) => ({
  code,
  name,
  capital,
  factSnippet,
  flagImageUrl,
});

const serializeCountryCatalog = (countryFixtures) =>
  JSON.stringify(countryFixtures.map(toCountryCatalogRecord));

const toVoteHash = (countryFixtures, voteType) =>
  Object.fromEntries(
    countryFixtures.map((country) => [country.code, country[voteType].toString()]),
  );

const toRefreshedVoteKeys = (countryFixtures) => [
  countryVoteLikesKey,
  countryVoteDislikesKey,
  ...countryFixtures.map((country) => legacyCountryVoteTotalsKey(country.code)),
];

export const seedRedisCountryData = async ({
  redisUrl,
  countryFixtures,
  clientFactory = createClient,
}) => {
  const client = clientFactory({ url: redisUrl });

  await client.connect();

  try {
    await client.set(countryCatalogKey, serializeCountryCatalog(countryFixtures));
    await client.del(toRefreshedVoteKeys(countryFixtures));
    await client.hSet(countryVoteLikesKey, toVoteHash(countryFixtures, "likes"));
    await client.hSet(
      countryVoteDislikesKey,
      toVoteHash(countryFixtures, "dislikes"),
    );
  } finally {
    await client.close();
  }
};

export const runSeedRedisVotes = async ({
  argv = process.argv.slice(2),
  env = process.env,
  logger = console,
  countryFixtureLoader = loadCountryFixtures,
  clientFactory = createClient,
} = {}) => {
  if (argv.includes("--help") || argv.includes("-h")) {
    logger.log(usage);
    return;
  }

  const redisUrl = requireRedisUrl(env);
  const countryFixtures = await countryFixtureLoader();

  assertSeedableCountryFixtures(countryFixtures);

  await seedRedisCountryData({ redisUrl, countryFixtures, clientFactory });

  logger.log(
    `Seeded Redis country catalog and aggregate vote totals for ${countryFixtures.length} country record(s).`,
  );
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSeedRedisVotes().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
