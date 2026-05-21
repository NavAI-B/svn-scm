import { Uri, window } from "vscode";
import { Command } from "./command";
import { BlameProvider } from "../blameProvider";

export class Blame extends Command {
  private _blameProvider: BlameProvider;

  constructor(blameProvider: BlameProvider) {
    super("svn.blame");

    this._blameProvider = blameProvider;
  }

  public async execute(...args: any[]): Promise<void> {
    if (args.length > 0 && args[0] instanceof Uri) {
      await this._blameProvider.showBlame(args[0]);
    } else {
      const editor = window.activeTextEditor;
      if (!editor) {
        return;
      }

      await this._blameProvider.showBlame(editor.document.uri);
    }
  }
}
