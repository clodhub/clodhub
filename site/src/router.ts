// Path matching for the pages the site has.
import { isCatalogueSlug } from "@clodhub/shared";

export type Route =
  | { page: "landing" }
  | { page: "developer" }
  | { page: "guide" }
  | { page: "terms" }
  | { page: "small" }
  | { page: "recipes" }
  | { page: "recipe"; slug: string }
  | { page: "components" }
  | { page: "component"; slug: string }
  | { page: "details"; kind: "recipes" | "components"; slug: string }
  | { page: "classes" }
  | { page: "class"; slug: string }
  | { page: "categories" }
  | { page: "not-found" };

export function matchRoute(pathname: string): Route {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return { page: "landing" };
  if (parts.length === 1) {
    if (parts[0] === "dev") return { page: "developer" };
    if (parts[0] === "guide") return { page: "guide" };
    if (parts[0] === "terms") return { page: "terms" };
    if (parts[0] === "small") return { page: "small" };
    if (parts[0] === "categories") return { page: "categories" };
  }
  if (parts[0] === "classes") {
    if (parts.length === 1) return { page: "classes" };
    if (parts.length === 2 && isCatalogueSlug(parts[1])) return { page: "class", slug: parts[1] };
    return { page: "not-found" };
  }
  if (parts[0] === "recipes" || parts[0] === "components") {
    const kind = parts[0] === "recipes" ? "recipe" : "component";
    if (parts.length === 1) return { page: parts[0] };
    if (parts.length === 2 && isCatalogueSlug(parts[1])) return kind === "recipe" ? { page: "recipe", slug: parts[1] } : { page: "component", slug: parts[1] };
    if (parts.length === 3 && parts[2] === "details" && isCatalogueSlug(parts[1])) return { page: "details", kind: parts[0], slug: parts[1] };
    return { page: "not-found" };
  }
  return { page: "not-found" };
}
