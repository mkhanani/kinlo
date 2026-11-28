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

## Search engines and sharing

| File | What it is for |
|---|---|
| The `<head>` of `index.html` | Title, description, the canonical address, the tags that make a link preview, and a description of kinlo as software that search engines can read. |
| `assets/img/og.png` | The picture shown when the link is shared. 1200 by 630. |
| `favicon.ico`, `favicon.svg`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `site.webmanifest` | The icon in browser tabs, bookmarks and phone home screens. |
| `robots.txt`, `sitemap.xml` | Tell search engines they may read the site and where its one page is. |
| `404.html` | What is shown for an address that does not exist. |
| `vercel.json` | Response headers: a content security policy that only lets the page load its own files and ask GitHub for the newest release, and long caching for the fonts. |

The site's address, `https://kinlo-website.vercel.app`, is written out in `index.html`,
`robots.txt` and `sitemap.xml`. If the site moves to its own domain, replace it in all three
and update the date in `sitemap.xml`.

There are no ratings, reviews or download counts in the search data, because kinlo has none
to report.

## Changing the screenshots

They are plain screenshots of the app at 1280 by 800, saved as WebP at 2000 pixels wide.
Replace a file with one of the same name and shape and the page picks it up.
