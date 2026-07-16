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

const visibleText = (html: string) => html.replaceAll("<!-- -->", "");

describe("PaidVoteDialog", () => {
  it("identifies the selected country and like vote", () => {
    const html = renderToString(
      <Dialog open>
        <PaidVoteDialogBody intent={{ country, voteType: "like" }} />
      </Dialog>,
    );
    const text = visibleText(html);

    expect(html).toContain("Confirm paid like for Japan");
    expect(text).toContain("Your like vote for Japan");
    expect(text).toContain("Japan - like");
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

    expect(html).toContain("Confirm paid dislike for Japan");
    expect(text).toContain("Your dislike vote for Japan");
    expect(text).toContain("Japan - dislike");
  });
});
