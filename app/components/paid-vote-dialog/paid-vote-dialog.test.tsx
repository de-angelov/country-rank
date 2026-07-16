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
    expect(text).toContain("Confirm vote");
    expect(text).toContain("Review your vote before continuing to payment.");
    expect(text).toContain("Like Japan");
    expect(text).toContain("Price");
    expect(text).toContain("$1");
    expect(text).toContain("Pay to submit your vote.");
    expect(html).toContain('src="https://example.com/japan.svg"');
    expect(html).toContain('alt="Japan flag"');
    expect(html).toContain("bg-vote-like");
    expect(html).toContain("lucide-thumbs-up");
    expect(text).toContain("Pay $1");
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
    expect(text).toContain("Confirm vote");
    expect(text).toContain("Review your vote before continuing to payment.");
    expect(text).toContain("Dislike Japan");
    expect(text).toContain("Price");
    expect(text).toContain("$2");
    expect(text).toContain("Pay to submit your vote.");
    expect(html).toContain('src="https://example.com/japan.svg"');
    expect(html).toContain('alt="Japan flag"');
    expect(html).toContain("bg-vote-dislike");
    expect(html).toContain("lucide-thumbs-down");
    expect(text).toContain("Pay $2");
    expect(html).toContain("disabled");
  });
});
