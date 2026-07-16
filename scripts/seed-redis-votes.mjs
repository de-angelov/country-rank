#!/usr/bin/env node
/* global Buffer, URL, console, process */
import { readFile } from "node:fs/promises";

import { createClient } from "redis";
import ts from "typescript";

const redisUrlEnvVar = "REDIS_URL";
const fixtureUrl = new URL("../app/countries/fixtures.ts", import.meta.url);

const usage = `Usage:
  REDIS_URL=redis://localhost:6379 npm run seed:redis:votes

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
      !Number.isInteger(country.likes) ||
      !Number.isInteger(country.dislikes)
    ) {
      throw new Error(
        "Country fixtures must include two-letter codes and integer vote totals.",
      );
    }
  }
};

const voteTotalsKey = (countryCode) => `country:votes:${countryCode}`;

const seedVoteTotals = async ({ redisUrl, countryFixtures }) => {
  const client = createClient({ url: redisUrl });

  await client.connect();

  try {
    for (const country of countryFixtures) {
      await client.hSet(voteTotalsKey(country.code), {
        likes: country.likes.toString(),
        dislikes: country.dislikes.toString(),
      });
    }
  } finally {
    await client.close();
  }
};

const main = async () => {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(usage);
    return;
  }

  const redisUrl = requireRedisUrl(process.env);
  const countryFixtures = await loadCountryFixtures();

  assertSeedableCountryFixtures(countryFixtures);

  await seedVoteTotals({ redisUrl, countryFixtures });

  console.log(`Seeded ${countryFixtures.length} Redis country vote total(s).`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
