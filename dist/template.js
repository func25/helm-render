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
exports.run = run;
const exec = __importStar(require("@actions/exec"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const crypto = __importStar(require("crypto"));
function getChartPath(service) {
    const urlHash = crypto.createHash("sha1").update(service.helmChart).digest("hex");
    // local chart
    if (isLocalChart(service) || service.version) {
        return `${urlHash}/${service.helmChart}`;
    }
    return `${urlHash}/${service.helmChart}-${service.version}`;
}
function isLocalChart(service) {
    return service.helmChart.startsWith("./");
}
async function fetchRepositories(config) {
    const repositories = config.services
        .filter((service) => service.helmRepository)
        .map((service) => ({
        name: service.helmRepositoryName,
        url: service.helmRepository,
    }));
    const addRepoPromises = repositories.map((repo) => exec.exec(`helm repo add --force-update ${repo.name} ${repo.url}`));
    await Promise.all(addRepoPromises);
    await exec.exec(`helm repo update`);
}
async function downloadCharts(config, targetDir) {
    for (const service of config.services) {
        // ignore local charts
        if (service.helmChart.startsWith("./")) {
            continue;
        }
        const outputPath = path.join(targetDir, await getChartPath(service));
        fs.mkdirSync(outputPath, { recursive: true });
        const fullChartName = `${service.helmRepositoryName}/${service.helmChart}`;
        let cmd = `helm pull --destination ${outputPath} ${fullChartName}`;
        if (service.version) {
            cmd += ` --version ${service.version}`;
        }
        await exec.exec(cmd);
    }
}
async function run(yamlConfig, outputDir, extraOpts) {
    await fetchRepositories(yamlConfig);
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "charts-"));
    await downloadCharts(yamlConfig, targetDir);
    for (const service of yamlConfig.services) {
        const releaseNamespace = service.namespace || "default";
        const releaseName = service.name;
        const chartDir = path.join(targetDir, getChartPath(service));
        const helmValuesFiles = service.helmValues || "";
        const outputPrefix = service.outputPathPrefix || ".";
        const fullChartName = service.helmChart.startsWith("./") ? service.helmChart : `${service.helmRepositoryName}/${service.helmChart}`;
        let cmd = `helm template --include-crds -n ${releaseNamespace} ${releaseName} ${fullChartName}`;
        if (!isLocalChart(service)) {
            let chartFiles = (await exec.getExecOutput(`find ${chartDir} -type f -name "*.tgz"`)).stdout.replace(/\n/g, " ").trim();
            cmd = `helm template --include-crds -n ${releaseNamespace} ${releaseName} ${chartFiles}`;
        }
        if (service.version) {
            cmd += ` --version ${service.version}`;
        }
        cmd += ` --output-dir ${outputDir}/${outputPrefix}/${releaseNamespace}/${releaseName}`;
        if (helmValuesFiles) {
            cmd += ` -f ${helmValuesFiles}`;
        }
        if (extraOpts) {
            cmd += ` ${extraOpts}`;
        }
        await exec.exec(cmd);
    }
}
// async function main() {
//   try {
//     const serviceConfigFile = core.getInput("serviceConfigFile");
//     const outputDir = core.getInput("outputDir");
//     const extraOpts = core.getInput("extraOpts", { required: false });
//     await run(serviceConfigFile, outputDir, extraOpts);
//   } catch (error: any) {
//     core.setFailed(error.message);
//   }
// }
// // main();
// (async () => {
//   try {
//     await run("./.github/files/minikube.yaml", "./outputs", "");
//   } catch (error) {
//     console.log(error);
//   }
// })();
//# sourceMappingURL=template.js.map