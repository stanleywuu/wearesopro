# Coding Rules

Source: original project brief (`Prompt`), `README.md`, and accumulated feedback from working sessions.

## Simplicity first
- This is a simple static site. The only generation step is `make site` (see below) — standard-library Python, no third-party packages. Don't introduce bundlers, frameworks, or a real build pipeline beyond it.
- Keep functions short and readable — aim for under ~50 lines each. Split a function up if it's doing more than one clear thing.
- Prefer plain, boring code a non-expert can read over clever abstractions. No premature helpers or config layers for hypothetical future needs.
- Keep output concise — this project is token-conscious; don't pad code or explanations.

## Security
- No inline `<script>` or `<style>` — all JS/CSS must live in external files (CSP-enforced; see `CLAUDE.md` Security section).
- External links use `rel="noopener noreferrer"`.
- Netlify Forms: every form needs a honeypot field.
- Follow standard web security best practices when applicable (sanitize/escape any user-influenced content, avoid `eval`/`innerHTML` with untrusted input, etc.).

## JS gotchas
- Never use curly/smart quotes (`'` `'` `"` `"`) as JS string delimiters — they cause silent syntax failures. Use straight quotes only.
- Gate debug/dev UI behind a URL query param (`?debug`, checked via `new URLSearchParams(location.search).has('debug')`) rather than deleting the code or leaving a visible control in production. Create any debug DOM elements dynamically in JS — nothing debug-related belongs in the HTML.

## Scope
- Work here is scoped to `netlify_pages/` (this static site). Don't touch the separate Python book-build pipeline (bookbuilder.py, names.py, picture_manager.py, noggins_combine.py) unless explicitly asked.

## Plans

Plans and task trackers go in `docs/`, not `~/.claude/plans/`. `docs/` is gitignored on purpose — the trackers are local working notes, not versioned files.

- `docs/OBJECTIVE.md` holds the overall objective, separate from per-feature checklists, so the high-level goal survives even after individual todos are checked off or trimmed. Update it when the active objective changes.
- Once a plan is finalized, create a granular todo checklist for it in `docs/<feature>.md` — one checkbox per concrete step. The user may hand-edit this list, so treat it as shared state and re-read it before updating.
- Summarize and trim old completed sections down to the last 5 over time.

### The commit loop — do not skip a step

**Every** change follows this loop. Not a batch of changes at the end of a work session — each one, as it lands.

1. Make the change.
2. Commit it.
3. Immediately tick the matching `docs/<feature>.md` item(s) and write the commit's short hash beside them — on the item, or on the section heading when one commit closes a whole section.

The hash is the point: it is what lets a future session (or a cleared context) map checklist state back to git history. A ticked box with no hash is an unverifiable claim.

If a change turns out not to match any existing todo item, add the item, then tick it — do not leave the work unrecorded. If several commits are already in and the tracker was not updated, stop and backfill from `git log --oneline` before doing anything else.

## `make site` — run it before every commit

`tools/build.py` owns two things that must exist as real markup because crawlers
do not run JS:

- the `<nav class="site-links">` site map written into every page between
  `<!-- nav:start -->` / `<!-- nav:end -->` markers
- `sitemap.xml`

**Never hand-edit inside those markers** — the next `make site` overwrites it.
To change *which* pages are listed, edit the `PAGES` list in `tools/build.py` — it is
the single source for the footer site map, the nav dropdowns, the mobile drawer and
`sitemap.xml`.

### Adding a page (e.g. a new game)
1. Create the page (copy an existing one for the CSP meta tag and the `og:*` set).
2. Add one entry to `PAGES` — `section: "games"` puts it in the menus, `badge: "New"` flags it.
3. `make site`
4. Add a card to `games.html` by hand — the blurb is prose, so it is not generated.
5. Commit.
To change *how the nav looks*, edit `tools/templates/site-links.html` (the block)
or `tools/templates/site-link.html` (one link) — no Python involved. Then run
`make site` and commit the regenerated pages.

**`make hooks` installs the pre-commit hook** (`tools/hooks/pre-commit`), once per
clone — `.git/hooks` is not version controlled, so the committed hook is inert
until git is pointed at it. The hook regenerates, then:
- **stages** a regenerated `sitemap.xml` (pure artifact; otherwise an ordinary page
  edit fails its first commit, because the page's `lastmod` moves to today)
- **stops the commit** if the nav inside pages changed and is unstaged — that only
  happens when `PAGES` or the templates change, so it is worth reviewing
- **fails** on broken internal links

`git commit --no-verify` skips it; do not make a habit of that.

You do **not** need to run `make site` before testing an ordinary edit — the nav is
already baked into the page files. Run it when you change `PAGES` or the templates
and want to see the result; otherwise the hook keeps things current at commit time.

`make check` reports pages missing the generated nav and any broken internal
link; it is worth running before a push.

It is deliberately NOT wired into the Azure workflow. The deploy stays a plain
static upload of the repo, so a bug in the generator can never fail a deploy —
but it does mean the generated output has to be committed.

## Keeping this repo self-describing
- If you add, remove, or repurpose a file, update `.claude/FILES.md` in the same change.
- If you establish a new non-obvious convention, add it here.

## Page metadata
- Every page needs a literal `<title>`, `<meta name="description">`, `<link rel="canonical">`, the `og:*` set and `twitter:card` — written into the page's own `<head>`.
- The same applies to **internal links**: the nav and footer are `data-include`d and therefore invisible to crawlers, which is why `make site` writes a static site map into every page. Anything a crawler must follow has to be real markup.
- **Never inject these with `data-include`.** The include system is client-side `fetch()`; social crawlers and search engines do not run JavaScript, so anything injected that way is invisible to them. The site previously included `<title>` this way and every page was effectively titleless to crawlers.
- `og:image` must be an absolute URL to an image of at least 1200x630. Share cards live in `assets/img/og-*.jpg` and are rendered from the Create A Player canvas renderer (see `docs/create-a-player.md` for the recipe).
