import {
  CancellationToken,
  commands,
  Disposable,
  env,
  Event,
  EventEmitter,
  l10n,
  ProviderResult,
  ThemeIcon,
  Timeline,
  TimelineChangeEvent,
  TimelineItem,
  TimelineOptions,
  Uri,
  window,
  workspace
} from "vscode";
import { ISvnLogEntry } from "./common/types";
import { SourceControlManager } from "./source_control_manager";
import { tempSvnFs } from "./temp_svn_fs";
import { dispose } from "./util";
import { getCommitToolTip, getLimit } from "./historyView/common";

class SvnTimelineItem extends TimelineItem {
  constructor(
    public readonly revision: string,
    public readonly previousRevision: string,
    message: string,
    timestamp: number,
    id: string,
    contextValue: string
  ) {
    super(message, timestamp);
    this.id = id;
    this.contextValue = contextValue;
  }
}

export class SvnTimelineProvider implements Disposable {
  readonly id = "svn-history";
  readonly label = l10n.t("SVN History");

  private _onDidChange: EventEmitter<TimelineChangeEvent | undefined> =
    new EventEmitter<TimelineChangeEvent | undefined>();
  readonly onDidChange: Event<TimelineChangeEvent | undefined> =
    this._onDidChange.event;

  private _disposables: Disposable[] = [];
  private _providerDisposable: Disposable | undefined;

  constructor(private sourceControlManager: SourceControlManager) {
    this._disposables.push(
      commands.registerCommand(
        "svn.timeline.openDiff",
        async (item: SvnTimelineItem, uri: Uri) => {
          const repo = this.sourceControlManager.getRepository(uri);
          if (!repo) {
            return;
          }
          try {
            const svnTarget = await this.getSvnTarget(uri);
            if (!svnTarget) {
              return;
            }
            const uri1 = await this.downloadFile(
              repo,
              svnTarget,
              item.previousRevision
            );
            const uri2 = await this.downloadFile(
              repo,
              svnTarget,
              item.revision
            );
            const title = `${this.getFileName(uri)} (${item.previousRevision} : ${item.revision})`;
            await commands.executeCommand("vscode.diff", uri1, uri2, title, {
              preview: true
            });
          } catch (e) {
            window.showErrorMessage(
              `Failed to open diff: ${(e as Error).message}`
            );
          }
        }
      ),
      commands.registerCommand(
        "svn.timeline.openFileRemote",
        async (item: SvnTimelineItem, uri: Uri) => {
          const repo = this.sourceControlManager.getRepository(uri);
          if (!repo) {
            return;
          }
          try {
            const svnTarget = await this.getSvnTarget(uri);
            if (!svnTarget) {
              return;
            }
            const content = await repo.show(svnTarget, item.revision);
            const localUri = await tempSvnFs.createTempSvnRevisionFile(
              svnTarget,
              item.revision,
              content
            );
            await commands.executeCommand("vscode.open", localUri, {
              preview: true
            });
          } catch (e) {
            window.showErrorMessage(
              `Failed to open file: ${(e as Error).message}`
            );
          }
        }
      ),
      commands.registerCommand(
        "svn.timeline.copyRevision",
        async (item: SvnTimelineItem) => {
          const clipboard = (env as any).clipboard;
          if (clipboard) {
            await clipboard.writeText(item.revision);
          }
        }
      ),
      commands.registerCommand(
        "svn.timeline.copyMessage",
        async (_item: SvnTimelineItem, _uri: Uri, logEntry: ISvnLogEntry) => {
          const clipboard = (env as any).clipboard;
          if (clipboard) {
            await clipboard.writeText(logEntry.msg || "");
          }
        }
      )
    );

    this.ensureProviderRegistration();
  }

  private ensureProviderRegistration() {
    if (this._providerDisposable === undefined) {
      this._providerDisposable = workspace.registerTimelineProvider(
        ["file"],
        this
      );
      this._disposables.push(this._providerDisposable);
    }
  }

  public dispose() {
    dispose(this._disposables);
  }

  private getFileName(uri: Uri): string {
    const parts = uri.path.split("/");
    return parts[parts.length - 1] || uri.path;
  }

  private async getSvnTarget(uri: Uri): Promise<Uri | undefined> {
    const repo = this.sourceControlManager.getRepository(uri);
    if (!repo) {
      return undefined;
    }
    try {
      const info = await repo.getInfo(uri.fsPath);
      return Uri.parse(info.url);
    } catch {
      return undefined;
    }
  }

