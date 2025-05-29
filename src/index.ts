import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as fs from "fs";
import * as path from "path";
import * as template from "./template";
import * as YAML from "yaml";
import * as os from "os";

// delete everything except .git
function cleanRepository(dir: string) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    if (file !== ".git") {
      fs.rmSync(path.join(dir, file), { recursive: true, force: true });
    }
  }
}

// checkout orphan branch
async function checkoutOrphanBranch(token: string, dir: string, branch: string) {
  const actor = process.env.GITHUB_ACTOR;
  const repo = process.env.GITHUB_REPOSITORY;

  core.debug(`len token: ${token?.length}`);

  const remote_repo = `https://${actor}:${token}@github.com/${repo}.git`;

  //use dir path
  await exec.exec(`git init`, [], { cwd: dir });
  await exec.exec(`git remote add origin ${remote_repo}`, [], { cwd: dir });
  await exec.exec(`git fetch origin`, [], { cwd: dir });

  await exec.exec(`git config --global user.name "${actor}"`, [], { cwd: dir });
  await exec.exec(`git config --global user.email "${actor}@users.noreply.github.com"`, [], { cwd: dir });

  if (await checkBranchExist(dir, branch)) {
    await exec.exec(`git checkout --track origin/${branch}`, [], { cwd: dir });
  } else {
    await exec.exec(`git checkout --orphan ${branch}`, [], { cwd: dir });
  }
}

async function checkBranchExist(dir: string, branch: string): Promise<boolean> {
  try {
    await exec.exec(`git show-ref --quiet origin/${branch}`, [], { cwd: dir });
    return true;
  } catch (error) {
    return false;
  }
}

async function push(dir: string, branch: string) {
  const GITHUB_SHA = process.env.GITHUB_SHA?.slice(0, 8);
  const GITHUB_ACTOR = process.env.GITHUB_ACTOR;

  await exec.exec(`git add .`, [], { cwd: dir });
  await exec.exec(`git status`, [], { cwd: dir });
  await exec.exec(`git commit -m "${GITHUB_ACTOR} syncs ${GITHUB_SHA}"`, [], { cwd: dir });
  await exec.exec(`git push --set-upstream origin ${branch}`, [], { cwd: dir });
}

async function run(configPath: string, branch?: string, token?: string, helmExtraOpts: string = "") {
  const config = YAML.parse(fs.readFileSync(configPath, "utf8")) as template.Config;
  
  if (branch && token) {
    // Sync mode: create temp directory, render, and push to branch
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sync_"));
    
    core.debug(`Running in ${dir}`);
    core.debug(`Check out ${branch}`);
    await checkoutOrphanBranch(token, dir, branch);
    core.debug(`Clean repository`);
    cleanRepository(dir);
    core.debug(`Template run`);
    await template.run(config, dir, helmExtraOpts);
    core.debug(`Push to ${branch}`);
    await push(dir, branch);
  } else {
    // Local mode: render to current directory
    const outputDir = "./rendered-manifests";
    core.info(`Rendering Helm charts to ${outputDir}`);
    await template.run(config, outputDir, helmExtraOpts);
    core.info(`Helm charts rendered successfully to ${outputDir}`);
  }
}

async function main() {
  try {
    const configPath = core.getInput("configPath", { required: true });
    const branch = core.getInput("branch") || undefined;
    const githubToken = core.getInput("token") || undefined;
    const helmExtraOpts = core.getInput("helmExtraOpts") || "";
    
    // Validate inputs
    if (branch && !githubToken) {
      throw new Error("GitHub token is required when branch is specified");
    }
    
    await run(configPath, branch, githubToken, helmExtraOpts);
  } catch (error: any) {
    core.setFailed(error.message);
  }
}

main();
