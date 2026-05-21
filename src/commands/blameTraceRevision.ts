import { Command } from "./command";
import { BlameProvider } from "../blameProvider";

export class BlameTraceRevision extends Command {
  private _blameProvider: BlameProvider;

  constructor(blameProvider: BlameProvider) {
    super("svn.blame.traceRevision");

    this._blameProvider = blameProvider;
  }

  public async execute(args?: { revision: string }): Promise<void> {
    if (!args || !args.revision) {
      // Fallback: get revision from current line
      await this._blameProvider.traceRevision();
      return;
    }

    await this._blameProvider.traceRevision();
  }
}
