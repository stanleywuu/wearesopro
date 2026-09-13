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

## Generated markup — `make site`

Crawlers do not run JS, so anything they must follow has to be real markup in the
page rather than a `data-include`. `tools/build.py` generates that from **one
`PAGES` list**, which is the single source of truth for:

| what | where it lands |
|---|---|
| footer site map | `<nav class="site-links">` in every page, between `nav:start` / `nav:end` |
| desktop dropdowns | `partials/nav.html`, between `nav:notes` / `nav:games` |
| mobile drawer menus | `partials/nav.html`, same markers (identical `<li>` markup) |
| `sitemap.xml` | repo root |

**Never hand-edit inside any of those markers** — the next `make site` overwrites it.

- To change **which** pages appear: edit `PAGES` in `tools/build.py`.
- To change **how** the nav looks: edit `tools/templates/` — `site-links.html`
  (footer block), `site-link.html` (one footer link), `nav-item.html` (one menu row).
  No Python involved.

### Adding a page (e.g. a new game)
1. Create the page — copy an existing one, so it carries the CSP meta tag and the
   literal `<title>` / `og:*` set.
2. Add **one entry** to `PAGES`:
   ```python
   {"path": "games/yourgame.html", "label": "Your Game", "nav": True,
    "section": "games", "badge": "New"},
   ```
   `section` puts it in the dropdown + drawer (`"games"` or `"notes"`; omit for none),
   `menu` overrides the wording in menus, `badge` flags it as New.
3. `make site`
4. Add the card to `games.html` by hand — the blurb is prose, so it is not generated.
5. Commit.

### Commands
- `make site` — regenerate everything above.
- `make check` — report pages missing the generated nav, and broken internal links.
- `make hooks` — install the pre-commit hook, **once per clone**. `.git/hooks` is not
  version controlled, so the committed hook is inert until git is pointed at it.

### What the pre-commit hook does
1. runs `make site`
2. **stages** a regenerated `sitemap.xml` — it is a pure artifact, and without this an
   ordinary page edit fails its first commit whenever the page's `lastmod` moves to today
3. **stops the commit** if the nav inside pages changed and is unstaged — that only
   happens when `PAGES` or a template changed, so it is worth a look first
4. **fails** on broken internal links

`git commit --no-verify` skips it; do not make a habit of that.

You do **not** need `make site` before testing an ordinary content edit — the nav is
already baked into the page files, and the hook keeps things current at commit time.
Run it when you change `PAGES` or a template and want to see the result.

It is deliberately **not** wired into the Azure workflow: the deploy stays a plain
static upload, so a bug in the generator can never fail a deploy. The trade-off is
that generated output must be committed.

## Keeping this repo self-describing
- If you add, remove, or repurpose a file, update `.claude/FILES.md` in the same change.
- If you establish a new non-obvious convention, add it here.

## Page metadata
- Every page needs a literal `<title>`, `<meta name="description">`, `<link rel="canonical">`, the `og:*` set and `twitter:card` — written into the page's own `<head>`.
- The same applies to **internal links**: the nav and footer are `data-include`d and therefore invisible to crawlers, which is why `make site` writes a static site map into every page. Anything a crawler must follow has to be real markup.
- **Never inject these with `data-include`.** The include system is client-side `fetch()`; social crawlers and search engines do not run JavaScript, so anything injected that way is invisible to them. The site previously included `<title>` this way and every page was effectively titleless to crawlers.
- `og:image` must be an absolute URL to an image of at least 1200x630. Share cards live in `assets/img/og-*.jpg` and are rendered from the Create A Player canvas renderer (see `docs/create-a-player.md` for the recipe).
