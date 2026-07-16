import { CreditCard } from "lucide-react";
import { match } from "ts-pattern";

import type { Country } from "~/countries";

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
  dislike: "dislike",
  like: "like",
};

export function PaidVoteDialog({
  intent,
  onOpenChange,
}: PaidVoteDialogProps) {
  const open = intent !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{intent ? <PaidVoteDialogBody intent={intent} /> : null}</DialogContent>
    </Dialog>
  );
}

export function PaidVoteDialogBody({ intent }: { intent: VoteIntent }) {
  const countryName = intent?.country.name ?? "this country";
  const voteType = intent?.voteType ?? "like";
  const voteLabel = voteTypeLabels[voteType];
  const title = match(voteType)
    .with("like", () => `Confirm paid like for ${countryName}`)
    .with("dislike", () => `Confirm paid dislike for ${countryName}`)
    .exhaustive();

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          Your {voteLabel} vote for {countryName} will be submitted after
          payment is connected.
        </DialogDescription>
      </DialogHeader>

      <div className="rounded-base border-2 border-border bg-background p-4">
        <p className="text-sm font-heading">Selected vote</p>
        <p className="mt-1 text-base">
          {countryName} - {voteLabel}
        </p>
      </div>

      <DialogFooter>
        <Button type="button" variant="neutral" disabled>
          <CreditCard aria-hidden="true" />
          Payment coming soon
        </Button>
      </DialogFooter>
    </>
  );
}
