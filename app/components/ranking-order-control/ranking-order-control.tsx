import { Button } from "~/components/ui/button";
import type { Country } from "~/countries";

export type RankingOrder = "highest-first" | "lowest-first";

const orderOptions = ["highest-first", "lowest-first"] as const;

export function orderRankedCountries(
  countries: readonly Country[],
  order: RankingOrder,
) {
  return order === "highest-first" ? countries : [...countries].reverse();
}

export function RankingOrderControl({
  countLabel,
  order,
  onOrderChange,
}: {
  countLabel: string;
  order: RankingOrder;
  onOrderChange: (nextOrder: RankingOrder) => void;
}) {
  const labels = {
    "highest-first": `Highest ${countLabel} first`,
    "lowest-first": `Lowest ${countLabel} first`,
  } as const;

  return (
    <div className="grid gap-2">
      <span className="font-heading text-sm" id={`${countLabel}-order-label`}>
        Order
      </span>
      <div
        aria-labelledby={`${countLabel}-order-label`}
        className="grid grid-cols-2 gap-2"
        role="group"
      >
        {orderOptions.map((option) => (
          <Button
            aria-pressed={order === option}
            className="min-h-10 min-w-0 whitespace-normal px-3 py-2 leading-tight"
            key={option}
            onClick={() => onOrderChange(option)}
            type="button"
            variant={order === option ? "default" : "neutral"}
          >
            {labels[option]}
          </Button>
        ))}
      </div>
    </div>
  );
}
