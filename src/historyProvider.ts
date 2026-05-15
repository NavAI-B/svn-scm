/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  CancellationToken,
  Disposable,
  Event,
  EventEmitter,
  MarkdownString,
  SourceControlHistoryItem,
  SourceControlHistoryItemChange,
  SourceControlHistoryItemRef,
  SourceControlHistoryItemRefsChangeEvent,
  SourceControlHistoryOptions,
  ThemeIcon,
  Uri
} from "vscode";
import { ISvnPath } from "./common/types";
import { parseDiffXml } from "./parser/diffParser";
import { Repository as BaseRepository } from "./svnRepository";

export class SvnHistoryProvider implements Disposable {
  /**
   * Extract revision number from a ref id (e.g., "refs/svn/r129670" -> "129670")
   * or return the string as-is if it's already a plain revision number.
   */
  private static extractRevision(refOrRev: string): string {
    const match = refOrRev.match(/r(\d+)/);
    return match ? match[1] : refOrRev;
  }

  private _currentHistoryItemRef: SourceControlHistoryItemRef | undefined;
  private _currentHistoryItemBaseRef: SourceControlHistoryItemRef | undefined;

  private readonly _onDidChangeCurrentHistoryItemRefs =
    new EventEmitter<void>();
  readonly onDidChangeCurrentHistoryItemRefs: Event<void> =
    this._onDidChangeCurrentHistoryItemRefs.event;

  private readonly _onDidChangeHistoryItemRefs =
    new EventEmitter<SourceControlHistoryItemRefsChangeEvent>();
  readonly onDidChangeHistoryItemRefs: Event<SourceControlHistoryItemRefsChangeEvent> =
    this._onDidChangeHistoryItemRefs.event;

  private disposables: Disposable[] = [];

  constructor(private repository: BaseRepository) {
    this.updateRefs().catch(() => {});
  }

  dispose() {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }

  get currentHistoryItemRef(): SourceControlHistoryItemRef | undefined {
    return this._currentHistoryItemRef;
  }

  get currentHistoryItemRemoteRef(): SourceControlHistoryItemRef | undefined {
    return undefined;
  }

  get currentHistoryItemBaseRef(): SourceControlHistoryItemRef | undefined {
    return this._currentHistoryItemBaseRef;
  }

