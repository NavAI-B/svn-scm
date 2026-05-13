"use strict";

import { env } from "vscode";

type TranslationKey =
  | "stagedChanges"
  | "changes"
  | "conflicts"
  | "unversioned"
  | "changelist"
  | "remoteChanges";

const translations: Record<string, Record<TranslationKey, string>> = {
  "zh-cn": {
    stagedChanges: "等待提交",
    changes: "变更",
    conflicts: "冲突",
    unversioned: "未版本控制",
    changelist: '变更列表 "{0}"',
    remoteChanges: "远程变更"
  },
  "zh-tw": {
    stagedChanges: "等待提交",
    changes: "變更",
    conflicts: "衝突",
    unversioned: "未版本控制",
    changelist: '變更列表 "{0}"',
    remoteChanges: "遠端變更"
  },
  ja: {
    stagedChanges: "コミット待ち",
    changes: "変更",
    conflicts: "競合",
    unversioned: "バージョン管理外",
    changelist: 'チェンジリスト "{0}"',
    remoteChanges: "リモートの変更"
  },
  ko: {
    stagedChanges: "커밋 대기",
    changes: "변경 사항",
    conflicts: "충돌",
    unversioned: "버전 관리 안됨",
    changelist: '체인지리스트 "{0}"',
    remoteChanges: "원격 변경"
  }
};

const defaults: Record<TranslationKey, string> = {
  stagedChanges: "Wait for commit",
  changes: "Changes",
  conflicts: "Conflicts",
  unversioned: "Unversioned",
  changelist: 'Changelist "{0}"',
  remoteChanges: "Remote Changes"
};

function getLocale(): string {
  return env.language;
}

function getTranslations(): Record<TranslationKey, string> {
  const locale = getLocale();
  // Exact match first
  if (translations[locale]) {
    return translations[locale];
  }
  // Prefix match (e.g., "zh" matches "zh-cn")
  const prefix = locale.split("-")[0];
  for (const key of Object.keys(translations)) {
    if (key === prefix || key.startsWith(prefix + "-")) {
      return translations[key];
    }
  }
  return defaults;
}

export function t(key: TranslationKey, ...args: string[]): string {
  const translations = getTranslations();
  let result = translations[key];
  for (let i = 0; i < args.length; i++) {
    result = result.replace(`{${i}}`, args[i]);
  }
  return result;
}
