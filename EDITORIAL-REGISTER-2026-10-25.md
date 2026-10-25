# Editorial and question update, 25 October 2026: completion register

Status: applied and committed locally. Not pushed and not published. Nothing here claims live publication.

Source: johnplusnews-claude-editorial-and-question-update-2026-10-25.md (and its companion JSON).

## What was done

| Area | Result |
|---|---|
| Questions | Exactly 3 opening and 3 closing questions on every story at every level, same wording at all three levels. Core sentence help sits outside the list. All 642 question rows read "3 questions". No 4 or 5 question labels remain. |
| Headlines | Specific overrides applied. The Advanced helper text now reads "Natural language, richer detail and room for discussion." |
| Prose | All 107 stories (77 main, 30 Teens) revised version by version against the per-version directions and proposed passages. The three complete worked rewrites (A007 Advanced, T09 Advanced, T26 Advanced) replace those versions verbatim. |
| Summaries | Rewritten to lead with the event or dilemma. Teacher-facing and thesis wording removed wherever found, at level and card level. Card summaries kept in step with the Intermediate summary. |
| Matching | The definition bank is shuffled independently of the term list. Scoring uses the pair's own number, not its position. Checked on all 321 sets in the built pages: no term keeps its position, no set is reversed, and the lettered print key is in the same order as the displayed options. |
| Exercises | Every item in every set at every level was inspected against the final text: 107 stories x 3 levels x 4 exercises, 6,035 items. 3,973 were retained and verified. 2,062 were rewritten. |
| Exercise behaviour | Show answers now marks the attempt as assisted: a later Check no longer reports a perfect score, and the overall tally leaves it out. Unanswered gaps, boxes, drop-downs and true/false items are flagged and counted ("2 of 5 correct, 3 not answered"). Try again clears responses, flags and scores. |

## Exercise items by level and edition

| | Items | Rewritten |
|---|---|---|
| Core | 1,956 | 589 |
| Intermediate | 2,033 | 637 |
| Advanced | 2,046 | 836 |
| Main (77 stories) | 4,312 | 1,370 |
| Teens (30 stories) | 1,723 | 692 |

| Exercise type | Retained and verified | Rewritten |
|---|---|---|
| Gap fill | 1,398 | 361 |
| Matching | 1,002 | 282 |
| Grammar / word formation | 944 | 661 |
| True / false / not given | 629 | 758 |

## Main corrections made to exercises

- Targets that the prose revision had removed (gap answers, matching terms, word-formation answers), worst at Advanced, were replaced with language that is in that level's text.
- True/false/not given: reasons now quote that level's text verbatim; false items genuinely contradict it; not-given explanations say what the text leaves out; "the article says" frames removed.
- Word formation: many cues ran backwards (derived word to root). Replaced with real prefix and suffix items from the text.
- Verb items: ambiguous tenses removed, accepted variants listed after a bar, cue-equals-answer items reduced, forms spread.
- Gap distractors that could fit a gap, or appeared in a gap sentence, were replaced.
- Matching definitions that repeated a head word, were too short, or overlapped each other were rewritten; gap/match overlap is two items at most.
- Teens: items about named private people and minors' circumstances replaced with neutral facts; no item rewards celebrity knowledge.

## How the register was produced

- Review: eight reviewers each took 12 to 15 stories and read every item against its level's final text, rewrote weak items, and wrote a record of what changed and why.
- Reconciliation: each record was compared automatically with the committed exercise files. An item counts as retained only if it is identical to the committed version (including its feedback text); every other item is listed as rewritten with its reason. No unlisted change and no listed change without a matching new item remained.
- Mechanical checks: the structural and strict validators report zero errors on all 107 files.
- In-browser checks, on the built site: every gap, match, grammar and true/false block on all 107 pages at all three levels (1,284 blocks) scored full marks when answered correctly. A worked page was also tested for unanswered, wrong, show-then-check, try again, the overall tally and level switching (answers in one level do not appear in another). A mobile-width view showed wrong and unanswered markers clearly.
- Page checks on all 107 pages: six question rows each with three non-empty, non-duplicate questions; headline and summary present; no stray markup or em dashes.

## Files

- editorial-register-items.csv: one row per item, keyed by article URL + level + exercise type + item ID, with status, final answer, accepted alternatives (or the matching term), and a text anchor or rewrite reason.
- editorial-register-versions.csv: one row for each of the 321 versions: exercise and item counts, items changed, key corrections, matching-order check, unresolved issues.

## Limits and open points

- This is an editorial and language review, not a new external fact-check of the source stories, and the prose was revised from the directions and proposed passages rather than re-proofread word by word.
- Retained items are recorded as verified by the reviewer's reading of the final text; there is no second independent reader. A spot check of one Advanced set found it sound.
- A006 (slug learning-to-read-at-42-...): the slug and original date say 42 but all three texts say 46. The slug is stable, so it was left. Decide whether to keep it.
- Some validator warnings are accepted on purpose: "not in the verified list" notes for phrases that are in the text, and the proper name Pew Research Center.
- The three commissioned adult stories (P01 to P03) are not in the catalogue yet. The same rules apply when they are drafted.
- Nothing has been pushed. Publishing needs John's go-ahead.
