#!/usr/bin/env python3
"""Generate the static site map nav and sitemap.xml.

Why this exists: the nav and footer are injected client side by data-include,
and crawlers do not run JS, so every page also needs real <a href> markup of
its own. Rather than hand-copy that into 18 pages, the list below is the single
source of truth and this script writes it into each page between markers.

The markup itself lives in tools/templates/ — edit it there, not in here.

Run it after changing PAGES, then commit the result:

    python3 tools/build.py

It is deliberately not wired into the Azure workflow: the deploy stays a plain
static upload, so a bug in here can never fail a deployment.
"""

import datetime
import pathlib
import re
import subprocess
import sys

SITE = "https://wearesopro.ca"

# Every page, and the only place a link is declared. Only "path" is required.
#   path     file, relative to the repo root
#   label    text in the site map at the foot of every page; no label = not listed
#   section  which menu it belongs to: "games", "team", or absent
#   menu     menu wording, when it should differ from label
#   badge    flag shown in the menus only, e.g. "New"
#   icon     emoji shown in the menus, so a long list is scannable
PAGES = [
    {"path": "index.html",                 "label": "Home"},
    {"path": "notes.html",                 "label": "Editor&rsquo;s Notes"},

    # Out of the menus on purpose: build notes don't sell the book. Still live,
    # still in the footer site map for anyone curious.
    {"path": "notes/pipeline.html",        "label": "The Pipeline"},
    {"path": "notes/spreadsheet.html",     "label": "The Spreadsheet"},
    {"path": "notes/faqs.html",            "label": "FAQs"},

    {"path": "games.html",                 "label": "Games &amp; Quizzes"},
    {"path": "games/chirp.html",           "label": "Teammate or Coworker",
     "section": "games", "icon": "💬"},
    {"path": "games/quotes.html",          "label": "Who Said What",
     "section": "games", "menu": "Who said what?", "icon": "🗣️"},
    {"path": "games/whowas.html",          "label": "Who&rsquo;s This Early Bird",
     "section": "games", "menu": "Who&rsquo;s this Early Bird?", "icon": "🕵️"},
    {"path": "games/adopt.html",           "label": "Tommy The Goalie",
     "section": "games", "icon": "🥅"},
    {"path": "games/fighter.html",         "label": "Goalie Brawl",
     "section": "games", "icon": "🥊"},
    {"path": "games/create-a-player.html", "label": "Create A Player",
     "section": "games", "badge": "New", "icon": "🎨"},
    {"path": "games/team-photo.html", "label": "Team Photo",
     "section": "games", "badge": "New", "icon": "📸"},
    # No label and no section on purpose: a card with no player in the URL is
    # an empty page, so it does not belong in a menu. It is reached from a
    # player's share view. Listed here only so the sitemap knows about it.
    {"path": "games/card.html"},

    {"path": "team.html",                  "label": "The Team"},
    {"path": "team/updates.html",          "label": "Team Updates",
     "section": "team", "menu": "Recent Updates", "icon": "📰"},
    {"path": "team/stanley.html",          "label": "Stanley The Author",
     "section": "team", "icon": "✍️"},
    {"path": "team/tommy.html",            "label": "Tommy The Goalie",
     "section": "team", "icon": "🥅"},
    {"path": "team/stephanie.html",        "label": "Stephanie The Planner",
     "section": "team", "icon": "📣"},
    {"path": "team/dale.html",             "label": "Dale The Uncle",
     "section": "team", "icon": "🚌"},
    {"path": "team/ricky.html",            "label": "Ricky The Screamer",
     "section": "team", "icon": "📢"},
    {"path": "links.html",                 "label": "Get the Book"},
    {"path": "feedback.html",              "label": "Feedback"},
    {"path": "experiments.html"},
    {"path": "thanks.html"},
    {"path": "404.html"},
]

NAV_PARTIAL = "partials/nav.html"

TEMPLATES = pathlib.Path(__file__).resolve().parent / "templates"


def template(name):
    return (TEMPLATES / name).read_text(encoding="utf-8")


def markers():
    """The first and last lines of the block template delimit what gets replaced."""
    lines = template("site-links.html").strip().splitlines()
    return lines[0], lines[-1]


def nav_html():
    item = template("site-link.html").rstrip("\n")
    links = "\n".join(
        item.replace("{{href}}", "/" + page["path"]).replace("{{label}}", page["label"])
        for page in PAGES if page.get("label")
    )
    return template("site-links.html").replace("{{links}}", links)


