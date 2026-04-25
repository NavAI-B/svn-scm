"use strict";

import * as cp from "child_process";
import * as path from "path";
import { configuration } from "./configuration";

export interface HookConfig {
  hook: string;
  command: string;
}

/**
 * Get all configured hooks
 */
function getHooks(): HookConfig[] {
  return configuration.get<HookConfig[]>("hooks.commands", []);
}

/**
 * Replace variables in command string for a given file
 * Variables:
 *   $(file)         - Full file path
 *   $(fileName)     - File name with extension
 *   $(fileBaseName) - File name without extension
 *   $(fileExt)      - File extension (with dot)
 *   $(fileDir)      - Directory of the file
 *   $(files)        - All file paths joined by space
 *   $(cwd)          - Working directory
 */
function replaceVariables(
  command: string,
  file: string,
  allFiles: string[],
  cwd: string
): string {
  const parsed = path.parse(file);
  return command
    .replace(/\$\(file\)/g, file)
    .replace(/\$\(fileName\)/g, parsed.base)
    .replace(/\$\(fileBaseName\)/g, parsed.name)
    .replace(/\$\(fileExt\)/g, parsed.ext)
    .replace(/\$\(fileDir\)/g, parsed.dir)
    .replace(/\$\(files\)/g, allFiles.map(f => `"${f}"`).join(" "))
    .replace(/\$\(cwd\)/g, cwd);
}

/**
 * Execute a shell command
 */
function execCommand(command: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    cp.exec(command, { cwd, timeout: 30000 }, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Run hooks for a given SVN command timing (pre/post) and command name.
 * @param timing - "pre" or "post"
 * @param svnCommand - SVN command name (e.g., "add", "remove", "commit")
 * @param files - Array of file paths involved
 * @param cwd - Working directory
 */
export async function runHook(
  timing: "pre" | "post",
  svnCommand: string,
  files: string[],
  cwd: string
): Promise<void> {
  const hookName = `${timing}${svnCommand.charAt(0).toUpperCase()}${svnCommand.slice(1)}`;
  const hooks = getHooks().filter(h => h.hook === hookName);

  for (const hook of hooks) {
    if (!hook.command) {
      continue;
    }

    for (const file of files) {
      const resolvedCommand = replaceVariables(hook.command, file, files, cwd);
      try {
        await execCommand(resolvedCommand, cwd);
      } catch (error) {
        console.error(
          `SVN Hook [${hookName}] failed for file "${file}":`,
          error
        );
        throw error;
      }
    }
  }
}
