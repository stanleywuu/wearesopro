# We Are So Pro — Static Site

A super-simple static site for Netlify (free tier). No build step. Drag-and-drop the folder or ZIP into Netlify.

## Structure
- `index.html` — Landing
- `notes.html` — Editor’s notes (Acknowledgements, Pipeline, Random Thoughts)
- `experiments.html` — Under construction + email capture (Netlify Forms)
- `games.html` — Games & Quizzes placeholder
- `links.html` — Amazon/Lulu links
- `thanks.html` — Netlify Forms success page
- `404.html` — Custom 404
- `assets/` — CSS/JS/img
- `widgets/` — Placeholder for future poll widgets

## Netlify Forms
Forms have `data-netlify="true"` and a hidden `form-name`. Submissions appear in Netlify’s dashboard. A honeypot field reduces spam.

## Security
- Basic CSP blocks external scripts/styles.
- No inline scripts or styles.
- External links use `rel="noopener noreferrer"`.

## Customize
- Replace `/assets/img/book-placeholder.png` with your real cover image.
- Update links in `links.html`.
- Add new pages directly — the nav and sidebar are already in each file.
