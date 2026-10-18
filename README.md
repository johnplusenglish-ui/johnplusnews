# johnplusnews

News articles from around the world for English learners. The home page is a gallery of cards, newest first, each with a thumbnail, the heading and a short summary. Each article can be written at up to three levels, Core, Intermediate and Advanced, and readers switch between them with tabs on the article page. Readers can also choose a reading font. No database, no login, no admin page. Each article is a plain text file; a small script turns the files into the site.

## Add an article with the publisher (easiest)

Double-click `Publish an article.command`. A Terminal window opens and the publisher appears in your browser. Keep the Terminal window open while you work, and close it when you are finished.

1. Fill in the title and check the date.
2. Choose a picture (click the box, drag a picture onto it, or paste one). It is shrunk automatically and a small copy is made for the gallery cards.
3. Tick each level you are adding (Core, Intermediate, Advanced). A box appears for each ticked level, so paste that level's text into it. If a level has its own headline or subheading, put them in that box's optional fields, otherwise leave them empty. Tick one level for a single version, or two or three to give the article tabs. Add a summary line, and a source name and link if you want them.
4. Press **Preview** to see it exactly as it will look, without publishing anything.
5. Press **Publish**. The site is rebuilt and sent to GitHub, and the page tells you when the article is live on johnplusnews.com, usually within one to two minutes. When it is live, a **View the live article** button appears under the Publish button.

Your articles are listed on the right. **Edit** opens one back up (its web address stays the same), **View live** opens it on johnplusnews.com in a new tab, and **Remove from site** takes it off the live site. The editing banner at the top of the form also has a link to the live article.

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
date: 2026-10-20                  (required, year-month-day; use the date of the news story, the home page lists articles newest first by this date)
summary: One or two sentences.    (optional, shown under the title and in lists)
tags: Technology, Society          (optional, up to 8 topics separated by commas, see Topics and search)
level: Advanced                   (only for an article with ONE version, see Levels below)
source: Name | https://link       (optional, shown at the bottom)
image: images/photo.jpg           (the card thumbnail and article picture, a file in static/images/)
image-alt: What the photo shows   (optional)
image-credit: Name, Agency        (optional, shown as a small "Photo:" line under the picture)
image-credit-url: https://link    (optional, makes the credit name a link; needs image-credit)
image-licence: CC BY-SA 4.0       (optional, the picture licence, added to the credit line)
image-licence-url: https://link   (optional, makes the licence a link; needs image-licence)
image-credit-note: via Wikimedia Commons, resized   (optional extra words on the credit line)
image-credit-label: Image         (optional first word of the credit line, default Photo)
draft: yes                        (optional, keeps the article out of the site)
---
```

## What a card on the home page shows

Each card shows the picture, then the article's topics (its tags, in blue) and its date, then the headline and summary. The levels are not repeated on the card because every article page already has its level tabs. An article with no tags shows just the date, and a card with no picture shows its topics on the coloured block. Articles are listed newest first by their `date:`; for two articles with the same date the one added to the site later comes first.

## If you change an article outside the publisher

The publisher remembers which version of an article it opened. If the article file changes after that (for example Claude edits it, or it is open in two publisher windows) and you then press Publish or Preview on the old form, the publisher refuses with a message saying the article was changed outside the publisher, and saves nothing. Press **Edit** on the article again to load the latest version and redo your change. This stops an old form quietly overwriting newer text.

## Topics and search

Give an article `tags:` in its header (in the publisher, the **Tags** box: type a tag and press Enter, or press one of the suggested tags to reuse it). Tags become **topics**: a row of buttons under the banner on the home page (All, Technology, Society and so on, biggest first), one page per topic at `/tags/<topic>/` that lists its articles, and small Topics links under each article. Reuse the same spelling so related articles stay together (the publisher does this for you, so "technology" becomes the existing "Technology"). A topic page appears when an article uses the tag and disappears when none does. Both the home page and the topic pages have a **Search articles** box that filters the cards as you type, looking through the headlines (both levels), summaries, tags and level names. It is a small script in `build.py` (`FINDER_JS`); without JavaScript the box is hidden and the topic buttons still work. Search does not look inside the article text, so give each article a clear headline, summary and tags.

## Levels and tabs

An article has one version for each level it is written at. There are three levels: Core (B1), Intermediate (B2) and Advanced (C1). Readers get a tab for each version on the article page, and the page remembers the level they chose last, so they land on their own level in every article. A reader who has not chosen yet lands on Intermediate (or on the first version if an article has no Intermediate). If an article has only one version, there are no tabs and its level is simply shown above the title.

By hand, an article with one version uses `level: Advanced` in the header. An article with several versions leaves `level:` out and starts each version with a marker line:

```
title: The article title
date: 2026-10-20
---
=== Core ===

