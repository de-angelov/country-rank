import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("vote request route", () => {
  it("does not expose the unpaid direct vote route module", async () => {
    const { default: routes } = await import("~/routes");
    const registeredRoutes = JSON.stringify(routes);

    expect(registeredRoutes).not.toContain('"path":"votes"');
    expect(registeredRoutes).not.toContain("routes/votes.ts");
    expect(
      existsSync(resolve(process.cwd(), "app/routes/votes.ts")),
    ).toBe(false);
  });
});
