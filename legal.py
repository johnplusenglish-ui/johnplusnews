"""The privacy notice, terms and contact pages. Plain English drafts: have a solicitor read them before you take any money.
Edit the details in SITE (build.py): owner, owner_full, email."""

UPDATED = "19 October 2026"


def who(site):
    owner = site.get("owner_full") or site["owner"]
    return owner


def contact_lines(site):
    bits = []
    if site.get("email"):
        bits.append('by email at <a href="mailto:{0}">{0}</a>'.format(site["email"]))
    for label, url in site["social"]:
        bits.append('on <a href="{}" rel="noopener noreferrer">{}</a>'.format(url, label))
    return ", or ".join(bits)


def privacy(site):
    return """<p class="legal-date">Last updated {updated}</p>
<p>This notice explains what johnplusnews does with your information. We keep it short and plain on purpose.</p>

<h2>Who we are</h2>
<p>johnplusnews is run by {who} in Ireland. We are the controller of the personal information described here. You can reach us on the <a href="/contact/">contact page</a>.</p>

<h2>What we collect</h2>
<p>You can read every article without an account. If you create an account, we collect:</p>
<ul>
<li>your name and email address;</li>
<li>your password, which is handled by our sign-in provider and stored in scrambled form, so we cannot read it;</li>
<li>the words and phrases you highlight, with the sentence each one came from;</li>
<li>which articles you have opened or finished, and the level you read;</li>
<li>your preferences: reading font, level and timer length.</li>
</ul>
<p>Without an account, your highlights and preferences stay in your own browser and are not sent to us.</p>

<h2>Why we use it</h2>
<p>To run your account and give you the features you asked for: saving words, remembering your place, and sending sign-in and password emails. We do not use your information for advertising and we do not sell it.</p>

<h2>Who can see it</h2>
<p>Your teacher, who runs this site, can see your name, email, saved words, and which articles you have opened or finished. This is the point of the student view. Nobody else can see it. The sign-up form tells you this before you create an account.</p>

<h2>Cookies and similar storage</h2>
<p>We do not use advertising or tracking cookies, and we do not use analytics. The site stores a small amount of information in your browser that it needs to work: your sign-in, your highlights and your preferences. This is strictly necessary for the features you use, so we do not show a cookie banner. You can clear it at any time in your browser settings, or by signing out.</p>

<h2>Services we use</h2>
<ul>
<li>GitHub Pages hosts the website. Like any host, it receives your internet address when you load a page.</li>
<li>Supabase provides the database and sign-in for accounts.</li>
<li>Resend delivers the emails we send you.</li>
</ul>
<p>The fonts are hosted on this site, so your device does not contact Google. Some of these providers are based outside Ireland. We choose providers that publish their own data protection terms.</p>

<h2>How long we keep it</h2>
<p>For as long as you have an account. If you delete your account, your account information, saved words and progress are deleted from our live database. Copies may remain in provider backups for a short time.</p>

<h2>Your rights</h2>
<p>You can ask to see your information, correct it, take a copy, or have it deleted. You can download your saved words from the My words page, and delete your account there too. For anything else, <a href="/contact/">contact us</a>. If you are unhappy with how we handle your information, you can complain to the Data Protection Commission at <a href="https://www.dataprotection.ie" rel="noopener noreferrer">dataprotection.ie</a>.</p>

<h2>Children</h2>
<p>johnplusnews is written for adult learners. If you are under 16, please ask a parent or guardian before creating an account.</p>

<h2>Changes</h2>
<p>If we change this notice we will update the date at the top.</p>
""".format(updated=UPDATED, who=who(site))


def terms(site):
    return """<p class="legal-date">Last updated {updated}</p>
<p>By using johnplusnews you agree to these terms. They are short because we want you to read them.</p>

<h2>What johnplusnews is</h2>
<p>johnplusnews is a news site for English learners, run by {who} in Ireland. Each article is an original educational feature written for learners at three levels. Articles are written with AI assistance and edited before publication. They are based on published reporting, and each article links to its main source where one exists.</p>

<h2>Not news reporting or advice</h2>
<p>The articles are for learning English. They are not professional news, legal, medical or financial advice. We check facts and correct mistakes, but errors can happen and some stories change quickly. If you spot one, tell us on the <a href="/contact/">contact page</a>.</p>

<h2>Accounts</h2>
<ul>
<li>You need an email address. Give accurate details and keep your password private.</li>
<li>You can delete your account at any time from the My words page.</li>
<li>Please do not misuse the site: no attempts to break it, overload it, or collect other people's information.</li>
<li>We may close an account that is misused.</li>
</ul>

<h2>Using the articles</h2>
<p>You can read, highlight, print and use the articles for your own learning and in your own classes. Please do not copy the site, republish the articles, or collect them in bulk without asking first. Pictures are credited under their own licences where they have one.</p>

<h2>Links to other sites</h2>
<p>Articles link to sources and other sites. We are not responsible for what those sites say or do.</p>

<h2>Availability</h2>
<p>We aim to keep the site running but cannot promise it will always be available or error free. We may change or remove content and features.</p>

<h2>Our responsibility</h2>
<p>Nothing in these terms limits any right you have as a consumer, or any liability that cannot be limited by law. Beyond that, we are not responsible for losses that come from using the site, including from relying on an article.</p>

<h2>Changes and law</h2>
<p>We may update these terms and will change the date above when we do. Irish law applies, and the Irish courts can decide any dispute.</p>
""".format(updated=UPDATED, who=who(site))


def contact(site):
    lines = contact_lines(site)
    how = "You can reach us {}.".format(lines) if lines else "Contact details are coming soon."
    return """<p>{how}</p>

<h2>Spotted a mistake?</h2>
<p>Please tell us. Say which article it is and what looks wrong, and a link to a better source if you have one. We check every report, fix real errors, and add the date of the correction at the bottom of the article.</p>

<h2>Copyright and picture concerns</h2>
<p>If you own something on this site and think we have used it wrongly, contact us with the page address and what you own. We will look at it promptly and remove or fix it if you are right.</p>

<h2>Your information</h2>
<p>To ask about your account or your information, see the <a href="/privacy/">privacy notice</a>.</p>
""".format(how=how)
