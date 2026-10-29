---
name: chordpro-directives-variants
description: Explain and use Hosanna ChordPro directives and named variations accurately.
---

# Directives and variations

## Resources
- `hosanna://chordpro/directives`
- `hosanna://chordpro/features`
- `hosanna://chordpro/examples/variants`
- Tool: `chordpro.directives`

## Variants
Use `{start_of_version: Name}` … `{end_of_version}`. IDs are slugs. Metadata inherits from the default body. Nested versions are errors.

## Comment styles
`{c: text|warning}` is supported by the TypeScript stack.

## Support levels
- **parsed** — safe to recommend
- **formatter-only** — may appear in files but is not first-class
- **unsupported / not_implemented** — explain and avoid

When arranging, refuse or clearly label unsupported official ChordPro features (`define`, fonts, `new_page`).
