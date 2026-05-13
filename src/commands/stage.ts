"use strict";

import { SourceControlResourceState } from "vscode";
import { Command } from "./command";
import { Repository } from "../repository";
import { Resource } from "../resource";

export class Stage extends Command {
  constructor() {
    super("svn.stage", { repository: true });
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
        repository.stagedUris.add(state.resourceUri.fsPath);
      }
    }

    repository.saveStagedUris();
    await repository.updateModelState();
  }
}
