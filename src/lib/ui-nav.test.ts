import { describe, expect, it } from "vitest";
import { shouldShowBottomNav } from "./ui-nav";

const base = {
  pathname: "/",
  hydrated: true,
  booting: false,
  hasFailedMatch: false,
  statusCode: 200,
};

describe("shouldShowBottomNav", () => {
  it("never renders on the server pass, so hydration trees match", () => {
    expect(shouldShowBottomNav({ ...base, hydrated: false })).toBe(false);
  });

  it("hides the nav on the auth page", () => {
    expect(shouldShowBottomNav({ ...base, pathname: "/auth" })).toBe(false);
    expect(shouldShowBottomNav({ ...base, pathname: "/auth/callback" })).toBe(false);
  });

  it("hides the nav while the route is still loading", () => {
    expect(shouldShowBottomNav({ ...base, booting: true })).toBe(false);
  });

  it("hides the nav on error and not-found screens", () => {
    expect(shouldShowBottomNav({ ...base, hasFailedMatch: true })).toBe(false);
    expect(shouldShowBottomNav({ ...base, statusCode: 404 })).toBe(false);
  });

  it("shows the nav on a ready authenticated page", () => {
    expect(shouldShowBottomNav({ ...base, pathname: "/students" })).toBe(true);
  });
});
