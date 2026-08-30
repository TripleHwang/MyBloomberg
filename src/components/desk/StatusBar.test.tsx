import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { sampleDeskStatus } from "@/lib/sample-data";
import { StatusBar } from "./StatusBar";

describe("StatusBar", () => {
  it("states that scaffold values are stale sample data", () => {
    render(<StatusBar status={sampleDeskStatus} />);

    expect(screen.getByText("STALE DATA")).toBeTruthy();
    expect(screen.getByText(/NOT LIVE QUOTES/)).toBeTruthy();
    expect(screen.getByText(sampleDeskStatus.reportId)).toBeTruthy();
  });
});
