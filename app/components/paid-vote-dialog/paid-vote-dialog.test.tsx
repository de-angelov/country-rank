import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  PaidVoteDialog,
  PaidVoteDialogBody,
  requestPaidVoteCheckout,
} from "./paid-vote-dialog";
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
  it("does not render the dialog body when the vote intent is null", () => {
    const html = renderToString(
      <PaidVoteDialog intent={null} onOpenChange={() => undefined} />,
    );
    const text = visibleText(html);

    expect(text).not.toContain("Confirm vote");
    expect(text).not.toContain("Review your vote before continuing to payment.");
    expect(text).not.toContain("Pay to submit your vote.");
    expect(text).not.toContain("Pay $1");
    expect(text).not.toContain("Pay $2");
  });

  it("renders Cancel as the dialog close action while Pay submits checkout", () => {
    const html = renderToString(
      <Dialog open>
        <PaidVoteDialogBody intent={{ country, voteType: "like" }} />
      </Dialog>,
    );
    const text = visibleText(html);

    expect(text).toContain("Cancel");
    expect(html).toContain('data-slot="dialog-close"');
    expect(text).toContain("Pay $1");
    expect(html).toContain('action="/checkout"');
    expect(html).toContain('method="post"');
    expect(html).toContain('name="countryCode"');
    expect(html).toContain('value="JP"');
    expect(html).toContain('name="voteType"');
    expect(html).toContain('value="like"');
    expect(html).toContain('type="submit"');
    expect(html).not.toContain("Continuing...");
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain('role="alert"');
  });

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
    expect(html).toContain('name="countryCode"');
    expect(html).toContain('value="JP"');
    expect(html).toContain('name="voteType"');
    expect(html).toContain('value="like"');
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
    expect(html).toContain('name="countryCode"');
    expect(html).toContain('value="JP"');
    expect(html).toContain('name="voteType"');
    expect(html).toContain('value="dislike"');
  });

  it("requests a Stripe Checkout URL for the selected paid vote", async () => {
    const fetchCheckout = vi.fn(() =>
      Promise.resolve(
        Response.json({
          ok: true,
          data: {
            checkoutUrl: "https://checkout.stripe.test/session/ui",
          },
        }),
      ),
    );

    await expect(
      requestPaidVoteCheckout(
        { country, voteType: "dislike" },
        fetchCheckout,
      ),
    ).resolves.toBe("https://checkout.stripe.test/session/ui");

    expect(fetchCheckout).toHaveBeenCalledWith(
      "/checkout",
      expect.objectContaining({
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
      }),
    );
    expect(JSON.parse(fetchCheckout.mock.calls[0]?.[1]?.body as string)).toEqual(
      {
        countryCode: "JP",
        voteType: "dislike",
      },
    );
  });

  it("surfaces checkout creation failures without returning a redirect URL", async () => {
    const fetchCheckout = vi.fn(() =>
      Promise.resolve(
        Response.json(
          {
            ok: false,
            error: {
              message: "Stripe checkout request payload is invalid.",
            },
          },
          { status: 400 },
        ),
      ),
    );

    await expect(
      requestPaidVoteCheckout({ country, voteType: "like" }, fetchCheckout),
    ).rejects.toThrow("Stripe checkout request payload is invalid.");
  });
});
