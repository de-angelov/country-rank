import { useId } from "react";

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
    <div className="grid gap-2">
      <p className="font-heading text-sm" id={labelId}>
        Ranking order
      </p>
      <div
        aria-labelledby={labelId}
        className="flex flex-wrap gap-2"
        role="group"
      >
        {options.map((option) => {
          const isSelected = option.order === currentOrder;

          return (
            <Button
              aria-pressed={isSelected}
              key={option.order}
              onClick={() => onOrderChange(option.order)}
              type="button"
              variant={isSelected ? "default" : "neutral"}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
