"use strict";

import { window, l10n } from "vscode";
import { Command } from "./command";
import { Repository } from "../repository";
import { AIProvider } from "../ai/aiProvider";
import { collectDiff } from "../ai/diffCollector";

export class GenerateCommitMessage extends Command {
  constructor() {
    super("svn.generateCommitMessage", { repository: true });
  }

  public async execute(repository: Repository) {
    const diff = await collectDiff(repository);

    if (!diff || diff.trim().length === 0) {
      window.showInformationMessage(
        l10n.t("No changes to generate commit message from.")
      );
      return;
    }

    try {
      const ai = new AIProvider();
      const message = await window.withProgress(
        {
          location: { viewId: "workbench.scm" },
          title: l10n.t("Generating commit message...")
        },
        async (progress, token) => {
          return ai.generateCommitMessage(diff, progress, token);
        }
      );

      if (message) {
        repository.inputBox.value = message;
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("cancelled")) {
        return;
      }
      window.showErrorMessage(
        l10n.t("Failed to generate commit message: {0}", String(error))
      );
    }
  }
}
