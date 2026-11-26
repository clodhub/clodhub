// Drawn SVG diagrams on the pages: each opens full size in a new tab.
import { html, type Raw } from "./html.js";

// A drawn SVG diagram at its own proportions that opens full size in a new tab.
export function svgFigure(src: string, alt: string): Raw {
  return html`<a class="figure-link" href="${src}" target="_blank" rel="noopener" title="Open full size"><img class="svg-figure" src="${src}" alt="${alt}" loading="lazy" /><span class="figure-hint">Open full size</span></a>`;
}

export const COOKING_FILE = "/diagrams/cooking-a-recipe.svg";

export const COOKING_ALT =
  "How a recipe is cooked, in five parts. You and your agent: find a recipe on ClodHub, read its questions, answer them; the agent infers what it can and asks you the rest. " +
  "Evaluation: conditions over the answers decide which components are included, the scale band chooses a provider for each job, settings are applied and connections checked, giving a design. " +
  "clod: resolve exact versions, download each archive from its publisher's GitHub release, check its sha256 digest and signatures, review, install by copying the listed files without running their code, and verify with the components' tests, giving the application. " +
  "Run: your agent builds the application for each device and runs it on your computer, and servers and websites go to hosting on accounts you own. " +
  "Delivering it to people's devices is a separate step a recipe can include, for example through ourapps.app. " +
  "Updates: a new component version becomes a proposal, you approve it, and clod applies it with recovery.";

// The process overview, from site/src/diagrams/cooking.ts.
export function cookingFigure(): Raw {
  return svgFigure(COOKING_FILE, COOKING_ALT);
}
