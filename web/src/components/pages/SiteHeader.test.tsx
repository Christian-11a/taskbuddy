import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GET_APP_HREF } from "@/lib/getApp";
import { SiteHeader } from "./SiteHeader";

describe("SiteHeader", () => {
  it("points every primary button at Get the app and has no Join/Sign in links", () => {
    render(<SiteHeader />);
    const links = screen.getAllByRole("link", { name: "Get the app" });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute("href", GET_APP_HREF);
    expect(screen.queryByText(/join taskbuddy|sign in|log in/i)).toBeNull();
  });
});
