# linearctl

[![Release](https://github.com/sorafujitani/linearctl/actions/workflows/release.yml/badge.svg)](https://github.com/sorafujitani/linearctl/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A focused terminal UI for browsing and updating [Linear](https://linear.app/) issues without leaving your terminal.

Browse issues assigned to you or scoped by team, current cycle, and active project. Search, filter, and group issues, then update common fields through explicit confirmation.

## Features

- Browse My Issues, Team Issues, current Cycles, and active Projects
- Switch the active team without restarting the application
- Search, filter, and group by status, assignee, priority, team, cycle, project, or label
- Update status, assignee, priority, cycle, project, and labels
- Copy issue URLs through OSC 52 terminal clipboard support
- Verify the connected Linear workspace before opening the TUI
- Try the complete interface with synthetic data and no network access

## Requirements

- A terminal with interactive TTY support
- A Linear personal API key
- The `urlKey` of the Linear workspace you want to use

The workspace `urlKey` is the workspace slug in a Linear URL. For example, `fs0414` is the `urlKey` in `linear.app/fs0414/...`.

## Installation

Prebuilt binaries for macOS, Linux, and Windows are available from [GitHub Releases](https://github.com/sorafujitani/linearctl/releases).

### Homebrew

```sh
brew tap sorafujitani/linearctl https://github.com/sorafujitani/linearctl
brew install sorafujitani/linearctl/linearctl
```

To build the latest `main` branch instead of a tagged release:

```sh
brew install --HEAD sorafujitani/linearctl/linearctl
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

## Configuration

Frequently used workspace and team values can be stored in `${XDG_CONFIG_HOME:-~/.config}/linearctl/config.json`:

```json
{
  "workspace": "fs0414",
  "defaultTeam": "APP"
}
```

`workspace` is a Linear workspace `urlKey`. `defaultTeam` is a team key such as `APP`, not a team name or ID. Team keys are normalized to uppercase.

Command-line options override the configuration file:

```sh
linearctl --workspace another-workspace --team PLAT
```

When `defaultTeam` is omitted or cannot be found, linearctl opens the team selector. Press `t` at any time to change the active team.

The active team scopes every main view. My Issues shows your assignments in that team, Team Issues shows all of its active issues, Cycles shows its current cycle, and Projects shows active projects that include it. Cycle and Project metadata is queried through the active team without loading the workspace-wide catalog.

The configuration file accepts only `workspace` and `defaultTeam`. API keys are never read from or stored in this file.

## Keyboard shortcuts

Press `?` inside linearctl to open and search the complete keyboard reference.

| Key                        | Action                                           |
| -------------------------- | ------------------------------------------------ |
| `1` / `2` / `3` / `4`      | Open My Issues, Team Issues, Cycles, or Projects |
| `t`                        | Change the active team                           |
| `j` / `k` or `Down` / `Up` | Move the selection                               |
| `Enter`                    | Open or confirm                                  |
| `Esc`                      | Go back or cancel without writing                |
| `/`                        | Search issues                                    |
| `f` / `g`                  | Filter or group issues                           |
| `x`                        | Clear search, filters, and grouping              |
| `r`                        | Reload the current view                          |
| `u`                        | Copy the selected issue URL                      |
| `s` / `a` / `y`            | Change status, assignee, or priority             |
| `c` / `p` / `l`            | Change cycle, project, or labels                 |
| `?`                        | Open keyboard help                               |
| `q`                        | Quit                                             |

Issue updates are sent only after confirmation with `Enter`. Pressing `Esc` closes a picker without writing.

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

| Command                | Purpose                                            |
| ---------------------- | -------------------------------------------------- |
| `vp check`             | Check formatting, lint rules, and TypeScript       |
| `vp test run`          | Run the Vitest suite once                          |
| `vp run test:watch`    | Run tests in watch mode                            |
| `vp run test:coverage` | Generate test coverage                             |
| `vp run dev:mock`      | Start the mock TUI                                 |
| `vp run build`         | Build a standalone binary for the current platform |
| `vp run smoke`         | Smoke-test the built binary                        |
| `vp run verify`        | Run checks, tests, build, and smoke tests          |

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
