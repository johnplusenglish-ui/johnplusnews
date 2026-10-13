# johnplusnews

A new article every week for English learners, at three levels: Intermediate, Advanced and Proficient. The home page is a gallery of cards, newest first, each with a thumbnail, the heading and a short summary. Tabs above the gallery filter it by level. No database, no login, no admin page. Each article is a plain text file; a small script turns the files into the site.

## Add an article with the publisher (easiest)

Double-click `Publish an article.command`. A Terminal window opens and the publisher appears in your browser. Keep the Terminal window open while you work, and close it when you are finished.

1. Fill in the title, choose the level, and check the date.
2. Choose a picture (click the box, drag a picture onto it, or paste one). It is shrunk automatically and a small copy is made for the gallery cards.
3. Paste the article text. Add a summary line, and a source name and link if you want them.
4. Press **Preview** to see it exactly as it will look, without publishing anything.
5. Press **Publish**. The site is rebuilt and sent to GitHub, and the page tells you when the article is live on johnplusnews.com, usually within one to two minutes.

Your articles are listed on the right. **Edit** opens one back up (its web address stays the same) and **Remove from site** takes it off the live site.

If GitHub does not accept the upload, the page says so. Your article is still saved on your Mac, so fix the problem and press Publish again. If it says the sign-in was refused, open Terminal, go to this folder and run `git push`. It will ask for your GitHub username and a personal access token, and macOS will remember them.

## Add an article by hand

1. Create a file in `content/` named `YYYY-MM-DD-short-title.md`, for example `2026-10-20-the-news-title.md`.
2. Write the header, then a line containing only `---`, then the article.
3. Run `python3 build.py`. The finished site is written to `docs/`.
4. Preview with `python3 build.py --serve` and open http://localhost:8123.

The file name decides the web address: `2026-10-20-the-news-title.md` becomes `/articles/the-news-title/`.

## Header fields

```
title: The article title          (required)
date: 2026-10-20                  (required, year-month-day)
summary: One or two sentences.    (optional, shown under the title and in lists)
level: Advanced                   (required: Intermediate, Advanced or Proficient)
source: Name | https://link       (optional, shown at the bottom)
image: images/photo.jpg           (the card thumbnail and article picture, a file in static/images/)
image-alt: What the photo shows   (optional)
draft: yes                        (optional, keeps the article out of the site)
---
```

## Levels

- Every article needs a level, and it must be exactly one of Intermediate, Advanced or Proficient (capital letters do not matter). Anything else stops the build with a clear message, so a typo cannot slip through.
- The level is shown on the card and the article page.
- The tabs give each level its own page: `/intermediate/`, `/advanced/` and `/proficient/`. A level with no articles yet shows "No ... articles yet".
- The older and newer links at the bottom of an article stay within that article's level.

## Pictures

- Put the file in `static/images/` and name it in the header as `image: images/your-file.jpg`.
- Use a landscape picture at least 1200 pixels wide, with the important part in the middle. Cards crop it to 3:2 and the article page crops it to 16:9.
- Keep each file under about 200 KB (JPG or WebP) so the gallery loads quickly on phones.
- An article with no picture still works: its card shows the level name on a coloured block.
- The three `sample-*.svg` pictures are placeholders. Delete them with the sample articles.

## Formatting in the article text

- A blank line starts a new paragraph.
- `## Heading` and `### Smaller heading`
- `**bold**` and `[link text](https://address)`
- Lines starting with `- ` make a list.
- Lines starting with `> ` make a highlighted quote block.
- `![description](images/photo.jpg)` on its own line adds a picture inside the article.

There is deliberately no italic.

## What is in this folder

- `content/` has one text file per article.
- `static/` has the pictures (`static/images/` and the small copies in `static/images/thumbs/`).
- `docs/` is the finished website. Do not edit it by hand, it is rebuilt every time.
- `build.py` builds the site, `style.css` is the design, and `tools/` holds the publisher.

## Change the site wording

The site name, tagline and the two social links on the About page are at the top of `build.py` in the `SITE` block. Colours and type are in `style.css`.

## Publish

The site is hosted on GitHub Pages from the `docs/` folder of the `main` branch, at johnplusnews.com. After building, commit and push, and the new article is live within a minute or two.

`static/CNAME` holds the domain name and `static/.nojekyll` tells GitHub not to process the files. The build copies both into `docs/`. Do not delete them.

The three articles in `content/` are samples. Delete them once the first real article is in.
