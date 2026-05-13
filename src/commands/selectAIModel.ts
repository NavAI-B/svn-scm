"use strict";

import { window, l10n, lm, QuickPickItem } from "vscode";
import { Command } from "./command";
import { configuration } from "../helpers/configuration";

interface ModelQuickPickItem extends QuickPickItem {
  vendor: string;
  family: string;
}

export class SelectAIModel extends Command {
  constructor() {
    super("svn.selectAIModel");
  }

  public async execute() {
    const models = await lm.selectChatModels();

    if (models.length === 0) {
      window.showWarningMessage(
        l10n.t(
          "No language models available. Please install GitHub Copilot or another LM extension."
        )
      );
      return;
    }

    const currentModel = configuration.get<string>("ai.model");

    const items: ModelQuickPickItem[] = [
      {
        label: l10n.t("Auto Select"),
        description: l10n.t("Use first available model"),
        vendor: "",
        family: "",
        picked: !currentModel
      },
      ...models.map(model => ({
        label: model.name,
        description: `${model.vendor}/${model.family}`,
        detail: model.id,
        vendor: model.vendor,
        family: model.family,
        picked:
          currentModel === `${model.vendor}/${model.family}`
      }))
    ];

    const selected = await window.showQuickPick<ModelQuickPickItem>(items, {
      placeHolder: l10n.t("Select a language model for AI commit message generation")
    });

    if (!selected) {
      return;
    }

    const value =
      selected.vendor && selected.family
        ? `${selected.vendor}/${selected.family}`
        : undefined;

    await configuration.update("ai.model", value ?? null);
  }
}
