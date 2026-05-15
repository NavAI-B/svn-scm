import { SourceControlResourceState, Uri } from "vscode";
import { Resource } from "../resource";
import { Command } from "./command";

export class OpenChangePrev extends Command {
  constructor() {
    super("svn.openChangePrev", {});
  }

  public async execute(
    arg?: Resource | Uri | { uri: Uri; type: string },
    ...resourceStates: SourceControlResourceState[]
  ) {
    return this.openChange(arg, "PREV", resourceStates);
  }
}
