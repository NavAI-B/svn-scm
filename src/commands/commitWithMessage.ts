import * as path from "path";
import { window, l10n } from "vscode";
import { Status } from "../common/types";
import { inputCommitMessage } from "../messages";
import { Repository } from "../repository";
import { Resource } from "../resource";
import { Command } from "./command";

export class CommitWithMessage extends Command {
  constructor() {
    super("svn.commitWithMessage", { repository: true });
  }

  public async execute(repository: Repository) {
    const resourceStates = repository.stagedChanges.resourceStates;

    if (resourceStates.length === 0) {
      window.showInformationMessage(
        l10n.t("No staged changes to commit. Please stage files first.")
      );
      return;
    }

    const filePaths = resourceStates.map(state => {
      return state.resourceUri.fsPath;
    });

    const message = await inputCommitMessage(
      repository.inputBox.value,
      false,
      filePaths
    );
    if (message === undefined) {
      return;
    }

    // If files is renamed, the commit need previous file
    resourceStates.forEach(state => {
      if (state instanceof Resource) {
        if (state.type === Status.ADDED && state.renameResourceUri) {
          filePaths.push(state.renameResourceUri.fsPath);
        }

        let dir = path.dirname(state.resourceUri.fsPath);
        let parent = repository.getResourceFromFile(dir);

        while (parent) {
          if (parent.type === Status.ADDED) {
            filePaths.push(dir);
          }
          dir = path.dirname(dir);
          parent = repository.getResourceFromFile(dir);
        }
      }
    });

    try {
      const result = await repository.commitFiles(message, filePaths);
      window.showInformationMessage(result);
      repository.inputBox.value = "";

      // Remove committed files from staged
      for (const state of resourceStates) {
        repository.stagedUris.delete(state.resourceUri.fsPath);
      }
      repository.saveStagedUris();
    } catch (error: unknown) {
      console.error(error);
      window.showErrorMessage((error as any).stderrFormated);
    }
  }
}
