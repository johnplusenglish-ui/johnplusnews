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

## Update: lessons 13 to 30 (added 25 October 2026)

Eighteen more lessons from the second source pack, taking Teens to **30 lessons and 90 reading versions**. Each has an AI-generated photo (made in ChatGPT from the prompts in `teens-image-prompts-batch2.html`, installed as a 1400px hero and a 1000px card thumbnail, credited "AI-generated image"). Pushed together with the images.

- 54 reading versions, 54 exercise sets (about 1,000 items), all with the same structure as lessons 1 to 12: three warm-up and five talk-about-it questions per level, one shared activity, gap-fill, matching, verb or word-formation and reading checks.
- Four new topic filters on the Teens page: **Sport**, **TV, film & fandom**, **Language & memes** and **Hobbies**. The page intro now starts with "Sport, TV, games, music..." and the page lists 30 stories.
- Checks: word counts against the targets, paragraph and sentence length, a reading-grade step between levels, no em dashes, emojis, italics or American spellings; exercise integrity checks; and an automated run of all 360 exercise blocks on the built pages (every block scores full marks). The two remaining flags are false alarms: "Tony Tony" (Chopper's real name) and "Catalog Avatar Creator" (the Roblox experience's real name).

| # | Category | Core / Intermediate / Advanced headline | Words (C/I/A) | Source date |
|---|---|---|---|---|
| 13 | Sport | Mbappé Changes Brands, and Helps Build Something New / Why Mbappé Swapped Nike for On / Mbappé's Next Move Is About More Than Wearing the Boots | 308/408/497 | 18 September 2026 |
| 14 | Music & style | Why Taylor Swift Bought Her Old Recordings / Why Taylor Swift Bought Back Her Recordings / Taylor Swift's Long Road to Owning Her Music | 283/403/495 | 30 May 2025 |
| 15 | Sport | Playing at the World Cup at 17 / Gilberto Mora: A World Cup Debut at 17 / What Helps When You're the Youngest on the Team? | 282/440/539 | 27 June 2026 |
| 16 | Language & memes | Is "Delulu" a Real English Word? / How Did "Delulu" Get into the Dictionary? / Does a Word Become Less Cool When the Dictionary Finds It? | 275/379/453 | 29 August 2025, updated 29 October 2025 |
| 17 | Language & memes | The Boy Behind the Boat Dance / The Real Story Behind the "Aura Farming" Dance / You Know the Meme. Do You Know Where It Came From? | 289/423/549 | 11 July 2025 |
| 18 | TV, film & fandom | Jenna Ortega Created Wednesday's Dance / Jenna Ortega Made Wednesday's Dance Her Own / Why Wednesday's Dance Didn't Need to Look Like Everyone Else's | 261/373/472 | 25 November 2022 |
| 19 | Music & style | A Cartoon Band with a Real Hit Song / The Fictional Band with a Real Hit Song / Can You Be a Fan of a Band That Doesn't Exist? | 317/446/468 | 18 February 2026 |
| 20 | TV, film & fandom | How a Drawing Became One Piece's Chopper / How One Piece Made Chopper Feel Real / How Real Should a Talking Reindeer Look? | 284/413/479 | 2 June 2025 |
| 21 | TV, film & fandom | The TV Episode Fans Expected, but Never Got / The Stranger Things Episode That Never Arrived / When Does a Fan Theory Start Sounding Like News? | 260/379/477 | 8 January 2026, updated 10 February 2026 |
| 22 | TV, film & fandom | Should a Cinema Be Quiet? / When Minecraft Fans Turned the Cinema into a Show / You Came to Watch. They Came to Shout Along. | 271/395/498 | 17 April 2025, updated 18 April 2025 |
| 23 | Games & online life | What Would Your Game Character Wear? / Why Dress Up an Avatar Nobody Can Touch? / Would Your Avatar Look Like You, or Someone Else? | 276/400/489 | undated; checked 25 October 2026 |
| 24 | Games & online life | Chess on an Esports Stage / How Chess Joined the Esports World Cup / Can a Quiet Board Game Be a Great Spectator Sport? | 275/361/492 | 2 August 2025 |
| 25 | Hobbies | A School Drawing Became a Book Project / The School Sketch That Led to a Book / What Happens When Someone Notices Your Work? | 284/442/521 | 5 October 2026 |
| 26 | Science & making | His Paper-Folding Hobby Led to a Science Prize / The Teen Who Turned Paper Folding into Research / What Can a Folded Wing Teach a Teenage Inventor? | 256/392/457 | 18 May 2026 |
| 27 | Hobbies | A Puzzle Helped Thomas Meet New People / The Teen Who Found His People Through a Puzzle / Would You Enter a Competition for the People, Not the Prize? | 294/422/483 | 16 May 2026 |
| 28 | TV, film & fandom | Would You Queue at Midnight for a Book? / Why Fans Queued at Midnight for a Book / The Book Could Wait Until Morning. The Fans Couldn't. | 311/436/509 | 18 March 2025 |
| 29 | Sport | Kimi Started 19th. He Finished First. / Kimi Antonelli's Comeback from 19th to First / A Bad Start Didn't Decide Antonelli's Race | 316/373/463 | 6 September 2026 |
| 30 | Games & online life | Can You Guess the Country from One Picture? / The World Championship Where You Guess the Place / What Would You Notice If the Map Disappeared? | 301/395/484 | 7 September 2026 |

