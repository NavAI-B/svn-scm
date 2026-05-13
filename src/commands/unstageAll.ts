"use strict";

import { Command } from "./command";
import { Repository } from "../repository";

export class UnstageAll extends Command {
  constructor() {
    super("svn.unstageAll", { repository: true });
  }

  public async execute(repository: Repository) {
    repository.stagedUris.clear();
    repository.saveStagedUris();
    await repository.updateModelState();
  }
}
