// Each page's module loads when its route is first shown, so a page downloads only the code it uses.
import { navigate } from "./nav.js";
import { matchRoute } from "./router.js";

const root = document.getElementById("app")!;

const library = () => import("./pages/library.js");
const publicPages = () => import("./pages/public.js");

async function render(): Promise<void> {
  const route = matchRoute(location.pathname);
  if (!location.hash) scrollTo(0, 0);
  switch (route.page) {
    case "landing": await (await publicPages()).landing(root); break;
    case "developer": await (await import("./pages/dev.js")).developerPage(root); break;
    case "guide": await (await import("./pages/guide.js")).guide(root); break;
    case "terms": await (await import("./pages/terms.js")).termsPage(root); break;
    case "small": await (await import("./pages/small.js")).smallPage(root); break;
    case "recipes": await (await library()).recipesPage(root); break;
    case "recipe": await (await library()).recipePage(root, route.slug); break;
    case "components": await (await library()).componentsPage(root); break;
    case "component": await (await library()).componentPage(root, route.slug); break;
    case "details": await (await library()).detailsPage(root, route.kind, route.slug); break;
    case "classes": await (await library()).classesPage(root); break;
    case "class": await (await library()).classPage(root, route.slug); break;
    case "categories": await (await library()).categoriesPage(root); break;
    default: (await publicPages()).notFound(root);
  }
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

// Same-origin links navigate without a reload; everything else is left to the browser.
document.addEventListener("click", (e) => {
  if (e.defaultPrevented) return;
  const a = (e.target as HTMLElement).closest("a");
  if (!a || a.target || a.hasAttribute("download") || e.metaKey || e.ctrlKey) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/dl/") || /\.(md|txt|svg|json|xml|yml)$/.test(url.pathname)) return;
  e.preventDefault();
  if (url.pathname === location.pathname && url.hash) {
    history.replaceState(null, "", url.pathname + url.search + url.hash);
    document.getElementById(url.hash.slice(1))?.scrollIntoView({ behavior: "smooth" });
    return;
  }
  navigate(url.pathname + url.search + url.hash);
});

addEventListener("popstate", () => void render());
addEventListener("navigate", () => void render());
void render();
