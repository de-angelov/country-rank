import { useId } from "react";
import { flushSync } from "react-dom";
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";

import { Button } from "~/components/ui/button";
import type { Country } from "~/countries";

export type RankingOrder = "highest-first" | "lowest-first";

type RankingOrderOption = Readonly<{
  order: RankingOrder;
  label: string;
}>;

export function orderRankedCountries(
  countries: readonly Country[],
  order: RankingOrder,
) {
  return order === "highest-first" ? countries : [...countries].reverse();
}

type RankingViewTransitionDocument = Document & {
  startViewTransition?: (updateCallback: () => void) => unknown;
};

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function updateRankingOrderWithTransition(
  currentOrder: RankingOrder,
  nextOrder: RankingOrder,
  setRankingOrder: (nextOrder: RankingOrder) => void,
) {
  if (nextOrder === currentOrder) {
    return;
  }

  const shouldReduceMotion = prefersReducedMotion();
  const canStartViewTransition =
    typeof document !== "undefined" &&
    !shouldReduceMotion &&
    (document as RankingViewTransitionDocument).startViewTransition !==
      undefined;

  if (!canStartViewTransition) {
    setRankingOrder(nextOrder);
    return;
  }

  (document as RankingViewTransitionDocument).startViewTransition?.(() => {
    flushSync(() => setRankingOrder(nextOrder));
  });
}

export function RankingOrderControls({
  currentOrder,
  highestFirstLabel,
  lowestFirstLabel,
  onOrderChange,
}: {
  currentOrder: RankingOrder;
  highestFirstLabel: string;
  lowestFirstLabel: string;
  onOrderChange: (order: RankingOrder) => void;
}) {
  const labelId = useId();
  const options: readonly RankingOrderOption[] = [
    { order: "highest-first", label: highestFirstLabel },
    { order: "lowest-first", label: lowestFirstLabel },
  ];

  return (
    <div className="grid gap-2 md:justify-self-end">
      <p className="font-heading text-sm" id={labelId}>
        Ranking order
      </p>
      <div
        aria-labelledby={labelId}
        className="flex w-fit gap-2"
        role="group"
      >
        {options.map((option) => {
          const isSelected = option.order === currentOrder;
          const Icon =
            option.order === "highest-first"
              ? ArrowDownWideNarrow
              : ArrowUpNarrowWide;

          return (
            <Button
              aria-label={option.label}
              aria-pressed={isSelected}
              className="size-10 shadow-shadow"
              key={option.order}
              onClick={() => onOrderChange(option.order)}
              size="icon"
              title={option.label}
              type="button"
              variant={isSelected ? "default" : "neutral"}
            >
              <Icon aria-hidden="true" className="size-5" />
              <span className="sr-only">{option.label}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
