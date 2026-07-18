import { useState } from "react";

import type { Country } from "~/countries";
import { cn } from "~/lib/utils";

import {
  PaidVoteCheckoutDialog,
  type VoteIntent,
  type VoteType,
} from "~/components/paid-vote-dialog/paid-vote-dialog";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";

export type CountryCardProps = Readonly<{
  country: Country;
  className?: string;
  includeVoteIconSprite?: boolean;
}>;

const numberFormatter = new Intl.NumberFormat("en-US");
const voteIconSymbolIds = {
  dislike: "country-card-thumbs-down",
  like: "country-card-thumbs-up",
} as const satisfies Record<VoteType, string>;

const styles = {
  article: "grid gap-4 bg-secondary-background p-4",
  header: "grid gap-4 sm:grid-cols-[minmax(7rem,10rem)_1fr] sm:items-center",
  flagFrame:
    "aspect-[4/3] min-h-24 overflow-hidden rounded-base border-2 border-border bg-background sm:min-h-0",
  flagImage: "h-full w-full object-contain",
  textBlock: "min-w-0",
  title: "truncate text-xl font-heading",
  capital: "mt-1 text-sm",
  fact: "mt-2 text-sm text-foreground/75",
  voteSection: "grid gap-3 border-t-2 border-border pt-4",
  voteRatio: "grid gap-2 text-sm",
  voteTotalsRow: "flex items-center justify-between gap-3",
  voteTotalLabel: "inline-flex items-center gap-1 font-heading",
  voteIcon: "size-4 shrink-0",
  actions: "grid grid-cols-2 gap-2",
  voteButton: "min-h-9 min-w-0 px-3",
} as const;

export function CountryCardVoteIconSprite() {
  return (
    <svg
      aria-hidden="true"
      className="absolute size-0 overflow-hidden"
      focusable="false"
    >
      <symbol
        id={voteIconSymbolIds.like}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
        <path d="M7 10v12" />
      </symbol>
      <symbol
        id={voteIconSymbolIds.dislike}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
        <path d="M17 14V2" />
      </symbol>
    </svg>
  );
}

function CountryCardVoteIcon({ voteType }: { voteType: VoteType }) {
  return (
    <svg
      aria-hidden="true"
      className={styles.voteIcon}
      focusable="false"
      viewBox="0 0 24 24"
    >
      <use href={`#${voteIconSymbolIds[voteType]}`} />
    </svg>
  );
}

export function CountryCard({
  country,
  className,
  includeVoteIconSprite = true,
}: CountryCardProps) {
  const [voteIntent, setVoteIntent] = useState<VoteIntent | null>(null);
  const likeCount = numberFormatter.format(country.likes);
  const dislikeCount = numberFormatter.format(country.dislikes);
  const totalVotes = country.likes + country.dislikes;
  const likeRatio = totalVotes === 0 ? 50 : (country.likes / totalVotes) * 100;
  const roundedLikeRatio = totalVotes === 0 ? 0 : Math.round(likeRatio);
  const roundedDislikeRatio = totalVotes === 0 ? 0 : 100 - roundedLikeRatio;
  const openVoteDialog = (voteType: VoteType) => {
    setVoteIntent({ country, voteType });
  };

  return (
    <>
      {includeVoteIconSprite ? <CountryCardVoteIconSprite /> : null}
      <Card asChild>
        <article className={cn(styles.article, className)}>
          <div className={styles.header}>
            <div className={styles.flagFrame}>
              <img
                src={country.flagImageUrl}
                alt={`${country.name} flag`}
                className={styles.flagImage}
                width="320"
                height="240"
                loading="lazy"
              />
            </div>

            <div className={styles.textBlock}>
              <h2 className={styles.title}>{country.name}</h2>
              <p className={styles.capital}>Capital: {country.capital}</p>
              <p className={styles.fact}>
                {country.factSnippet}
              </p>
            </div>
          </div>

          <div className={styles.voteSection}>
            <div
              className={styles.voteRatio}
              role="img"
              aria-label={`${country.name} vote ratio: ${likeCount} likes (${roundedLikeRatio}%) and ${dislikeCount} dislikes (${roundedDislikeRatio}%).`}
            >
              <div className={styles.voteTotalsRow}>
                <span className={styles.voteTotalLabel}>
                  <CountryCardVoteIcon voteType="like" />
                  {likeCount} likes
                </span>
                <span className={styles.voteTotalLabel}>
                  <CountryCardVoteIcon voteType="dislike" />
                  {dislikeCount} dislikes
                </span>
              </div>
              <Progress
                value={likeRatio}
                className="bg-vote-dislike shadow-none"
                indicatorClassName="bg-vote-like transition-none"
                aria-hidden="true"
              />
            </div>

            <div className={styles.actions}>
              <Button
                type="button"
                variant="like"
                size="sm"
                className={styles.voteButton}
                aria-label={`Like ${country.name}`}
                onClick={() => openVoteDialog("like")}
              >
                <CountryCardVoteIcon voteType="like" />
                Like
              </Button>
              <Button
                type="button"
                variant="dislike"
                size="sm"
                className={styles.voteButton}
                aria-label={`Dislike ${country.name}`}
                onClick={() => openVoteDialog("dislike")}
              >
                <CountryCardVoteIcon voteType="dislike" />
                Dislike
              </Button>
            </div>
          </div>
        </article>
      </Card>
      <PaidVoteCheckoutDialog
        intent={voteIntent}
        onOpenChange={(open) => {
          if (!open) {
            setVoteIntent(null);
          }
        }}
      />
    </>
  );
}
