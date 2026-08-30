import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { sampleThesis } from "@/lib/sample-data";
import { MorningThesis } from "./MorningThesis";

describe("MorningThesis", () => {
  it("renders the sample headline and an accessible conviction score", () => {
    render(<MorningThesis thesis={sampleThesis} />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      sampleThesis.headline,
    );
    const score = screen.getByRole("progressbar");
    expect(score.getAttribute("aria-valuenow")).toBe(
      String(sampleThesis.conviction),
    );
    expect(screen.getByText(/SAMPLE SNAPSHOT/)).toBeTruthy();
  });
});
