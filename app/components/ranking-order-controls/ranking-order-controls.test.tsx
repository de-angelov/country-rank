import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

import {
  RankingOrderControls,
  type RankingOrder,
  updateRankingOrderWithTransition,
} from "./ranking-order-controls";

const getButtonClassName = (html: string, ariaLabel: string) => {
  const buttonTag = html.match(
    new RegExp(`<button[^>]*aria-label="${ariaLabel}"[^>]*>`),
  )?.[0];

  expect(buttonTag).toBeDefined();

  return buttonTag?.match(/class="([^"]*)"/)?.[1] ?? "";
};

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

  it("renders the selected order button with the yellow accent highlight", () => {
    const html = renderToString(
      <RankingOrderControls
        currentOrder="highest-first"
        highestFirstLabel="Highest first"
        lowestFirstLabel="Lowest first"
        onOrderChange={vi.fn()}
      />,
    );

    const selectedClassName = getButtonClassName(html, "Highest first");
    const idleClassName = getButtonClassName(html, "Lowest first");

    expect(selectedClassName).toContain("bg-accent-highlight");
    expect(selectedClassName).toContain("text-foreground");
    expect(idleClassName).toContain("bg-secondary-background");
    expect(idleClassName).not.toContain("bg-accent-highlight");
  });
});
