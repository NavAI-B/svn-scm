"use strict";

import {
  CancellationToken,
  LanguageModelChat,
  LanguageModelChatMessage,
  LanguageModelChatResponse,
  Progress,
  lm,
  l10n,
  env,
  window
} from "vscode";
import { configuration } from "../helpers/configuration";

const outputChannel = window.createOutputChannel("SVN AI Commit", {
  log: true
});

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
   * Select model and collect diff in parallel, then stream response to inputBox
   */
  public async prepareAndGenerate(
    diffPromise: Promise<string>,
    progress: Progress<{ message?: string }>,
    token: CancellationToken,
    onChunk?: (text: string) => void
  ): Promise<string> {
    const totalStart = Date.now();
    outputChannel.info("[AI Commit] Start");

    const parallelStart = Date.now();
    const [diff, models] = await Promise.all([diffPromise, this.selectModel()]);
    outputChannel.info(
      `[AI Commit] Diff + Model selection: ${Date.now() - parallelStart}ms (diff: ${diff.length} chars, model: ${models[0]?.name ?? "none"})`
    );

    if (!diff || diff.trim().length === 0) {
      throw new Error(
        l10n.t("No staged changes to generate commit message from.")
      );
    }

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

    const requestStart = Date.now();
    const response: LanguageModelChatResponse = await model.sendRequest(
      messages,
      {},
      token
    );
    outputChannel.info(
      `[AI Commit] sendRequest connected: ${Date.now() - requestStart}ms`
    );

    let result = "";
    let chunkCount = 0;
    const streamStart = Date.now();
    for await (const chunk of response.text) {
      result += chunk;
      chunkCount++;
      if (onChunk) {
        onChunk(this.cleanResponse(result));
      }
    }
    outputChannel.info(
      `[AI Commit] Stream complete: ${Date.now() - streamStart}ms (${chunkCount} chunks, ${result.length} chars)`
    );
    outputChannel.info(`[AI Commit] Total: ${Date.now() - totalStart}ms`);

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
    const allModels = await lm.selectChatModels();

    if (modelConfig) {
      const matched = allModels.filter(m => m.id === modelConfig);
      if (matched.length > 0) {
        return matched;
      }
    }

    return allModels;
  }
}