  async updateRefs(): Promise<void> {
    try {
      // Use the max revision across all items in the working copy,
      // matching TortoiseSVN's behaviour when a subfolder is opened.
      const localRevision = await this.repository.getMaxRevision();
      const info = await this.repository.getInfo("", undefined, true);
      const branch = info.url
        ? info.url.replace(info.repository.root, "").replace(/^\//, "")
        : "trunk";

      this._currentHistoryItemRef = {
        id: `refs/svn/r${localRevision}`,
        name: `r${localRevision}`,
        description: branch,
        revision: localRevision,
        category: "local",
        icon: new ThemeIcon("target")
      };

      this._currentHistoryItemBaseRef = undefined;
      this._onDidChangeCurrentHistoryItemRefs.fire();
      this._onDidChangeHistoryItemRefs.fire({
        added: [this._currentHistoryItemRef],
        removed: [],
        modified: [],
        silent: false
      });
    } catch {
      // Repository may not be ready yet
    }
  }

  async provideHistoryItemRefs(
    historyItemRefs: string[] | undefined,
    _token: CancellationToken
  ): Promise<SourceControlHistoryItemRef[] | null | undefined> {
    const refs: SourceControlHistoryItemRef[] = [];

    if (this._currentHistoryItemRef) {
      refs.push(this._currentHistoryItemRef);
    }

    if (historyItemRefs) {
      return refs.filter(ref => historyItemRefs.includes(ref.id));
    }

    return refs;
  }

  async provideHistoryItems(
    options: SourceControlHistoryOptions,
    _token: CancellationToken
  ): Promise<SourceControlHistoryItem[] | null | undefined> {
    if (!this._currentHistoryItemRef || !options.historyItemRefs) {
      return [];
    }

    const limit = typeof options.limit === "number" ? options.limit : 50;
    const skip = options.skip ?? 0;

    // SVN log does not support --skip, so we request (skip + limit) entries
    // and return only the last `limit` entries to ensure parentIds continuity.
    // Request one extra entry so the last item on each page can reference
    // a real parent instead of falling back to revision-1 (which may not
    // exist when opening a subfolder with non-contiguous revisions).
    const totalNeeded = skip + limit + 1;

    const entries = await this.repository.log("HEAD", "1", totalNeeded);

    // Take only the entries for the current page (skip the first `skip` entries)
    const pageEntries = entries.slice(skip, skip + limit);

    const items: SourceControlHistoryItem[] = [];

    // When opening a subfolder, svn log returns non-contiguous revisions,
    // so parentIds must point to the actual next (older) entry in the log,
    // not revision-1 (which may not exist, causing VS Code to render
    // extra branch lines / indentation in the SCM Graph).
    // entries[] is ordered newest→oldest (svn log -r HEAD:1).
    for (let i = 0; i < pageEntries.length; i++) {
      const entry = pageEntries[i];
      const globalIndex = skip + i;
      let parentIds: string[] = [];

      if (globalIndex + 1 < entries.length) {
        // Point to the actual next (older) entry in the log
        parentIds = [entries[globalIndex + 1].revision];
      } else if (Number(entry.revision) > 1) {
        // Last loaded entry, fallback to revision-1
        parentIds = [String(Number(entry.revision) - 1)];
      }

      items.push({
        id: entry.revision,
        parentIds,
        subject: entry.msg.split("\n")[0] || `(r${entry.revision})`,
        message: entry.msg || `(r${entry.revision})`,
        displayId: `r${entry.revision}`,
        author: entry.author,
        timestamp: entry.date ? new Date(entry.date).getTime() : undefined,
        references: [
          {
            id: `refs/svn/r${entry.revision}`,
            name: `r${entry.revision}`,
            revision: entry.revision,
            category: "commit",
            icon: new ThemeIcon("git-commit")
          }
        ],
        statistics:
          entry.paths.length > 0
            ? { files: entry.paths.length, insertions: 0, deletions: 0 }
            : undefined
      });
    }

    return items;
  }

  async provideHistoryItemChanges(
    historyItemId: string,
    historyItemParentId: string | undefined,
    _token: CancellationToken
  ): Promise<SourceControlHistoryItemChange[] | null | undefined> {
    const revision = SvnHistoryProvider.extractRevision(historyItemId);
    const parentRevision = historyItemParentId
      ? SvnHistoryProvider.extractRevision(historyItemParentId)
      : String(Number(revision) - 1);

    try {
      // Use svn diff --summarize to get changed files
      const args = [
        "diff",
        "-r",
        `${parentRevision}:${revision}`,
        "--summarize",
        "--xml"
      ];
      const result = await this.repository.exec(args);
      const paths: ISvnPath[] = await parseDiffXml(result.stdout);

      const workspaceRoot = this.repository.workspaceRoot;
      const changes: SourceControlHistoryItemChange[] = [];

      for (const p of paths) {
        // Convert repo-relative path to local path
        const relativePath = p._.startsWith("/") ? p._.substring(1) : p._;
        const localUri = Uri.file(`${workspaceRoot}/${relativePath}`);

        changes.push({
          uri: localUri.with({ query: `ref=${revision}` }),
          originalUri: localUri.with({ query: `ref=${parentRevision}` }),
          modifiedUri: localUri.with({ query: `ref=${revision}` })
        });
      }

      return changes;
    } catch {
      return [];
    }
  }

  async resolveHistoryItem(
    historyItemId: string,
    _token: CancellationToken
  ): Promise<SourceControlHistoryItem | null | undefined> {
    const revision = SvnHistoryProvider.extractRevision(historyItemId);
    try {
      const entries = await this.repository.log(revision, revision, 1);

      if (entries.length === 0) {
        return undefined;
      }

      const entry = entries[0];

      return {
        id: entry.revision,
        parentIds: [],
        subject: entry.msg.split("\n")[0] || `(r${entry.revision})`,
        message: entry.msg || `(r${entry.revision})`,
        displayId: `r${entry.revision}`,
        author: entry.author,
        timestamp: entry.date ? new Date(entry.date).getTime() : undefined,
        references: [
          {
            id: `refs/svn/r${entry.revision}`,
            name: `r${entry.revision}`,
            revision: entry.revision,
            category: "commit",
            icon: new ThemeIcon("git-commit")
          }
        ],
        tooltip: new MarkdownString(
          [
            `**r${entry.revision}** by ${entry.author}`,
            "",
            entry.msg,
            "",
            `*${entry.date ? new Date(entry.date).toLocaleString() : ""}*`
          ].join("\n")
        )
      };
    } catch {
      return undefined;
    }
  }

  async resolveHistoryItemChatContext(
    _historyItemId: string,
    _token: CancellationToken
  ): Promise<string | null | undefined> {
    return "";
  }

  async resolveHistoryItemChangeRangeChatContext(
    _historyItemId: string,
    _historyItemParentId: string,
    _path: string,
    _token: CancellationToken
  ): Promise<string | null | undefined> {
    return "";
  }

  async resolveHistoryItemRefsCommonAncestor(
    _historyItemRefs: string[],
    _token: CancellationToken
  ): Promise<string | null | undefined> {
    // SVN has linear history; no common ancestor needed
    return null;
  }
}
