import { Command } from "./command";
import { BlameProvider } from "../blameProvider";

export class BlameClear extends Command {
  private _blameProvider: BlameProvider;

  constructor(blameProvider: BlameProvider) {
    super("svn.blame.clear");

    this._blameProvider = blameProvider;
  }

  public async execute(): Promise<void> {
    this._blameProvider.clearBlame();
  }
}
