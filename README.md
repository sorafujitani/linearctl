# linearctl

`linearctl` is a terminal UI for browsing Linear issues by My Issues, Team, current Cycle, or active Project. It can update an issue's status, assignee, priority, cycle, project, and labels through explicit picker confirmation.

The project uses Bun 1.3, TypeScript 7, Vite+, OpenTUI, and Valibot.

## Requirements

- A Linear personal API key for real workspace access
- The target workspace `urlKey`, such as `fs0414`

## Install

### Homebrew

Install the tagged release from this repository's tap:

```sh
brew tap sorafujitani/linearctl https://github.com/sorafujitani/linearctl
brew install sorafujitani/linearctl/linearctl
linearctl --version
```

The stable Formula follows the package version and currently expects the `v0.1.0` tag. To build the latest `main` branch instead:

```sh
brew install --HEAD sorafujitani/linearctl/linearctl
```

Homebrew builds a standalone executable with Bun. Bun is a build-time dependency and is not required to run the installed executable.

### Nix

Install the pinned flake package into your user profile:

```sh
nix profile add github:sorafujitani/linearctl
linearctl --version
```

Run it without installing:

```sh
nix run github:sorafujitani/linearctl -- --version
```

The Nix package supports Apple silicon macOS and arm64/x86_64 Linux. Intel macOS users can use Homebrew or a release binary.

The application reads the API key only from `LINEAR_API_KEY`. It does not accept or persist the key through argv, configuration files, or logs. The following zsh command reads it without echoing it and exports it only in the current shell session:

```zsh
read -rs 'LINEAR_API_KEY?Linear API key: '
echo
export LINEAR_API_KEY
```

`.env` files are excluded from Git. Do not put the API key directly in a command argument.

## Configuration

Repeated workspace and Team options can be stored in `${XDG_CONFIG_HOME:-~/.config}/linearctl/config.json`:

```json
{
  "workspace": "fs0414",
  "defaultTeam": "APP"
}
```

Create the directory once and edit the file with your preferred editor:

```sh
mkdir -p "${XDG_CONFIG_HOME:-$HOME/.config}/linearctl"
${EDITOR:-vi} "${XDG_CONFIG_HOME:-$HOME/.config}/linearctl/config.json"
```

`workspace` verifies the connected Linear workspace. `defaultTeam` is a Team key such as `APP`, not a Team name or ID. Team keys are normalized to uppercase.

CLI options override config values:

```sh
linearctl --workspace another-workspace --team PLAT
```

With the example config, normal startup is simply:

```sh
linearctl
```

Opening Teams, Cycles, or Projects initially selects the configured Team, its current Cycle, or the first active Project containing that Team. The full catalog remains available, so `j`/`k` can move to other Teams. Reloading does not reset a selection that you already moved.

The config file never accepts or stores `LINEAR_API_KEY`. Unknown fields and invalid JSON fail at startup with the config path in the error.

## Usage

### Mock mode

Start the realistic mock workspace without an API key or network access:

```sh
vp run dev:mock
```

The mock workspace always uses the `fs0414` urlKey. Verify it without starting the TUI:

```sh
vp run auth:mock
```

All mock users, workspaces, issues, cycles, and projects are synthetic. The fixture contains three teams, three current cycles, 15 active issues, and four active projects. It includes multi-team projects, unassigned issues, varied statuses, priorities, estimates, cycles, projects, and labels.

Mock writes remain in process memory and are discarded on exit. Cycle, project, and team-label pickers enforce the same-team constraints used by the real client.

### Connect to a Linear workspace

Verify the workspace before opening the TUI:

```sh
vp run dev auth status --workspace fs0414
```

Then start the TUI:

```sh
vp run dev --workspace fs0414
```

The client stops before reading or updating issues when the connected workspace urlKey does not match. A workspace argument is optional for the TUI, but specifying it is strongly recommended.

### Navigation and help

The top-level views are:

- `1`: My Issues
- `2`: Teams
- `3`: Current Cycles
- `4`: Active Projects

Teams, Cycles, and Projects first open a lightweight catalog. Cycle and Project catalogs do not nest issue connections in their GraphQL queries; press `Enter` to load the selected scope's issues in a separate request. Press `Esc` to return to its catalog.

