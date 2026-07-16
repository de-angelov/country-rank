import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PaidVoteDialogBody } from "./paid-vote-dialog";
import { Dialog } from "~/components/ui/dialog";

const country = {
  code: "JP",
  name: "Japan",
  capital: "Tokyo",
  flagImageUrl: "https://example.com/japan.svg",
  likes: 1234,
  dislikes: 56,
};

const visibleText = (html: string) =>
  html.replaceAll("<!-- -->", "").replace(/<[^>]*>/g, "");

describe("PaidVoteDialog", () => {
  it("identifies the selected country and like vote", () => {
    const html = renderToString(
      <Dialog open>
        <PaidVoteDialogBody intent={{ country, voteType: "like" }} />
      </Dialog>,
    );
    const text = visibleText(html);

    expect(html).toContain('data-slot="dialog-title"');
    expect(text).toContain("Confirm your like");
    expect(text).toContain("Review your vote before continuing to payment.");
    expect(text).toContain("Japan");
    expect(text).toContain("Like");
    expect(text).toContain("Payment required: A like costs $1");
    expect(text).toContain(
      "Your vote will be submitted immediately after payment is completed.",
    );
    expect(html).toContain('src="https://example.com/japan.svg"');
    expect(html).toContain('alt="Japan flag"');
    expect(html).toContain("bg-vote-like");
    expect(html).toContain("lucide-thumbs-up");
    expect(html).toContain("Payment coming soon");
    expect(html).toContain("disabled");
  });

  it("identifies the selected country and dislike vote", () => {
    const html = renderToString(
      <Dialog open>
        <PaidVoteDialogBody intent={{ country, voteType: "dislike" }} />
      </Dialog>,
    );
    const text = visibleText(html);

    expect(html).toContain('data-slot="dialog-title"');
    expect(text).toContain("Confirm your dislike");
    expect(text).toContain("Review your vote before continuing to payment.");
    expect(text).toContain("Japan");
    expect(text).toContain("Dislike");
    expect(text).toContain("Payment required: A dislike costs $2");
    expect(text).toContain(
      "Your vote will be submitted immediately after payment is completed.",
    );
    expect(html).toContain('src="https://example.com/japan.svg"');
    expect(html).toContain('alt="Japan flag"');
    expect(html).toContain("bg-vote-dislike");
    expect(html).toContain("lucide-thumbs-down");
    expect(html).toContain("Payment coming soon");
    expect(html).toContain("disabled");
  });
});
