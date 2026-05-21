import { Command } from "./command";
import { BlameProvider } from "../blameProvider";

export class BlameTracePreviousRevision extends Command {
  private _blameProvider: BlameProvider;

  constructor(blameProvider: BlameProvider) {
    super("svn.blame.tracePreviousRevision");

    this._blameProvider = blameProvider;
  }

  public async execute(): Promise<void> {
    await this._blameProvider.tracePreviousRevision();
  }
}
