#!/bin/bash
# One-time setup. Saves your GitHub token on this Mac so the publisher can send articles to the website.
cd "$(dirname "$0")" || exit 1

OWNER=$(git remote get-url origin 2>/dev/null | sed -nE 's#^https://github.com/([^/]+)/.*#\1#p')
OWNER=${OWNER:-johnplusenglish-ui}

clear
echo "Sign in to GitHub"
echo "================="
echo
echo "This saves your GitHub token on this Mac, once, so the publisher can send"
echo "articles to johnplusnews.com. You will not need to do this again."
echo
echo "You need a token. If you do not have one:"
echo "  1. Open github.com and sign in as $OWNER."
echo "  2. Click your picture, then Settings, then Developer settings (bottom of the left menu)."
echo "  3. Personal access tokens, then Tokens (classic), then Generate new token (classic)."
echo "  4. Give it any name, tick ONLY the box called repo, choose an expiry, and generate it."
echo "  5. Copy the token (it starts with ghp_). GitHub shows it only once."
echo
echo "Paste your token here and press Return."
echo "Nothing will appear as you paste. That is normal."
echo
read -rs TOKEN
echo
TOKEN=${TOKEN//[[:space:]]/}

if [ -z "$TOKEN" ]; then
  echo "Nothing was pasted, so nothing was saved. Run this again when you have the token."
  exit 1
fi

printf 'protocol=https\nhost=github.com\nusername=%s\npassword=%s\n\n' "$OWNER" "$TOKEN" | git credential-osxkeychain store
unset TOKEN

echo "Saved. Checking that GitHub accepts it..."
echo
if GIT_TERMINAL_PROMPT=0 git push origin main; then
  echo
  echo "All done. GitHub accepted the sign-in, and anything waiting has been sent."
  echo "Go back to the publisher and press Publish. You can close this window."
else
  printf 'protocol=https\nhost=github.com\n\n' | git credential-osxkeychain erase
  echo
  echo "GitHub did not accept that token, so it has NOT been kept."
  echo "The usual reasons are: the token was copied incompletely, it has expired,"
  echo "it was made without the repo box ticked, or it belongs to a different GitHub account."
  echo "Make a new token as described above, then run this again."
  exit 1
fi
