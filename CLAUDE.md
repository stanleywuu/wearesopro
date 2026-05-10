# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Static HTML/CSS/JS website for the "We Are So Pro" beer league hockey book, hosted on Netlify. No build step — deploy by dragging the `netlify_pages/` folder into Netlify's UI.

## Partial Includes

`assets/js/main.js` implements a lightweight include system: any page can have `<meta data-include="/partials/nav.html">` tags, which are fetched and replaced with the partial's content at page load. Nav, sidebar, and footer live in `partials/`.

## Games

Three reader games live in `games/`, each with its HTML page and a paired logic/data file in `games/assets/js/`:

- **chirp** — Guess if Stanley said a quote at work or on the ice
- **whowas** — Identify which character matches a clue (5-question rounds)
- **quotes** — Match quotes to characters; streak counter; supports an "Everyone" answer

Game data (questions, quotes, choices) is kept in the JS files alongside the logic.

## Forms

Uses Netlify Forms. Each form has a honeypot field to reduce spam. Successful submissions redirect to `thanks.html`.

## CSS

`assets/css/style.css` is the main stylesheet. `assets/css/critical.css` contains above-the-fold styles intended to be inlined in `<style>` tags.

## Security

CSP headers are set in `_headers` (Netlify edge config). No inline scripts or styles are allowed — all JS/CSS must be external files.

## Instructions
When we create plans, create the plans under a docs directory here.
As we execute the plan, mark it off so we know where we currently are and can continue to pick it up from there, even if we cleared context
The plan here doesn't need to be full, it just need to be the tasks we wish to do, and what has been done.

After a while, we can summarize the old tasks and leave the last 5 in plan