The simplest text goes here.

=== Intermediate ===

The middle text goes here.

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

When a reader switches tab, the headline, the subheading and the browser tab title change with it. The gallery card and the link preview always use the main title and summary from the top of the file, which should be the Intermediate version's. In the publisher, each level's box has optional "Headline" and "Subheading" fields for this; leave them empty to use the title and summary at the top of the form. A level can appear only once, and a level name that is not one of the three stops the build with a clear message.

## Questions before and after the article

An article can have two optional sets of questions: **Before you read** (warm-up questions) and **Talk about it** (discussion questions). On the page they are two quiet one-line rows, one under the picture and one under the text, closed until a reader opens them, so the article itself stays clean. The PDF always prints both open, in a tinted box. Every level shares the same questions, so keep the wording simple enough for the Core level.

## Useful language

Each level can carry a short list of the useful language in its text: adjectives, phrasal verbs and idioms or phrases (three of each is the house minimum, written into the article so they read naturally). In the file, put a section after that level's text:

```
=== Core language ===

- turn up (phrasal verb): to arrive somewhere
- exhausting (adjective): making you very tired
- in the long run (phrase): over a long period of time
```

One item per line: the words exactly as they appear in the text, the type in brackets, a colon, then a short meaning. The site underlines the first place each item appears in that level's text (a dotted line; tapping it shows the meaning) and adds a tinted, collapsible **Useful language** row above the text, as a task before reading, which opens to three short lists (adjectives, phrasal verbs, idioms and phrases), each item with a short meaning. Tapping an item copies it and **Copy list** copies them all, so students can paste them into their notes. **Hide meanings** blurs every definition so a student can test themselves; tapping an item then reveals that one. The choice is remembered on that device, and the PDF always prints the meanings. The table switches with the level tabs and is printed in the PDF. An item whose exact words are not in the text is still listed, and the build prints a note so you can fix the wording. In the publisher, each level has a "Useful language" box.

In the publisher, use the two boxes called **Before you read** and **Talk about it** under the article text (one question per line, up to 12 each; a leading dash or number is dropped). Leave a box empty for no row. By hand, add these after the level texts, one question per line:

```
=== Before you read ===

- Have you ever visited a very old village?
- What can happen when young people leave a small town?

=== Talk about it ===

- Is tourism always good for the people who live in a place?
```

The words in the marker lines must be exactly "Before you read" and "Talk about it". They can sit anywhere after the header line, and the level texts are not affected. The code is `split_sections` and `questions_html` in `build.py`, with the styling under "questions" in `style.css`.

## Recordings (the Listen player)

Each level of an article can have its own recording. In the publisher, tick a level and use **Recording of the ... version** under its text: choose an m4a, mp3, wav or aiff file (a Voice Memos or QuickTime recording works), and fill in the label shown beside the player (it starts as "Read by John"; for an AI voice write something like "AI voice"). On publishing, the Mac's own audio tool shrinks it to a small mono m4a under `static/audio/` (about 2 MB for four minutes), and the page gets a quiet **Listen** row under the picture with play and pause, back 10 seconds, a seek bar, the time and a speed button (1x, 1.25x, 1.5x, 0.75x, remembered on that device). Switching level swaps to that level's recording and pauses the other. A version with no recording shows no player, and the PDF never prints it. To replace or remove a recording, open the article with Edit; recordings that no article uses any more are deleted automatically.

By hand, put these two lines straight after the level marker, before the text: `audio: audio/my-file.m4a` (a file in `static/audio/`, or a full https link to a recording kept elsewhere) and `voice: Read by John`. The player is `static/listen.js`, built in `build.py` (`listen_html`) and styled under "listen" in `style.css`.

Paywall note: this site is plain static hosting, so every file in `static/` (and the public GitHub repository) can be downloaded by anyone who knows its address. That means recordings cannot be locked behind a login here. If audio becomes paid, the recordings need to live on a members service (for example a video and audio host with signed links, Supabase storage with sign-in, or a membership platform) and the `audio:` line can point at that host; only the player and the hosting would change, not the articles.

