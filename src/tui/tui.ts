import {
  BoxRenderable,
  CliRenderEvents,
  createCliRenderer,
  fg,
  type KeyEvent,
  type MouseEvent,
  ScrollBoxRenderable,
  StyledText,
  TextAttributes,
  TextRenderable,
} from "@opentui/core";

import {
  applyCreatedIssue,
  applyCreatedProject,
  cancelOverlaySearch,
  commitOverlaySearch,
  applyIssueUpdate,
  activeTeam,
  beginIssueRequest,
  closeOverlay,
  createAppState,
  currentTopNav,
  drillIntoSelected,
  emptyIssueCreateDraft,
  emptyProjectCreateDraft,
  escapeIssueBrowser,
  finishIssueRequest,
  issueChangeForOverlay,
  issueCreateInputFromDraft,
  issueEditDraft,
  moveOverlay,
  moveSelection,
  openTeamSelector,
  openOverlay,
  overlaySupportsSearch,
  projectCreateInputFromDraft,
  resetIssueList,
  sameScope,
  selectTopNav,
  selectedCatalogItem,
  scopedProjects,
  selectActiveTeam,
  selectedIssue,
  selectedOverlayOption,
  setFilter,
  setGroup,
  setOverlayQuery,
  setQuery,
  startOverlaySearch,
  toggleSelectedLabel,
  visibleIssues,
  visibleProjects,
  type IssueCreateDraft,
  type IssueEditDraft,
  type Overlay,
  type ProjectCreateDraft,
  type SelectOption,
  type TopNav,
} from "./app-state";
import type { ClientMode } from "../core/client-factory";
import {
  sortWorkflowStates,
  type Cycle,
  type IssueChange,
  type IssueCommentPage,
  type IssuePage,
  type Workspace,
} from "../core/domain";
import { HELP_ENTRIES, helpText } from "./help";
import { ISSUE_DIMENSIONS, NONE_VALUE, type IssueGroupDimension } from "./issue-list";
import type { LinearClient } from "../core/linear-client";
import { openUrlInBrowser, type UrlOpener } from "./open-url";
import {
  deleteBackward,
  deleteForward,
  insertText,
  lineEnd,
  lineStart,
  moveCursorHorizontal,
  moveCursorVertical,
} from "./text-input";
import { isCreateSubmit, isEditorConfirm, isSearchTrigger, printableKeyText } from "./key-intent";
import { CATALOG_CONTROLS, ISSUE_BROWSER_CONTROLS, listIntent, type ListIntent } from "./keymap";
import { helpIntent, searchIntent, type Mode } from "./ui-state";
import { unreachable } from "../core/unreachable";
import { openSelectedItemUrl, selectedItemUrl } from "./item-url";
import {
  CLEAR_VALUE,
  cycleOptions,
  ensureOption,
  issueFilterOptions,
  optionsWithNone,
  PRIORITIES,
} from "./issue-options";
import { DIMENSION_LABELS, ISSUE_ACTION_LABELS, overlayText, overlayTitle } from "./overlay-view";
import {
  catalogDetailText,
  catalogListText,
  COLORS,
  commentsText,
  issueDetailText,
  issueListRows,
  listScrollOffset,
  panelWidths,
  scopeTitle,
  selectableTextRows,
  styledListContent,
} from "./tui-format";

interface TuiOptions {
  readonly client: LinearClient;
  readonly workspace: Workspace;
  readonly mode: ClientMode;
  readonly defaultTeam?: string;
  readonly openUrl?: UrlOpener;
}

class LinearTui {
  private readonly renderer: Awaited<ReturnType<typeof createCliRenderer>>;
  private readonly options: TuiOptions;
  private readonly done: () => void;
  private state = createAppState();
  private mode: Mode = "list";
  private searchBaselineQuery = "";
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
  private readonly detailScroll: ScrollBoxRenderable;
  /** Last rendered detail identity; scroll resets when it changes so a new item starts at the top. */
  private detailKey = "";
  /** Comments shown in the detail panel; cleared when the selection moves to another issue. */
  private commentsView: { issueId: string; page: IssueCommentPage } | null = null;
  private readonly helpBox: BoxRenderable;
  private readonly helpSearch: TextRenderable;
  private readonly helpScroll: ScrollBoxRenderable;
  private readonly helpContent: TextRenderable;

