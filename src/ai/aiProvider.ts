"use strict";

import {
  CancellationToken,
  LanguageModelChat,
  LanguageModelChatMessage,
  LanguageModelChatResponse,
  Progress,
  lm,
  l10n,
  env
} from "vscode";
import { configuration } from "../helpers/configuration";

const DEFAULT_PROMPT =
  "Generate a concise and clear commit message for the following SVN diff. " +
  "Use the conventional commit format if appropriate (e.g., feat:, fix:, refactor:, etc.). " +
  "Write the commit message in the language matching the locale code: {language}. " +
  "Output ONLY the plain text commit message. Do NOT use markdown formatting, code blocks, or any wrapping:\n\n{diff}";

export class AIProvider {
  /**
   * Generate a commit message using VS Code Language Model API
   */
  public async generateCommitMessage(
    diff: string,
    progress: Progress<{ message?: string }>,
    token: CancellationToken
  ): Promise<string> {
    const models = await this.selectModel();
    if (models.length === 0) {
      throw new Error(
        l10n.t(
          "No language model available. Please install GitHub Copilot or another LM extension."
        )
      );
    }

    const model = models[0];
    progress.report({
      message: l10n.t("Generating commit message with {0}...", model.name)
    });

    const promptTemplate =
      configuration.get<string>("ai.prompt") || DEFAULT_PROMPT;
    const language = env.language;
    const prompt = promptTemplate
      .replace("{language}", language)
      .replace("{diff}", diff);

    const messages = [LanguageModelChatMessage.User(prompt)];

    const response: LanguageModelChatResponse = await model.sendRequest(
      messages,
      {},
      token
    );

    let result = "";
    for await (const chunk of response.text) {
      result += chunk;
    }

    return this.cleanResponse(result);
  }

  /**
   * Clean AI response: remove markdown code blocks and extra formatting
   */
  private cleanResponse(text: string): string {
    let cleaned = text.trim();
    // Remove markdown code block wrapping (```text ... ``` or ``` ... ```)
    cleaned = cleaned.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "");
    return cleaned.trim();
  }

  /**
   * Select language model based on user configuration
   */
  private async selectModel(): Promise<LanguageModelChat[]> {
    const modelConfig = configuration.get<string>("ai.model");

    if (modelConfig) {
      const [vendor, family] = modelConfig.split("/");
      const selector: Record<string, string> = {};
      if (vendor) {
        selector.vendor = vendor;
      }
      if (family) {
        selector.family = family;
      }
      const models = await lm.selectChatModels(selector);
      if (models.length > 0) {
        return models;
      }
      // Fallback: configured model not found, try all
    }

    return lm.selectChatModels();
  }
}
