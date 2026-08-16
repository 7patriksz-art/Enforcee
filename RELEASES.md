# Releases

One section per published version. **The auto-release gate refuses to publish a version that
has no section here** (`.github/workflows/auto-release.yml`, condition 2), so this file is a
control rather than a courtesy: a release nobody can describe is a release nobody should get.

Write the section as part of the change that earns the version bump, not afterwards.

Format — the heading must match the version in `package.json`:

```
## v0.9.0

- What changed, in the words of someone who would be affected by it.
- Anything that needs a person to do something on upgrade.
```

Versions published before this file existed (up to and including `0.8.5`) are not recorded
here. They are not backfilled: notes reconstructed after the fact from a diff are a guess
about intent, and this project does not publish guesses as records. The npm registry and the
git tags remain the authoritative list of what shipped and when.