  constructor(
    renderer: Awaited<ReturnType<typeof createCliRenderer>>,
    options: TuiOptions,
    done: () => void,
  ) {
    this.renderer = renderer;
    this.options = options;
    this.done = done;
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
      onMouseScroll: (event) => this.handleListScroll(event),
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
    this.detailScroll = new ScrollBoxRenderable(renderer, {
      id: "detail-scroll",
      width: "100%",
      height: "100%",
      scrollY: true,
      scrollX: false,
      verticalScrollbarOptions: { visible: true },
    });
    this.detail = new TextRenderable(renderer, {
      id: "detail",
      content: "",
      fg: COLORS.text,
      width: "100%",
      wrapMode: "word",
    });
    this.footer = new TextRenderable(renderer, {
      id: "footer",
      height: 2,
      content: "",
      fg: COLORS.dim,
      paddingLeft: 1,
      // Word wrap would spend both rows on the controls line and hide the message row.
      wrapMode: "none",
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
    this.detailScroll.add(this.detail);
    this.detailBox.add(this.detailScroll);
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
    }
    if (shouldReload) {
      void this.reload();
      return;
    }
    this.render();
  }

  private async reload(): Promise<void> {
    if (this.state.screen.kind === "issue-browser") {
      await this.reloadIssues();
      return;
    }
    if (this.busy) return;
    this.busy = true;
    try {
      await this.reloadCatalog();
    } catch (error) {
      this.setMessage(this.errorMessage(error), COLORS.error);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private async reloadIssues(force = false): Promise<void> {
    if (this.state.screen.kind !== "issue-browser") return;
    const scope = this.state.screen.scope;
    // Key repeat on r/1-4 must not stack identical requests; a new scope still
    // supersedes the pending one so view switches stay responsive. A forced
    // reload (the done toggle) changes what the same scope returns, so it may not skip.
    const pending = this.state.pendingIssueRequest;
    if (!force && pending !== null && sameScope(pending.scope, scope)) return;
    const requestId = ++this.requestId;
    this.state = beginIssueRequest(this.state, requestId);
    this.render();
    try {
      // Resolve the current cycle before the issue fetch so getIssues does not
      // repeat the same cycle query, and so no await runs after finishIssueRequest
      // (state committed after a second await would drop keys pressed meanwhile).
      let cycles: Cycle[] | null = null;
      let page: IssuePage;
      if (scope.kind === "current-cycle") {
        cycles = await this.options.client.getCurrentCycles(scope.teamId);
        const cycle = cycles[0];
        page =
          cycle === undefined
            ? { issues: [], hasMore: false }
            : await this.options.client.getIssues(
                { kind: "cycle", cycleId: cycle.id },
                { includeDone: this.state.includeDone },
              );
      } else {
        page = await this.options.client.getIssues(scope, {
          includeDone: this.state.includeDone,
        });
      }
      const next = finishIssueRequest(this.state, requestId, scope, page);
      if (next !== this.state) {
        this.state = cycles === null ? next : { ...next, cycles };
        this.setMessage(
          page.hasMore
            ? `Loaded the first ${page.issues.length} issues; more exist on the server`
            : `Loaded ${page.issues.length} issues`,
          page.hasMore ? COLORS.warning : COLORS.success,
        );
      }
    } catch (error) {
      // A superseded request must not clear the newer pending state or repaint
      // the current view's message with its own failure.
      if (this.state.pendingIssueRequest?.id === requestId) {
        this.state = { ...this.state, pendingIssueRequest: null };
        this.setMessage(this.errorMessage(error), COLORS.error);
      }
    } finally {
      this.render();
    }
  }

  private async reloadCatalog(): Promise<void> {
    const teamId = this.state.activeTeamId;
    if (teamId === null) throw new Error("Choose a team before loading this view.");
    const page = await this.options.client.getActiveProjects(teamId);
    this.state = { ...this.state, projects: page.projects, projectsHasMore: page.hasMore };
    this.setMessage(
      page.hasMore
        ? `Loaded the first ${scopedProjects(this.state).length} active projects; more exist on the server`
        : `Loaded ${scopedProjects(this.state).length} active projects`,
      page.hasMore ? COLORS.warning : COLORS.success,
    );
  }

  private selectNav(nav: TopNav): void {
    this.mode = "list";
    this.state = selectTopNav(this.state, nav);
    if (this.state.overlay?.kind === "team-context") {
      this.render();
      return;
    }
    void this.reload();
  }

  private requestIssueAction(
    action: Exclude<IssueChange["kind"], "content" | "title" | "description">,
  ): void {
    if (this.state.screen.kind !== "issue-browser") {
      this.setMessage(
        `Open an issue view before changing its ${ISSUE_ACTION_LABELS[action].toLowerCase()}`,
        COLORS.error,
      );
      return;
    }
    void this.openIssueAction(action);
  }

  private async openIssueAction(
    action: Exclude<IssueChange["kind"], "content" | "title" | "description">,
  ): Promise<void> {
    const issue = selectedIssue(this.state);
    if (issue === undefined) {
      this.setMessage(
        `Select an issue before changing its ${ISSUE_ACTION_LABELS[action].toLowerCase()}`,
        COLORS.error,
      );
      return;
    }
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
        const cycles = await this.options.client.getTeamCycles(issue.team.id);
        const options = ensureOption(
          cycleOptions(cycles),
          issue.cycle === null
            ? null
            : {
                id: issue.cycle.id,
                label: `#${issue.cycle.number} ${issue.cycle.name ?? "Untitled"}`,
              },
        );
        this.openSingle(
          action,
          issue.id,
          [{ id: NONE_VALUE, label: "Unassigned" }, ...options],
          issue.cycle?.id ?? NONE_VALUE,
        );
      } else if (action === "project") {
        const { projects } = await this.options.client.getActiveProjects(issue.team.id);
        this.state = { ...this.state, projects };
        const options = ensureOption(
          projects
            .filter((project) => project.teams.some((team) => team.id === issue.team.id))
            .map((project) => ({ id: project.id, label: project.name })),
          issue.project === null ? null : { id: issue.project.id, label: issue.project.name },
        );
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

  private async openCreateIssue(): Promise<void> {
    const team = activeTeam(this.state);
    if (team === undefined) {
      this.setMessage("Choose a team before creating an issue", COLORS.error);
      return;
    }
    this.state = openOverlay(this.state, {
      kind: "create-issue",
      draft: emptyIssueCreateDraft(team.id),
      focusedField: "title",
      editor: "fields",
      cursor: 0,
    });
    this.setMessage("Create issue · fill fields, then Create issue", COLORS.dim);
    this.render();
  }

  private openEditIssue(): void {
    const issue = selectedIssue(this.state);
    if (issue === undefined) {
      this.setMessage("Select an issue before editing it", COLORS.error);
      return;
    }
    this.state = openOverlay(this.state, {
      kind: "edit-issue",
      draft: issueEditDraft(issue),
      focusedField: "title",
      editor: "fields",
      cursor: 0,
    });
    this.setMessage(`Edit ${issue.identifier} · save explicitly when ready`, COLORS.dim);
    this.render();
  }

  private async openCreateProject(): Promise<void> {
    const team = activeTeam(this.state);
    if (team === undefined) {
      this.setMessage("Choose a team before creating a project", COLORS.error);
      return;
    }
    this.state = openOverlay(this.state, {
      kind: "create-project",
      draft: emptyProjectCreateDraft(team.id),
      focusedField: "name",
      editor: "fields",
      cursor: 0,
    });
    this.setMessage("Create project · fill fields, then Create project", COLORS.dim);
    this.render();
  }

  private async openCreateFieldPicker(
    field: "status" | "assignee" | "priority" | "cycle" | "project" | "lead" | "labels",
  ): Promise<void> {
    const overlay = this.state.overlay;
    if (overlay === null || this.busy) return;
    if (overlay.kind === "create-issue") {
      const draft = overlay.draft;
      this.busy = true;
      try {
        if (field === "status") {
          const states = sortWorkflowStates(
            await this.options.client.getWorkflowStates(draft.teamId),
          );
          const picked = optionsWithNone(
            states.map((state) => ({ id: state.id, label: state.name })),
            draft.stateId,
            "Team default",
          );
          this.state = openOverlay(this.state, {
            kind: "create-choice",
            target: "issue",
            field: "status",
            draft,
            options: picked.options,
            selectedIndex: picked.selectedIndex,
          });
        } else if (field === "assignee") {
          const users = await this.options.client.getTeamMembers(draft.teamId);
          const picked = optionsWithNone(
            users.map((user) => ({ id: user.id, label: user.name })),
            draft.assigneeId,
          );
          this.state = openOverlay(this.state, {
            kind: "create-choice",
            target: "issue",
            field: "assignee",
            draft,
            options: picked.options,
            selectedIndex: picked.selectedIndex,
          });
        } else if (field === "priority") {
          this.state = openOverlay(this.state, {
            kind: "create-choice",
            target: "issue",
            field: "priority",
            draft,
            options: PRIORITIES,
            selectedIndex: Math.max(
              0,
              PRIORITIES.findIndex((option) => option.id === String(draft.priority)),
            ),
          });
        } else if (field === "cycle") {
          const cycles = await this.options.client.getTeamCycles(draft.teamId);
          const picked = optionsWithNone(
            ensureOption(
              cycleOptions(cycles),
              draft.cycleId === null ? null : { id: draft.cycleId, label: draft.cycleLabel },
            ),
            draft.cycleId,
          );
          this.state = openOverlay(this.state, {
            kind: "create-choice",
            target: "issue",
            field: "cycle",
            draft,
            options: picked.options,
            selectedIndex: picked.selectedIndex,
          });
        } else if (field === "project") {
          const { projects } = await this.options.client.getActiveProjects(draft.teamId);
          this.state = { ...this.state, projects };
          const picked = optionsWithNone(
            ensureOption(
              projects
                .filter((project) => project.teams.some((team) => team.id === draft.teamId))
                .map((project) => ({ id: project.id, label: project.name })),
              draft.projectId === null ? null : { id: draft.projectId, label: draft.projectLabel },
            ),
            draft.projectId,
          );
          this.state = openOverlay(this.state, {
            kind: "create-choice",
            target: "issue",
            field: "project",
            draft,
            options: picked.options,
            selectedIndex: picked.selectedIndex,
          });
        } else if (field === "labels") {
          const labels = (await this.options.client.getIssueLabels()).filter(
            (label) => label.team === null || label.team.id === draft.teamId,
          );
          this.state = openOverlay(this.state, {
            kind: "create-labels",
            draft,
            options: labels,
            selectedIndex: 0,
            selectedIds: [...draft.labelIds],
          });
        }
      } catch (error) {
        this.setMessage(this.errorMessage(error), COLORS.error);
      } finally {
        this.busy = false;
        this.render();
      }
      return;
    }
    if (overlay.kind === "create-project" && field === "lead") {
      this.busy = true;
      try {
        const users = await this.options.client.getTeamMembers(overlay.draft.teamId);
        const picked = optionsWithNone(
          users.map((user) => ({ id: user.id, label: user.name })),
          overlay.draft.leadId,
        );
        this.state = openOverlay(this.state, {
          kind: "create-choice",
          target: "project",
          field: "lead",
          draft: overlay.draft,
          options: picked.options,
          selectedIndex: picked.selectedIndex,
        });
      } catch (error) {
        this.setMessage(this.errorMessage(error), COLORS.error);
      } finally {
        this.busy = false;
        this.render();
      }
    }
  }

  private async submitCreateIssue(draft: IssueCreateDraft): Promise<void> {
    if (draft.title.trim().length === 0) {
      this.setMessage("Issue title is required", COLORS.error);
      return;
    }
    this.busy = true;
    try {
      const created = await this.options.client.createIssue(issueCreateInputFromDraft(draft));
      this.state = applyCreatedIssue(this.state, created);
      this.setMessage(`Created ${created.identifier}`, COLORS.success);
    } catch (error) {
      this.setMessage(this.errorMessage(error), COLORS.error);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private async submitCreateProject(draft: ProjectCreateDraft): Promise<void> {
    if (draft.name.trim().length === 0) {
      this.setMessage("Project name is required", COLORS.error);
      return;
    }
    this.busy = true;
    try {
      const created = await this.options.client.createProject(projectCreateInputFromDraft(draft));
      this.state = applyCreatedProject(this.state, created);
      this.setMessage(`Created project ${created.name}`, COLORS.success);
    } catch (error) {
      this.setMessage(this.errorMessage(error), COLORS.error);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private async submitEditIssue(draft: IssueEditDraft): Promise<void> {
    if (draft.title.trim().length === 0) {
      this.setMessage("Issue title is required", COLORS.error);
      return;
    }
    const issue = this.state.issues.find((candidate) => candidate.id === draft.issueId);
    if (issue === undefined) {
      this.state = closeOverlay(this.state);
      this.setMessage("The issue is no longer in this view", COLORS.error);
      this.render();
      return;
    }
    const change = issueChangeForOverlay(this.state, issue);
    if (change === null) {
      this.state = closeOverlay(this.state);
      this.setMessage("No issue changes to save", COLORS.dim);
      this.render();
      return;
    }
    this.busy = true;
    try {
      const updated = await this.options.client.updateIssue(change);
      this.state = applyIssueUpdate(this.state, updated);
      this.setMessage(`Updated ${issue.identifier}`, COLORS.success);
    } catch (error) {
      this.setMessage(this.errorMessage(error), COLORS.error);
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private async confirmOverlay(): Promise<void> {
    const overlay = this.state.overlay;
    if (overlay === null) return;
    if (overlay.kind === "team-context") {
      const selected = selectedOverlayOption(this.state);
      if (selected === undefined) return;
      this.state = selectActiveTeam(this.state, selected.id, overlay.destination);
      const team = activeTeam(this.state);
      this.setMessage(
        team === undefined ? "Team changed" : `Team: ${team.key} · ${team.name}`,
        COLORS.success,
      );
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
      const option = selectedOverlayOption(this.state);
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
    if (overlay.kind === "edit-issue") {
      if (overlay.editor !== "fields") return;
      if (overlay.focusedField === "title") {
        this.state = openOverlay(this.state, {
          ...overlay,
          editor: "title",
          cursor: overlay.draft.title.length,
        });
        this.render();
        return;
      }
      if (overlay.focusedField === "description") {
        this.state = openOverlay(this.state, {
          ...overlay,
          editor: "description",
          cursor: overlay.draft.description.length,
        });
        this.render();
        return;
      }
      await this.submitEditIssue(overlay.draft);
      return;
    }
    if (overlay.kind === "create-issue") {
      if (overlay.editor !== "fields") return;
      if (overlay.focusedField === "title") {
        this.state = openOverlay(this.state, {
          ...overlay,
          editor: "title",
          cursor: overlay.draft.title.length,
        });
        this.render();
        return;
      }
      if (overlay.focusedField === "description") {
        this.state = openOverlay(this.state, {
          ...overlay,
          editor: "description",
          cursor: overlay.draft.description.length,
        });
        this.render();
        return;
      }
      if (overlay.focusedField === "submit") {
        await this.submitCreateIssue(overlay.draft);
        return;
      }
      await this.openCreateFieldPicker(overlay.focusedField);
      return;
    }
    if (overlay.kind === "create-project") {
      if (overlay.editor !== "fields") return;
      if (overlay.focusedField === "name") {
        this.state = openOverlay(this.state, {
          ...overlay,
          editor: "name",
          cursor: overlay.draft.name.length,
        });
        this.render();
        return;
      }
      if (overlay.focusedField === "description") {
        this.state = openOverlay(this.state, {
          ...overlay,
          editor: "description",
          cursor: overlay.draft.description.length,
        });
        this.render();
        return;
      }
      if (overlay.focusedField === "content") {
        this.state = openOverlay(this.state, {
          ...overlay,
          editor: "content",
          cursor: overlay.draft.content.length,
        });
        this.render();
        return;
      }
      if (overlay.focusedField === "submit") {
        await this.submitCreateProject(overlay.draft);
        return;
      }
      await this.openCreateFieldPicker("lead");
      return;
    }
    if (overlay.kind === "create-choice") {
      const option = selectedOverlayOption(this.state);
      if (option === undefined) return;
      if (overlay.target === "issue") {
        const draft = { ...overlay.draft };
        if (overlay.field === "status") {
          draft.stateId = option.id === NONE_VALUE ? null : option.id;
          draft.stateLabel = option.label;
        } else if (overlay.field === "assignee") {
          draft.assigneeId = option.id === NONE_VALUE ? null : option.id;
          draft.assigneeLabel = option.label;
        } else if (overlay.field === "priority") {
          draft.priority = Number(option.id);
        } else if (overlay.field === "cycle") {
          draft.cycleId = option.id === NONE_VALUE ? null : option.id;
          draft.cycleLabel = option.label;
        } else {
          draft.projectId = option.id === NONE_VALUE ? null : option.id;
          draft.projectLabel = option.label;
        }
        this.state = openOverlay(this.state, {
          kind: "create-issue",
          draft,
          focusedField: overlay.field,
          editor: "fields",
          cursor: 0,
        });
      } else {
        const draft = { ...overlay.draft };
        draft.leadId = option.id === NONE_VALUE ? null : option.id;
        draft.leadLabel = option.label;
        this.state = openOverlay(this.state, {
          kind: "create-project",
          draft,
          focusedField: overlay.field,
          editor: "fields",
          cursor: 0,
        });
      }
      this.render();
      return;
    }
    if (overlay.kind === "create-labels") {
      const selected = overlay.options.filter((label) => overlay.selectedIds.includes(label.id));
      const draft = {
        ...overlay.draft,
        labelIds: selected.map((label) => label.id),
        labelSummary:
          selected.length === 0 ? "None" : selected.map((label) => label.name).join(", "),
      };
      this.state = openOverlay(this.state, {
        kind: "create-issue",
        draft,
        focusedField: "labels",
        editor: "fields",
        cursor: 0,
      });
      this.render();
      return;
    }
    const issueId =
      overlay.kind === "labels" || overlay.kind === "single-choice" ? overlay.issueId : null;
    const issue = this.state.issues.find((candidate) => candidate.id === issueId);
    const change = issue === undefined ? null : issueChangeForOverlay(this.state, issue);
    if (change === null) {
      this.state = closeOverlay(this.state);
      this.setMessage("No issue changes to save", COLORS.dim);
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
      else this.setMessage("Working on the previous action...", COLORS.dim);
      return;
    }
    if (this.state.overlay !== null) return this.handleOverlayKey(key);
    if (this.mode === "help") return this.handleHelpKey(key);
    if (this.mode === "search") return this.handleSearchKey(key);
    const intent = listIntent(key);
    if (intent !== null) this.applyListIntent(intent);
  }

  /** Wheel over the list panel moves the selection; the detail panel scrolls itself. */
  private handleListScroll(event: MouseEvent): void {
    const scroll = event.scroll;
    if (scroll === undefined) return;
    if (this.busy || this.state.overlay !== null || this.mode !== "list") return;
    if (scroll.direction !== "up" && scroll.direction !== "down") return;
    const steps = Math.max(1, Math.round(scroll.delta));
    this.state = moveSelection(this.state, scroll.direction === "up" ? -steps : steps);
    this.render();
  }

  private applyListIntent(intent: ListIntent): void {
    switch (intent.kind) {
      case "nav":
        return this.selectNav(intent.nav);
      case "team-selector":
        this.state = openTeamSelector(this.state);
        return this.render();
      case "create":
        if (this.state.screen.kind === "catalog") void this.openCreateProject();
        else if (this.state.screen.kind === "issue-browser") void this.openCreateIssue();
        return;
      case "edit":
        if (this.state.screen.kind === "issue-browser") this.openEditIssue();
        else this.setMessage("Open an issue view before editing an issue", COLORS.error);
        return;
      case "quit":
        return this.quit();
      case "move":
        this.state = moveSelection(this.state, intent.delta);
        return this.render();
      case "activate":
        if (this.state.screen.kind === "catalog") {
          this.state = drillIntoSelected(this.state);
          void this.reload();
        }
        return;
      case "back":
        this.state = escapeIssueBrowser(this.state);
        return this.render();
      case "search":
        return this.enterSearchMode();
      case "filter":
        if (this.state.screen.kind === "issue-browser") {
          this.state = openOverlay(this.state, { kind: "filter-field", selectedIndex: 0 });
          this.render();
        }
        return;
      case "group":
        if (this.state.screen.kind === "issue-browser") {
          this.state = openOverlay(this.state, { kind: "group", selectedIndex: 0 });
          this.render();
        }
        return;
      case "reset":
        this.state = resetIssueList(this.state);
        return this.render();
      case "reload":
        void this.reload();
        return;
      case "scroll-detail":
        this.detailScroll.scrollBy(intent.delta);
        return this.render();
      case "open-url":
        void this.openIssueInBrowser();
        return;
      case "copy-url":
        return this.copyIssueUrl();
      case "issue-action":
        return this.requestIssueAction(intent.action);
      case "comments":
        void this.toggleComments();
        return;
      case "toggle-done":
        if (this.state.screen.kind === "issue-browser") {
          this.state = { ...this.state, includeDone: !this.state.includeDone };
          this.setMessage(
            this.state.includeDone
              ? "Showing completed and canceled issues"
              : "Hiding completed and canceled issues",
            COLORS.dim,
          );
          void this.reloadIssues(true);
        } else {
          this.setMessage("Open an issue view before toggling done issues", COLORS.error);
        }
        return;
      case "help":
        this.mode = "help";
        this.helpQuery = "";
        this.helpScroll.scrollTo(0);
        return this.render();
      default:
        return unreachable(intent);
    }
  }

  private enterSearchMode(): void {
    if (this.state.screen.kind !== "issue-browser" && this.state.screen.kind !== "catalog") return;
    this.searchBaselineQuery = this.state.query;
    this.mode = "search";
    this.render();
  }

  private handleSearchKey(key: KeyEvent): void {
    const intent = searchIntent(key);
    switch (intent.kind) {
      case "cancel":
        this.state = setQuery(this.state, this.searchBaselineQuery);
        this.mode = "list";
        break;
      case "commit":
        this.mode = "list";
        break;
      case "backspace":
        this.state = setQuery(this.state, this.state.query.slice(0, -1));
        break;
      case "clear":
        this.state = setQuery(this.state, "");
        break;
      case "input":
        this.state = setQuery(this.state, `${this.state.query}${intent.text}`);
        break;
      case "none":
        return;
      default:
        return unreachable(intent);
    }
    this.render();
  }

  private handleHelpKey(key: KeyEvent): void {
    const intent = helpIntent(key);
    switch (intent.kind) {
      case "close":
        this.mode = "list";
        return this.render();
      case "scroll":
        this.helpScroll.scrollBy(intent.delta);
        return this.render();
      case "backspace":
        this.helpQuery = deleteBackward(this.helpQuery, this.helpQuery.length).text;
        break;
      case "clear":
        this.helpQuery = "";
        break;
      case "input":
        this.helpQuery = `${this.helpQuery}${intent.text}`;
        break;
      case "none":
        return;
      default:
        return unreachable(intent);
    }
    this.helpScroll.scrollTo(0);
    this.render();
  }

  /** Text field of the focused editor; single source for reading and writing draft text. */
  private editorText(
    overlay: Extract<
      Overlay,
      { kind: "create-issue" } | { kind: "create-project" } | { kind: "edit-issue" }
    >,
  ): string {
    if (overlay.kind === "create-issue" || overlay.kind === "edit-issue") {
      return overlay.editor === "title" ? overlay.draft.title : overlay.draft.description;
    }
    if (overlay.editor === "name") return overlay.draft.name;
    if (overlay.editor === "description") return overlay.draft.description;
    return overlay.draft.content;
  }

  private setEditorText(
    overlay: Extract<
      Overlay,
      { kind: "create-issue" } | { kind: "create-project" } | { kind: "edit-issue" }
    >,
    text: string,
    cursor: number,
  ): void {
    if (overlay.kind === "create-issue") {
      const draft =
        overlay.editor === "title"
          ? { ...overlay.draft, title: text }
          : { ...overlay.draft, description: text };
      this.state = openOverlay(this.state, { ...overlay, draft, cursor });
      return;
    }
    if (overlay.kind === "edit-issue") {
      const draft =
        overlay.editor === "title"
          ? { ...overlay.draft, title: text }
          : { ...overlay.draft, description: text };
      this.state = openOverlay(this.state, { ...overlay, draft, cursor });
      return;
    }
    const draft =
      overlay.editor === "name"
        ? { ...overlay.draft, name: text }
        : overlay.editor === "description"
          ? { ...overlay.draft, description: text }
          : { ...overlay.draft, content: text };
    this.state = openOverlay(this.state, { ...overlay, draft, cursor });
  }

  private handleCreateEditorKey(
    key: KeyEvent,
    overlay: Extract<
      Overlay,
      { kind: "create-issue" } | { kind: "create-project" } | { kind: "edit-issue" }
    >,
  ): void {
    const multiline =
      overlay.kind === "create-project"
        ? overlay.editor === "content"
        : overlay.editor === "description";
    const text = this.editorText(overlay);
    const cursor = overlay.cursor;

    if (isEditorConfirm(key)) {
      this.state = openOverlay(this.state, { ...overlay, editor: "fields" });
      this.render();
      return;
    }
    if (key.name === "left") {
      this.state = openOverlay(this.state, {
        ...overlay,
        cursor: moveCursorHorizontal(text, cursor, -1),
      });
      this.render();
      return;
    }
    if (key.name === "right") {
      this.state = openOverlay(this.state, {
        ...overlay,
        cursor: moveCursorHorizontal(text, cursor, 1),
      });
      this.render();
      return;
    }
    if (key.name === "up" || key.name === "down") {
      const delta = key.name === "up" ? -1 : 1;
      this.state = openOverlay(this.state, {
        ...overlay,
        cursor: multiline
          ? moveCursorVertical(text, cursor, delta)
          : moveCursorHorizontal(text, cursor, delta),
      });
      this.render();
      return;
    }
    if (key.name === "home" || (key.ctrl && key.name === "a")) {
      this.state = openOverlay(this.state, { ...overlay, cursor: lineStart(text, cursor) });
      this.render();
      return;
    }
    if (key.name === "end" || (key.ctrl && key.name === "e")) {
      this.state = openOverlay(this.state, { ...overlay, cursor: lineEnd(text, cursor) });
      this.render();
      return;
    }
    if (key.name === "backspace") {
      const next = deleteBackward(text, cursor);
      this.setEditorText(overlay, next.text, next.cursor);
      this.render();
      return;
    }
    if (key.name === "delete") {
      const next = deleteForward(text, cursor);
      this.setEditorText(overlay, next.text, next.cursor);
      this.render();
      return;
    }
    if (key.ctrl && key.name === "u") {
      const start = lineStart(text, cursor);
      this.setEditorText(overlay, `${text.slice(0, start)}${text.slice(cursor)}`, start);
      this.render();
      return;
    }
    if (key.name === "return" || key.name === "enter" || key.name === "linefeed") {
      if (!multiline) {
        this.state = moveOverlay(openOverlay(this.state, { ...overlay, editor: "fields" }), 1);
        this.render();
        return;
      }
      const next = insertText(text, cursor, "\n");
      this.setEditorText(overlay, next.text, next.cursor);
      this.render();
      return;
    }
    const typed = printableKeyText(key);
    if (typed !== null) {
      const next = insertText(text, cursor, typed);
      this.setEditorText(overlay, next.text, next.cursor);
      this.render();
    }
  }

  private handleOverlayKey(key: KeyEvent): void {
    const overlay = this.state.overlay;
    if (overlay === null) return;

    if (
      (overlay.kind === "create-issue" && overlay.editor !== "fields") ||
      (overlay.kind === "create-project" && overlay.editor !== "fields") ||
      (overlay.kind === "edit-issue" && overlay.editor !== "fields")
    ) {
      this.handleCreateEditorKey(key, overlay);
      return;
    }

    if (this.state.overlaySearch.active) {
      if (key.name === "escape") {
        this.state = cancelOverlaySearch(this.state);
        this.render();
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        this.state = commitOverlaySearch(this.state);
        void this.confirmOverlay();
        return;
      }
      if (key.name === "up" || key.name === "down") {
        this.state = moveOverlay(this.state, key.name === "up" ? -1 : 1);
        this.render();
        return;
      }
      if (key.name === "backspace") {
        this.state = setOverlayQuery(this.state, this.state.overlaySearch.query.slice(0, -1));
        this.render();
        return;
      }
      if (key.ctrl && key.name === "u") {
        this.state = setOverlayQuery(this.state, "");
        this.render();
        return;
      }
      if (
        (key.name === "space" || key.sequence === " ") &&
        !key.ctrl &&
        !key.meta &&
        (overlay.kind === "labels" || overlay.kind === "create-labels")
      ) {
        this.state = toggleSelectedLabel(this.state);
        this.render();
        return;
      }
      const typed = printableKeyText(key);
      if (typed !== null) {
        this.state = setOverlayQuery(this.state, `${this.state.overlaySearch.query}${typed}`);
        this.render();
      }
      return;
    }

    if (isSearchTrigger(key) && overlaySupportsSearch(overlay)) {
      this.state = startOverlaySearch(this.state);
      this.render();
      return;
    }

    if (isCreateSubmit(key)) {
      if (overlay.kind === "edit-issue") {
        void this.submitEditIssue(overlay.draft);
        return;
      }
      if (overlay.kind === "create-issue") {
        void this.submitCreateIssue(overlay.draft);
        return;
      }
      if (overlay.kind === "create-project") {
        void this.submitCreateProject(overlay.draft);
        return;
      }
    }

    if (key.name === "q") {
      if (overlay.kind === "team-context" && this.state.activeTeamId === null) {
        this.quit();
        return;
      }
      if (
        overlay.kind === "create-issue" ||
        overlay.kind === "create-project" ||
        overlay.kind === "edit-issue"
      ) {
        this.setMessage("Press Esc to discard this draft", COLORS.dim);
        return;
      }
      this.state = closeOverlay(this.state);
    } else if (key.name === "escape") {
      if (overlay.kind === "team-context" && this.state.activeTeamId === null) {
        this.setMessage("Choose a team to continue", COLORS.error);
        return;
      }
      if (overlay.kind === "create-choice") {
        if (overlay.target === "issue") {
          this.state = openOverlay(this.state, {
            kind: "create-issue",
            cursor: 0,
            draft: overlay.draft,
            focusedField: overlay.field,
            editor: "fields",
          });
        } else {
          this.state = openOverlay(this.state, {
            kind: "create-project",
            cursor: 0,
            draft: overlay.draft,
            focusedField: overlay.field,
            editor: "fields",
          });
        }
      } else if (overlay.kind === "create-labels") {
        this.state = openOverlay(this.state, {
          kind: "create-issue",
          draft: overlay.draft,
          focusedField: "labels",
          editor: "fields",
          cursor: 0,
        });
      } else {
        this.state = closeOverlay(this.state);
      }
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
        ["cycles", "3 Cycle"],
        ["projects", "4 Projects"],
      ] satisfies [TopNav, string][]
    )
      .map(([id, label]) => (id === active ? `[${label}]` : label))
      .join("  ");
    const team = activeTeam(this.state);
    const teamLabel = team === undefined ? "Team: Choose" : `Team: ${team.key}`;
    this.header.content = `${mock}linearctl  ${this.options.workspace.urlKey}  ${teamLabel}  ${nav}`;
    let selectedLine: number | null = null;
    if (this.state.screen.kind === "issue-browser") {
      const visible = visibleIssues(this.state);
      this.listBox.title = ` ${scopeTitle(this.state.screen.scope, this.state)} ${visible.length}/${this.state.issues.length}${this.state.issuesHasMore ? "+" : ""} `;
      const rows = issueListRows(this.state, width);
      this.list.content = styledListContent(rows);
      const index = rows.findIndex((row) => row.selected);
      selectedLine = index < 0 ? null : index;
      this.detail.content = issueDetailText(selectedIssue(this.state));
    } else {
      const visible = visibleProjects(this.state);
      const total = scopedProjects(this.state).length;
      this.listBox.title = ` Projects ${visible.length}/${total}${this.state.projectsHasMore ? "+" : ""} `;
      const rows = selectableTextRows(catalogListText(this.state, width));
      this.list.content = styledListContent(rows);
      const index = rows.findIndex((row) => row.selected);
      selectedLine = index < 0 ? null : index;
      this.detail.content = catalogDetailText(selectedCatalogItem(this.state));
    }
    this.list.scrollY = listScrollOffset(this.list.scrollY, this.list.height, selectedLine);
    this.detailBox.title = " Detail ";
    const commentsIssue =
      this.commentsView === null || this.state.screen.kind !== "issue-browser"
        ? undefined
        : selectedIssue(this.state);
    if (this.commentsView !== null && this.commentsView.issueId !== commentsIssue?.id) {
      // Selection moved on; drop the panel and its footer message together.
      this.commentsView = null;
      this.message = "";
      this.messageColor = COLORS.dim;
    }
    if (this.commentsView !== null && commentsIssue !== undefined && this.state.overlay === null) {
      this.detailBox.title = " Comments ";
      this.detail.content = commentsText(commentsIssue, this.commentsView.page);
    }
    if (this.state.overlay !== null) {
      this.detailBox.title = ` ${overlayTitle(this.state.overlay)} `;
      this.detail.content = overlayText(this.state, this.state.overlay);
    }
    const detailIdentity =
      this.state.overlay !== null
        ? `overlay:${this.state.overlay.kind}`
        : this.commentsView !== null
          ? `comments:${this.commentsView.issueId}`
          : this.state.screen.kind === "issue-browser"
            ? `issue:${selectedIssue(this.state)?.id ?? ""}`
            : `catalog:${selectedCatalogItem(this.state)?.id ?? ""}`;
    if (detailIdentity !== this.detailKey) {
      this.detailKey = detailIdentity;
      this.detailScroll.scrollTo(0);
    }
    this.helpBox.visible = this.mode === "help";
    this.helpSearch.content = `Search commands: ${this.helpQuery}█\nType to filter · Up/Down to scroll · Esc or ? to close`;
    this.helpContent.content = helpText(HELP_ENTRIES, this.helpQuery);
    const controls = this.controlsText();
    const filterCount = Object.keys(this.state.filters).length;
    const statusColor =
      this.mode === "search" || this.mode === "help" ? COLORS.accent : this.messageColor;
    // The controls line stays a fixed hint color so status colors only affect the status line.
    this.footer.content = new StyledText([
      fg(COLORS.hint)(`${this.options.mode === "mock" ? "MOCK  " : ""}${controls}\n`),
      fg(statusColor)(
        `Filters: ${filterCount} · Group: ${
          this.state.groupBy === "none" ? "None" : DIMENSION_LABELS[this.state.groupBy]
        }${this.state.includeDone ? " · Done: shown" : ""} · ${this.message}`,
      ),
    ]);
    this.renderer.requestRender();
  }

  private controlsText(): string {
    if (this.mode === "help") return "Help search is active";
    if (this.mode === "search")
      return `Search: ${this.state.query}█  Enter apply · Esc cancel · Ctrl+U clear`;
    if (this.state.overlaySearch.active) {
      const toggleHint =
        this.state.overlay?.kind === "labels" || this.state.overlay?.kind === "create-labels"
          ? "Space toggle · "
          : "";
      return `Filter: ${this.state.overlaySearch.query}█  Up/Down move · ${toggleHint}Enter confirm · Esc clear filter`;
    }
    if (this.state.overlay?.kind === "labels")
      return "Up/Down select · Space toggle · / filter · Enter save · Esc cancel";
    if (
      this.state.overlay?.kind === "create-issue" ||
      this.state.overlay?.kind === "create-project"
    )
      return "j/k fields · Enter edit/open · Cmd/Ctrl+Enter or Ctrl+S create · Esc cancel";
    if (this.state.overlay?.kind === "edit-issue")
      return "j/k fields · Enter edit/save · Cmd/Ctrl+Enter or Ctrl+S save · Esc cancel";
    if (
      this.state.overlay?.kind === "create-choice" ||
      this.state.overlay?.kind === "create-labels"
    )
      return "Up/Down select · / filter · Enter confirm · Esc back";
    if (this.state.overlay?.kind === "team-context" && this.state.activeTeamId === null)
      return "Up/Down select · Enter confirm · q quit";
    if (this.state.overlay !== null)
      return "Up/Down select · / filter · Enter confirm · Esc cancel";
    if (this.state.screen.kind === "catalog") return CATALOG_CONTROLS;
    return ISSUE_BROWSER_CONTROLS;
  }

  private async toggleComments(): Promise<void> {
    if (this.state.screen.kind !== "issue-browser") {
      this.setMessage("Open an issue view before reading comments", COLORS.error);
      return this.render();
    }
    const issue = selectedIssue(this.state);
    if (issue === undefined) {
      this.setMessage("Select an issue to read its comments", COLORS.error);
      return this.render();
    }
    if (this.commentsView?.issueId === issue.id) {
      this.commentsView = null;
      return this.render();
    }
    try {
      const page = await this.options.client.getIssueComments(issue.id);
      // A slow response must not clobber the comments of the issue selected since.
      if (selectedIssue(this.state)?.id !== issue.id) return;
      this.commentsView = { issueId: issue.id, page };
      this.setMessage(
        page.comments.length === 0
          ? "No comments on this issue"
          : `Loaded ${page.comments.length} comments (v to close)`,
        COLORS.dim,
      );
    } catch (error) {
      this.setMessage(this.errorMessage(error), COLORS.error);
    }
    this.render();
  }

  private async openIssueInBrowser(): Promise<void> {
    try {
      const opened = await openSelectedItemUrl(
        this.state,
        this.options.workspace.urlKey,
        this.options.openUrl ?? openUrlInBrowser,
      );
      this.setMessage(
        opened ? "URL opened in browser" : "Select an item before opening its URL",
        opened ? COLORS.success : COLORS.error,
      );
    } catch (error) {
      this.setMessage(`Could not open URL: ${this.errorMessage(error)}`, COLORS.error);
    }
  }

  private copyIssueUrl(): void {
    const url = selectedItemUrl(this.state, this.options.workspace.urlKey);
    if (url === null) {
      this.setMessage("Select an item before copying its URL", COLORS.error);
      return;
    }
    if (!this.renderer.copyToClipboardOSC52(url)) {
      this.setMessage("The terminal does not support clipboard copy", COLORS.error);
      return;
    }
    this.setMessage("URL copied", COLORS.success);
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
    // Without mouse reporting terminals translate the wheel into arrow keys, so
    // scrolling the detail panel moved the list selection instead.
    useMouse: true,
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
