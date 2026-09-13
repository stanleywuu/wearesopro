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

**Day to day this changes nothing: edit, commit.** The pre-commit hook keeps the
generated files current for you. You only run `make site` yourself when adding or
removing a page, or editing a template, and want to see the result before committing.

### Why it exists
Crawlers do not run JS, so `data-include` markup is invisible to them. Internal links
have to be real markup in the page. `tools/build.py` writes that from one `PAGES`
list, which is the single source for: the site map at the foot of every page, the nav
dropdown and mobile drawer in `partials/nav.html`, and `sitemap.xml`.

**Never hand-edit between `nav:*:start` / `nav:*:end` markers** — regeneration wins.

### Adding a page (e.g. a new game)
1. Create the page — copy an existing one for the CSP meta tag and the `og:*` set.
2. Add one entry to `PAGES` in `tools/build.py`:
   ```python
   {"path": "games/yourgame.html", "label": "Your Game",
    "section": "games", "badge": "New"},
   ```
   Only `path` is required. `label` lists it in the footer site map, `section` puts it
   in the menus, `menu` overrides the menu wording, `badge` flags it, `icon` is the
   emoji shown beside it in the menus (give every game one — a plain list of six
   titles is unscannable on a phone).
3. `make site`
4. Add the card to `games.html` by hand — the blurb is prose, so it is not generated.
5. Commit.

### Commands
- `make site` — regenerate. `make check` — find broken internal links.
- `make hooks` — install the pre-commit hook, **once per clone** (`.git/hooks` is not
  version controlled, so the committed hook is inert until git is pointed at it).

The hook regenerates, quietly stages `sitemap.xml` (a pure artifact), stops the commit
if the nav in pages changed and is unstaged, and fails on broken internal links.
`--no-verify` skips it; don't make a habit of it.

Nothing here touches the Azure workflow — the deploy stays a plain static upload, so a
generator bug cannot fail a deploy. The trade-off is that generated output is committed.

## One builder, two mounts

There is exactly **one** player builder: its markup in `partials/player-editor.html`,
its behaviour in `CAP_EDITOR` (`games/assets/js/create-a-player.editor.js`). The Create
A Player page and the slot modal on the Team Photo page are two *mounts* of it, not two
copies. Add a control once and both get it.

- **No builder control markup in a page.** `create-a-player.html` and `team-photo.html`
  each hold a `data-include` mount point and nothing else of the builder.
- **No builder behaviour in `create-a-player.js`.** That file is the *page*: share links,
  `?p=`, autosave, the collapsed view a shared link opens in. Page-specific buttons are
  created in JS and dropped into the partial's `[data-el="host-actions"]` /
  `[data-el="host-footer"]` slots.
- **`CAP_EDITOR.mount` never reaches outside its `root`** — no `document.getElementById`,
  no global ids. Elements are addressed `root.querySelector('[data-el="..."]')`. That is
  what lets two mounts coexist, and CSS must not target the builder by id either.
- **A new player field goes in exactly three places:** `defaults()` in
  `create-a-player.codec.js`, the field order in `encode`/`decode`/`sanitize` there
  (**append to the end** so codes already shared keep decoding), and the control in the
  partial. The renderer reads it off `params`; both pages and every saved team get it free.
- Included markup arrives after deferred page scripts run, so anything that needs it
  listens for `partials:ready` (dispatched by `main.js` once the includes resolve).

## Keeping this repo self-describing
- If you add, remove, or repurpose a file, update `.claude/FILES.md` in the same change.
- If you establish a new non-obvious convention, add it here.

## Page metadata
- Every page needs a literal `<title>`, `<meta name="description">`, `<link rel="canonical">`, the `og:*` set and `twitter:card` — written into the page's own `<head>`.
- The same applies to **internal links**: the nav and footer are `data-include`d and therefore invisible to crawlers, which is why `make site` writes a static site map into every page. Anything a crawler must follow has to be real markup.
- **Never inject these with `data-include`.** The include system is client-side `fetch()`; social crawlers and search engines do not run JavaScript, so anything injected that way is invisible to them. The site previously included `<title>` this way and every page was effectively titleless to crawlers.
- `og:image` must be an absolute URL to an image of at least 1200x630. Share cards live in `assets/img/og-*.jpg` and are rendered from the Create A Player canvas renderer (see `docs/create-a-player.md` for the recipe).
