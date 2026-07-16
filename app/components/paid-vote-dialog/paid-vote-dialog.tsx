import { CreditCard, ThumbsDown, ThumbsUp } from "lucide-react";
import { match } from "ts-pattern";

import type { Country } from "~/countries";
import { cn } from "~/lib/utils";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

export type VoteType = "like" | "dislike";

export type VoteIntent = Readonly<{
  country: Country;
  voteType: VoteType;
}>;

export type PaidVoteDialogProps = Readonly<{
  intent: VoteIntent | null;
  onOpenChange: (open: boolean) => void;
}>;

const voteTypeLabels: Record<VoteType, string> = {
  dislike: "Dislike",
  like: "Like",
};

const voteTypeThemes = {
  dislike: {
    Icon: ThumbsDown,
    badgeClassName: "bg-vote-dislike text-main-foreground",
  },
  like: {
    Icon: ThumbsUp,
    badgeClassName: "bg-vote-like text-main-foreground",
  },
} satisfies Record<
  VoteType,
  Readonly<{
    Icon: typeof ThumbsUp;
    badgeClassName: string;
  }>
>;

export function PaidVoteDialog({
  intent,
  onOpenChange,
}: PaidVoteDialogProps) {
  return (
    <Dialog open={intent !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {intent ? <PaidVoteDialogBody intent={intent} /> : null}
      </DialogContent>
    </Dialog>
  );
}

export function PaidVoteDialogBody({
  intent,
}: {
  intent: VoteIntent;
}) {
  const countryName = intent.country.name;
  const voteType = intent.voteType;
  const voteLabel = voteTypeLabels[voteType];
  const theme = voteTypeThemes[voteType];
  const VoteIcon = theme.Icon;

  const title = match(voteType)
    .with("like", () => `Confirm your like`)
    .with("dislike", () => `Confirm your dislike`)
    .exhaustive();

 return (
  <>
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>
        Review your vote before continuing to payment.
      </DialogDescription>
    </DialogHeader>

    <div className="overflow-hidden rounded-base border-2 border-border bg-background">
      {/* Vote summary */}
      <div className="flex items-center gap-4 p-4">
        <img
          alt={`${countryName} flag`}
          className="h-14 w-20 shrink-0 rounded-base border-2 border-border bg-main object-cover"
          src={intent.country.flagImageUrl}
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-heading">{countryName}</p>

          <div
            className={cn(
              "mt-2 inline-flex items-center gap-2 rounded-base border-2 border-border px-3 py-1.5 text-sm font-heading",
              theme.badgeClassName,
            )}
          >
            <VoteIcon aria-hidden="true" className="size-4" />
            {voteLabel}
          </div>
        </div>
      </div>

      <div className="border-t-2 border-border bg-muted/40 p-4">
        <div className="flex items-start gap-3">
          <CreditCard
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-muted-foreground"
          />

          <div className="flex-1">
            <strong className="font-heading mt-2 text-sm text-muted-foreground">
              {voteType === "like"
                ? "Payment required: A like costs $1"
                : "Payment required: A dislike costs $2"}
            </strong>

            <p className="mt-1 text-sm text-muted-foreground">
              Your vote will be submitted immediately after payment is completed.
            </p>
          </div>
        </div>
      </div>
    </div>

    <DialogFooter>
      <Button type="button" variant="neutral">
        Cancel
      </Button>

      <Button type="button" disabled className="min-w-44">
        <CreditCard aria-hidden="true" className="size-4" />
        Payment coming soon
      </Button>
    </DialogFooter>
  </>
);
}