  private async downloadFile(
    repo: any,
    svnTarget: Uri,
    revision: string
  ): Promise<Uri> {
    if (revision === "BASE") {
      return svnTarget;
    }
    const content = await repo.show(svnTarget, revision);
    return tempSvnFs.createTempSvnRevisionFile(svnTarget, revision, content);
  }

  provideTimeline(
    uri: Uri,
    options: TimelineOptions,
    token: CancellationToken
  ): ProviderResult<Timeline> {
    return this.provideSvnTimeline(uri, options, token);
  }

  private async provideSvnTimeline(
    uri: Uri,
    options: TimelineOptions,
    token: CancellationToken
  ): Promise<Timeline> {
    if (uri.scheme !== "file") {
      return { items: [] };
    }

    const repo = this.sourceControlManager.getRepository(uri);
    if (!repo) {
      return { items: [] };
    }

    let svnTarget: Uri;
    try {
      const info = await repo.getInfo(uri.fsPath);
      svnTarget = Uri.parse(info.url);
    } catch {
      return { items: [] };
    }

    if (token.isCancellationRequested) {
      return { items: [] };
    }

    const limit =
      typeof options.limit === "number" ? options.limit : getLimit();

    // Parse cursor for pagination (cursor is the starting revision)
    let rfrom = options.cursor || "HEAD";
    const rto = "1";

    let entries: ISvnLogEntry[];
    try {
      entries = await repo.log(rfrom, rto, limit + 1, svnTarget);
    } catch {
      return { items: [] };
    }

    if (token.isCancellationRequested) {
      return { items: [] };
    }

    // Determine if there are more entries
    const hasMore = entries.length > limit;
    if (hasMore) {
      entries = entries.slice(0, limit);
    }

    const items: TimelineItem[] = [];

    for (let i = 0; i < entries.length; i++) {
      if (token.isCancellationRequested) {
        break;
      }

      const entry = entries[i];
      const previousRevision =
        i < entries.length - 1
          ? entries[i + 1].revision
          : (parseInt(entry.revision, 10) - 1).toString();

      const date = entry.date ? new Date(entry.date) : new Date();
      const label = entry.msg
        ? entry.msg.split(/\r?\n/, 1)[0]
        : `<r${entry.revision}>`;

      const item = new SvnTimelineItem(
        entry.revision,
        previousRevision,
        label,
        date.getTime(),
        entry.revision,
        "svn:file:commit"
      );

      // Icon
      item.iconPath = new ThemeIcon("git-commit");

      // Description: revision and relative time
      const relativeDate = this.getRelativeDate(date);
      item.description = `r${entry.revision}, ${relativeDate}`;

      // Tooltip
      item.tooltip = getCommitToolTip(entry);

      // Command: open diff
      item.command = {
        title: l10n.t("Open Diff"),
        command: "svn.timeline.openDiff",
        arguments: [item, uri]
      };

      items.push(item);
    }

    // Paging cursor: use the last entry's revision - 1 as the next cursor
    let cursor: string | undefined;
    if (hasMore && entries.length > 0) {
      const lastRevision = parseInt(entries[entries.length - 1].revision, 10);
      if (lastRevision > 1) {
        cursor = (lastRevision - 1).toString();
      }
    }

    return {
      items,
      paging: { cursor }
    };
  }

  private getRelativeDate(date: Date): string {
    const now = Date.now();
    const diffMs = now - date.getTime();

    if (diffMs < 0) {
      return l10n.t("just now");
    }

    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) {
      return l10n.t("{0} seconds ago", seconds);
    }

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return minutes === 1
        ? l10n.t("1 minute ago")
        : l10n.t("{0} minutes ago", minutes);
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return hours === 1
        ? l10n.t("1 hour ago")
        : l10n.t("{0} hours ago", hours);
    }

    const days = Math.floor(hours / 24);
    if (days < 30) {
      return days === 1 ? l10n.t("1 day ago") : l10n.t("{0} days ago", days);
    }

    const months = Math.floor(days / 30);
    if (months < 12) {
      return months === 1
        ? l10n.t("1 month ago")
        : l10n.t("{0} months ago", months);
    }

    const years = Math.floor(days / 365);
    return years === 1 ? l10n.t("1 year ago") : l10n.t("{0} years ago", years);
  }
}
