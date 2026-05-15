import { Uri, window } from "vscode";
import { configuration } from "../helpers/configuration";
import { Command } from "./command";

interface IIncomingChangeItem {
  uri: Uri;
  repository: { pullIncomingChange(path: string): Promise<string> };
}

export class PullIncommingChange extends Command {
  constructor() {
    super("svn.treeview.pullIncomingChange");
  }

  public async execute(...changes: any[]) {
    const showUpdateMessage = configuration.get<boolean>(
      "showUpdateMessage",
      true
    );

    // Handle IncomingChangeItem from the new IncomingChangesProvider view
    if (changes[0] && changes[0].uri && changes[0].repository) {
      const item = changes[0] as IIncomingChangeItem;
      try {
        const result = await item.repository.pullIncomingChange(
          item.uri.fsPath
        );

        if (showUpdateMessage) {
          window.showInformationMessage(result);
        }
      } catch (error) {
        console.error(error);
        window.showErrorMessage("Unable to update");
      }

      return;
    }

    // Handle SCM resource states
    const uris = changes.map(change => change.resourceUri);

    await this.runByRepository(uris, async (repository, resources) => {
      if (!repository) {
        return;
      }

      const files = resources.map(resource => resource.fsPath);

      files.forEach(async path => {
        const result = await repository.pullIncomingChange(path);

        if (showUpdateMessage) {
          window.showInformationMessage(result);
        }
      });
    });
  }
}
