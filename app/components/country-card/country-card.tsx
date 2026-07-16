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
      <Card asChild>
        <article
          className={cn(
            "grid gap-4 bg-secondary-background p-4 sm:grid-cols-[minmax(5rem,7rem)_1fr] sm:items-center",
            className,
          )}
        >
          <div className="aspect-[4/3] overflow-hidden rounded-base border-2 border-border bg-background">
            <img
              src={country.flagImageUrl}
              alt={`${country.name} flag`}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>

          <div className="grid min-w-0 gap-4">
            <div className="min-w-0">
              <h2 className="truncate text-xl font-heading">{country.name}</h2>
              <p className="mt-1 text-sm">Capital: {country.capital}</p>
              <p className="mt-2 text-sm text-foreground/75">
                {country.factSnippet}
              </p>
            </div>

            <div
              className="grid gap-2 text-sm sm:max-w-sm"
              role="img"
              aria-label={`${country.name} vote ratio: ${likeCount} likes (${roundedLikeRatio}%) and ${dislikeCount} dislikes (${roundedDislikeRatio}%).`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1 font-heading">
                  <ThumbsUp aria-hidden="true" className="size-4" />
                  {likeCount} likes
                </span>
                <span className="inline-flex items-center gap-1 font-heading">
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

            <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
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
