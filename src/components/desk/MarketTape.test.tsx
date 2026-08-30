import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { sampleMarketPoints } from "@/lib/sample-data";
import { MarketTape } from "./MarketTape";

describe("MarketTape", () => {
  it("renders every typed market point as sample data", () => {
    render(<MarketTape points={sampleMarketPoints} />);

    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(
      sampleMarketPoints.length,
    );
    expect(screen.getByText("NASDAQ")).toBeTruthy();
    expect(screen.getByText("17,863.23")).toBeTruthy();
  });

  it("makes a stale quote visible in text", () => {
    render(<MarketTape points={sampleMarketPoints} />);

    const stalePoint = screen.getByText("USD/KRW").closest("li");
    expect(stalePoint?.textContent).toContain("STALE");
    expect(stalePoint?.className).toContain("status-stale");
  });
});
