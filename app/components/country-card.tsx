import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";

import type { Country } from "~/countries";
import { cn } from "~/lib/utils";

import { PaidVoteDialog, type VoteIntent, type VoteType } from "./paid-vote-dialog";
import { Button } from "./ui/button";

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
          "grid gap-4 rounded-base border-2 border-border bg-secondary-background p-4 shadow-shadow sm:grid-cols-[minmax(5rem,7rem)_1fr] sm:items-center",
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
          </div>

          <dl className="grid grid-cols-2 gap-2 text-sm sm:max-w-sm">
            <div className="rounded-base border-2 border-border bg-vote-like p-2 text-main-foreground">
              <dt className="font-heading">Likes</dt>
              <dd>{likeCount}</dd>
            </div>
            <div className="rounded-base border-2 border-border bg-vote-dislike p-2 text-main-foreground">
              <dt className="font-heading">Dislikes</dt>
              <dd>{dislikeCount}</dd>
            </div>
          </dl>

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
