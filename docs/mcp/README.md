# Hosanna MCP documentation

Markdown and examples served as MCP resources (`hosanna://…`).

| Path                  | Resource URI                                         |
| --------------------- | ---------------------------------------------------- |
| `chordpro-guide.md`   | `hosanna://chordpro/guide`                           |
| `domain-songs.md`     | `hosanna://domain/songs`                             |
| `domain-services.md`  | `hosanna://domain/services`                          |
| `examples/*.chordpro` | `hosanna://chordpro/examples/{valid,variants,grids}` |

Capability manifests for directives/features are derived at runtime from `@hosanna/chordpro` (`getChordProCapabilities()`).

Workflow skills live in `docs/mcp/skills/*/SKILL.md` and are also exposed as `hosanna://skills/{name}`.
