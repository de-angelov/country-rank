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
import styles from "./country-card.module.css";

export type CountryVoteHandler = (country: Country) => void;

export type CountryCardProps = Readonly<{
  country: Country;
  onLikeClick: CountryVoteHandler;
  onDislikeClick: CountryVoteHandler;
  className?: string;
}>;

const numberFormatter = new Intl.NumberFormat("en-US");

export function CountryCard({
  country,
  onLikeClick,
  onDislikeClick,
  className,
}: CountryCardProps) {
  const [voteIntent, setVoteIntent] = useState<VoteIntent | null>(null);
  const likeCount = numberFormatter.format(country.likes);
  const dislikeCount = numberFormatter.format(country.dislikes);
  const totalVotes = country.likes + country.dislikes;
  const likeRatio = totalVotes === 0 ? 50 : (country.likes / totalVotes) * 100;
  const dislikeRatio = totalVotes === 0 ? 50 : 100 - likeRatio;
  const roundedLikeRatio = totalVotes === 0 ? 0 : Math.round(likeRatio);
  const roundedDislikeRatio = totalVotes === 0 ? 0 : 100 - roundedLikeRatio;
  const openVoteDialog = (voteType: VoteType) => {
    setVoteIntent({ country, voteType });

    if (voteType === "like") {
      onLikeClick(country);
      return;
    }

    onDislikeClick(country);
  };

  return (
    <>
      <article
        className={cn(
          styles.card,
          className,
        )}
      >
        <div className={styles.flagFrame}>
          <img
            src={country.flagImageUrl}
            alt={`${country.name} flag`}
            className={styles.flagImage}
            loading="lazy"
          />
        </div>

        <div className={styles.body}>
          <div className={styles.summary}>
            <h2 className={styles.name}>{country.name}</h2>
            <p className={styles.capital}>Capital: {country.capital}</p>
            <p className={styles.fact}>
              {country.factSnippet}
            </p>
          </div>

          <div
            className={styles.voteSummary}
            role="img"
            aria-label={`${country.name} vote ratio: ${likeCount} likes (${roundedLikeRatio}%) and ${dislikeCount} dislikes (${roundedDislikeRatio}%).`}
          >
            <div className={styles.voteLabels}>
              <span className={styles.voteLabel}>
                <ThumbsUp aria-hidden="true" className={styles.voteIcon} />
                {likeCount} likes
              </span>
              <span className={styles.voteLabel}>
                <ThumbsDown aria-hidden="true" className={styles.voteIcon} />
                {dislikeCount} dislikes
              </span>
            </div>
            <div className={styles.voteBar}>
              <div
                className={styles.likeBar}
                style={{ width: `${likeRatio}%` }}
                aria-hidden="true"
              />
              <div
                className={styles.dislikeBar}
                style={{ width: `${dislikeRatio}%` }}
                aria-hidden="true"
              />
            </div>
          </div>

          <div className={styles.actions}>
            <Button
              type="button"
              variant="like"
              aria-label={`Like ${country.name}`}
              onClick={() => openVoteDialog("like")}
            >
              <ThumbsUp aria-hidden="true" />
              Like
            </Button>
            <Button
              type="button"
              variant="dislike"
              aria-label={`Dislike ${country.name}`}
              onClick={() => openVoteDialog("dislike")}
            >
              <ThumbsDown aria-hidden="true" />
              Dislike
            </Button>
          </div>
        </div>
      </article>
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
