import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  handlePaidVoteDialogOpenChange,
  PaidVoteDialogContent,
} from "./paid-vote-dialog";
import { Dialog } from "~/components/ui/dialog";

const visibleText = (html: string) =>
  html.replaceAll("<!-- -->", "").replace(/<[^>]*>/g, "");

describe("PaidVoteDialog", () => {
  it("renders an applied paid vote with country, vote type, and updated totals", () => {
    const html = renderToString(
      <Dialog open>
        <PaidVoteDialogContent
          status={{
            status: "applied",
            country: { name: "Japan" },
            voteType: "like",
            totals: {
              likes: 1235,
              dislikes: 56,
            },
          }}
        />
      </Dialog>,
    );
    const text = visibleText(html);

    expect(text).toContain("Paid vote applied");
    expect(text).toContain("Your like vote for Japan was applied.");
    expect(text).toContain("Updated totals for Japan");
    expect(text).toContain("Likes");
    expect(text).toContain("1,235");
    expect(text).toContain("Dislikes");
    expect(text).toContain("56");
    expect(html).toContain("lucide-circle-check");
    expect(html).toContain("bg-vote-like");
    expect(text).toContain("Close");
    expect(html).toContain('data-slot="dialog-close"');
  });

  it("renders an applied dislike paid vote distinctly", () => {
    const html = renderToString(
      <Dialog open>
        <PaidVoteDialogContent
          status={{
            status: "applied",
            country: { name: "Brazil" },
            voteType: "dislike",
            totals: {
              likes: 10,
              dislikes: 2,
            },
          }}
        />
      </Dialog>,
    );
    const text = visibleText(html);

    expect(text).toContain("Your dislike vote for Brazil was applied.");
    expect(text).toContain("Updated totals for Brazil");
    expect(text).toContain("10");
    expect(text).toContain("2");
  });

  it("renders a pending paid vote without claiming the vote was applied", () => {
    const html = renderToString(
      <Dialog open>
        <PaidVoteDialogContent status={{ status: "pending" }} />
      </Dialog>,
    );
    const text = visibleText(html);

    expect(text).toContain("Paid vote pending");
    expect(text).toContain("We are still confirming your payment.");
    expect(text).toContain("Your vote has not been applied yet.");
    expect(text).toContain("Check again shortly");
    expect(text).not.toContain("Paid vote applied");
    expect(text).not.toContain("Updated totals");
    expect(html).toContain("lucide-clock-3");
  });

  it("renders an invalid-session state without claiming the vote was applied", () => {
    const html = renderToString(
      <Dialog open>
        <PaidVoteDialogContent status={{ status: "invalid" }} />
      </Dialog>,
    );
    const text = visibleText(html);

    expect(text).toContain("Paid vote not found");
    expect(text).toContain(
      "We could not match this checkout session to a paid vote.",
    );
    expect(text).toContain("unrecognized");
    expect(text).toContain("failed");
    expect(text).not.toContain("Paid vote applied");
    expect(text).not.toContain("Updated totals");
    expect(html).toContain("lucide-circle-alert");
    expect(html).toContain("bg-vote-dislike");
  });

  it("calls the close callback when the dialog is closed", () => {
    const onClose = vi.fn();

    handlePaidVoteDialogOpenChange(false, onClose);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call the close callback when the dialog remains open", () => {
    const onClose = vi.fn();

    handlePaidVoteDialogOpenChange(true, onClose);

    expect(onClose).not.toHaveBeenCalled();
  });
});
