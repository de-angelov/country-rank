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
  const price = match(voteType)
    .with("like", () => "$1")
    .with("dislike", () => "$2")
    .exhaustive();

  return (
    <>
      <DialogHeader>
        <DialogTitle>Confirm vote</DialogTitle>
        <DialogDescription>
          Review your vote before continuing to payment.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <img
            alt={`${countryName} flag`}
            className="h-12 w-16 shrink-0 rounded-base border-2 border-border bg-main object-cover"
            src={intent.country.flagImageUrl}
          />
          <div
            className={cn(
              "inline-flex min-w-0 flex-1 items-center gap-2 rounded-base border-2 border-border px-3 py-2 font-heading text-sm shadow-shadow sm:text-base",
              theme.badgeClassName,
            )}
          >
            <VoteIcon aria-hidden="true" className="size-4" />
            <span className="truncate">
              {voteLabel} {countryName}
            </span>
          </div>
        </div>

        <div className="rounded-base border-2 border-border bg-background p-4 shadow-shadow">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CreditCard
                aria-hidden="true"
                className="size-5 shrink-0 text-muted-foreground"
              />
              <span className="font-heading text-sm text-muted-foreground">
                Price
              </span>
            </div>
            <strong className="font-heading text-xl">{price}</strong>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Pay to submit your vote.
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="neutral">
          Cancel
        </Button>

        <Button type="button" disabled className="min-w-32">
          <CreditCard aria-hidden="true" className="size-4" />
          Pay {price}
        </Button>
      </DialogFooter>
    </>
  );
}
