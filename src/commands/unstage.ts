"use strict";

import { SourceControlResourceState } from "vscode";
import { Command } from "./command";
import { Repository } from "../repository";
import { Resource } from "../resource";

export class Unstage extends Command {
  constructor() {
    super("svn.unstage", { repository: true });
  }

  public async execute(
    repository: Repository,
    ...resourceStates: SourceControlResourceState[]
  ) {
    if (resourceStates.length === 0) {
      return;
    }

    for (const state of resourceStates) {
      if (state instanceof Resource) {
        repository.stagedUris.delete(state.resourceUri.fsPath);
      }
    }

    repository.saveStagedUris();
    await repository.updateModelState();
  }
}