Press `?` to open the floating keyboard-help window. Type any text to search commands by key, action, or description. Use `Up` and `Down` to scroll, and press `Esc` or `?` to close it. The footer shows only operations relevant to the current screen.

The issue list and detail panel use widths derived only from the terminal width. Long descriptions, titles, and URLs wrap inside the detail panel without resizing either panel.

The issue browser supports text search and filtering or grouping by status, assignee, priority, team, cycle, project, and label. Filters can be combined across dimensions. Picker writes occur only after `Enter`; `Esc` cancels without calling the API.

Press `u` in the issue browser to copy the selected issue URL through OSC 52. If the terminal does not support clipboard copy, linearctl reports the failure instead of showing a false success message.

Issue edits respect the owning Team boundary: assignees come from that Team's active members, cycles come from that Team's current cycle, projects must include that Team, and labels must be workspace-wide or owned by that Team. Projects can still span multiple Teams and display every participating Team key.

Issue scopes return at most 50 active issues and exclude completed or canceled workflow states. The Cycles catalog uses each team's active cycle. The Projects catalog returns at most 50 projects whose status is not completed or canceled.

## Development with Vite+

### Nix and direnv

The flake provides Bun, direnv, and Git for development. Enter it directly:

```sh
nix develop
vp install
```

With direnv's shell hook installed, allow the checked-in `.envrc` once:

```sh
direnv allow
vp install
```

The `.envrc` uses the same flake development shell. `.direnv/` and Nix `result` links are ignored by Git. The API key is still read only from `LINEAR_API_KEY`; neither Nix nor direnv stores it.

Build or install the current checkout without fetching GitHub:

```sh
nix build "path:$PWD"
nix profile add "path:$PWD"
```

### Commands

Development requires Bun 1.3.x. Install dependencies through Vite+, then run `vp run` without a task name to select a project task interactively:

```sh
vp install
vp run
```

Common commands:

| Command                | Purpose                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `vp check`             | Check formatting, Oxlint rules, and TypeScript                |
| `vp run check:fix`     | Apply formatting and safe lint fixes                          |
| `vp test run`          | Run the Vitest suite once                                     |
| `vp run test:watch`    | Run Vitest in watch mode                                      |
| `vp run test:coverage` | Run Vitest with V8 text, JSON, and HTML coverage              |
| `vp run typecheck`     | Run type checking without formatting or standalone lint rules |
| `vp run format`        | Rewrite files with Oxfmt                                      |
| `vp run dev:mock`      | Start the `fs0414` mock TUI                                   |
| `vp run build`         | Build a standalone binary for the current platform            |
| `vp run smoke`         | Verify version output and mock authentication on the binary   |
| `vp run verify`        | Run check, test, build, and smoke in sequence                 |

`vp test` is Vite+'s Vitest integration. Files and test names can be passed directly:

```sh
vp test run src/app-state.test.ts
vp test run -t "label multi-select"
```

`vp <name>` invokes a Vite+ built-in command, while `vp run <name>` invokes a project script. The built-in `vp build` is a web-oriented Vite build. Use `vp run build` for the Bun standalone executable.

## Build and release

Build and verify the host-platform executable:

```sh
vp run build
vp run smoke
./dist/linearctl --version
```

OpenTUI 0.5.1 is statically imported, so its host native library is embedded in the Bun executable. A normal host build does not require separately deploying assets or setting `OTUI_ASSET_ROOT`.

Cross-target builds require the matching OpenTUI optional packages:

```sh
vp run release:prepare
vp run build --target bun-linux-x64 --outfile dist/linearctl-linux-x64
```

Supported targets are `bun-darwin-arm64`, `bun-darwin-x64`, `bun-linux-arm64`, `bun-linux-x64`, the Linux musl variants, and `bun-windows-x64`.

The release workflow builds native binaries for macOS arm64/x64, Linux arm64/x64, and Windows x64. Each runner verifies `--version` before uploading its artifact. A `v<package version>` tag creates a GitHub Release with SHA-256 checksums; `workflow_dispatch` only uploads workflow artifacts.
