import { describe, expect, it } from "vitest";

import { loader } from "./health";

const readJson = async (response: Response) =>
  (await response.json()) as unknown;

describe("health route", () => {
  it("returns a stable ok response", async () => {
    const response = loader();

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ status: "ok" });
  });
});
