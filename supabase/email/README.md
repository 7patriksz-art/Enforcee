# Transactional email templates

Four templates, on brand, carrying the favicon. Paste each into **Supabase → Authentication
→ Emails**, matching the file to the template of the same name.

| File | Supabase template |
|---|---|
| `confirm-signup.html` | Confirm signup |
| `magic-link.html` | Magic Link |
| `reset-password.html` | Reset Password |
| `change-email.html` | Change Email Address |

Also set, on the same screen:

- **Sender name:** `Enforcee`
- **Sender email:** the address in `src/lib/contact.ts`

## Why these look the way they do

**Everything is inline and table-based.** Email is not the web. Gmail strips `<style>`
blocks, Outlook renders through Word's HTML engine, and no client supports CSS custom
properties — so the site's variables cannot be used and every colour here is a literal.
That duplication is deliberate and is the one place on this project where two copies of a
value is the correct answer.

**Light mode only, declared.** `color-scheme: light` and `supported-color-schemes: light`
are set. A dark-mode email is worse than no dark-mode email, because several clients
auto-invert instead of honouring your styles and turn a warm cream card into a muddy
blue-grey one. Declaring light is how you ask them not to.

**The logo is a base64 `data:` URI.** No external image request, so it renders with images
blocked and there is no tracking-pixel-shaped hole where the brand should be. It is also
the same 404-byte SVG as the site favicon, so the mark cannot drift from the site's.

**The link appears twice** — once as a button, once as plain text. Corporate mail scanners
rewrite `href` targets, and some clients refuse to render a styled anchor at all. Without
the plain copy those users receive a dead end, and the only signal we would get is a
support email we cannot answer.

**Each has a preheader.** That is the grey line the inbox lists next to the subject. Left
empty it fills with whatever text comes first, which on a branded template is the word
"Enforcee" repeated. It is one hidden div and it is the highest-leverage line in the file.

## What is deliberately absent

No tracking pixel, no open-rate beacon, no click-wrapped links, no unsubscribe footer.
These are transactional — you cannot unsubscribe from your own sign-in link, and offering
to is a dark pattern. A product selling verifiable behaviour does not measure whether you
opened an email.

## Preview

Render any of them locally with the placeholder filled in:

```bash
node -e "const f=require('fs');process.stdout.write(f.readFileSync('supabase/email/magic-link.html','utf8').replaceAll('{{ .ConfirmationURL }}','https://example.test/x'))" > /tmp/preview.html
```

`tests/email-templates.test.ts` checks every template still carries its placeholder, its
preheader, the plain-text fallback and no external image — the ways these silently rot.
