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

# Every real page, in nav order. (path, nav label, include-in-nav)
# Utility pages are still in the sitemap but do not need a nav link.
PAGES = [
    ("index.html",                   "Home",                   True),
    ("teamupdates.html",             "Team Updates",           True),
    ("notes.html",                   "Editor&rsquo;s Notes",    True),
    ("notes/pipeline.html",          "The Pipeline",           True),
    ("notes/spreadsheet.html",       "The Spreadsheet",        True),
    ("notes/faqs.html",              "FAQs",                   True),
    ("games.html",                   "Games &amp; Quizzes",    True),
    ("games/create-a-player.html",   "Create A Player",        True),
    ("games/chirp.html",             "Teammate or Coworker",   True),
    ("games/quotes.html",            "Who Said What",          True),
    ("games/whowas.html",            "Who&rsquo;s This Early Bird", True),
    ("games/adopt.html",             "Tommy The Goalie",       True),
    ("games/fighter.html",           "Goalie Brawl",           True),
    ("links.html",                   "Get the Book",           True),
    ("feedback.html",                "Feedback",               True),
    ("experiments.html",             None,                     False),
    ("thanks.html",                  None,                     False),
    ("404.html",                     None,                     False),
]

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
        item.replace("{{href}}", "/" + path).replace("{{label}}", label)
        for path, label, in_nav in PAGES if in_nav
    )
    return template("site-links.html").replace("{{links}}", links)


def insert(source, block, start, end):
    """Put the block in, replacing an older one if this page already has it."""
    # an unmarked nav from before this script existed
    source = re.sub(r'(<!--[^>]*?static site map.*?-->\s*)?<nav class="site-links".*?</nav>\n?',
                    "", source, flags=re.S)
    if start in source and end in source:
        pattern = re.escape(start) + r".*?" + re.escape(end) + r"\n?"
        return re.sub(pattern, block, source, flags=re.S)
    for anchor in ('<div data-include="/partials/footer.html"></div>',
                   "</body>", "</html>"):
        if anchor in source:
            return source.replace(anchor, block + anchor, 1)
    return source + block


def write_navs(root):
    block = nav_html()
    start, end = markers()
    for path, _, _ in PAGES:
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
    for path, _, _ in PAGES:
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
    for path, _, _ in PAGES:
        page = root / path
        if not page.exists():
            problems.append("missing page: " + path)
            continue
        source = page.read_text(encoding="utf-8")
        if start not in source:
            problems.append("no generated nav: " + path)
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
    write_sitemap(root)


if __name__ == "__main__":
    main()
