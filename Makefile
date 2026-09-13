# Site generation. Standard library Python only — no third-party packages, no
# bundler, and nothing wired into the Azure deploy. Run `make site` after
# editing the PAGES list in tools/build.py, then commit the result.

.PHONY: site check hooks help

help:
	@echo "make site   regenerate the crawlable nav in every page + sitemap.xml"
	@echo "make check  report pages missing the generated nav, and broken internal links"
	@echo "make hooks  install the pre-commit hook (once per clone)"

site:
	python3 tools/build.py

check:
	@python3 tools/build.py --check

# .git/hooks is not version controlled, so the committed hook in tools/hooks
# does nothing until git is pointed at it. This is that one-time step.
hooks:
	git config core.hooksPath tools/hooks
	@echo "pre-commit hook active (tools/hooks/pre-commit)"
