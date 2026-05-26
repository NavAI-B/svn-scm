import { posix as path } from "path";
import {
  commands,
  DecorationOptions,
  Disposable,
  l10n,
  MarkdownString,
  Range,
  TextEditor,
  TextEditorDecorationType,
  Uri,
  window,
  ThemeColor
} from "vscode";
import { ISvnBlameInfo, SvnUriAction } from "./common/types";
import { SourceControlManager } from "./source_control_manager";
import { toSvnUri, fromSvnUri } from "./uri";
import SvnError from "./svnError";

/**
 * Color palette for blame line coloring.
 * Low saturation, pastel-like colors for readability.
 */
const BLAME_COLORS = [
  "rgba(66, 133, 244, 0.08)", // Blue
  "rgba(52, 168, 83, 0.08)", // Green
  "rgba(251, 188, 4, 0.08)", // Yellow
  "rgba(234, 67, 53, 0.08)", // Red
  "rgba(171, 71, 188, 0.08)", // Purple
  "rgba(0, 172, 193, 0.08)", // Cyan
  "rgba(255, 112, 67, 0.08)", // Orange
  "rgba(126, 87, 194, 0.08)", // Deep Purple
  "rgba(38, 166, 154, 0.08)", // Teal
  "rgba(239, 108, 0, 0.08)", // Amber
  "rgba(92, 107, 192, 0.08)", // Indigo
  "rgba(255, 167, 38, 0.08)", // Orange Light
  "rgba(129, 199, 132, 0.08)", // Green Light
  "rgba(239, 154, 154, 0.08)", // Red Light
  "rgba(144, 202, 249, 0.08)", // Blue Light
  "rgba(206, 147, 216, 0.08)" // Purple Light
];

interface BlameSession {
  documentUri: Uri; // The svn:// URI of the blame document, used to re-find the editor
  blameData: ISvnBlameInfo[];
  decorationTypes: Map<string, TextEditorDecorationType>;
  fileUri: Uri;
  revision?: string;
  ready: boolean; // Whether decorations have been applied
}

export class BlameProvider implements Disposable {
  private _disposables: Disposable[] = [];
  private _sessions: Map<string, BlameSession> = new Map(); // key: document URI string
  private _restoring: Set<string> = new Set(); // URIs currently being restored
  private _sourceControlManager: SourceControlManager;
  private _applying = false; // Guard against re-entrant applyDecorations

  constructor(sourceControlManager: SourceControlManager) {
    this._sourceControlManager = sourceControlManager;

    this._disposables.push(
      window.onDidChangeActiveTextEditor(() => this.onEditorChanged()),
      window.onDidChangeVisibleTextEditors(() =>
        this.onVisibleEditorsChanged()
      ),
      window.onDidChangeTextEditorSelection(e => {
        const session = this.getSessionForEditor(e.textEditor);
        if (session) {
          this.updateStatusBar(e.textEditor, session);
        }
      })
    );
  }

  private getSessionForEditor(editor: TextEditor): BlameSession | undefined {
    return this._sessions.get(editor.document.uri.toString());
  }

  private updateStatusBar(editor: TextEditor, session: BlameSession): void {
    const line = editor.selection.active.line;
    const blameInfo = session.blameData[line];
    if (blameInfo && blameInfo.revision) {
      commands.executeCommand(
        "setContext",
        "svnBlameCurrentRevision",
        blameInfo.revision
      );
    } else {
      commands.executeCommand("setContext", "svnBlameCurrentRevision", "");
    }
  }

  /**
   * Toggle blame annotations for the active editor
   */
  public async toggleBlame(): Promise<void> {
    const editor = window.activeTextEditor;
    if (!editor) {
      return;
    }

    const session = this.getSessionForEditor(editor);
    if (session) {
      this.clearSession(session.documentUri.toString());
      return;
    }

    await this.showBlame(editor.document.uri);
  }

