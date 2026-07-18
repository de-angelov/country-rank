import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type RankingOrder,
  updateRankingOrderWithTransition,
} from "./ranking-order-controls";

describe("updateRankingOrderWithTransition", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("updates the ranking order without a view transition when unsupported", () => {
    const setRankingOrder =
      vi.fn<(nextRankingOrder: RankingOrder) => void>();

    vi.stubGlobal("document", {});
    vi.stubGlobal("window", {
      matchMedia: vi.fn(() => ({ matches: false })),
    });

    updateRankingOrderWithTransition(
      "highest-first",
      "lowest-first",
      setRankingOrder,
    );

    expect(setRankingOrder).toHaveBeenCalledWith("lowest-first");
  });

  it("updates the ranking order inside a view transition when supported", () => {
    const setRankingOrder =
      vi.fn<(nextRankingOrder: RankingOrder) => void>();
    const startViewTransition = vi.fn((updateCallback: () => void) => {
      updateCallback();
    });

    vi.stubGlobal("document", { startViewTransition });
    vi.stubGlobal("window", {
      matchMedia: vi.fn(() => ({ matches: false })),
    });

    updateRankingOrderWithTransition(
      "highest-first",
      "lowest-first",
      setRankingOrder,
    );

    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(setRankingOrder).toHaveBeenCalledWith("lowest-first");
  });

  it("skips view transitions for reduced-motion users", () => {
    const setRankingOrder =
      vi.fn<(nextRankingOrder: RankingOrder) => void>();
    const startViewTransition = vi.fn((updateCallback: () => void) => {
      updateCallback();
    });

    vi.stubGlobal("document", { startViewTransition });
    vi.stubGlobal("window", {
      matchMedia: vi.fn(() => ({ matches: true })),
    });

    updateRankingOrderWithTransition(
      "highest-first",
      "lowest-first",
      setRankingOrder,
    );

    expect(startViewTransition).not.toHaveBeenCalled();
    expect(setRankingOrder).toHaveBeenCalledWith("lowest-first");
  });

  it("ignores clicks for the current ranking order without updating or transitioning", () => {
    const setRankingOrder =
      vi.fn<(nextRankingOrder: RankingOrder) => void>();
    const startViewTransition = vi.fn((updateCallback: () => void) => {
      updateCallback();
    });

    vi.stubGlobal("document", { startViewTransition });
    vi.stubGlobal("window", {
      matchMedia: vi.fn(() => ({ matches: false })),
    });

    updateRankingOrderWithTransition(
      "highest-first",
      "highest-first",
      setRankingOrder,
    );

    expect(startViewTransition).not.toHaveBeenCalled();
    expect(setRankingOrder).not.toHaveBeenCalled();
  });
});
