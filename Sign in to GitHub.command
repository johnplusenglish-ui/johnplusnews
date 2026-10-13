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
TOKEN=${TOKEN//[[:space:]\"\']/}

if [ -z "$TOKEN" ]; then
  echo "Nothing was pasted, so nothing was saved. Run this again when you have the token."
  exit 1
fi

echo "You pasted ${#TOKEN} characters, starting with \"${TOKEN:0:4}\"."
echo "(A normal classic token starts with ghp_ and is 40 characters long.)"
echo
echo "Asking GitHub whether it recognises this token..."
REPLY_FROM_GITHUB=$(printf 'header = "Authorization: Bearer %s"\nheader = "User-Agent: johnplusnews-signin"\n' "$TOKEN" | curl -sS -K - -D - -m 20 "${JPN_API_URL:-https://api.github.com/user}" 2>/dev/null)
STATUS=$(printf '%s' "$REPLY_FROM_GITHUB" | head -1 | awk '{print $2}')
LOGIN=$(printf '%s' "$REPLY_FROM_GITHUB" | sed -nE 's/.*"login": *"([^"]+)".*/\1/p' | head -1)
SCOPES=$(printf '%s' "$REPLY_FROM_GITHUB" | tr -d '\r' | grep -i '^x-oauth-scopes:' | sed -E 's/^[^:]*: *//')

if [ "$STATUS" = "401" ]; then
  echo
  echo "GitHub does NOT recognise this token, so nothing has been saved."
  echo "That means it is not a live token. The usual causes are:"
  echo "  - it is the OLD token that was revoked (you need a brand new one),"
  echo "  - it was only partly copied (a classic token is 40 characters),"
  echo "  - it has expired."
  echo "Make a new token as described above, copy ALL of it, and run this again."
  exit 1
elif [ "$STATUS" = "200" ]; then
  echo "GitHub recognises this token. It belongs to the account: ${LOGIN:-unknown}"
  if [ -n "$LOGIN" ] && [ "$LOGIN" != "$OWNER" ]; then
    echo "WARNING: the website's repository belongs to $OWNER, not $LOGIN. Pushing will probably be refused."
  fi
  if [ -n "$SCOPES" ]; then
    case "$SCOPES" in
      *repo*) ;;
      *) echo "WARNING: this token has no repo permission (it has: $SCOPES). Make a new one with the repo box ticked." ;;
    esac
  else
    echo "Note: this looks like a fine-grained token. It must allow Contents: Read and write on the johnplusnews repository."
  fi
else
  echo "Could not ask GitHub (no answer). Carrying on and testing with a real push instead."
fi
echo

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
  echo "GitHub did not accept that token for the website's repository, so it has NOT been kept."
  echo "Read the messages above: they say whether the token is unknown to GitHub, belongs to a"
  echo "different account, or lacks the repo permission. Make a new token as described at the"
  echo "top, then run this again."
  exit 1
fi
