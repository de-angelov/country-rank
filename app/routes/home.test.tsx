import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HomeContent } from "./home";

describe("Home", () => {
  it("renders the minimal country ranking placeholder", () => {
    const html = renderToString(<HomeContent />);

    expect(html).toContain("Country Ranking");
    expect(html).toContain("React Router is ready");
  });
});