def insert(source, block, start, end):
    """Put the block in, replacing an older one if this page already has it."""
    if start in source and end in source:
        pattern = re.escape(start) + r".*?" + re.escape(end) + r"\n?"
        return re.sub(pattern, block, source, flags=re.S)
    for anchor in ('<div data-include="/partials/footer.html"></div>',
                   "</body>", "</html>"):
        if anchor in source:
            return source.replace(anchor, block + anchor, 1)
    return source + block


def menu_html(section):
    """The <li> rows for one dropdown/drawer menu, from the same PAGES list."""
    item = template("nav-item.html").rstrip("\n")
    rows = []
    for page in PAGES:
        if page.get("section") != section:
            continue
        label = page.get("menu", page["label"])
        if page.get("badge"):
            label += ' <span class="badge">%s</span>' % page["badge"]
        rows.append(item.replace("{{href}}", "/" + page["path"])
                        .replace("{{icon}}", page.get("icon", ""))
                        .replace("{{label}}", label))
    return "\n".join(rows)


def write_menus(root):
    """Rewrite the menu lists inside partials/nav.html.

    The dropdown and the mobile drawer use identical <li> markup, so both copies
    are filled from one list and a new game only has to be declared once.
    """
    partial = root / NAV_PARTIAL
    source = partial.read_text(encoding="utf-8")
    updated = source
    for section in ("games", "team"):
        start = "<!-- nav:%s:start -->" % section
        end = "<!-- nav:%s:end -->" % section
        if start not in updated:
            print("  no %s marker in %s, skipped" % (section, NAV_PARTIAL))
            continue
        block = "%s\n%s\n%s" % (start, menu_html(section), end)
        pattern = re.escape(start) + r".*?" + re.escape(end)
        updated = re.sub(pattern, lambda _: block, updated, flags=re.S)
    if updated != source:
        partial.write_text(updated, encoding="utf-8")
    print("menus written into", NAV_PARTIAL)


def write_navs(root):
    block = nav_html()
    start, end = markers()
    for entry in PAGES:
        path = entry["path"]
        page = root / path
        if not page.exists():
            print("  missing, skipped:", path)
            continue
        source = page.read_text(encoding="utf-8")
        updated = insert(source, block, start, end)
        if updated != source:
            page.write_text(updated, encoding="utf-8")
    print("nav written into %d pages" % len(PAGES))


def git(root, *args):
    try:
        out = subprocess.run(["git"] + list(args), cwd=root,
                             capture_output=True, text=True, timeout=10)
        return out.stdout.strip()
    except Exception:
        return ""


def last_modified(root, path):
    """When the page last changed.

    A page with uncommitted edits is dated today rather than by its previous
    commit. Otherwise every commit leaves the sitemap one commit behind, and the
    pre-commit hook blocks the *next* commit over a sitemap nobody touched.
    """
    if git(root, "status", "--porcelain", "--", path):
        return datetime.date.today().isoformat()
    return git(root, "log", "-1", "--format=%cs", "--", path) or None


def write_sitemap(root):
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for entry in PAGES:
        path = entry["path"]
        if path == "404.html" or not (root / path).exists():
            continue
        loc = SITE + "/" + ("" if path == "index.html" else path)
        lines.append("  <url>")
        lines.append("    <loc>%s</loc>" % loc)
        stamp = last_modified(root, path)
        if stamp:
            lines.append("    <lastmod>%s</lastmod>" % stamp)
        lines.append("  </url>")
    lines.append("</urlset>")
    (root / "sitemap.xml").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("sitemap.xml written")


def check(root):
    """Report what a crawler would trip over. Does not write anything."""
    problems = []
    start, _ = markers()
    for entry in PAGES:
        path = entry["path"]
        page = root / path
        if not page.exists():
            problems.append("missing page: " + path)
            continue
        source = page.read_text(encoding="utf-8")
        if start not in source:
            problems.append("no generated nav: " + path)
        # The CSP is per page, so a page that forgets it silently loses the one
        # thing standing between a bad string and a running script.
        if "Content-Security-Policy" not in source:
            problems.append("no Content-Security-Policy meta: " + path)
        for target in re.findall(r'href="(/[^"#?]*)"', source):
            if target.startswith("/assets") or target.startswith("/games/assets"):
                continue
            resolved = root / target.lstrip("/")
            if target == "/":
                resolved = root / "index.html"
            if not resolved.exists():
                problems.append("broken link in %s -> %s" % (path, target))
    for line in problems:
        print("  " + line)
    print("%d problem(s)" % len(problems))
    return 1 if problems else 0


def main():
    root = pathlib.Path(__file__).resolve().parent.parent
    if "--check" in sys.argv:
        raise SystemExit(check(root))
    write_navs(root)
    write_menus(root)
    write_sitemap(root)


if __name__ == "__main__":
    main()
