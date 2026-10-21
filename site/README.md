# The project site

A static site for Hermes Bot. No build step, no framework: `index.html`,
`assets/site.css` and `assets/site.js` are the whole thing, so it can be
published as it is.

## Run it locally

```bash
python3 -m http.server 4321 --directory site
```

Then open <http://localhost:4321>.

## The avatars

The site draws the same avatars the desktop app draws. The frame geometry lives
in the app, in `src/components/bloubFrames.ts`, and it is copied into
`assets/bloub.js` by:

```bash
node site/tools/extract-bloub.mjs
```

Run it after the frames change, and never edit `assets/bloub.js` by hand. The
geometry is Bloub, by Jeremy Perret, under MIT. See `THIRD_PARTY_NOTICES.md`.

## Publishing

`.github/workflows/pages.yml` publishes `site/` to GitHub Pages on every push
to `main`. Turn Pages on for the repository, with the source set to GitHub
Actions.

Any static host works too: copy the contents of `site/` to the web root.
