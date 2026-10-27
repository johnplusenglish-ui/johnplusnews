johnplusnews: four new stories, 27 October 2026
===============================================

Implements `09-four-new-article-source-pack.md` from the 27 October handoff pack. Every
other file in that pack is byte-identical to the 26 October pack, which was already
implemented, so nothing else in it was re-run.

Catalogue after this change: 80 main stories and 31 Teens stories, 111 in total, 333
level versions.

Completion register
-------------------

A row passes only when the prose, the two question sets, all four exercises, the sources
and the rendered layout have been checked. Images are the one outstanding item and are
marked as such.

| # | Story | Level | Words | Prose | Questions | Exercises | Full marks | Sources | Image |
|---|-------|-------|-------|-------|-----------|-----------|------------|---------|-------|
| 1 | why-does-the-generation-gap-feel-so-wide | Core | 386 | yes | 3 + 3 | 18 items | 18/18 | 3 | pending |
| 2 | why-does-the-generation-gap-feel-so-wide | Intermediate | 442 | yes | 3 + 3 | 18 items | 18/18 | 3 | pending |
| 3 | why-does-the-generation-gap-feel-so-wide | Advanced | 511 | yes | 3 + 3 | 18 items | 18/18 | 3 | pending |
| 4 | has-streaming-beaten-the-cinema | Core | 364 | yes | 3 + 3 | 18 items | 18/18 | 3 | pending |
| 5 | has-streaming-beaten-the-cinema | Intermediate | 444 | yes | 3 + 3 | 18 items | 18/18 | 3 | pending |
| 6 | has-streaming-beaten-the-cinema | Advanced | 506 | yes | 3 + 3 | 18 items | 18/18 | 3 | pending |
| 7 | therapy-is-more-normal-is-it-easier-to-get | Core | 379 | yes | 3 + 3 | 18 items | 18/18 | 3 | pending |
| 8 | therapy-is-more-normal-is-it-easier-to-get | Intermediate | 430 | yes | 3 + 3 | 18 items | 18/18 | 3 | pending |
| 9 | therapy-is-more-normal-is-it-easier-to-get | Advanced | 497 | yes | 3 + 3 | 18 items | 18/18 | 3 | pending |
| 10 | looksmaxxing-self-care-or-a-dangerous-score | Core | 288 | yes | 3 + 3 | 18 items | 18/18 | 3 | pending |
| 11 | looksmaxxing-self-care-or-a-dangerous-score | Intermediate | 404 | yes | 3 + 3 | 18 items | 18/18 | 3 | pending |
| 12 | looksmaxxing-self-care-or-a-dangerous-score | Advanced | 490 | yes | 3 + 3 | 18 items | 18/18 | 3 | pending |

Word counts sit within 25 words of the house median for that level and audience
(main 380 / 455 / 500, Teens 292 / 386 / 466), measured across the existing 107 stories.

Each level carries 5 gap-fill items with 2 unused distractors, 4 meaning matches,
5 grammar items and 4 true/false/not given items: 216 items in total. Every level's
four blocks were filled with their stored answers in the browser and scored 18 out of 18.

Where this departs from the pack
--------------------------------

The pack's source selection was checked against the live sources before anything was
written. Three figures did not survive that check.

1. **Cinema attendance.** The pack says "about two thirds had seen a recent release in a
   cinema" from the AP-NORC poll. The published figure is 65% who have been to a cinema
   at least once, with no timeframe given on the AP-NORC page, so it cannot carry the
   phrase "a recent release". It is not used. The article uses only the three figures the
   release states plainly: 75% streamed a recently released film at home instead of going
   out for it in the past year, 16% go to a cinema at least monthly, and 32% stream a new
   release monthly. The fieldwork was 21 to 25 August 2025; the pack's 25 September 2025
   is the publication date.

2. **European admissions.** The pack cites 843 million admissions in 2024, down 1.7%. The
   Observatory has since published 2025 figures, and a story running in October 2026
   should use them: admissions down about 5.5% to roughly 796 million, with box office
   revenue broadly level. The pack's global claim for 2025, up about 5% and still some 30%
   below the pre-pandemic average, checks out and is used.

3. **Treatment access.** The pack says "about one in three people with mental-health needs
   in EU countries accessed treatment in the previous year". The OECD's own wording is
   that nearly two thirds of people in the EU who need mental healthcare are estimated to
   face inadequate access. The articles use the OECD's wording, and say that the estimate
   is modelled.

Everything else was confirmed against the source: the Eurostat figures of 89.3% and 67.3%
for 2025, published 9 April 2026; the 2023 Eurobarometer figures of 45% and 52%; the BACP
survey of 5,058 UK adults between 16 February and 6 March 2026, with 37%, 35%, 72%, 35%
and 22%; the BFI tracker's 14%, fielded in the second half of March 2025; the 8,072
comments in Halpin and colleagues, published 11 March 2025; and the Centre for Young
Lives figure of 61%, published 25 June 2026.

Two further editorial decisions:

- The looksmaxxing article names no dangerous practice and gives no method for one. It
  says only that the advice runs from ordinary grooming to unproven products, severe diets
  and self-inflicted injury. The pack's safety rules require this and the Teens audience
  makes it non-negotiable.
- The forum study is described throughout as evidence about one forum. It is never used as
  a prevalence figure for teenagers in general.

Matching exercises
------------------

The displayed order of the meanings comes from a hash of slug, level and term, so it is
fixed but not authored. Ten of the twelve new sets happened to leave at least one item
answerable by its own position, and one left all four, which the pack forbids. All 321
existing sets have none, so the pairs in the new files were reordered until every set is a
derangement. Verified across all 333 sets.

Outstanding
-----------

- **Hero images for all four stories.** Prompts in John's house format are in
  `~/Desktop/untitled folder/jpn-image-prompts-2026-10-27.html`. Until the files are added,
  the cards fall back to the existing tinted topic placeholder, which looks deliberate but
  is not the finished article. Each story needs `image:` and `image-alt:` adding to its
  front matter; `image-credit-label: AI illustration` is already in place.
- The four stories are members-only, like every story outside the three free slugs.
