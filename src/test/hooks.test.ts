import * as assert from "assert";
import { replaceVariables } from "../helpers/hooks";

suite("Hook Tests - replaceVariables", () => {
  const cwd = "/home/user/project";
  const svnPath = "/usr/bin/svn";
  const allFiles = ["/home/user/project/src/main.ts"];

  test("Replace $(file)", () => {
    const result = replaceVariables(
      "echo $(file)",
      "/home/user/project/src/main.ts",
      allFiles,
      cwd,
      svnPath
    );
    assert.equal(result, "echo /home/user/project/src/main.ts");
  });

  test("Replace $(fileName)", () => {
    const result = replaceVariables(
      "echo $(fileName)",
      "/home/user/project/src/main.ts",
      allFiles,
      cwd,
      svnPath
    );
    assert.equal(result, "echo main.ts");
  });

  test("Replace $(fileBaseName)", () => {
    const result = replaceVariables(
      "echo $(fileBaseName)",
      "/home/user/project/src/main.ts",
      allFiles,
      cwd,
      svnPath
    );
    assert.equal(result, "echo main");
  });

  test("Replace $(fileExt)", () => {
    const result = replaceVariables(
      "echo $(fileExt)",
      "/home/user/project/src/main.ts",
      allFiles,
      cwd,
      svnPath
    );
    assert.equal(result, "echo .ts");
  });

  test("Replace $(fileDir)", () => {
    const result = replaceVariables(
      "echo $(fileDir)",
      "/home/user/project/src/main.ts",
      allFiles,
      cwd,
      svnPath
    );
    assert.equal(result, "echo /home/user/project/src");
  });

  test("Replace $(files) with single file", () => {
    const result = replaceVariables(
      "echo $(files)",
      "/home/user/project/src/main.ts",
      ["/home/user/project/src/main.ts"],
      cwd,
      svnPath
    );
    assert.equal(result, 'echo "/home/user/project/src/main.ts"');
  });

  test("Replace $(files) with multiple files", () => {
    const result = replaceVariables(
      "echo $(files)",
      "/home/user/project/src/main.ts",
      ["/home/user/project/src/main.ts", "/home/user/project/src/util.ts"],
      cwd,
      svnPath
    );
    assert.equal(
      result,
      'echo "/home/user/project/src/main.ts" "/home/user/project/src/util.ts"'
    );
  });

  test("Replace $(cwd)", () => {
    const result = replaceVariables(
      "echo $(cwd)",
      "/home/user/project/src/main.ts",
      allFiles,
      cwd,
      svnPath
    );
    assert.equal(result, "echo /home/user/project");
  });

  test("Replace $(svn)", () => {
    const result = replaceVariables(
      "echo $(svn)",
      "/home/user/project/src/main.ts",
      allFiles,
      cwd,
      svnPath
    );
    assert.equal(result, "echo /usr/bin/svn");
  });

  test("Replace multiple variables in one command", () => {
    const result = replaceVariables(
      "$(svn) commit $(file) --cwd $(cwd)",
      "/home/user/project/src/main.ts",
      allFiles,
      cwd,
      svnPath
    );
    assert.equal(
      result,
      "/usr/bin/svn commit /home/user/project/src/main.ts --cwd /home/user/project"
    );
  });

  test("Keep unknown text unchanged", () => {
    const result = replaceVariables(
      "echo hello world",
      "/home/user/project/src/main.ts",
      allFiles,
      cwd,
      svnPath
    );
    assert.equal(result, "echo hello world");
  });

  test("Handle file without extension", () => {
    const result = replaceVariables(
      "$(fileBaseName) $(fileExt)",
      "/home/user/project/Makefile",
      allFiles,
      cwd,
      svnPath
    );
    assert.equal(result, "Makefile ");
  });

  test("Handle path with spaces", () => {
    const result = replaceVariables(
      "$(file)",
      "/home/user/my project/src/main.ts",
      allFiles,
      cwd,
      svnPath
    );
    assert.equal(result, "/home/user/my project/src/main.ts");
  });

  test("Replace same variable multiple times", () => {
    const result = replaceVariables(
      "$(file) && echo $(file)",
      "/home/user/project/src/main.ts",
      allFiles,
      cwd,
      svnPath
    );
    assert.equal(
      result,
      "/home/user/project/src/main.ts && echo /home/user/project/src/main.ts"
    );
  });
});
