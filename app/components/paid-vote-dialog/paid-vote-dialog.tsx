import { type FormEvent, useState } from "react";
import { CreditCard, Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import { match } from "ts-pattern";

import type { Country } from "~/countries";
import { cn } from "~/lib/utils";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
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

type CheckoutFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type CheckoutResponse = Readonly<{
  ok: boolean;
  data?: Readonly<{
    checkoutUrl?: unknown;
  }>;
  error?: Readonly<{
    message?: unknown;
  }>;
}>;

const checkoutAction = "/checkout";

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

const styles = {
  dialogContent: "sm:max-w-md",
  voteSummary: "space-y-3",
  voteSummaryRow: "flex items-center gap-3",
  flagImage:
    "h-12 w-16 shrink-0 rounded-base border-2 border-border bg-main object-cover",
  voteBadge:
    "inline-flex min-w-0 flex-1 items-center gap-2 rounded-base border-2 border-border px-3 py-2 font-heading text-sm shadow-shadow sm:text-base",
  voteBadgeIcon: "size-4",
  voteBadgeText: "truncate",
  paymentCard:
    "rounded-base border-2 border-border bg-background p-4 shadow-shadow",
  paymentRow: "flex items-center justify-between gap-4",
  paymentLabel: "flex items-center gap-3",
  paymentIcon: "size-5 shrink-0 text-muted-foreground",
  paymentText: "font-heading text-sm text-muted-foreground",
  paymentPrice: "font-heading text-xl",
  paymentDescription: "mt-2 text-sm text-muted-foreground",
  checkoutError:
    "rounded-base border-2 border-border bg-vote-dislike px-3 py-2 text-sm font-bold text-main-foreground",
  payButton: "min-w-32",
  payButtonIcon: "size-4",
} as const;

const fallbackCheckoutError =
  "We couldn't start checkout. Try again, or reload the page.";

export async function requestPaidVoteCheckout(
  intent: VoteIntent,
  fetchCheckout: CheckoutFetch = fetch,
): Promise<string> {
  const response = await fetchCheckout(checkoutAction, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      countryCode: intent.country.code,
      voteType: intent.voteType,
    }),
  });
  const body = (await response.json().catch(() => undefined)) as
    | CheckoutResponse
    | undefined;
  const checkoutUrl = body?.data?.checkoutUrl;

  if (response.ok && body?.ok === true && typeof checkoutUrl === "string") {
    return checkoutUrl;
  }

  const serverMessage = body?.error?.message;

  if (typeof serverMessage === "string" && serverMessage.trim().length > 0) {
    throw new Error(serverMessage);
  }

  throw new Error(fallbackCheckoutError);
}

export function PaidVoteDialog({
  intent,
  onOpenChange,
}: PaidVoteDialogProps) {
  return (
    <Dialog open={intent !== null} onOpenChange={onOpenChange}>
      <DialogContent className={styles.dialogContent}>
        {intent === null ? null : <PaidVoteDialogBody intent={intent} />}
      </DialogContent>
    </Dialog>
  );
}

export function PaidVoteDialogBody({
  intent,
}: {
  intent: VoteIntent;
}) {
  const [isCheckoutPending, setIsCheckoutPending] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const countryName = intent.country.name;
  const voteType = intent.voteType;
  const voteLabel = voteTypeLabels[voteType];
  const theme = voteTypeThemes[voteType];
  const VoteIcon = theme.Icon;
  const price = match(voteType)
    .with("like", () => "$1")
    .with("dislike", () => "$2")
    .exhaustive();
  const payLabel = isCheckoutPending ? "Continuing..." : `Pay ${price}`;

  const submitCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCheckoutPending(true);
    setCheckoutError(null);

    try {
      const checkoutUrl = await requestPaidVoteCheckout(intent);
      window.location.assign(checkoutUrl);
    } catch (error) {
      setCheckoutError(
        error instanceof Error ? error.message : fallbackCheckoutError,
      );
      setIsCheckoutPending(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Confirm vote</DialogTitle>
        <DialogDescription>
          Review your vote before continuing to payment.
        </DialogDescription>
      </DialogHeader>

      <form action={checkoutAction} method="post" onSubmit={submitCheckout}>
        <input type="hidden" name="countryCode" value={intent.country.code} />
        <input type="hidden" name="voteType" value={voteType} />

        <div className={styles.voteSummary}>
          <div className={styles.voteSummaryRow}>
            <img
              alt={`${countryName} flag`}
              className={styles.flagImage}
              src={intent.country.flagImageUrl}
            />
            <div className={cn(styles.voteBadge, theme.badgeClassName)}>
              <VoteIcon aria-hidden="true" className={styles.voteBadgeIcon} />
              <span className={styles.voteBadgeText}>
                {voteLabel} {countryName}
              </span>
            </div>
          </div>

          <div className={styles.paymentCard}>
            <div className={styles.paymentRow}>
              <div className={styles.paymentLabel}>
                <CreditCard aria-hidden="true" className={styles.paymentIcon} />
                <span className={styles.paymentText}>Price</span>
              </div>
              <strong className={styles.paymentPrice}>{price}</strong>
            </div>
            <p className={styles.paymentDescription}>
              Pay to submit your vote.
            </p>
          </div>

          {checkoutError === null ? null : (
            <p className={styles.checkoutError} role="alert">
              {checkoutError}
            </p>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="neutral" disabled={isCheckoutPending}>
              Cancel
            </Button>
          </DialogClose>

          <Button
            type="submit"
            disabled={isCheckoutPending}
            className={styles.payButton}
            aria-busy={isCheckoutPending}
          >
            {isCheckoutPending ? (
              <Loader2 aria-hidden="true" className={styles.payButtonIcon} />
            ) : (
              <CreditCard aria-hidden="true" className={styles.payButtonIcon} />
            )}
            {payLabel}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
