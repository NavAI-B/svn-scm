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
    try {
      const ai = new AIProvider();
      const diffPromise = collectDiff(repository);

      const message = await window.withProgress(
        {
          location: { viewId: "workbench.scm" },
          title: l10n.t("Generating commit message...")
        },
        async (progress, token) => {
          return ai.prepareAndGenerate(diffPromise, progress, token, text => {
            repository.inputBox.value = text;
          });
        }
      );

      if (message) {
        repository.inputBox.value = message;
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("cancelled")) {
        return;
      }
      if (
        error instanceof Error &&
        error.message.includes("No staged changes")
      ) {
        window.showInformationMessage(
          l10n.t(
            "No staged changes to generate commit message from. Please stage files first."
          )
        );
        return;
      }
      window.showErrorMessage(
        l10n.t("Failed to generate commit message: {0}", String(error))
      );
    }
  }
}
