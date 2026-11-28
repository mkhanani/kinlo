# kinlo's website

One static page: `index.html`, with its images and fonts in `assets/`. There is no build
step and nothing to install.

## Looking at it

```bash
python3 -m http.server 4173 --directory website
```

Then open `http://localhost:4173`.

## What is in it

| | |
|---|---|
| `index.html` | The whole page: markup, styles and a small script. |
| `assets/img/*-light.webp`, `*-dark.webp` | Screenshots of the real app, taken with example data. |
| `assets/img/photo-*.webp` | Three black-and-white photographs. They were generated with an AI image model, not taken with a camera, and show nobody real. |
| `assets/fonts/` | Inter, Inter Tight and Geist Mono, served from here, with their licences (SIL Open Font License 1.1). |

## What the page does and does not do

- It loads nothing from other sites: no trackers, no cookies, no fonts or scripts from anyone else.
- The download buttons name the visitor's system from what the browser already says about itself.
- On Windows only, reaching for a download button asks GitHub for the newest release so the
  button can point straight at the installer. If that fails, the button goes to the releases page.
- Every claim on the page is taken from the README and `docs/`. When the app changes, check
  the numbers under "Small by design" (the installer size) and the two privacy cases.

## Changing the screenshots

They are plain screenshots of the app at 1280 by 800, saved as WebP at 2000 pixels wide.
Replace a file with one of the same name and shape and the page picks it up.