  /**
   * Show blame for a specific file URI, optionally at a specific revision
   * @param fileUri The original file:// URI of the file to blame
   * @param blameRevision The revision range for blame (e.g. "1:123"), or undefined for HEAD
   */
  public async showBlame(fileUri: Uri, blameRevision?: string): Promise<void> {
    const repository = this._sourceControlManager.getRepository(fileUri);
    if (!repository) {
      window.showWarningMessage(
        l10n.t("No SVN repository found for this file.")
      );
      return;
    }

    // Clear existing session for this specific document if any
    // (will be replaced after opening the new tab)

    // Open in a new tab using svn:// URI with modified path (like OpenHeadFile)
    let editor: TextEditor | undefined;
    const basename = path.basename(fileUri.path);
    const basedir = path.dirname(fileUri.path);

    // Determine the revision label for the tab title
    // and the single revision for svn cat (file content display)
    let revisionLabel: string;
    let catRevision: string | undefined;
    if (blameRevision) {
      // blameRevision is like "1:123", extract the end revision
      const endRev = blameRevision.includes(":")
        ? blameRevision.split(":")[1]
        : blameRevision;
      revisionLabel = `Blame r${endRev}`;
      catRevision = endRev; // svn cat needs a single revision, not a range
    } else {
      revisionLabel = "Blame HEAD";
      catRevision = undefined;
    }

    // Use single revision for svn cat (file content), range is only for svn blame
    const svnUri = toSvnUri(
      fileUri,
      SvnUriAction.SHOW,
      catRevision ? { ref: catRevision } : {}
    );
    const uri = svnUri.with({
      path: path.join(basedir, `${basename} (${revisionLabel})`)
    });
    // Clean up existing session for the same URI (e.g. re-tracing same revision)
    const existingUriStr = uri.toString();
    const oldSession = this._sessions.get(existingUriStr);
    if (oldSession) {
      for (const [, decorationType] of oldSession.decorationTypes) {
        decorationType.dispose();
      }
      oldSession.decorationTypes.clear();
    }

    // Pre-register a placeholder session to prevent tryRestoreBlameSession from duplicating
    const session: BlameSession = {
      documentUri: uri,
      blameData: [],
      decorationTypes: new Map(),
      fileUri,
      revision: blameRevision,
      ready: false
    };
    this._sessions.set(existingUriStr, session);

    await commands.executeCommand<void>("vscode.open", uri, { preview: true });
    editor = window.activeTextEditor;

    if (!editor) {
      this._sessions.delete(uri.toString());
      return;
    }

    try {
      // Use the full range for blame, single revision for file content
      const blameData = await repository.blame(fileUri, blameRevision);

      commands.executeCommand("setContext", "svnBlameActive", true);

      session.blameData = blameData;

      this.applyDecorations(editor, blameData, session);
    } catch (err) {
      let msg: string;
      if (err instanceof SvnError) {
        msg = err.stderrFormated || err.stderr || err.message;
      } else {
        msg = err instanceof Error ? err.message : String(err);
      }
      window.showErrorMessage(`SVN blame failed: ${msg}`);
    }
  }

  /**
   * Trace (blame) at a specific revision from the current blame view
   */
  public async traceRevision(): Promise<void> {
    const editor = window.activeTextEditor;
    if (!editor) {
      return;
    }

    const session = this.getSessionForEditor(editor);
    if (!session) {
      return;
    }

    const line = editor.selection.active.line;
    const blameInfo = session.blameData[line];

    if (!blameInfo || !blameInfo.revision) {
      window.showInformationMessage(l10n.t("No revision info for this line."));
      return;
    }

    const revision = blameInfo.revision;

    if (revision === "1" || revision === "0") {
      window.showInformationMessage(
        l10n.t("Already at the earliest revision.")
      );
      return;
    }

    // Blame the file up to this revision (full file content at that revision)
    await this.showBlame(session.fileUri, `1:${revision}`);
  }

  /**
   * Trace from the previous revision of the selected line
   * e.g. line is r123 → blame up to r122 (see what the file looked like before r123 changed it)
   */
  public async tracePreviousRevision(): Promise<void> {
    const editor = window.activeTextEditor;
    if (!editor) {
      return;
    }

    const session = this.getSessionForEditor(editor);
    if (!session) {
      return;
    }

    const line = editor.selection.active.line;
    const blameInfo = session.blameData[line];

    if (!blameInfo || !blameInfo.revision) {
      window.showInformationMessage(l10n.t("No revision info for this line."));
      return;
    }

    const revision = parseInt(blameInfo.revision, 10);

    if (isNaN(revision) || revision <= 1) {
      window.showInformationMessage(
        l10n.t("Already at the earliest revision.")
      );
      return;
    }

    // Blame up to revision-1 (the state before this revision's changes)
    await this.showBlame(session.fileUri, `1:${revision - 1}`);
  }

