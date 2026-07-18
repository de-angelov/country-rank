import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { fontMetricStableClassName, links, RootErrorPage } from "./root";

const visibleText = (html: string) => html.replaceAll("<!-- -->", "");

describe("root error boundary", () => {
  it("uses the global font metric stabilization class for document text", () => {
    expect(fontMetricStableClassName).toBe("font-metric-stable");
  });

  it("preloads the primary Geist subsets used by initial page text", () => {
    expect(links()).toEqual([
      expect.objectContaining({
        rel: "preload",
        href: expect.stringContaining("geist-latin-wght-normal.woff2"),
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      }),
      expect.objectContaining({
        rel: "preload",
        href: expect.stringContaining("geist-latin-ext-wght-normal.woff2"),
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      }),
    ]);
  });

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
