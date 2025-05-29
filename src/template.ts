import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import YAML from "yaml";

// Useful for raw chart url, but not our concern right now
// function getChartInfo(chartUrl: string): {
//   chartName: string;
//   chartVersion: string;
// } {
//   const filename = chartUrl.split("/").pop() || "";
//   const basename = filename.replace(".tgz", "");
//   const chartVersion = basename.split("-").pop() || "";
//   const chartName = basename.replace(`-${chartVersion}`, "");
//   return { chartName, chartVersion };
// }

type Service = {
  name: string; // required
  namespace: string; // required
  outputPathPrefix: string; // required
  helmRepository: string; // required
  helmRepositoryName: string; // required
  helmChart: string; // both helmChart or chart are supported

  version: string;
  helmValues: string[];
};

export type Config = {
  services: Service[];
};

function getChartPath(service: Service): string {
  const urlHash = crypto.createHash("sha1").update(service.helmChart).digest("hex");

  // local chart
  if (isLocalChart(service)) {
    return `${urlHash}/${service.helmChart}`;
  }

  // For remote charts, always use the chart name (version is handled separately in helm pull)
  return `${urlHash}/${service.helmChart}`;
}

function isLocalChart(service: Service): boolean {
  return service.helmChart.startsWith("./");
}

async function fetchRepositories(config: Config): Promise<void> {
  // Deduplicate repositories by name and URL
  const repositoriesMap = new Map<string, string>();
  
  config.services
    .filter((service) => service.helmRepository)
    .forEach((service) => {
      repositoriesMap.set(service.helmRepositoryName, service.helmRepository);
    });

  const repositories = Array.from(repositoriesMap.entries()).map(([name, url]) => ({
    name,
    url,
  }));

  core.info(`Adding ${repositories.length} unique helm repositories`);
  const addRepoPromises = repositories.map((repo) => 
    exec.exec(`helm repo add --force-update ${repo.name} ${repo.url}`)
  );

  await Promise.all(addRepoPromises);
  await exec.exec(`helm repo update`);
}

async function downloadCharts(config: Config, targetDir: string): Promise<void> {
  for (const service of config.services) {
    // ignore local charts
    if (service.helmChart.startsWith("./")) {
      continue;
    }

    const outputPath = path.join(targetDir, getChartPath(service));
    fs.mkdirSync(outputPath, { recursive: true });

    const fullChartName = `${service.helmRepositoryName}/${service.helmChart}`;
    let cmd = `helm pull --destination ${outputPath} ${fullChartName}`;
    if (service.version) {
      cmd += ` --version ${service.version}`;
    }
    await exec.exec(cmd);
  }
}

export async function run(yamlConfig: Config, outputDir: string, extraOpts: string) {
  await fetchRepositories(yamlConfig);

  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "charts-"));
  await downloadCharts(yamlConfig, targetDir);

  for (const service of yamlConfig.services) {
    const releaseNamespace = service.namespace || "default";
    const releaseName = service.name;
    const chartDir = path.join(targetDir, getChartPath(service));
    const helmValuesFiles = service.helmValues || "";
    const outputPrefix = service.outputPathPrefix || ".";

    let cmd = `helm template --include-crds -n ${releaseNamespace} ${releaseName}`;
    
    if (isLocalChart(service)) {
      // For local charts, use the chart path directly
      cmd += ` ${service.helmChart}`;
    } else {
      // For remote charts, use the downloaded .tgz file
      const chartFiles = (await exec.getExecOutput(`find ${chartDir} -type f -name "*.tgz"`)).stdout.trim();
      if (!chartFiles) {
        throw new Error(`No chart files found in ${chartDir} for service ${service.name}`);
      }
      cmd += ` ${chartFiles}`;
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
