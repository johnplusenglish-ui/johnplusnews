# Switching on accounts (one time, about 10 minutes)

The site is already built for sign-in. Until you finish the steps below, nobody sees a Sign in button and the site works exactly as before. To avoid a paid Supabase plan, the news site shares the existing book42 project. Its tables all start with `news_`, so they sit beside Book42's tables without touching them.

## 1. Run the setup SQL

1. In the book42 project, open **SQL Editor** and press **New query**.
2. Open `supabase/schema.sql` from this folder, copy everything, paste it in, and press **Run**.
3. It should say "Success". It only creates new `news_` tables, a function and rules. It drops, deletes and alters nothing that exists, and it can safely be run again.

The rules mean students only ever see their own rows, and only a teacher can read everyone's.

## 2. Allow the news site's links

Open **Authentication**, then **URL Configuration**. Under **Redirect URLs** add `https://johnplusnews.com/**`. Leave **Site URL** alone, because Book42 uses it. Password reset and confirmation emails need this to bring students back to the news site.

Leave every other sign-in setting as it is. They apply to the whole project, so changing them would also change Book42.

## 3. Give the site its two keys

1. Open **Project Settings**, then **API**.
2. Copy the **Project URL** and the **anon public** key. Never copy the `service_role` key.
3. Open `static/config.js` and paste them between the quotes.
4. Tell Claude, or run `python3 build.py` and push as usual. The Sign in button appears on every page.

Both values are meant to be public. The anon key only works together with the rules from step 1.

## 4. Make yourself the teacher

1. On the live site, press **Sign in**, then **Create an account**, and make your own account. Open any page once while signed in so your profile is created.
2. Back in the Supabase **SQL Editor**, run this one line with your own address:

```sql
update public.news_profiles set role = 'teacher' where email = 'you@example.com';
```

3. Reload the site. Your menu now has **Teacher view**. Nobody can give themselves this role from the website.

## What students get

- **Highlight words** in any article, as before. When signed in, each highlight is saved with its sentence and follows the student to any device.
- **My words** (account menu): every saved word with its sentence, a search box, Copy words and Download CSV.
- **Progress and preferences**: the site remembers which articles were opened and finished (the home page shows Started or Read), plus the reading font, the level tab and the timer length.
- Words highlighted before signing in are saved to the account the first time they sign in.
- Signing out clears that device's highlights, so the next person on a shared computer starts clean. The saved words stay in the account.

## What you get (Teacher view)

- **Students**: name, email, how many words, articles read, last active. Press a name to see their words by article, each with its sentence.
- **By article**: for each article, the words the class has saved, most popular first, with how many students saved each.
- **Download all words (CSV)** for the whole class.

## Good to know

- Students can see only their own words. Teachers can see every student's words and reading, so the sign-up form tells students that.
- A free Supabase project pauses after a week with no activity. A weekly article and a class using it keeps it awake; if it ever pauses, press Restore in the dashboard.
- To remove a student, open **Authentication**, then **Users**, and delete them. Their words and progress go with them.
- The sign-ins are shared with Book42, so anyone with a Book42 account could sign in on the news site. They only appear in your Teacher view once they have opened it.
