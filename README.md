# johnplusnews

A new article every week for English learners. The home page is a gallery of cards, newest first, each with a thumbnail, the heading and a short summary. Each article can be written at two levels, Intermediate and Advanced, and readers switch between them with tabs on the article page. Readers can also choose a reading font. No database, no login, no admin page. Each article is a plain text file; a small script turns the files into the site.

## Add an article with the publisher (easiest)

Double-click `Publish an article.command`. A Terminal window opens and the publisher appears in your browser. Keep the Terminal window open while you work, and close it when you are finished.

1. Fill in the title and check the date.
2. Choose a picture (click the box, drag a picture onto it, or paste one). It is shrunk automatically and a small copy is made for the gallery cards.
3. Tick each level you are adding (Intermediate, Advanced). A box appears for each ticked level, so paste that level's text into it. If a level has its own headline or subheading, put them in that box's optional fields, otherwise leave them empty. Tick one level for a single version, or both to give the article tabs. Add a summary line, and a source name and link if you want them.
4. Press **Preview** to see it exactly as it will look, without publishing anything.
5. Press **Publish**. The site is rebuilt and sent to GitHub, and the page tells you when the article is live on johnplusnews.com, usually within one to two minutes.

Your articles are listed on the right. **Edit** opens one back up (its web address stays the same) and **Remove from site** takes it off the live site.

If GitHub does not accept the upload, the page says so. Your article is still saved on your Mac, so fix the problem and press Publish again.

## Sign in to GitHub (one time)

The publisher needs a GitHub token saved on your Mac before it can send articles to the website. If you see "GitHub needs your sign-in", click **Open the sign-in window** in the publisher, or double-click `Sign in to GitHub.command`. It explains how to make a token if you do not have one, asks you to paste it (nothing shows as you paste), saves it in your Mac's keychain and tests it. If GitHub refuses the token it is not kept, and you can run the file again with a new one. After that, publishing works without Terminal.

## Put the publisher in your Dock

Run `python3 tools/make_dock_app.py` once. It makes `Publish an article.app` in this folder, with a blue icon. Drag that app onto your Dock, and click it whenever you want to publish. It opens `Publish an article.command` in Terminal, so keep the app in this folder, next to that file. If you ever move or delete the folder, run the script again and drag the new app onto the Dock. The app is not saved to GitHub, only the script that makes it.

## Add an article by hand

1. Create a file in `content/` named `YYYY-MM-DD-short-title.md`, for example `2026-10-20-the-news-title.md`.
2. Write the header, then a line containing only `---`, then the article. For one level, put `level: Advanced` in the header. For several levels, leave `level:` out and start each version with a line like `=== Intermediate ===` (see Levels below).
3. Run `python3 build.py`. The finished site is written to `docs/`.
4. Preview with `python3 build.py --serve` and open http://localhost:8123.

The file name decides the web address: `2026-10-20-the-news-title.md` becomes `/articles/the-news-title/`.

## Header fields

```
title: The article title          (required)
date: 2026-10-20                  (required, year-month-day)
summary: One or two sentences.    (optional, shown under the title and in lists)
level: Advanced                   (only for an article with ONE version, see Levels below)
source: Name | https://link       (optional, shown at the bottom)
image: images/photo.jpg           (the card thumbnail and article picture, a file in static/images/)
image-alt: What the photo shows   (optional)
image-credit: Name, Agency        (optional, shown as a small "Photo:" line under the picture)
image-credit-url: https://link    (optional, makes the credit name a link; needs image-credit)
image-licence: CC BY-SA 4.0       (optional, the picture licence, added to the credit line)
image-licence-url: https://link   (optional, makes the licence a link; needs image-licence)
image-credit-note: via Wikimedia Commons, resized   (optional extra words on the credit line)
draft: yes                        (optional, keeps the article out of the site)
---
```

## Levels and tabs

An article has one version for each level it is written at. There are two levels, Intermediate and Advanced. Readers get a tab for each version on the article page, and the page remembers the level they chose last, so they land on their own level in every article. If an article has only one version, there are no tabs and its level is simply shown above the title.

By hand, an article with one version uses `level: Advanced` in the header. An article with several versions leaves `level:` out and starts each version with a marker line:

```
title: The article title
date: 2026-10-20
---
=== Intermediate ===

The simpler text goes here.

=== Advanced ===

The more demanding text goes here.
```

The title, summary, picture and source are shared by all the versions unless a version has its own headline and subheading. To give a version its own, put `title:` and/or `summary:` lines straight after its marker, then a blank line, then the text:

```
=== Advanced ===

title: A different headline for this level
summary: A different subheading for this level

The text starts here.
```

When a reader switches tab, the headline, the subheading and the browser tab title change with it. The gallery card and the link preview always use the main title and summary from the top of the file, which should be the first level's. In the publisher, each level's box has optional "Headline" and "Subheading" fields for this; leave them empty to use the title and summary at the top of the form. A level can appear only once, and a level name that is not one of the two stops the build with a clear message. The gallery cards list the levels each article has.

## Reading font

Every article page has a Reading font menu: Default (the site font), Georgia, Verdana, Atkinson Hyperlegible and Lexend. The choice is remembered on that reader's device and applies to the article text on every article. The two web fonts are only downloaded when a reader opens the menu or has chosen one. To add a font, edit `FONTS` in `build.py` and the `[data-font="..."]` rules in `style.css`.

## Pictures

A credit is not a licence. Naming the photographer does not give you the right to publish their picture. Only use pictures you took yourself, pictures with a licence that allows it (for example Creative Commons, with the credit that licence asks for), or pictures you have asked permission to use. The credit line is there for the credit that a licence or permission requires. In the publisher, fill in "Picture credit" and, if you want it, "Credit link", "Licence", "Licence link" and "Extra words for the credit". The credit appears on the article page only, not on the gallery card.

For a Creative Commons picture from Wikimedia Commons, copy the details from the file's page on Commons:

- Picture credit: the author's name, as shown on the file page.
- Credit link: the address of the file page itself.
- Licence: for example `CC BY-SA 4.0`, with the licence link from the file page (for example `https://creativecommons.org/licenses/by-sa/4.0/`).
- Extra words: `via Wikimedia Commons, resized and cropped`. Licences like CC BY ask you to say if you changed the picture, and the site resizes every picture and crops it to fit.

This gives a line like "Photo: Barcex, CC BY-SA 4.0, via Wikimedia Commons, resized and cropped", with the name and the licence as links.

- Put the file in `static/images/` and name it in the header as `image: images/your-file.jpg`.
- Use a landscape picture at least 1200 pixels wide, with the important part in the middle. Cards crop it to 3:2 and the article page crops it to 16:9.
- Keep each file under about 200 KB (JPG or WebP) so the gallery loads quickly on phones.
- An article with no picture still works: its card shows its level names on a coloured block.

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
- `build.py` builds the site, `style.css` is the design, and `tools/` holds the publisher and the script that makes the Dock app.

## Change the site wording

The site name, tagline and the two social links on the About page are at the top of `build.py` in the `SITE` block. Colours and type are in `style.css`.

## Publish

The site is hosted on GitHub Pages from the `docs/` folder of the `main` branch, at johnplusnews.com. After building, commit and push, and the new article is live within a minute or two.

`static/CNAME` holds the domain name and `static/.nojekyll` tells GitHub not to process the files. The build copies both into `docs/`. Do not delete them.
