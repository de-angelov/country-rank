#!/usr/bin/env node
import { readdir, stat } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";

import { readCountryCatalog } from "../app/countries/redis-catalog.server";
import type { Country } from "../app/countries";
import { readAllCountryVoteTotals } from "../app/votes/storage.server";

type TimedResult<Value> = Readonly<{
  label: string;
  durationMs: number;
  value: Value;
}>;

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

const countryDisplayNameCollator = new Intl.Collator("en", {
  sensitivity: "base",
});

const formatDuration = (durationMs: number) =>
  `${numberFormatter.format(durationMs)}ms`;

async function time<Value>(
  label: string,
  fn: () => Promise<Value>,
): Promise<TimedResult<Value>> {
  const start = performance.now();
  const value = await fn();

  return {
    label,
    durationMs: performance.now() - start,
    value,
  };
}

async function unwrapResult<Value>(
  label: string,
  resultPromise: Promise<{
    isErr: () => boolean;
    error?: { message?: string };
    value?: Value;
  }>,
): Promise<Value> {
  const result = await resultPromise;

  if (result.isErr()) {
    throw new Error(result.error?.message ?? `${label} failed.`);
  }

  return result.value as Value;
}

const joinCatalogAndTotals = (
  catalog: Awaited<ReturnType<typeof readCountryCatalog>> extends {
    value: infer Value;
  }
    ? Value
    : never,
  voteTotalsByCountry: Awaited<
    ReturnType<typeof readAllCountryVoteTotals>
  > extends { value: infer Value }
    ? Value
    : never,
) =>
  catalog.map((profile) => {
    const totals = voteTotalsByCountry.get(profile.code);

    return {
      ...profile,
      likes: totals?.likes ?? 0,
      dislikes: totals?.dislikes ?? 0,
    };
  });

const sortCountriesByDisplayName = (countries: readonly Country[]) =>
  [...countries].sort((left, right) => {
    const nameOrder = countryDisplayNameCollator.compare(
      left.name,
      right.name,
    );

    return nameOrder === 0
      ? left.code.localeCompare(right.code, "en")
      : nameOrder;
  });

async function inspectBuildAssets() {
  const assetsPath = path.resolve("build/client/assets");
  const assets = await readdir(assetsPath).catch(() => []);
  const sizes = await Promise.all(
    assets.map(async (asset) => {
      const assetPath = path.join(assetsPath, asset);
      const assetStat = await stat(assetPath);

      return {
        asset,
        bytes: assetStat.size,
      };
    }),
  );

  return sizes.sort((left, right) => right.bytes - left.bytes).slice(0, 12);
}

async function inspectHttpResponse(appUrl: string) {
  const responseTiming = await time("HTTP GET /", async () => {
    const response = await fetch(appUrl);
    const html = await response.text();

    return {
      status: response.status,
      html,
    };
  });
  const html = responseTiming.value.html;

  return {
    durationMs: responseTiming.durationMs,
    status: responseTiming.value.status,
    htmlBytes: Buffer.byteLength(html),
    countryCards: (html.match(/<article class="/g) ?? []).length,
    images: (html.match(/<img /g) ?? []).length,
    lazyImages: (html.match(/loading="lazy"/g) ?? []).length,
    remoteFlagImages: (html.match(/src="https:\/\/commons\.wikimedia\.org/g) ?? [])
      .length,
    scripts: (html.match(/<script /g) ?? []).length,
    stylesheets: (html.match(/rel="stylesheet"/g) ?? []).length,
    bannerReferences: (html.match(/country-ranking-banner-v7\.png/g) ?? [])
      .length,
  };
}

async function main() {
  const catalogTiming = await time("Redis catalog read", () =>
    unwrapResult("Redis catalog read", readCountryCatalog()),
  );
  const totalsTiming = await time("Redis vote totals read", () =>
    unwrapResult("Redis vote totals read", readAllCountryVoteTotals()),
  );
  const joinTiming = await time("Catalog/totals join", async () =>
    joinCatalogAndTotals(catalogTiming.value, totalsTiming.value),
  );
  const sortTiming = await time("Client-side initial sort equivalent", async () =>
    sortCountriesByDisplayName(joinTiming.value),
  );
  const blankFilterTiming = await time("Blank search filter preparation", async () =>
    sortTiming.value.filter(() => true),
  );
  const buildAssets = await inspectBuildAssets();
  const appUrl = process.env.APP_URL?.trim();
  const http = appUrl ? await inspectHttpResponse(appUrl) : undefined;

  console.log("Home route diagnostic timings");
  console.log(`Countries: ${joinTiming.value.length}`);
  console.log(`Vote total records: ${totalsTiming.value.size}`);
  for (const timing of [
    catalogTiming,
    totalsTiming,
    joinTiming,
    sortTiming,
    blankFilterTiming,
  ]) {
    console.log(`${timing.label}: ${formatDuration(timing.durationMs)}`);
  }

  if (http) {
    console.log(`HTTP GET / status: ${http.status}`);
    console.log(`HTTP GET / response time: ${formatDuration(http.durationMs)}`);
    console.log(`SSR HTML bytes: ${http.htmlBytes}`);
    console.log(`SSR country cards: ${http.countryCards}`);
    console.log(`SSR images: ${http.images}`);
    console.log(`SSR lazy images: ${http.lazyImages}`);
    console.log(`SSR remote flag images: ${http.remoteFlagImages}`);
    console.log(`SSR script tags: ${http.scripts}`);
    console.log(`SSR stylesheet links: ${http.stylesheets}`);
    console.log(`SSR banner references: ${http.bannerReferences}`);
  }

  console.log("Largest build assets");
  for (const { asset, bytes } of buildAssets) {
    console.log(`${asset}: ${bytes} bytes`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => {
  process.exit();
});
