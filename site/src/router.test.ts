import { describe, expect, it } from "vitest";
import { matchRoute } from "./router.js";

describe("matchRoute", () => {
  it("maps every page", () => {
    expect(matchRoute("/")).toEqual({ page: "landing" });
    expect(matchRoute("/dev")).toEqual({ page: "developer" });
    expect(matchRoute("/guide")).toEqual({ page: "guide" });
    expect(matchRoute("/terms")).toEqual({ page: "terms" });
    expect(matchRoute("/small")).toEqual({ page: "small" });
  });

  it("maps the recipes, components, classes and categories", () => {
    expect(matchRoute("/recipes")).toEqual({ page: "recipes" });
    expect(matchRoute("/recipes/poker-night")).toEqual({ page: "recipe", slug: "poker-night" });
    expect(matchRoute("/components")).toEqual({ page: "components" });
    expect(matchRoute("/components/card-deck")).toEqual({ page: "component", slug: "card-deck" });
    expect(matchRoute("/components/card-deck/details")).toEqual({ page: "details", kind: "components", slug: "card-deck" });
    expect(matchRoute("/recipes/poker-night/details")).toEqual({ page: "details", kind: "recipes", slug: "poker-night" });
    expect(matchRoute("/recipes/poker-night/other")).toEqual({ page: "not-found" });
    expect(matchRoute("/classes")).toEqual({ page: "classes" });
    expect(matchRoute("/classes/card-deck-class")).toEqual({ page: "class", slug: "card-deck-class" });
    expect(matchRoute("/categories")).toEqual({ page: "categories" });
  });

  it("rejects malformed names", () => {
    expect(matchRoute("/recipes/Bad")).toEqual({ page: "not-found" });
    expect(matchRoute("/recipes/search")).toEqual({ page: "not-found" });
    expect(matchRoute("/recipes/a/b")).toEqual({ page: "not-found" });
    expect(matchRoute("/components/x")).toEqual({ page: "not-found" });
    expect(matchRoute("/components/card-deck/0.1.0")).toEqual({ page: "not-found" });
  });

  it("rejects everything else", () => {
    expect(matchRoute("/george")).toEqual({ page: "not-found" });
    expect(matchRoute("/l/abc123")).toEqual({ page: "not-found" });
    expect(matchRoute("/dev/apps")).toEqual({ page: "not-found" });
    expect(matchRoute("/dev/guide")).toEqual({ page: "not-found" });
    expect(matchRoute("/a/b")).toEqual({ page: "not-found" });
  });
});