## Highlighting words (for readers)

Readers can select any words in an article text (up to about 90 characters, inside one paragraph or heading). A small dark **Highlight** pill appears next to the selection. Pressing it gives the words an amber underline and adds them to a numbered **Highlights** list under that text. Alt+H does the same from the keyboard, and Escape hides the pill. Pressing an underlined word offers **Remove highlight**, each list entry has a cross to remove it, and the list has **Copy list** (one word or phrase per line) and **Clear all**. Highlights are kept in the reader's own browser, separately for each article and each level, and nothing is sent anywhere. The code is in `static/highlight.js` (loaded only on article pages) and its styling is under "highlights" in `style.css`. If an article's text is edited later, saved highlights are matched again by their words, and any that can no longer be found are dropped.

## Saving an article as a PDF (for readers)

Every article page has a small **PDF** button next to the font menu. It opens the browser's print window with a print layout built for it, so nothing needs to be generated or uploaded. The sheet is A4: the date and level, the headline, the subheading and the picture with its credit run across the top, then the text sits in two neat columns (justified with hyphens, or left-aligned when the reader chose Verdana, Atkinson or Lexend), and the reader's own **Highlights** list follows, with the amber underlines kept. Only the level on screen is printed and the file is named after the headline and level. In Chrome or Edge choose **Save as PDF** as the destination; on a phone use Share or Print and choose PDF. The page margin is set to zero in the print rules (the white border is padding that repeats on every page), which is what stops Chrome and Edge adding their own date, title and web address across the top and bottom, so readers do not need to untick **Headers and footers**. The cost is that there are no page numbers. Browsers that cannot repeat the padding fall back to normal page margins with page numbers. The print rules are at the end of `style.css` (the `@media print` block) and the button script is `PRINT_JS` in `build.py`.

## Reading font

Every article page has a Reading font menu: Georgia (the default), Outfit (the site font), Verdana, Atkinson Hyperlegible and Lexend. The choice applies to the headline, subheading, text, highlights list and questions, is remembered on that reader's device, and is what the PDF uses. The default values (Georgia) sit under `:root` in `style.css` and each other font is a `[data-font="..."]` block. The two web fonts are only downloaded when a reader opens the menu or has chosen one. To add a font, edit `FONTS` in `build.py` and add a `[data-font="..."]` rule and a matching `.fo-...` preview rule in `style.css`.

## Pictures

A credit is not a licence. Naming the photographer does not give you the right to publish their picture. Only use pictures you took yourself, pictures with a licence that allows it (for example Creative Commons, with the credit that licence asks for), or pictures you have asked permission to use. The credit line is there for the credit that a licence or permission requires. In the publisher, fill in "Picture credit" and, if you want it, "Credit link", "Licence", "Licence link" and "Extra words for the credit". The credit appears on the article page only, not on the gallery card.

For a Creative Commons picture from Wikimedia Commons, copy the details from the file's page on Commons:

- Picture credit: the author's name, as shown on the file page.
- Credit link: the address of the file page itself.
- Licence: for example `CC BY-SA 4.0`, with the licence link from the file page (for example `https://creativecommons.org/licenses/by-sa/4.0/`).
- Extra words: `via Wikimedia Commons, resized and cropped`. Licences like CC BY ask you to say if you changed the picture, and the site resizes every picture and crops it to fit.

This gives a line like "Photo: Barcex, CC BY-SA 4.0, via Wikimedia Commons, resized and cropped", with the name and the licence as links.

For a picture you made with an AI image tool, there is no photographer to credit, and the honest label is that it is AI-generated, especially when it looks like a real photograph of a real place. In the publisher put `Image` in "First word of the credit", `AI-generated` as the picture credit, and optionally `not a real photograph` in the extra words. The line then reads "Image: AI-generated, not a real photograph".

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
- `build.py` builds the site, `style.css` is the design, `static/highlight.js` is the word highlighter, and `tools/` holds the publisher and the script that makes the Dock app.

## Change the site wording

The site name, tagline and the two social links on the About page are at the top of `build.py` in the `SITE` block. Colours and type are in `style.css`.

## Publish

The site is hosted on GitHub Pages from the `docs/` folder of the `main` branch, at johnplusnews.com. After building, commit and push, and the new article is live within a minute or two.

`static/CNAME` holds the domain name and `static/.nojekyll` tells GitHub not to process the files. The build copies both into `docs/`. Do not delete them.
