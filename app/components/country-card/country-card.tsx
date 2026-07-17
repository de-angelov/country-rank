import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";

import type { Country } from "~/countries";
import { cn } from "~/lib/utils";

import {
  PaidVoteDialog,
  type VoteIntent,
  type VoteType,
} from "~/components/paid-vote-dialog/paid-vote-dialog";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";

export type CountryCardProps = Readonly<{
  country: Country;
  className?: string;
}>;

const numberFormatter = new Intl.NumberFormat("en-US");

const styles = {
  article: "grid gap-4 bg-secondary-background p-4",
  header: "grid gap-4 sm:grid-cols-[minmax(5rem,7rem)_1fr] sm:items-center",
  flagFrame:
    "aspect-[4/3] overflow-hidden rounded-base border-2 border-border bg-background",
  flagImage: "h-full w-full object-cover",
  textBlock: "min-w-0",
  title: "truncate text-xl font-heading",
  capital: "mt-1 text-sm",
  fact: "mt-2 text-sm text-foreground/75",
  voteSection: "grid gap-3 border-t-2 border-border pt-4",
  voteRatio: "grid gap-2 text-sm",
  voteTotalsRow: "flex items-center justify-between gap-3",
  voteTotalLabel: "inline-flex items-center gap-1 font-heading",
  actions: "grid grid-cols-2 gap-2",
  voteButton: "min-h-9 min-w-0 px-3",
} as const;

export function CountryCard({
  country,
  className,
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
      <Card asChild>
        <article className={cn(styles.article, className)}>
          <div className={styles.header}>
            <div className={styles.flagFrame}>
              <img
                src={country.flagImageUrl}
                alt={`${country.name} flag`}
                className={styles.flagImage}
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
                  <ThumbsUp aria-hidden="true" className="size-4" />
                  {likeCount} likes
                </span>
                <span className={styles.voteTotalLabel}>
                  <ThumbsDown aria-hidden="true" className="size-4" />
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
                <ThumbsUp aria-hidden="true" />
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
                <ThumbsDown aria-hidden="true" />
                Dislike
              </Button>
            </div>
          </div>
        </article>
      </Card>
      <PaidVoteDialog
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