  /**
   * Apply blame decorations to the editor
   */
  private applyDecorations(
    editor: TextEditor,
    blameData: ISvnBlameInfo[],
    session: BlameSession
  ): void {
    if (!blameData.length || this._applying) {
      return;
    }

    this._applying = true;
    try {
      // If decoration types already exist, reuse them (just re-set decorations)
      // This avoids flickering when switching tabs
      if (session.decorationTypes.size > 0) {
        this.reapplyDecorations(editor, blameData, session);
        return;
      }

      // First time: create decoration types
      // Calculate max widths for alignment
      let maxRevLen = 0;
      let maxAuthorLen = 0;
      for (const info of blameData) {
        const revText = info.revision ? `r${info.revision}` : "-";
        if (revText.length > maxRevLen) {
          maxRevLen = revText.length;
        }
        if (info.author && info.author.length > maxAuthorLen) {
          maxAuthorLen = info.author.length;
        }
      }

      // Use at least 4ch for revision column, or wider if needed
      const revColWidth = Math.max(4, maxRevLen);

      // --- Decoration 1: Revision column (fixed width) ---
      const revDecoType = window.createTextEditorDecorationType({
        before: {
          width: `${revColWidth}ch`,
          contentText: "",
          color: new ThemeColor("editorLineNumber.foreground"),
          backgroundColor: new ThemeColor("editorLineNumber.background"),
          margin: "0 4px 0 0"
        }
      });
      session.decorationTypes.set("__rev__", revDecoType);

      const revDecorations: DecorationOptions[] = blameData.map((info, i) => ({
        range: new Range(i, 0, i, 0),
        hoverMessage: this.createHoverMessage(info.revision, info.author),
        renderOptions: {
          before: {
            contentText: info.revision ? `r${info.revision}` : "-"
          }
        }
      }));
      editor.setDecorations(revDecoType, revDecorations);

      // --- Decoration 2: Author column (fixed width) ---
      const authorDecoType = window.createTextEditorDecorationType({
        before: {
          width: `${maxAuthorLen + 1}ch`, // " author" (1ch gap from rev column)
          contentText: "",
          color: new ThemeColor("editorLineNumber.foreground"),
          margin: "0 0 0 0"
        }
      });
      session.decorationTypes.set("__author__", authorDecoType);

      const authorDecorations: DecorationOptions[] = blameData.map(
        (info, i) => ({
          range: new Range(i, 0, i, 0),
          renderOptions: {
            before: {
              contentText: info.author ? `${info.author}` : ""
            }
          }
        })
      );
      editor.setDecorations(authorDecoType, authorDecorations);

      // --- Decoration 3: Separator column (fixed width) ---
      const sepDecoType = window.createTextEditorDecorationType({
        before: {
          width: "1ch", // "│"
          contentText: "",
          color: new ThemeColor("editorLineNumber.foreground"),
          margin: "0 4px 0 0"
        }
      });
      session.decorationTypes.set("__sep__", sepDecoType);

      const sepDecorations: DecorationOptions[] = blameData.map((_, i) => ({
        range: new Range(i, 0, i, 0),
        renderOptions: {
          before: {
            contentText: "\u2502"
          }
        }
      }));
      editor.setDecorations(sepDecoType, sepDecorations);

      // --- Decoration 4: Line color by revision group ---
      const revisionColorMap = new Map<string, number>();
      let colorIndex = 0;
      for (const info of blameData) {
        const key = info.revision ?? "unknown";
        if (!revisionColorMap.has(key)) {
          revisionColorMap.set(key, colorIndex % BLAME_COLORS.length);
          colorIndex++;
        }
      }

      const revisionLines = new Map<string, { lines: number[] }>();
      for (let i = 0; i < blameData.length; i++) {
        const key = blameData[i].revision ?? "unknown";
        if (!revisionLines.has(key)) {
          revisionLines.set(key, { lines: [] });
        }
        revisionLines.get(key)!.lines.push(i);
      }

      for (const [revision, data] of revisionLines) {
        const colorIdx = revisionColorMap.get(revision) ?? 0;
        const color = BLAME_COLORS[colorIdx];

        const colorDecoType = window.createTextEditorDecorationType({
          isWholeLine: true,
          backgroundColor: color
        });
        session.decorationTypes.set(`__color_${revision}__`, colorDecoType);

        const colorDecorations: DecorationOptions[] = data.lines.map(line => ({
          range: new Range(line, 0, line, 0)
        }));
        editor.setDecorations(colorDecoType, colorDecorations);
      }

      session.ready = true;
    } finally {
      this._applying = false;
    }
  }

