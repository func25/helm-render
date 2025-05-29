"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const template = __importStar(require("./template"));
const YAML = __importStar(require("yaml"));
const os = __importStar(require("os"));
// delete everything except .git
function cleanRepository(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (file !== ".git") {
            fs.rmSync(path.join(dir, file), { recursive: true, force: true });
        }
    }
}
// checkout orphan branch
async function checkoutOrphanBranch(token, dir, branch) {
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
    }
    else {
        await exec.exec(`git checkout --orphan ${branch}`, [], { cwd: dir });
    }
}
async function checkBranchExist(dir, branch) {
    try {
        await exec.exec(`git show-ref --quiet origin/${branch}`, [], { cwd: dir });
        return true;
    }
    catch (error) {
        return false;
    }
}
async function push(dir, branch) {
    const GITHUB_SHA = process.env.GITHUB_SHA?.slice(0, 8);
    const GITHUB_ACTOR = process.env.GITHUB_ACTOR;
    await exec.exec(`git add .`, [], { cwd: dir });
    await exec.exec(`git status`, [], { cwd: dir });
    await exec.exec(`git commit -m "${GITHUB_ACTOR} syncs ${GITHUB_SHA}"`, [], { cwd: dir });
    await exec.exec(`git push --set-upstream origin ${branch}`, [], { cwd: dir });
}
async function run(configPath, branch, token, helmExtraOpts = "") {
    const config = YAML.parse(fs.readFileSync(configPath, "utf8"));
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
    }
    else {
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
    }
    catch (error) {
        core.setFailed(error.message);
    }
}
main();
//# sourceMappingURL=index.js.map