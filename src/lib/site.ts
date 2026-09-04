/** Project identity, in one place so the header and the docs cannot drift. */

/** What the site calls itself, in the header and the browser tab. */
export const SITE_NAME = "Excess Rent";

/**
 * The repository name. Kept separate from SITE_NAME because the display name
 * has a space in it and would not survive being put in a URL.
 */
export const REPO_SLUG = "excess-rent";

export const AUTHOR = "zaialamm";

/**
 * The public repository. Change this if the project moves or is renamed; the
 * header byline and anything else pointing at the source reads from here.
 */
export const REPO_URL = `https://github.com/${AUTHOR}/${REPO_SLUG}`;

/** Where to find the author. */
export const X_URL = `https://x.com/${AUTHOR}`;

/** A walkthrough of both reclaim paths, by the author of the Token program change. */
export const ARTICLE_URL = "https://x.com/a_milz/status/2095532192579661927";

export const SIMD_URL =
  "https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0437-incremental-rent-reduction.md";
