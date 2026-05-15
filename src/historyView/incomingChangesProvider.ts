import * as path from "path";
import {
  commands,
  Disposable,
  Event,
  EventEmitter,
  ThemeIcon,
  TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
  Uri,
  window,
  workspace
} from "vscode";
import { SourceControlManager } from "../source_control_manager";
import { Resource } from "../resource";
import { dispose } from "../util";

// --- Tree elements ---

class FolderNode extends TreeItem {
  constructor(
    public readonly relativePath: string,
    label: string
  ) {
    super(label, TreeItemCollapsibleState.Collapsed);
    this.contextValue = "incomingFolder";
    this.iconPath = ThemeIcon.Folder;
  }
}

class IncomingChangeItem extends TreeItem {
  constructor(
    uri: Uri,
    type: string,
    _repo: {
      workspaceRoot: string;
      pullIncomingChange(path: string): Promise<string>;
    },
    showPath: boolean = false
  ) {
    super(path.basename(uri.fsPath), TreeItemCollapsibleState.None);
    if (showPath) {
      this.description = path
        .dirname(uri.fsPath)
        .split(/[/\\]+/)
        .pop();
    }
    this.contextValue = `incomingChange:${type}`;
    this.resourceUri = uri;
    this.command = IncomingChangeItem.createCommand(uri, type);
  }

  private static createCommand(uri: Uri, type: string) {
    switch (type) {
      case "modified":
        return {
          command: "svn.openChangeHead",
          title: "Open Changes with HEAD",
          arguments: [new Resource(uri, type, undefined, "none", true)]
        };
      case "deleted":
        return {
          command: "svn.openFile",
          title: "Open File",
          arguments: [uri]
        };
      case "added":
        return {
          command: "svn.openHEADFile",
          title: "Open File (HEAD)",
          arguments: [new Resource(uri, type, undefined, "none", true)]
        };
      default:
        return undefined;
    }
  }
}

type TreeElement = FolderNode | IncomingChangeItem;

// --- Provider ---

export class IncomingChangesProvider
  implements TreeDataProvider<TreeElement>, Disposable
{
  private _onDidChangeTreeData = new EventEmitter<TreeElement | undefined>();
  readonly onDidChangeTreeData: Event<TreeElement | undefined> =
    this._onDidChangeTreeData.event;

  private disposables: Disposable[] = [];

  constructor(private sourceControlManager: SourceControlManager) {
    this.disposables.push(
      window.registerTreeDataProvider("incomingChanges", this),
      commands.registerCommand("svn.incomingChanges.refresh", () =>
        this.refresh()
      ),
      commands.registerCommand("svn.incomingChanges.toggleView", () =>
        this.toggleViewMode()
      )
    );

    for (const repo of this.sourceControlManager.openRepositories) {
      repo.repository.onDidChangeRemoteChangedFile(
        () => this._onDidChangeTreeData.fire(undefined),
        null,
        this.disposables
      );
    }
  }

  private get isTreeView(): boolean {
    return workspace
      .getConfiguration("svn")
      .get<boolean>("incomingChanges.treeView", true);
  }

  private async toggleViewMode() {
    const current = this.isTreeView;
    await workspace
      .getConfiguration("svn")
      .update("incomingChanges.treeView", !current, true);
    this._onDidChangeTreeData.fire(undefined);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TreeElement): TreeItem {
    return element;
  }

  /** Collect all remote statuses from all open repositories, with normalized paths */
  private getAllStatuses(): { relPath: string; type: string; repo: any }[] {
    const result: { relPath: string; type: string; repo: any }[] = [];
    for (const repo of this.sourceControlManager.openRepositories) {
      const statuses = repo.repository.remoteChangeStatuses;
      if (!statuses) {
        continue;
      }
      for (const s of statuses) {
        if (!s.reposStatus) {
          continue;
        }
        // Normalize path separators to forward slashes for consistent splitting
        const relPath = s.path.replace(/\\/g, "/");
        result.push({
          relPath,
          type: s.reposStatus.item,
          repo: repo.repository
        });
      }
    }
    return result;
  }

  async getChildren(element?: TreeElement): Promise<TreeElement[]> {
    const allStatuses = this.getAllStatuses();
    if (allStatuses.length === 0) {
      return [];
    }

    // Flat list mode
    if (!this.isTreeView) {
      if (element) {
        return [];
      }
      return allStatuses.map(s => {
        const uri = Uri.file(path.join(s.repo.workspaceRoot, s.relPath));
        return new IncomingChangeItem(uri, s.type, s.repo, true);
      });
    }

    // Tree mode: build folder hierarchy
    // element.relativePath is the folder prefix (e.g. "src/commands") or "" for root
    const prefix =
      element instanceof FolderNode ? element.relativePath + "/" : "";

    // Filter statuses under this prefix
    const underPrefix = allStatuses.filter(s => {
      if (prefix === "") {
        return true;
      }
      return s.relPath.startsWith(prefix);
    });

    // Collect immediate children (one level deep)
    const folderNames = new Set<string>();
    const directFiles: { relPath: string; type: string; repo: any }[] = [];

    for (const s of underPrefix) {
      const rel =
        prefix === "" ? s.relPath : s.relPath.substring(prefix.length);
      const slashIndex = rel.indexOf("/");
      if (slashIndex === -1) {
        // Direct file under this folder
        directFiles.push(s);
      } else {
        // Subdirectory — take only the first component
        folderNames.add(rel.substring(0, slashIndex));
      }
    }

    const items: TreeElement[] = [];

    // Add folder nodes (sorted)
    for (const folderName of Array.from(folderNames).sort()) {
      const folderRelPath = prefix === "" ? folderName : prefix + folderName;
      items.push(new FolderNode(folderRelPath, folderName));
    }

    // Add file nodes
    for (const s of directFiles) {
      const uri = Uri.file(path.join(s.repo.workspaceRoot, s.relPath));
      items.push(new IncomingChangeItem(uri, s.type, s.repo));
    }

    return items;
  }

  dispose() {
    dispose(this.disposables);
  }
}
