# Site generation. Standard library Python only — no third-party packages, no
# bundler, and nothing wired into the Azure deploy. Run `make site` after
# editing the PAGES list in tools/build.py, then commit the result.

.PHONY: site check help

help:
	@echo "make site   regenerate the crawlable nav in every page + sitemap.xml"
	@echo "make check  report pages missing the generated nav, and broken internal links"

site:
	python3 tools/build.py

check:
	@python3 tools/build.py --check
