-- johnplusnews: "In my words" on a saved word.
-- Each saved word gets a box the reader types their own definition into, in the
-- article and again on My words. Run once in the Supabase SQL editor for the
-- project uovqsqnxcgvefxpxntcj. Safe to run twice.
-- Until it is run the box still works, but what is typed stays on the device it
-- was typed on: the site leaves the column out of every request and carries on.

alter table public.news_words
  add column if not exists note text check (char_length(note) <= 400);
