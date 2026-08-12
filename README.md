# linearctl

[![Release](https://github.com/sorafujitani/linearctl/actions/workflows/release.yml/badge.svg)](https://github.com/sorafujitani/linearctl/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A focused terminal UI for browsing and updating [Linear](https://linear.app/) issues without leaving your terminal.

Browse issues assigned to you or scoped by team, current cycle, and active project. Search, filter, and group issues, create issues and projects, then update common fields through explicit confirmation.

## Features

- Browse My Issues, Team Issues, current Cycles, and active Projects
- Switch the active team without restarting the application
- Search, filter, and group by status, assignee, priority, team, cycle, project, or label
- Read issue comments in the detail panel
- Toggle completed and canceled issues into any issue view
- Edit issue titles and Markdown descriptions
- Update status, assignee, priority, cycle (including past and upcoming cycles), project, and labels
- Create issues with a Markdown description, and projects with Markdown content
- Copy issue URLs through OSC 52 terminal clipboard support
- Use it as a plain CLI: list, view, create, and update issues, and list teams, projects, and cycles, all with optional JSON output
- Verify the connected Linear workspace before opening the TUI
- Try the complete interface with synthetic data and no network access

## Requirements

- A terminal with interactive TTY support
- A Linear personal API key
- The `urlKey` of the Linear workspace you want to use

The workspace `urlKey` is the workspace slug in a Linear URL. For example, `sample-workspace` is the `urlKey` in `linear.app/sample-workspace/...`.

## Installation

Prebuilt binaries for macOS, Linux, and Windows are available from [GitHub Releases](https://github.com/sorafujitani/linearctl/releases).

### Homebrew

```sh
brew install sorafujitani/tap/linearctl
```

Homebrew automatically adds `sorafujitani/tap`. After that, `brew upgrade linearctl` upgrades the installed formula.

To build the latest `main` branch instead of a tagged release:

```sh
brew install --HEAD sorafujitani/tap/linearctl
```

### Nix

Install the pinned flake package into your user profile:

```sh
nix profile add github:sorafujitani/linearctl
```

Or run it without installing:

```sh
nix run github:sorafujitani/linearctl
```

Both forms track `main`. Append a tag to pin a release:

```sh
nix profile add github:sorafujitani/linearctl/v0.1.0
```

The Nix package supports Apple silicon macOS and arm64/x86_64 Linux. Intel macOS users can use Homebrew or a release binary.

Verify the installation:

```sh
linearctl --version
```

## Quick start

linearctl reads a Linear personal API key from the `LINEAR_API_KEY` environment variable. Set it to a valid value using your preferred environment-management method before running linearctl.

Verify that the API key belongs to the expected workspace:

```sh
linearctl auth status --workspace <urlKey>
```

Then open the TUI:

```sh
linearctl --workspace <urlKey>
```

The TUI can run without `--workspace`, but specifying it is recommended. If the connected workspace does not match, linearctl stops before reading or updating issues.

For scripts and non-interactive environments, the same binary works as a plain CLI:

```sh
linearctl issue list                 # issues assigned to you, across teams
linearctl issue list --team APP      # one team's active issues
linearctl issue list --team APP --mine --json
linearctl issue list --team APP --all         # include completed and canceled
linearctl issue view APP-101 --comments       # one issue with its thread
linearctl team list
linearctl project list --team APP
linearctl cycle list --team APP
```

Issues can also be created and updated without the TUI. Writes require the
target workspace (`--workspace` or the config file), names are resolved within
the issue's team and rejected when ambiguous, and each field is sent as its
own bounded mutation so an update never touches an unrelated relation:

```sh
linearctl issue create --team APP --title "Fix cart badge" \
  --description "Repro steps..." --assignee "Aiko Takahashi" --priority high
linearctl issue update APP-101 --state Done --assignee none
linearctl issue update APP-101 --label "Bug,Mobile"   # replaces all labels; "none" clears
linearctl issue update APP-101 --cycle current --project "Mobile Experience Renewal"
```

`--json` works with every non-interactive command. Reads are capped at the first 50 issues; the output notes when more exist on the server.

## Configuration

Frequently used workspace and team values can be stored in `${XDG_CONFIG_HOME:-~/.config}/linearctl/config.json`:

```json
{
  "workspace": "sample-workspace",
  "defaultTeam": "APP"
}
```

`workspace` is a Linear workspace `urlKey`. `defaultTeam` is a team key such as `APP`, not a team name or ID. Team keys are normalized to uppercase.

Command-line options override the configuration file:

```sh
linearctl --workspace another-workspace --team PLAT
```

When `defaultTeam` is omitted or cannot be found, linearctl opens the team selector. Press `t` at any time to change the active team.

The active team scopes every main view. My Issues shows your assignments in that team, Team Issues shows all of its active issues, and pressing `3` opens the current cycle's issues directly. Projects shows active projects that include the team. Current-cycle and Project metadata is queried through the active team without loading the workspace-wide catalog.

The configuration file accepts only `workspace` and `defaultTeam`. API keys are never read from or stored in this file.

## Keyboard shortcuts

Press `?` inside linearctl to open and search the complete keyboard reference.

| Key                        | Action                                                  |
| -------------------------- | ------------------------------------------------------- |
| `1` / `2` / `3` / `4`      | Open My Issues, Team Issues, current cycle, or Projects |
| `t`                        | Change the active team                                  |
| `j` / `k` or `Down` / `Up` | Move the selection                                      |
| `Enter`                    | Open or confirm                                         |
| `Esc`                      | Go back or cancel without writing                       |
| `/`                        | Search the list, or filter an open picker               |
| `f` / `g`                  | Filter or group issues                                  |
| `x`                        | Clear search, filters, and grouping                     |
| `n`                        | Create an issue, or a project in the Projects view      |
| `e`                        | Edit the selected issue title and description           |
| `r`                        | Reload the current view                                 |
| `o`                        | Open the selected issue, project, or cycle URL          |
| `u`                        | Copy the selected issue, project, or cycle URL          |
| `s` / `a` / `y`            | Change status, assignee, or priority                    |
| `c` / `p` / `l`            | Change cycle, project, or labels                        |
| `v`                        | View the selected issue's comments                      |
| `d`                        | Toggle completed and canceled issues                    |
| `PgUp` / `PgDn`            | Scroll the detail panel (also `Ctrl+U` / `Ctrl+D`)      |
| `?`                        | Open keyboard help                                      |
| `q`                        | Quit                                                    |

The mouse works too: the wheel over the list moves the selection, and the wheel or the scrollbar over
the Detail panel scrolls it. Hold `Shift` if your terminal needs it to select text while the TUI runs.

Issue picker updates are sent only after confirmation with `Enter`. Pressing `Esc` closes a picker
without writing. Press `e` to edit the selected issue's title and Markdown description; the edit is
sent only from `Save changes` or with `Cmd+Enter` / `Ctrl+Enter` / `Ctrl+S` at the field list.

### Creating and editing issues and projects

`n` opens a create form and `e` opens the selected issue's edit form in the Detail panel. Three keys
carry the same meaning everywhere in the form, so nothing depends on which field you are standing
on:

| Key                                      | Meaning                      |
| ---------------------------------------- | ---------------------------- |
| `Enter`                                  | Activate the current thing   |
| `Esc`                                    | Go back one level            |
| `Cmd+Enter` (or `Ctrl+Enter` / `Ctrl+S`) | Confirm the level you are on |

"Activate" resolves per context: on a field row it opens that field's editor or picker, in a picker
it confirms the highlighted choice, on the submit row it creates, in a single-line editor it commits
and moves to the next field, and in a Markdown editor it inserts a newline. "Go back" leaves an
editor or picker keeping what you typed, and at the field list it discards the draft.

"Confirm" is the level you are on, not the whole form: inside a text editor it commits that field and
returns to the field list, and from the field list — where the only thing left to confirm is the
issue or project itself — it creates or saves. A half-written description can therefore never
trigger a write.

`Cmd+Enter` needs a terminal that speaks the kitty keyboard protocol; `Ctrl+Enter` and `Ctrl+S` work
everywhere.

- Issue fields: title, description, status, assignee, priority, cycle, project, labels.
- Project fields: name, summary, content, lead. The active team is used as the project team.
- Description (issue) and content (project) are sent to Linear as raw Markdown.
- Text editors have a movable caret: `←` / `→` move one character, `↑` / `↓` move one line in the
  Markdown editors, `Home` / `End` (or `Ctrl+A` / `Ctrl+E`) jump to the line edges, `Backspace` and
  `Delete` remove around the caret, and `Ctrl+U` clears to the line start. Text is inserted at the
  caret, so you can edit earlier lines without retyping them.
- Pickers (status, assignee, priority, cycle, project, labels, team) filter with `/`. Type to narrow
  the list, `↑` / `↓` move within the matches, `Enter` confirms the highlighted row, and `Esc` clears
  the filter before it closes the picker. The same filter works in the update pickers.
- Nothing is created until you create explicitly; no request is sent while you edit fields.

## Security model

- The API key is read only from `LINEAR_API_KEY`.
- linearctl does not accept API keys through command-line arguments or its configuration file.
- linearctl does not persist or log API keys.
- Workspace verification completes before issue reads or updates.
- Assignees, cycles, projects, and team-owned labels are constrained to the issue's owning team.

## Development

Development requires Bun 1.3.x. The Nix flake provides Bun, direnv, and Git:

```sh
nix develop
vp install
```

With direnv installed, the checked-in `.envrc` enters the same development shell:

```sh
direnv allow
vp install
```

The development environment does not store or supply `LINEAR_API_KEY`.

### Mock mode

Start a realistic synthetic workspace without an API key or network access:

```sh
vp run dev:mock
```

Mock updates remain in memory and are discarded when the process exits.

### Commands

| Command                | Purpose                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `vp check`             | Check formatting, lint rules, and TypeScript                |
| `vp run typecheck`     | Run strict `tsc --noEmit`                                   |
| `vp test run`          | Run the Vitest suite once                                   |
| `vp run test:watch`    | Run tests in watch mode                                     |
| `vp run test:coverage` | Generate test coverage                                      |
| `vp run dev:mock`      | Start the mock TUI                                          |
| `vp run build`         | Build a standalone binary for the current platform          |
| `vp run smoke`         | Smoke-test the built binary                                 |
| `vp run verify`        | Run checks, strict typecheck, tests, build, and smoke tests |

Run a focused test by passing its path or name to Vite+:

```sh
vp test run src/app-state.test.ts
vp test run -t "label multi-select"
```

## Building from source

```sh
vp install
vp run build
vp run smoke
./dist/linearctl --version
```

The resulting standalone executable embeds the OpenTUI native package for the host platform. The release workflow builds and verifies native binaries for macOS arm64/x64, Linux arm64/x64, and Windows x64.

## Contributing

Issues and pull requests are welcome. For code changes, add or update focused tests and run the full verification pipeline before opening a pull request:

```sh
vp run verify
```

Please do not use a live issue update as a smoke test unless the target issue and mutation are explicitly intended for testing. Mock mode is available for local interaction testing.

## License

linearctl is available under the [MIT License](LICENSE).
