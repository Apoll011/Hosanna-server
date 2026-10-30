# Domain: library (folders, collections, Studio UI)

Studio library chrome — folders and collections — uses fixed **icon** and **color** id strings. Do not invent Lucide names; only the ids below render in the UI.

## Folder / collection icons (`icon`)

Use these exact ids with `folders_create`, `folders_update`, `collections_create`, `collections_update`:

| id            | Meaning (UI label)                     |
| ------------- | -------------------------------------- |
| `default`     | Plain folder (reset / no special icon) |
| `music`       | Music                                  |
| `heart`       | Heart / praise                         |
| `star`        | Star / favorites                       |
| `book-open`   | Book / Bible                           |
| `bookmark`    | Bookmark                               |
| `sun`         | Sun / morning                          |
| `moon`        | Moon / evening                         |
| `sparkles`    | Special / worship                      |
| `flame`       | Flame / Spirit                         |
| `cross`       | Cross / faith                          |
| `church`      | Church / service                       |
| `mic`         | Vocal / mic                            |
| `radio`       | Radio / broadcast                      |
| `disc`        | Disc / album                           |
| `headphones`  | Headphones / audio                     |
| `guitar`      | Guitar / instrument                    |
| `bell`        | Bell / alert                           |
| `archive`     | Archive / history                      |
| `tag`         | Tag / category                         |
| `hash`        | Hash / topic                           |
| `smile`       | Kids / youth                           |
| `shield`      | Shield / Psalms                        |
| `award`       | Award / highlight                      |
| `crown`       | Crown / Hosanna                        |
| `compass`     | Compass / missions                     |
| `map-pin`     | Map pin / campus                       |
| `calendar`    | Calendar / events                      |
| `layers`      | Layers / repertoire                    |
| `folder-open` | Open folder                            |

To **remove** a custom icon, set `icon` to `default` (not an empty string guess).

## Folder / collection colors (`color`)

| id        |
| --------- |
| `default` |
| `red`     |
| `orange`  |
| `amber`   |
| `yellow`  |
| `emerald` |
| `green`   |
| `teal`    |
| `cyan`    |
| `sky`     |
| `blue`    |
| `indigo`  |
| `violet`  |
| `purple`  |
| `fuchsia` |
| `pink`    |
| `rose`    |
| `slate`   |

## Concurrency

Folder updates need the current `updatedAt` from `folders_list` / `folders_get`. On stale errors, re-list and retry with `current.updatedAt`.

## Studio sync

Server mutations (folders, collections, saves, moves) are visible in Studio only after RxDB replication pulls. In Studio chat, call **`studio_sync`** after such mutations (or rely on the client auto-sync hook) so the explorer refreshes without a long wait.
