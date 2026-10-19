# Switching on accounts (one time, about 10 minutes)

The site is already built for sign-in. Until you finish the steps below, nobody sees a Sign in button and the site works exactly as before. Accounts live in their own Supabase project, separate from Book42 and the dictionary.

## 1. Make the project

1. Go to supabase.com, sign in, and press **New project**.
2. Name it `johnplusnews`. Pick the region closest to your students. Save the database password somewhere safe (you will not need it again for this).
3. Wait a minute or two until the project is ready.

## 2. Run the setup SQL

1. In the project, open **SQL Editor** and press **New query**.
2. Open `supabase/schema.sql` from this folder, copy everything, paste it in, and press **Run**.
3. It should say "Success". It is safe to run again if you are unsure.

This creates the four tables (profiles, words, progress, prefs) and the rules: students only ever see their own rows, and only a teacher can read everyone's.

## 3. Check the sign-in settings

Open **Authentication**, then:

1. **URL Configuration**: set **Site URL** to `https://johnplusnews.com`. Under **Redirect URLs** add `https://johnplusnews.com/**`. Password reset and confirmation links use this.
2. **Sign In / Providers**, then **Email**: keep it enabled. Set **Minimum password length** to 8. For a class, the easiest setting is **Confirm email: off**, so a student is signed in the moment they create an account. If you leave it on, students must press the link in an email before their first sign-in; the site handles both.
3. Leave every other sign-in provider off.

## 4. Give the site its two keys

1. Open **Project Settings**, then **API**.
2. Copy the **Project URL** and the **anon public** key. Never copy the `service_role` key.
3. Open `static/config.js` and paste them between the quotes.
4. Tell Claude, or run `python3 build.py` and push as usual. The Sign in button appears on every page.

Both values are meant to be public. The anon key only works together with the rules from step 2.

## 5. Make yourself the teacher

1. On the live site, press **Sign in**, then **Create an account**, and make your own account.
2. Back in the Supabase **SQL Editor**, run this one line with your own address:

```sql
update public.profiles set role = 'teacher' where email = 'you@example.com';
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
