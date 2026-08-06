import {
  BoxRenderable,
  CliRenderEvents,
  createCliRenderer,
  type KeyEvent,
  ScrollBoxRenderable,
  TextAttributes,
  TextRenderable,
} from "@opentui/core";
import stringWidth from "string-width";

import {
  applyIssueUpdate,
  activeTeam,
  beginIssueRequest,
  closeOverlay,
  createAppState,
  currentTopNav,
  drillIntoSelected,
  escapeIssueBrowser,
  finishIssueRequest,
  issueChangeForOverlay,
  moveOverlay,
  moveSelection,
  openTeamSelector,
  openOverlay,
  resetIssueList,
  selectTopNav,
  selectedCatalogItem,
  scopedCycles,
  scopedProjects,
  selectActiveTeam,
  selectedIssue,
  setFilter,
  setGroup,
  setQuery,
  toggleSelectedLabel,
  visibleIssues,
  type AppState,
  type Catalog,
  type Overlay,
  type SelectOption,
  type TopNav,
} from "./app-state";
import type { ClientMode } from "./client-factory";
import {
  sortWorkflowStates,
  type Cycle,
  type Issue,
  type IssueScope,
  type Project,
  type Workspace,
} from "./domain";
import { HELP_ENTRIES, helpText } from "./help";
import {
  groupIssueList,
  ISSUE_DIMENSIONS,
  NONE_VALUE,
  type IssueDimension,
  type IssueGroupDimension,
} from "./issue-list";
import type { LinearClient } from "./linear-client";

type Mode = "list" | "search" | "help";

interface TuiOptions {
  client: LinearClient;
  workspace: Workspace;
  mode: ClientMode;
  defaultTeam?: string;
}

const COLORS = {
  accent: "#7AA2F7",
  border: "#414868",
  dim: "#737DA0",
  error: "#F7768E",
  success: "#9ECE6A",
  text: "#C0CAF5",
};

const CLEAR_VALUE = "__clear__";
const PRIORITIES: SelectOption[] = [
  { id: "0", label: "No priority" },
  { id: "1", label: "Urgent" },
  { id: "2", label: "High" },
  { id: "3", label: "Medium" },
  { id: "4", label: "Low" },
];
const DIMENSION_LABELS: Record<IssueDimension, string> = {
  status: "Status",
  assignee: "Assignee",
  priority: "Priority",
  team: "Team",
  cycle: "Cycle",
  project: "Project",
  label: "Label",
};

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function truncateToWidth(value: string, width: number): string {
  const available = Math.max(0, Math.floor(width));
  if (stringWidth(value) <= available) return value;
  const ellipsis = "…";
  const ellipsisWidth = stringWidth(ellipsis);
  if (available < ellipsisWidth) return "";
  let result = "";
  let resultWidth = 0;
  for (const { segment } of graphemeSegmenter.segment(value)) {
    const segmentWidth = stringWidth(segment);
    if (resultWidth + segmentWidth + ellipsisWidth > available) break;
    result += segment;
    resultWidth += segmentWidth;
  }
  return `${result}${ellipsis}`;
}

