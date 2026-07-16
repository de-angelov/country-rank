import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RootErrorPage } from "./root";

const visibleText = (html: string) => html.replaceAll("<!-- -->", "");

describe("root error boundary", () => {
  it("renders friendly generic error copy", () => {
    const html = renderToString(
      <RootErrorPage error={new Error("Redis connection failed")} />,
    );
    const text = visibleText(html);

    expect(text).toContain("Something went wrong");
    expect(text).toContain("Back to countries");
    expect(html).toContain("border-2");
    expect(html).toContain("shadow-shadow");
  });

  it("renders distinct not-found copy for 404 route errors", () => {
    const html = renderToString(
      <RootErrorPage
        error={{
          status: 404,
          statusText: "Not Found",
          data: null,
          internal: false,
        }}
      />,
    );
    const text = visibleText(html);

    expect(text).toContain("Page not found");
    expect(text).toContain("The requested page could not be found.");
  });
});
