# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@.claude/FILES.md
@.claude/RULES.md

## Overview

Static HTML/CSS/JS website for the "We Are So Pro" beer league hockey book. No build step.

## Deploying

Pushing to `main` publishes the live site. `.github/workflows/azure-static-web-apps-*.yml` deploys the repo root to Azure Static Web Apps on every push to `main` — there is no manual upload step, so a push to `main` goes live immediately.

Route rules (redirects, blocked paths) live in `staticwebapp.config.json`, which is Azure's config — not Netlify's `_redirects`/`_headers`.

See `.claude/FILES.md` for what every file in the repo is, and `.claude/RULES.md` for coding rules.

## Partial Includes

`assets/js/main.js` implements a lightweight include system: any page can have `<meta data-include="/partials/nav.html">` tags, which are fetched and replaced with the partial's content at page load. Nav, sidebar, and footer live in `partials/`.

**Includes are invisible to crawlers** (they do not run JS), so anything a crawler must see — titles, meta tags, and internal links — has to be real markup in the page. That is what `make site` generates: a footer site map in every page, the nav dropdown and drawer lists in `partials/nav.html`, and `sitemap.xml`, all from the single `PAGES` list in `tools/build.py`.

Run `make site` after changing `PAGES` or a template in `tools/templates/`; a pre-commit hook (installed once with `make hooks`) runs it for you at commit time and fails on broken internal links. Never hand-edit between the `nav:*:start` / `nav:*:end` markers. See `.claude/RULES.md` for the full procedure, including how to add a new game page.

## Forms

Uses Netlify Forms. Each form has a honeypot field to reduce spam. Successful submissions redirect to `thanks.html`.

## Security

CSP is enforced per page by a `<meta http-equiv="Content-Security-Policy">` tag in each page's `<head>` (`script-src 'self'`), so no inline `<script>` or `<style>` will run — all JS/CSS must be external files. Copy the meta tag from an existing page when adding a new one.

## Instructions
Before committing, `make site` must be current — the pre-commit hook enforces it. See "Partial Includes" above and `.claude/RULES.md`.

When we create plans, create the plans under a docs directory here.
As we execute the plan, mark it off so we know where we currently are and can continue to pick it up from there, even if we cleared context
The plan here doesn't need to be full, it just need to be the tasks we wish to do, and what has been done.

After a while, we can summarize the old tasks and leave the last 5 in plan

Once a plan is finalized, create a granular todo checklist for it (one checkbox per concrete step, in the same docs file). I may edit this list by hand, so re-read it before updating. Each time a change is committed, check off the corresponding todo item and write that commit's short hash beside it — one commit, one checkbox, so the checklist stays traceable to git history.

Preserve the overall objective in `docs/OBJECTIVE.md`, separate from the per-feature todo checklists, so the high-level goal isn't lost when older todos get summarized/trimmed.
