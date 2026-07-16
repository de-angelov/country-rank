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
import styles from "./paid-vote-dialog.module.css";

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

const voteTypeThemes = {
  dislike: {
    Icon: ThumbsDown,
    className: styles.dislike,
  },
  like: {
    Icon: ThumbsUp,
    className: styles.like,
  },
} satisfies Record<
  VoteType,
  Readonly<{
    Icon: typeof ThumbsUp;
    className: string;
  }>
>;

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
  const flagAltText = `${countryName} flag`;
  const voteType = intent?.voteType ?? "like";
  const voteLabel = voteTypeLabels[voteType];
  const title = match(voteType)
    .with("like", () => `Confirm paid like for ${countryName}`)
    .with("dislike", () => `Confirm paid dislike for ${countryName}`)
    .exhaustive();
  const theme = voteTypeThemes[voteType];
  const VoteIcon = theme.Icon;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          Your {voteLabel} vote for {countryName} will be submitted after
          payment is connected.
        </DialogDescription>
      </DialogHeader>

      <div
        className={cn(
          styles.selectedVote,
          theme.className,
        )}
      >
        <VoteIcon aria-hidden="true" className={styles.voteIcon} />
        <img
          alt={flagAltText}
          className={styles.flag}
          src={intent.country.flagImageUrl}
        />
        <div className={styles.selectionText}>
          <p className={styles.selectionEyebrow}>Selected vote</p>
          <p className={styles.selectionValue}>
            <strong>{countryName}</strong> - {voteLabel}
          </p>
        </div>
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
