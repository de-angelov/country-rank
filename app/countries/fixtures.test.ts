import { describe, expect, it } from "vitest";

import { countryFixtures } from "./fixtures";

describe("countryFixtures", () => {
  it("provides a focused placeholder set for manual ranking flows", () => {
    expect(countryFixtures.length).toBeGreaterThanOrEqual(10);
    expect(countryFixtures.length).toBeLessThanOrEqual(20);
  });

  it("uses stable unique uppercase country codes", () => {
    const codes = countryFixtures.map((country) => country.code);

    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((code) => /^[A-Z]{2}$/.test(code))).toBe(true);
  });

  it("includes complete data with remote flag image URLs", () => {
    for (const country of countryFixtures) {
      expect(country.name).not.toBe("");
      expect(country.capital).not.toBe("");
      expect(country.factSnippet.trim()).not.toBe("");
      expect(country.factSnippet.length).toBeLessThanOrEqual(80);
      expect(country.likes).toBeGreaterThanOrEqual(0);
      expect(country.dislikes).toBeGreaterThanOrEqual(0);

      const flagUrl = new URL(country.flagImageUrl);
      expect(flagUrl.protocol).toBe("https:");
      expect(flagUrl.hostname).toBe("commons.wikimedia.org");
    }
  });

  it("gives every country a distinct fact snippet", () => {
    const snippets = countryFixtures.map((country) => country.factSnippet);

    expect(new Set(snippets).size).toBe(snippets.length);
  });

  it("varies vote totals enough to manually verify liked and disliked rankings", () => {
    const likeTotals = new Set(countryFixtures.map((country) => country.likes));
    const dislikeTotals = new Set(
      countryFixtures.map((country) => country.dislikes),
    );

    expect(likeTotals.size).toBeGreaterThan(1);
    expect(dislikeTotals.size).toBeGreaterThan(1);
  });
});
