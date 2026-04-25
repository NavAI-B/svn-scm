import * as assert from "assert";
import { commands, Uri } from "vscode";
import { SourceControlManager } from "../source_control_manager";
import { Repository } from "../repository";
import * as testUtil from "./testUtil";

suite("Repository Tests", () => {
  let repoUri: Uri;
  let checkoutDir: Uri;
  let sourceControlManager: SourceControlManager;

  suiteSetup(async () => {
    await testUtil.activeExtension();

    repoUri = await testUtil.createRepoServer();
    await testUtil.createStandardLayout(testUtil.getSvnUrl(repoUri));
    checkoutDir = await testUtil.createRepoCheckout(
      testUtil.getSvnUrl(repoUri) + "/trunk"
    );

    sourceControlManager = (await commands.executeCommand(
      "svn.getSourceControlManager",
      checkoutDir
    )) as SourceControlManager;
  });

  suiteTeardown(() => {
    sourceControlManager.openRepositories.forEach(repository =>
      repository.dispose()
    );
    testUtil.destroyAllTempPaths();
  });

  test("Empty Open Repository", async function () {
    assert.equal(sourceControlManager.repositories.length, 0);
  });

  test("Try Open Repository", async function () {
    await sourceControlManager.tryOpenRepository(checkoutDir.fsPath);
    assert.equal(sourceControlManager.repositories.length, 1);
  });

  test("Try Open Repository Again", async () => {
    await sourceControlManager.tryOpenRepository(checkoutDir.fsPath);
    assert.equal(sourceControlManager.repositories.length, 1);
  });

  test("Try get repository from Uri", () => {
    const repository = sourceControlManager.getRepository(checkoutDir);
    assert.ok(repository);
  });

  test("Try get repository from string", () => {
    const repository = sourceControlManager.getRepository(checkoutDir.fsPath);
    assert.ok(repository);
  });

  test("Try get repository from repository", () => {
    const repository = sourceControlManager.getRepository(checkoutDir.fsPath);
    const repository2 = sourceControlManager.getRepository(repository);
    assert.ok(repository2);
    assert.equal(repository, repository2);
  });

  test("Try get current branch name", async () => {
    const repository: Repository | null = sourceControlManager.getRepository(
      checkoutDir.fsPath
    );
    if (!repository) {
      return;
    }

    const name = await repository.getCurrentBranch();
    assert.equal(name, "trunk");
  });
});
