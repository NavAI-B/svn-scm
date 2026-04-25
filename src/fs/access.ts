import { promises as fsp } from "original-fs";

export async function access(
  path: string,
  mode: number | undefined
): Promise<boolean> {
  try {
    await fsp.access(path, mode);
    return true;
  } catch {
    return false;
  }
}
