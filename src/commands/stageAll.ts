"use strict";

import { Command } from "./command";
import { Repository } from "../repository";

export class StageAll extends Command {
  constructor() {
    super("svn.stageAll", { repository: true });
  }

  public async execute(repository: Repository) {
    const changes = repository.changes.resourceStates;

    for (const resource of changes) {
      repository.stagedUris.add(resource.resourceUri.fsPath);
    }

    repository.saveStagedUris();
    await repository.updateModelState();
  }
}
