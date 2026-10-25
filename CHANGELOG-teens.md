# JohnPlusNews Teens: completion register

Prepared 25 October 2026. The section is built and verified locally. **Nothing has been pushed to the live site.**

## What exists

- A **Teens** link in the main navigation (desktop and phone), a `/teens/` collection page and 12 complete lessons, each at Core, Intermediate and Advanced.
- Every lesson has three reading versions with their own headline and deck, three warm-up questions and five talk-about-it questions per level, one shared classroom activity, four exercise types per level, source links with dates and an original illustration.
- 36 reading versions, 36 exercise sets (695 items: 180 gap-fill, 144 matching, 180 verb or word-formation, 191 reading checks), 12 images with thumbnails and alt text.

## The 12 lessons

| # | Category | Core / Intermediate / Advanced headline | Words (C/I/A) | Source date |
|---|---|---|---|---|
| 1 | School life | Would You Like School to Start Later? / Would You Choose a Later Start to School? / A Later Start, a Later Finish: Would You Take the Deal? | 265 / 378 / 479 | 26 February 2026 |
| 2 | Games & online life | Can You Make Friends in a Game? / Can a Game Be a Place to Meet Friends? / Logging On to Spend Time Together | 296 / 423 / 514 | 9 May 2024 |
| 3 | Music & style | Can You Love a Song You Don't Understand? / Why a Great Song Doesn't Need Your Language / You Don't Know the Words. You Know the Feeling. | 288 / 358 / 470 | 11 March 2026 |
| 4 | Games & online life | What Does That Message Really Mean? / Who Makes the Rules in a Group Chat? / One Message, Three Different Meanings | 330 / 394 / 472 | October 2025 |
| 5 | Science & making | Can Dogs Smell Our Stress? / Can Dogs Smell When People Are Stressed? / What a Dog's Nose Might Notice Before You Do | 326 / 367 / 479 | 22 July 2024 |
| 6 | Music & style | Would You Wear Another Team's Shirt? / Would You Wear a Rival Team's Shirt? / You Love the Shirt. Your Friends Hate the Team. | 344 / 401 / 453 | 27 August 2026 |
| 7 | School life | Would You Let AI Help with Your Homework? / AI Did the Homework. Who Did the Learning? / When Does Homework Help Become Someone Else's Work? | 331 / 376 / 457 | 21 May 2026 |
| 8 | Music & style | Does a Good Photo Have to Be Perfect? / What Makes a Bad Photo a Good Memory? / Would You Keep the Blurry Photo? | 319 / 422 / 484 | 8 August 2026 |
| 9 | Places & people | Where Can Teenagers Spend Time Together? / Who Decides Where Teenagers Can Hang Out? / Old Enough to Go Out. Nowhere to Sit. | 331 / 431 / 494 | undated page |
| 10 | Games & online life | Would You Buy a Surprise Box? / Would You Buy a Box Without Knowing What's Inside? / Do You Want the Toy, or the Surprise? | 294 / 397 / 491 | 4 June 2025 |
| 11 | Science & making | A Tiny Satellite Students Can Build / Could You Build a Satellite That Fits in a Can? / One Can, One Mission, a Team Full of Ideas | 323 / 370 / 496 | 10 September 2026 |
| 12 | Science & making | Could You Give Old Clothes a New Look? / Can a Repair Make Your Clothes More You? / The Patch You Wouldn't Want to Hide | 305 / 387 / 453 | event listed for 19 April 2026 |

## Where the sources differed from the brief

- **T01 school start.** The University of Zurich release says classes at the Gossau school used to begin at 7:20, with a flexible start at 7:30 or 8:30. The study abstract says two secondary schools, so the texts say "a secondary school in Gossau" and the Advanced version explains the difference. 754 responses are never described as 754 students: 351 answered at baseline, 403 at follow-up and 212 at both.
- **T11 CanSat.** The brief says national winners attended. ESA's page says national competitions were held in 26 countries but that the June event itself was non-competitive, and each group presented a feasibility study. The texts say that, and no lesson uses the word "winners".
- **T07 AI.** Ofcom's page sat behind a bot check that I did not try to bypass. The 56% (ages 8 to 17) and 66% (ages 16 and 17) figures, and the findings on limited understanding of how AI works and few children questioning accuracy, were confirmed through a news report quoting Ofcom's Children's Online Experiences research. The primary page itself was not read. Any claim about learning effects is deliberately absent.
- **T04 group chat.** UNICEF Argentina's landing page was read in full. The glossary PDF could not be extracted with the tools available, so no glossary entry is quoted or described beyond what the landing page says (more than 100 terms, abbreviations, phrases and emojis; started by young people). The sample message in the lessons is invented and says so.
- **T08 photos.** The BBC article was read in the browser. The eBay, Backmarket and film-camera figures in it are not used, and the texts say the interviewees are adults in their twenties and thirties.
- **T10 blind boxes.** AP's story was read through syndicated copies. It is presented as a dated 2025 example with company and adult-buyer data, not a report on teenage buying.
- **T02 games.** Pew's report was read in the browser. Its figures are described as US teens, and UNICEF's study is described as children, not as a survey of teenagers.
- **T09 Barcelona.** The project page is undated and reports plans, not results, so the texts say "was planned" and "aims to".

## Decisions I made that you may want to change

- **Teens lessons are not on the home page or the topic pages.** The home page has a visible line pointing to Teens, so they are not silently hidden. Listing them with adult articles is a small change in `build.py`.
- **All 12 lessons are members-only**, like the other 73 articles. Only the three slugs in `site.json` are free. A signed-out visitor who opens a lesson therefore meets the sign-up prompt. Making one Teens lesson free is a one-line change in `site.json`.
- **The floating classroom timer is switched off on Teens pages** because the brief says it must not cover text. It stays on adult articles.
- **Illustrations are original flat artwork made for this site**, not photographs and not in your clay-toy style. They are captioned as illustrations.
- **Exercise format.** The four existing exercise types are kept, so scoring and show-answers behave exactly as they do now. Counts differ from the adult articles (5 or 6 reading checks, 5 gaps).
- **Answer states no longer rely on colour alone**, for these lessons and the adult ones: a tick or cross icon, strike-through on wrong typed answers and dashed borders on wrong drop-downs.

## Checks run

- Text: lengths against the brief's targets, paragraph and sentence length, a reading-grade step between levels in every lesson, no em dashes, emojis, italics or American spellings.
- Evidence: all 155 true or false reasons quote their own level's text in full. Every one of the 36 Not Given statements was tested against its text, and four that were really True or False were replaced.
- Items: every gap answer and matching term appears in its own level's text. Matching options are in a different order from their terms. No distractor appears in a sentence. Every gap, verb and word-formation sentence was read with its answer in place, and about 40 distractors that could fit another gap were replaced.
- Behaviour: in a real browser, all 12 lessons at all 3 levels score full marks on a correct run; wrong answers score less; Show answers is flagged as assisted; Try again clears.
- Layout: 1, 2 and 3 columns at phone, tablet and desktop; no horizontal overflow; no clipped headlines; all 12 pages checked at 375px; header fits at 320px; filters add up to 12.
- Site: Teens story links run in collection order; adult pages never link into Teens; the nav link is on every page; the sitemap lists /teens/ and all 12 lessons; the existing 77 articles differ only by the nav link and the new CSS.

## Not done

- No real teenager has read these. The brief asks for the first batch to be tested with actual learners.
- Nothing has been pushed, and there is no Search Console submission.
- The Places & people filter holds one lesson, as the brief's categories imply.