  /**
   * Re-apply decorations using existing decoration types (no dispose/create cycle)
   * Called when VSCode loses decorations after tab switch
   */
  private reapplyDecorations(
    editor: TextEditor,
    blameData: ISvnBlameInfo[],
    session: BlameSession
  ): void {
    // Re-apply revision decorations
    const revDecoType = session.decorationTypes.get("__rev__");
    if (revDecoType) {
      const revDecorations: DecorationOptions[] = blameData.map((info, i) => ({
        range: new Range(i, 0, i, 0),
        hoverMessage: this.createHoverMessage(info.revision, info.author),
        renderOptions: {
          before: {
            contentText: info.revision ? `r${info.revision}` : "-"
          }
        }
      }));
      editor.setDecorations(revDecoType, revDecorations);
    }

    // Re-apply author decorations
    const authorDecoType = session.decorationTypes.get("__author__");
    if (authorDecoType) {
      const authorDecorations: DecorationOptions[] = blameData.map(
        (info, i) => ({
          range: new Range(i, 0, i, 0),
          renderOptions: {
            before: {
              contentText: info.author ? `${info.author}` : ""
            }
          }
        })
      );
      editor.setDecorations(authorDecoType, authorDecorations);
    }

    // Re-apply separator decorations
    const sepDecoType = session.decorationTypes.get("__sep__");
    if (sepDecoType) {
      const sepDecorations: DecorationOptions[] = blameData.map((_, i) => ({
        range: new Range(i, 0, i, 0),
        renderOptions: {
          before: {
            contentText: "\u2502"
          }
        }
      }));
      editor.setDecorations(sepDecoType, sepDecorations);
    }

    // Re-apply color decorations
    const revisionLines = new Map<string, number[]>();
    for (let i = 0; i < blameData.length; i++) {
      const key = blameData[i].revision ?? "unknown";
      if (!revisionLines.has(key)) {
        revisionLines.set(key, []);
      }
      revisionLines.get(key)!.push(i);
    }

    for (const [revision, lines] of revisionLines) {
      const colorDecoType = session.decorationTypes.get(
        `__color_${revision}__`
      );
      if (colorDecoType) {
        const colorDecorations: DecorationOptions[] = lines.map(line => ({
          range: new Range(line, 0, line, 0)
        }));
        editor.setDecorations(colorDecoType, colorDecorations);
      }
    }
  }

  /**
   * Create a hover message with command links
   */
  private createHoverMessage(
    revision: string | undefined,
    author: string | undefined
  ): MarkdownString {
    const md = new MarkdownString(undefined, true);
    md.isTrusted = true;

    if (!revision) {
      md.appendMarkdown(`$(info) ${l10n.t("No blame info available")}`);
      return md;
    }

    md.appendMarkdown(`**${l10n.t("Revision")}:** r${revision}`);
    if (author) {
      md.appendMarkdown(`  \n**${l10n.t("Author")}:** ${author}`);
    }

    md.appendMarkdown(`\n\n---\n\n`);

    const traceArgs = encodeURIComponent(JSON.stringify({ revision }));
    md.appendMarkdown(
      `[$(git-commit) ${l10n.t("Trace previous revision")}](command:svn.blame.traceRevision?${traceArgs})`
    );

    md.appendMarkdown(`  \n`);

    const prevRev = parseInt(revision, 10);
    if (!isNaN(prevRev) && prevRev > 1) {
      const prevArgs = encodeURIComponent(JSON.stringify({ revision }));
      md.appendMarkdown(
        `[$(arrow-left) ${l10n.t("Trace from previous revision")}](command:svn.blame.tracePreviousRevision?${prevArgs})`
      );
    }

    return md;
  }