function formatDate(value: string | null): string {
  if (value === null) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatProgress(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function panelWidths(terminalWidth: number): { list: number; detail: number } {
  const available = Math.max(Math.floor(terminalWidth) - 1, 2);
  const list = Math.max(1, Math.floor(available * 0.42));
  return { list, detail: Math.max(1, available - list) };
}

function uniqueOptions(options: readonly SelectOption[]): SelectOption[] {
  return [...new Map(options.map((option) => [option.id, option])).values()];
}

function issueFilterOptions(issues: readonly Issue[], dimension: IssueDimension): SelectOption[] {
  const clear = { id: CLEAR_VALUE, label: "Clear this filter" };
  switch (dimension) {
    case "status":
      return [
        clear,
        ...uniqueOptions(issues.map((issue) => ({ id: issue.state.id, label: issue.state.name }))),
      ];
    case "assignee":
      return [
        clear,
        { id: NONE_VALUE, label: "Unassigned" },
        ...uniqueOptions(
          issues.flatMap((issue) =>
            issue.assignee === null ? [] : [{ id: issue.assignee.id, label: issue.assignee.name }],
          ),
        ),
      ];
    case "priority":
      return [clear, ...PRIORITIES];
    case "team":
      return [
        clear,
        ...uniqueOptions(
          issues.map((issue) => ({
            id: issue.team.id,
            label: `${issue.team.key} · ${issue.team.name}`,
          })),
        ),
      ];
    case "cycle":
      return [
        clear,
        { id: NONE_VALUE, label: "Unassigned" },
        ...uniqueOptions(
          issues.flatMap((issue) =>
            issue.cycle === null
              ? []
              : [
                  {
                    id: issue.cycle.id,
                    label: `#${issue.cycle.number} ${issue.cycle.name ?? "Untitled"}`,
                  },
                ],
          ),
        ),
      ];
    case "project":
      return [
        clear,
        { id: NONE_VALUE, label: "Unassigned" },
        ...uniqueOptions(
          issues.flatMap((issue) =>
            issue.project === null ? [] : [{ id: issue.project.id, label: issue.project.name }],
          ),
        ),
      ];
    case "label":
      return [
        clear,
        { id: NONE_VALUE, label: "No labels" },
        ...uniqueOptions(
          issues.flatMap((issue) =>
            issue.labels.map((label) => ({ id: label.id, label: label.name })),
          ),
        ),
      ];
  }
}

function scopeTitle(scope: IssueScope, state: AppState): string {
  switch (scope.kind) {
    case "assigned-to-me":
      return "My Issues";
    case "team": {
      const key = state.teams.find((team) => team.id === scope.teamId)?.key;
      return key === undefined ? "Team Issues" : `${key} Team Issues`;
    }
    case "cycle":
      return state.cycles.find((cycle) => cycle.id === scope.cycleId)?.name ?? "Cycle Issues";
    case "project":
      return (
        state.projects.find((project) => project.id === scope.projectId)?.name ?? "Project Issues"
      );
  }
}

export function issueListText(state: AppState, width: number): string {
  const issues = visibleIssues(state);
  if (issues.length === 0) return "No issues match the current view.";
  const groups = groupIssueList(issues, state.groupBy);
  const lines: string[] = [];
  const displayed = new Set<string>();
  for (const group of groups) {
    const uniqueIssues = group.issues.filter((issue) => !displayed.has(issue.id));
    if (uniqueIssues.length === 0) continue;
    if (state.groupBy !== "none") {
      if (lines.length > 0) lines.push("");
      const issueCount = `${uniqueIssues.length} ${uniqueIssues.length === 1 ? "issue" : "issues"}`;
      lines.push(truncateToWidth(`▾ ${group.label} · ${issueCount}`, width));
    }
    for (const issue of uniqueIssues) {
      displayed.add(issue.id);
      const marker = issue.id === state.selectedIssueId ? "›" : " ";
      const row =
        state.groupBy === "none"
          ? `${marker} ${issue.identifier} [${issue.state.name}] ${issue.title}`
          : `  ${marker} [${issue.state.name}] ${issue.title}`;
      lines.push(truncateToWidth(row, width));
    }
  }
  return lines.join("\n");
}

export function selectedIssueUrl(state: AppState): string | null {
  if (state.screen.kind !== "issue-browser") return null;
  return selectedIssue(state)?.url ?? null;
}

function issueDetailText(issue: Issue | undefined): string {
  if (issue === undefined) return "Select an issue.";
  return [
    `${issue.identifier}  ${issue.title}`,
    "",
    `Status:   ${issue.state.name}`,
    `Assignee: ${issue.assignee?.name ?? "Unassigned"}`,
    `Priority: ${issue.priorityLabel}`,
    `Estimate: ${issue.estimate ?? "-"}`,
    `Team:     ${issue.team.name}`,
    `Cycle:    ${issue.cycle === null ? "Unassigned" : `#${issue.cycle.number} ${issue.cycle.name ?? "Untitled"}`}`,
    `Project:  ${issue.project?.name ?? "Unassigned"}`,
    `Labels:   ${issue.labels.map((label) => label.name).join(", ") || "-"}`,
    `Updated:  ${formatDate(issue.updatedAt)}`,
    `URL:      ${issue.url}`,
    "",
    issue.description?.trim() || "No description.",
  ].join("\n");
}

export function catalogListText(state: AppState, width: number): string {
  if (state.screen.kind !== "catalog") return "";
  const index = state.catalogIndexes[state.screen.catalog];
  switch (state.screen.catalog) {
    case "cycles": {
      const cycles = scopedCycles(state);
      if (cycles.length === 0) return "No current cycle for this team.";
      return cycles
        .map((cycle, row) =>
          truncateToWidth(
            `${row === index ? "›" : " "} #${cycle.number} ${cycle.name ?? "Untitled"}`,
            width,
          ),
        )
        .join("\n");
    }
    case "projects": {
      const projects = scopedProjects(state);
      if (projects.length === 0) return "No active projects for this team.";
      return projects
        .map((project, row) =>
          truncateToWidth(
            `${row === index ? "›" : " "} [${project.status.name}] ${project.name}`,
            width,
          ),
        )
        .join("\n");
    }
  }
}

function catalogDetailText(item: Cycle | Project | undefined): string {
  if (item === undefined) return "Select an item.";
  if ("startsAt" in item) {
    return [
      `${item.team.name}  #${item.number} ${item.name ?? "Untitled"}`,
      "",
      `Period: ${formatDate(item.startsAt)} - ${formatDate(item.endsAt)}`,
      `Progress: ${formatProgress(item.progress)}`,
      "",
      "Press Enter to load this cycle's issues.",
    ].join("\n");
  }
  return [
    item.name,
    "",
    `Status: ${item.status.name}`,
    `Progress: ${formatProgress(item.progress)}`,
    `Health: ${item.health ?? "-"}`,
    `Lead: ${item.lead?.name ?? "-"}`,
    `Teams: ${item.teams.map((team) => team.name).join(", ")}`,
    "",
    item.description,
    "",
    "Press Enter to load this project's issues.",
  ].join("\n");
}

function overlayText(overlay: Overlay): string {
  if (overlay.kind === "team-context") {
    if (overlay.options.length === 0) return "No teams are available in this workspace.";
    return overlay.options
      .map((option, index) => `${index === overlay.selectedIndex ? "›" : " "} ${option.label}`)
      .join("\n");
  }
  if (overlay.kind === "filter-field") {
    return ISSUE_DIMENSIONS.map(
      (dimension, index) =>
        `${index === overlay.selectedIndex ? "›" : " "} ${DIMENSION_LABELS[dimension]}`,
    ).join("\n");
  }
  if (overlay.kind === "group") {
    const groups: IssueGroupDimension[] = ["none", ...ISSUE_DIMENSIONS];
    return groups
      .map(
        (group, index) =>
          `${index === overlay.selectedIndex ? "›" : " "} ${group === "none" ? "None" : DIMENSION_LABELS[group]}`,
      )
      .join("\n");
  }
  if (overlay.kind === "labels") {
    return overlay.options
      .map(
        (label, index) =>
          `${index === overlay.selectedIndex ? "›" : " "} ${overlay.selectedIds.includes(label.id) ? "[x]" : "[ ]"} ${label.name}`,
      )
      .join("\n");
  }
  return overlay.options
    .map((option, index) => `${index === overlay.selectedIndex ? "›" : " "} ${option.label}`)
    .join("\n");
}

function overlayTitle(overlay: Overlay): string {
  switch (overlay.kind) {
    case "team-context":
      return "Choose Team";
    case "filter-field":
      return "Choose Filter";
    case "filter-value":
      return `Filter by ${DIMENSION_LABELS[overlay.dimension]}`;
    case "group":
      return "Group Issues";
    case "labels":
      return "Change Labels";
    case "single-choice":
      return `Change ${
        {
          status: "Status",
          assignee: "Assignee",
          priority: "Priority",
          cycle: "Cycle",
          project: "Project",
        }[overlay.action]
      }`;
  }
}

class LinearTui {
  private state = createAppState();
  private mode: Mode = "list";
  private helpQuery = "";
  private message = "Loading...";
  private messageColor = COLORS.dim;
  private busy = false;
  private requestId = 0;

  private readonly header: TextRenderable;
  private readonly list: TextRenderable;
  private readonly detail: TextRenderable;
  private readonly footer: TextRenderable;
  private readonly listBox: BoxRenderable;
  private readonly detailBox: BoxRenderable;
  private readonly helpBox: BoxRenderable;
  private readonly helpSearch: TextRenderable;
  private readonly helpScroll: ScrollBoxRenderable;
  private readonly helpContent: TextRenderable;

  constructor(
    private readonly renderer: Awaited<ReturnType<typeof createCliRenderer>>,
    private readonly options: TuiOptions,
    private readonly done: () => void,
  ) {
    const root = new BoxRenderable(renderer, {
      id: "root",
      flexDirection: "column",
      width: "100%",
      height: "100%",
    });
    this.header = new TextRenderable(renderer, {
      id: "header",
      height: 2,
      content: "",
      fg: COLORS.accent,
      attributes: TextAttributes.BOLD,
      paddingLeft: 1,
    });
    const main = new BoxRenderable(renderer, {
      id: "main",
      flexDirection: "row",
      flexGrow: 1,
      gap: 1,
    });
    this.listBox = new BoxRenderable(renderer, {
      id: "list-panel",
      title: " My Issues ",
      border: true,
      borderColor: COLORS.border,
      width: "42%",
      flexShrink: 0,
      padding: 1,
    });
    this.detailBox = new BoxRenderable(renderer, {
      id: "detail-panel",
      title: " Detail ",
      border: true,
      borderColor: COLORS.border,
      flexGrow: 1,
      flexShrink: 0,
      minWidth: 1,
      padding: 1,
    });
    this.list = new TextRenderable(renderer, {
      id: "list",
      content: "",
      fg: COLORS.text,
      width: "100%",
      height: "100%",
      wrapMode: "none",
      selectable: false,
    });
    this.detail = new TextRenderable(renderer, {
      id: "detail",
      content: "",
      fg: COLORS.text,
      width: "100%",
      height: "100%",
      wrapMode: "word",
    });
    this.footer = new TextRenderable(renderer, {
      id: "footer",
      height: 2,
      content: "",
      fg: COLORS.dim,
      paddingLeft: 1,
      truncate: true,
    });
    this.helpBox = new BoxRenderable(renderer, {
      id: "help-window",
      title: " Keyboard Help ",
      border: true,
      borderColor: COLORS.accent,
      backgroundColor: "#0F111A",
      position: "absolute",
      left: "10%",
      top: "10%",
      width: "80%",
      height: "80%",
      zIndex: 100,
      visible: false,
      flexDirection: "column",
      padding: 1,
    });
    this.helpSearch = new TextRenderable(renderer, {
      id: "help-search",
      height: 2,
      content: "",
      fg: COLORS.accent,
    });
    this.helpScroll = new ScrollBoxRenderable(renderer, {
      id: "help-results",
      flexGrow: 1,
      scrollY: true,
      scrollX: false,
      verticalScrollbarOptions: { visible: true },
    });
    this.helpContent = new TextRenderable(renderer, {
      id: "help-content",
      content: "",
      fg: COLORS.text,
      width: "100%",
      wrapMode: "word",
    });
    this.listBox.add(this.list);
    this.detailBox.add(this.detail);
    main.add(this.listBox);
    main.add(this.detailBox);
    root.add(this.header);
    root.add(main);
    root.add(this.footer);
    this.helpScroll.add(this.helpContent);
    this.helpBox.add(this.helpSearch);
    this.helpBox.add(this.helpScroll);
    root.add(this.helpBox);
    renderer.root.add(root);
    renderer.keyInput.on("keypress", (key) => this.handleKey(key));
    renderer.on(CliRenderEvents.RESIZE, () => this.render());
  }

  start(): void {
    this.render();
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    let shouldReload = false;
    try {
      const teams = await this.options.client.getTeams();
      this.state = { ...this.state, teams };
      const configuredTeam = this.options.defaultTeam?.toUpperCase();
      const selected =
        configuredTeam === undefined
          ? undefined
          : teams.find((team) => team.key.toUpperCase() === configuredTeam);
      if (selected !== undefined) {
        this.state = selectActiveTeam(this.state, selected.id, "my-issues");
        this.setMessage(`Team: ${selected.key} · ${selected.name}`, COLORS.success);
        shouldReload = true;
      } else {
        this.state = openTeamSelector(this.state, "my-issues");
        this.setMessage(
          configuredTeam === undefined
            ? "Choose a team to continue"
            : `Default team ${configuredTeam} was not found. Choose a team.`,
          configuredTeam === undefined ? COLORS.dim : COLORS.error,
        );
      }
    } catch (error) {
      this.setMessage(this.errorMessage(error), COLORS.error);
    } finally {
      this.busy = false;
      this.render();
    }
    if (shouldReload) void this.reload();
  }

  private async reload(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      if (this.state.screen.kind === "issue-browser") {
        const scope = this.state.screen.scope;
        const requestId = ++this.requestId;
        this.state = beginIssueRequest(this.state, requestId);
        const issues = await this.options.client.getIssues(scope);
        this.state = finishIssueRequest(this.state, requestId, scope, issues);
        this.setMessage(`Loaded ${issues.length} issues`, COLORS.success);
      } else {
        await this.reloadCatalog(this.state.screen.catalog);
      }
    } catch (error) {
      this.setMessage(this.errorMessage(error), COLORS.error);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private async reloadCatalog(catalog: Catalog): Promise<void> {
    const teamId = this.state.activeTeamId;
    if (teamId === null) throw new Error("Choose a team before loading this view.");
    switch (catalog) {
      case "cycles": {
        const cycles = await this.options.client.getCurrentCycles(teamId);
        this.state = { ...this.state, cycles };
        this.setMessage(`Loaded ${scopedCycles(this.state).length} current cycles`, COLORS.success);
        break;
      }
      case "projects": {
        const projects = await this.options.client.getActiveProjects(teamId);
        this.state = { ...this.state, projects };
        this.setMessage(
          `Loaded ${scopedProjects(this.state).length} active projects`,
          COLORS.success,
        );
        break;
      }
    }
  }

  private selectNav(nav: TopNav): void {
    this.mode = "list";
    this.state = selectTopNav(this.state, nav);
    this.render();
    if (this.state.overlay?.kind === "team-context") return;
    void this.reload();
  }

  private async openIssueAction(
    action: "status" | "assignee" | "priority" | "cycle" | "project" | "labels",
  ): Promise<void> {
    const issue = selectedIssue(this.state);
    if (issue === undefined || this.busy) return;
    this.busy = true;
    try {
      if (action === "status") {
        const states = sortWorkflowStates(
          await this.options.client.getWorkflowStates(issue.team.id),
        );
        this.openSingle(
          action,
          issue.id,
          states.map((state) => ({ id: state.id, label: state.name })),
          issue.state.id,
        );
      } else if (action === "assignee") {
        const users = await this.options.client.getTeamMembers(issue.team.id);
        this.openSingle(
          action,
          issue.id,
          [
            { id: NONE_VALUE, label: "Unassigned" },
            ...users.map((user) => ({ id: user.id, label: user.name })),
          ],
          issue.assignee?.id ?? NONE_VALUE,
        );
      } else if (action === "priority") {
        this.openSingle(action, issue.id, PRIORITIES, String(issue.priority));
      } else if (action === "cycle") {
        const cycles = await this.options.client.getCurrentCycles(issue.team.id);
        this.state = { ...this.state, cycles };
        const options = cycles
          .filter((cycle) => cycle.team.id === issue.team.id)
          .map((cycle) => ({
            id: cycle.id,
            label: `#${cycle.number} ${cycle.name ?? "Untitled"}`,
          }));
        this.openSingle(
          action,
          issue.id,
          [{ id: NONE_VALUE, label: "Unassigned" }, ...options],
          issue.cycle?.id ?? NONE_VALUE,
        );
      } else if (action === "project") {
        const projects = await this.options.client.getActiveProjects(issue.team.id);
        this.state = { ...this.state, projects };
        const options = projects
          .filter((project) => project.teams.some((team) => team.id === issue.team.id))
          .map((project) => ({ id: project.id, label: project.name }));
        this.openSingle(
          action,
          issue.id,
          [{ id: NONE_VALUE, label: "Unassigned" }, ...options],
          issue.project?.id ?? NONE_VALUE,
        );
      } else {
        if (!issue.labelsComplete) {
          this.setMessage(
            "This issue has more than 50 labels, so bulk label updates are disabled for safety.",
            COLORS.error,
          );
          return;
        }
        const labels = (await this.options.client.getIssueLabels()).filter(
          (label) => label.team === null || label.team.id === issue.team.id,
        );
        this.state = openOverlay(this.state, {
          kind: "labels",
          issueId: issue.id,
          options: labels,
          selectedIndex: 0,
          selectedIds: issue.labels.map((label) => label.id),
        });
      }
      this.setMessage(
        action === "labels"
          ? "Use Up/Down to select, Space to toggle, Enter to save, or Esc to cancel"
          : "Use Up/Down to select, Enter to confirm, or Esc to cancel",
        COLORS.dim,
      );
    } catch (error) {
      this.setMessage(this.errorMessage(error), COLORS.error);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private openSingle(
    action: "status" | "assignee" | "priority" | "cycle" | "project",
    issueId: string,
    options: SelectOption[],
    selectedId: string,
  ): void {
    this.state = openOverlay(this.state, {
      kind: "single-choice",
      action,
      issueId,
      options,
      selectedIndex: Math.max(
        0,
        options.findIndex((option) => option.id === selectedId),
      ),
    });
  }

  private async confirmOverlay(): Promise<void> {
    const overlay = this.state.overlay;
    if (overlay === null) return;
    if (overlay.kind === "team-context") {
      const selected = overlay.options[overlay.selectedIndex];
      if (selected === undefined) return;
      this.state = selectActiveTeam(this.state, selected.id, overlay.destination);
      const team = activeTeam(this.state);
      this.setMessage(
        team === undefined ? "Team changed" : `Team: ${team.key} · ${team.name}`,
        COLORS.success,
      );
      this.render();
      void this.reload();
      return;
    }
    if (overlay.kind === "filter-field") {
      const dimension = ISSUE_DIMENSIONS[overlay.selectedIndex];
      if (dimension !== undefined) {
        this.state = openOverlay(this.state, {
          kind: "filter-value",
          dimension,
          options: issueFilterOptions(this.state.issues, dimension),
          selectedIndex: 0,
        });
      }
      this.render();
      return;
    }
    if (overlay.kind === "filter-value") {
      const option = overlay.options[overlay.selectedIndex];
      if (option !== undefined)
        this.state = setFilter(
          this.state,
          overlay.dimension,
          option.id === CLEAR_VALUE ? null : option.id,
        );
      this.render();
      return;
    }
    if (overlay.kind === "group") {
      const groups: IssueGroupDimension[] = ["none", ...ISSUE_DIMENSIONS];
      const group = groups[overlay.selectedIndex];
      if (group !== undefined) this.state = setGroup(this.state, group);
      this.render();
      return;
    }
    const issueId =
      overlay.kind === "labels" || overlay.kind === "single-choice" ? overlay.issueId : null;
    const issue = this.state.issues.find((candidate) => candidate.id === issueId);
    const change = issue === undefined ? null : issueChangeForOverlay(issue, overlay);
    if (change === null) {
      this.state = closeOverlay(this.state);
      this.render();
      return;
    }
    this.busy = true;
    try {
      const updated = await this.options.client.updateIssue(change);
      this.state = applyIssueUpdate(this.state, updated);
      this.setMessage("Issue updated", COLORS.success);
    } catch (error) {
      this.setMessage(this.errorMessage(error), COLORS.error);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private handleKey(key: KeyEvent): void {
    if (key.eventType === "release") return;
    if (key.ctrl && key.name === "c") return this.quit();
    if (this.busy) {
      if (key.name === "q") this.quit();
      return;
    }
    if (this.state.overlay !== null) return this.handleOverlayKey(key);
    if (this.mode === "help") return this.handleHelpKey(key);
    if (this.mode === "search") return this.handleSearchKey(key);
    switch (key.name) {
      case "1":
        this.selectNav("my-issues");
        break;
      case "2":
        this.selectNav("teams");
        break;
      case "3":
        this.selectNav("cycles");
        break;
      case "4":
        this.selectNav("projects");
        break;
      case "t":
        this.state = openTeamSelector(this.state);
        this.render();
        break;
      case "q":
        this.quit();
        break;
      case "up":
      case "k":
        this.state = moveSelection(this.state, -1);
        this.render();
        break;
      case "down":
      case "j":
        this.state = moveSelection(this.state, 1);
        this.render();
        break;
      case "return":
      case "enter":
        if (this.state.screen.kind === "catalog") {
          this.state = drillIntoSelected(this.state);
          this.render();
          void this.reload();
        }
        break;
      case "escape":
        this.state = escapeIssueBrowser(this.state);
        this.render();
        break;
      case "/":
        if (this.state.screen.kind === "issue-browser") {
          this.mode = "search";
          this.render();
        }
        break;
      case "f":
        if (this.state.screen.kind === "issue-browser") {
          this.state = openOverlay(this.state, { kind: "filter-field", selectedIndex: 0 });
          this.render();
        }
        break;
      case "g":
        if (this.state.screen.kind === "issue-browser") {
          this.state = openOverlay(this.state, { kind: "group", selectedIndex: 0 });
          this.render();
        }
        break;
      case "x":
        if (this.state.screen.kind === "issue-browser") {
          this.state = resetIssueList(this.state);
          this.render();
        }
        break;
      case "r":
        void this.reload();
        break;
      case "u":
        this.copyIssueUrl();
        break;
      case "s":
        if (this.state.screen.kind === "issue-browser") void this.openIssueAction("status");
        break;
      case "a":
        if (this.state.screen.kind === "issue-browser") void this.openIssueAction("assignee");
        break;
      case "y":
        if (this.state.screen.kind === "issue-browser") void this.openIssueAction("priority");
        break;
      case "c":
        if (this.state.screen.kind === "issue-browser") void this.openIssueAction("cycle");
        break;
      case "p":
        if (this.state.screen.kind === "issue-browser") void this.openIssueAction("project");
        break;
      case "l":
        if (this.state.screen.kind === "issue-browser") void this.openIssueAction("labels");
        break;
      case "?":
        this.mode = "help";
        this.helpQuery = "";
        this.helpScroll.scrollTo(0);
        this.render();
        break;
    }
  }

  private handleSearchKey(key: KeyEvent): void {
    if (key.name === "escape" || key.name === "return" || key.name === "enter") {
      this.mode = "list";
      return this.render();
    }
    const query = this.state.query;
    if (key.name === "backspace") this.state = setQuery(this.state, query.slice(0, -1));
    else if (key.ctrl && key.name === "u") this.state = setQuery(this.state, "");
    else if (!key.ctrl && !key.meta && key.sequence.length === 1)
      this.state = setQuery(this.state, `${query}${key.sequence}`);
    this.render();
  }

  private handleHelpKey(key: KeyEvent): void {
    if (key.name === "escape" || key.name === "?") {
      this.mode = "list";
      return this.render();
    }
    if (key.name === "up") {
      this.helpScroll.scrollBy(-3);
      return this.render();
    }
    if (key.name === "down") {
      this.helpScroll.scrollBy(3);
      return this.render();
    }
    if (key.name === "backspace") this.helpQuery = this.helpQuery.slice(0, -1);
    else if (key.ctrl && key.name === "u") this.helpQuery = "";
    else if (!key.ctrl && !key.meta && key.sequence.length === 1)
      this.helpQuery = `${this.helpQuery}${key.sequence}`;
    this.helpScroll.scrollTo(0);
    this.render();
  }

  private handleOverlayKey(key: KeyEvent): void {
    if (key.name === "q") {
      if (this.state.overlay?.kind === "team-context" && this.state.activeTeamId === null) {
        this.quit();
        return;
      }
      this.state = closeOverlay(this.state);
    } else if (key.name === "escape") {
      if (this.state.overlay?.kind === "team-context" && this.state.activeTeamId === null) {
        this.setMessage("Choose a team to continue", COLORS.error);
        return;
      }
      this.state = closeOverlay(this.state);
    } else if (key.name === "up" || key.name === "k") this.state = moveOverlay(this.state, -1);
    else if (key.name === "down" || key.name === "j") this.state = moveOverlay(this.state, 1);
    else if (key.name === "space" || key.sequence === " ")
      this.state = toggleSelectedLabel(this.state);
    else if (key.name === "return" || key.name === "enter") {
      void this.confirmOverlay();
      return;
    }
    this.render();
  }

  private render(): void {
    const panels = panelWidths(this.renderer.terminalWidth);
    this.listBox.width = panels.list;
    this.detailBox.width = panels.detail;
    const width = Math.max(this.listBox.width - 4, 10);
    const mock = this.options.mode === "mock" ? "[MOCK DATA]  " : "";
    const active = currentTopNav(this.state);
    const nav = (
      [
        ["my-issues", "1 My Issues"],
        ["teams", "2 Team Issues"],
        ["cycles", "3 Cycles"],
        ["projects", "4 Projects"],
      ] satisfies [TopNav, string][]
    )
      .map(([id, label]) => (id === active ? `[${label}]` : label))
      .join("  ");
    const team = activeTeam(this.state);
    const teamLabel = team === undefined ? "Team: Choose" : `Team: ${team.key}`;
    this.header.content = `${mock}linearctl  ${this.options.workspace.urlKey}  ${teamLabel}  ${nav}`;
    if (this.state.screen.kind === "issue-browser") {
      const visible = visibleIssues(this.state);
      this.listBox.title = ` ${scopeTitle(this.state.screen.scope, this.state)} ${visible.length}/${this.state.issues.length} `;
      this.list.content = issueListText(this.state, width);
      this.detail.content = issueDetailText(selectedIssue(this.state));
    } else {
      this.listBox.title = ` ${this.state.screen.catalog[0]?.toUpperCase()}${this.state.screen.catalog.slice(1)} `;
      this.list.content = catalogListText(this.state, width);
      this.detail.content = catalogDetailText(selectedCatalogItem(this.state));
    }
    this.detailBox.title = " Detail ";
    if (this.state.overlay !== null) {
      this.detailBox.title = ` ${overlayTitle(this.state.overlay)} `;
      this.detail.content = overlayText(this.state.overlay);
    }
    this.helpBox.visible = this.mode === "help";
    this.helpSearch.content = `Search commands: ${this.helpQuery}█\nType to filter · Up/Down to scroll · Esc or ? to close`;
    this.helpContent.content = helpText(HELP_ENTRIES, this.helpQuery);
    const controls = this.controlsText();
    const filterCount = Object.keys(this.state.filters).length;
    this.footer.content = [
      `${this.options.mode === "mock" ? "MOCK  " : ""}${controls}`,
      `Filters: ${filterCount} · Group: ${
        this.state.groupBy === "none" ? "None" : DIMENSION_LABELS[this.state.groupBy]
      } · ${this.message}`,
    ].join("\n");
    this.footer.fg =
      this.mode === "search" || this.mode === "help" ? COLORS.accent : this.messageColor;
    this.renderer.requestRender();
  }

  private controlsText(): string {
    if (this.mode === "help") return "Help search is active";
    if (this.mode === "search")
      return `Search: ${this.state.query}█  Enter apply · Esc cancel · Ctrl+U clear`;
    if (this.state.overlay?.kind === "labels")
      return "Up/Down select · Space toggle · Enter save · Esc cancel";
    if (this.state.overlay?.kind === "team-context" && this.state.activeTeamId === null)
      return "Up/Down select · Enter confirm · q quit";
    if (this.state.overlay !== null) return "Up/Down select · Enter confirm · Esc cancel";
    if (this.state.screen.kind === "catalog")
      return "Up/Down select · Enter open issues · t change team · r reload · ? all commands · q quit";
    return "Up/Down select · t change team · / search · f filter · g group · u copy URL · ? help";
  }

  private copyIssueUrl(): void {
    const url = selectedIssueUrl(this.state);
    if (url === null) {
      this.setMessage("Select an issue before copying its URL", COLORS.error);
      return;
    }
    if (!this.renderer.copyToClipboardOSC52(url)) {
      this.setMessage("The terminal does not support clipboard copy", COLORS.error);
      return;
    }
    this.setMessage("Issue URL copied", COLORS.success);
  }

  private setMessage(message: string, color: string): void {
    this.message = message;
    this.messageColor = color;
    this.render();
  }
  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "An unexpected error occurred.";
  }
  private quit(): void {
    this.done();
  }
}

export async function runTui(options: TuiOptions): Promise<void> {
  let finish: () => void = () => undefined;
  const stopped = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    targetFps: 30,
    useMouse: false,
    consoleMode: "disabled",
    onDestroy: finish,
  });
  try {
    renderer.setTerminalTitle(
      `${options.mode === "mock" ? "[MOCK] " : ""}linearctl · ${options.workspace.urlKey}`,
    );
    const app = new LinearTui(renderer, options, finish);
    renderer.start();
    app.start();
    await stopped;
  } finally {
    renderer.destroy();
  }
}
