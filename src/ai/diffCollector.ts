"use strict";

import { Repository } from "../repository";
import { Resource } from "../resource";
import { Status } from "../common/types";

const MAX_DIFF_LENGTH = 50000;

/**
 * Collect diff content from the staged changes in the repository
 */
export async function collectDiff(repository: Repository): Promise<string> {
  const staged = repository.stagedChanges.resourceStates as Resource[];

  if (staged.length === 0) {
    return "";
  }

  const filePaths = staged
    .filter(r => r.type !== Status.UNVERSIONED && r.type !== Status.IGNORED)
    .map(r => r.resourceUri.fsPath);

  if (filePaths.length === 0) {
    return "";
  }

  const diff = await repository.patch(filePaths);

  if (diff.length > MAX_DIFF_LENGTH) {
    return diff.substring(0, MAX_DIFF_LENGTH) + "\n... (truncated)";
  }

  return diff;
}