  /**
   * Clear a specific blame session by document URI
   */
  private clearSession(docUriStr: string): void {
    const session = this._sessions.get(docUriStr);
    if (session) {
      for (const [, decorationType] of session.decorationTypes) {
        decorationType.dispose();
      }
      session.decorationTypes.clear();
      this._sessions.delete(docUriStr);
    }

    this.updateBlameContext();
  }

  /**
   * Clear all blame decorations
   */
  public clearBlame(): void {
    for (const [, session] of this._sessions) {
      for (const [, decorationType] of session.decorationTypes) {
        decorationType.dispose();
      }
      session.decorationTypes.clear();
    }
    this._sessions.clear();

    this.updateBlameContext();
  }

  private updateBlameContext(): void {
    const active = this._sessions.size > 0;
    commands.executeCommand("setContext", "svnBlameActive", active);
    if (!active) {
      commands.executeCommand("setContext", "svnBlameCurrentRevision", "");
    }
  }

  private onEditorChanged(): void {
    const editor = window.activeTextEditor;
    if (!editor) {
      return;
    }

    const session = this.getSessionForEditor(editor);
    if (session) {
      // Always re-apply when switching back (VSCode may have lost decorations)
      this.applyDecorations(editor, session.blameData, session);
    } else {
      this.tryRestoreBlameSession(editor);
    }
  }

  private onVisibleEditorsChanged(): void {
    if (this._applying) {
      return;
    }

    for (const editor of window.visibleTextEditors) {
      const session = this.getSessionForEditor(editor);
      if (session) {
        // Always re-apply when becoming visible (VSCode may have lost decorations)
        this.applyDecorations(editor, session.blameData, session);
      } else {
        this.tryRestoreBlameSession(editor);
      }
    }
  }

  /**
   * Try to restore a blame session for an un-restored blame tab
   */
  private async tryRestoreBlameSession(editor: TextEditor): Promise<void> {
    const uri = editor.document.uri;
    if (uri.scheme !== "svn" || !uri.path.includes("(Blame")) {
      return;
    }

    const uriStr = uri.toString();
    // Skip if already has a session or is currently being restored
    if (this._sessions.has(uriStr) || this._restoring.has(uriStr)) {
      return;
    }

    this._restoring.add(uriStr);
    try {
      // Wait for SVN to be ready before attempting restore
      await this._sourceControlManager.isInitialized;

      // Double-check after await
      if (this._sessions.has(uriStr)) {
        return;
      }

      const params = fromSvnUri(uri);
      if (params.action !== SvnUriAction.SHOW) {
        return;
      }

      const fileUri = Uri.file(params.fsPath);
      const repository = this._sourceControlManager.getRepository(fileUri);
      if (!repository) {
        return;
      }

      const catRevision = params.extra?.ref;
      let blameRevision: string | undefined;
      if (catRevision) {
        blameRevision = `1:${catRevision}`;
      }

      const blameData = await repository.blame(fileUri, blameRevision);

      // Triple-check after await
      if (this._sessions.has(uriStr)) {
        return;
      }

      const session: BlameSession = {
        documentUri: uri,
        blameData,
        decorationTypes: new Map(),
        fileUri,
        revision: blameRevision,
        ready: false
      };
      this._sessions.set(uriStr, session);

      this.applyDecorations(editor, blameData, session);
      commands.executeCommand("setContext", "svnBlameActive", true);
    } catch {
      // Silently skip tabs that can't be restored
    } finally {
      this._restoring.delete(uriStr);
    }
  }

  public get isBlameActive(): boolean {
    return this._sessions.size > 0;
  }

  public get activeSession(): BlameSession | undefined {
    const editor = window.activeTextEditor;
    if (!editor) {
      return undefined;
    }
    return this.getSessionForEditor(editor);
  }

  public dispose(): void {
    this.clearBlame();
    this._disposables.forEach(d => d.dispose());
    this._disposables = [];
  }
}