### Where I departed from the brief, and why

- **Headlines with a dash.** The brief's Core headlines for T13, T21 and T23 used long dashes. They now use a comma.
- **T13 Mbappé.** Read On's announcement and the Reuters report (via Investing.com). The brief's check that this is a sponsorship, not a transfer is in all three versions. No club is named, because neither source names one. No fee, product benefit or investor reaction is used.
- **T14 Swift.** The AP page was blocked. The lesson uses Swift's own letter plus Music Business Worldwide's report of 30 May 2025. The price is never given (Variety, Page Six and the New York Times each report different figures; none is official). Publishing rights are not discussed, because neither source covers them.
- **T15 Mora.** The FIFA page was unreadable with the fetch tool, so I opened it in the browser pane and read it in full. The coach's and goalkeeper's observations are attributed to them. The "youngest Mexican at a World Cup" and "youngest to start for Mexico" claims come from AP. FIFA's own claim (sixth-youngest debutant in World Cup history) is attributed to FIFA. The two sources differ on the date of his senior debut for Mexico, so the lesson says only "at 16".
- **T16 delulu.** The Cambridge blog was read in the browser. Only "delulu" and "skibidi" appear. The dictionary's own definition of "delulu" could not be checked, so the lesson says only that it is short for "delusional" and informal.
- **T17 aura farming.** BBC article read in the browser. Rayyan is named, as the BBC names him, and nothing beyond the BBC's facts is added. The activity is on paper only.
- **T18 Ortega.** The Netflix article names the influences as Lisa Loring, Denis Lavant and Bob Fosse. It does not mention the music or any claims about working while ill, so neither appears.
- **T19 Golden.** Netflix's oral history says the song has won major awards and is nearing four billion streams. The lesson reports only the chart and streaming claims, attributes them to Netflix and dates them to February 2026.
- **T20 Chopper.** The March 2026 video page has only a short description, which was read; the full video was not watched. The "facial capture" explanation is general.
- **T21 Stranger Things.** All plot content from the LBC article is removed. The petition figure (about 390,000) and the unconfirmed crash report are attributed to LBC.
- **T22 Minecraft.** The Erina police incident and the screen-damage cost in the ABC report are left out, because the first is unresolved and the second is an estimate.
- **T23 Roblox.** The page is undated. The "50 million outfits" and award claims are described as the creator's own. No age or player-number claims.
- **T24 chess.** FIDE and Chess.com describe the final's structure differently, so the lessons say so and give no set-by-set account. Prize money is omitted.
- **T25 Bethany.** BBC article read in the browser. Her health details are limited to what she and her mother say in the article, and the lessons state that the story is not a cure story.
- **T26 origami.** Only the Science News Explores article was read; the Society for Science release was not. The text says the article comes from the organisation that runs the fair, so it is not an independent check.
- **T27 cubing.** BBC article read in the browser. I left out the mention of autism and neurodivergence on purpose, because it is not needed for the story and is about a named 15-year-old. The ranking is dated May 2026 and the clock event is separated from the standard cube.
- **T28 Hunger Games.** AP read in the browser. The Bookseller article is paywalled, so only its visible text is used (110 midnight parties and the Piccadilly shop).
- **T29 Antonelli.** Formula 1's report. No standings or points. He is described as a driver, not a teenager.
- **T30 GeoGuessr.** taz (German) and the Steam announcements. The match rules and the final come from taz, because the Steam page does not describe them.
