# Helm Render Action

A GitHub Action that renders Helm charts and outputs manifests to a target directory or syncs them to a specified branch.

## Features

- Downloads Helm charts from repositories
- Renders charts with custom values
- Outputs manifests to local directory or sync to branch
- Supports multiple services in a single configuration
- Configurable Helm options

## Usage

### Basic Usage (Local Output)

```yaml
name: Render Helm Charts
on: [push]

jobs:
  render:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Render Helm Charts
        uses: func25/helm-render@v1
        with:
          configPath: './config/services.yaml'
```

### Sync to Branch

```yaml
name: Render and Sync Helm Charts
on: [push]

jobs:
  render:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Render and Sync Helm Charts
        uses: func25/helm-render@v1
        with:
          configPath: './config/services.yaml'
          branch: 'rendered-manifests'
          token: ${{ secrets.GITHUB_TOKEN }}
          helmExtraOpts: '--debug'
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `configPath` | Path to the service configuration file | Yes | - |
| `branch` | Branch to sync rendered manifests to | No | - |
| `token` | GitHub token (required if branch is specified) | No | - |
| `helmExtraOpts` | Extra command line options for helm | No | `""` |

## Configuration File Format

Create a YAML configuration file that defines your services:

```yaml
services:
  - name: nginx
    namespace: default
    outputPathPrefix: "apps"
    helmRepository: "https://charts.bitnami.com/bitnami"
    helmRepositoryName: "bitnami"
    helmChart: "nginx"
    version: "15.1.0"
    helmValues:
      - "./values/nginx-values.yaml"
  
  - name: redis
    namespace: cache
    outputPathPrefix: "infrastructure"
    helmRepository: "https://charts.bitnami.com/bitnami"
    helmRepositoryName: "bitnami"
    helmChart: "redis"
    version: "17.11.3"
```

### Configuration Options

- **name**: Release name for the Helm chart
- **namespace**: Kubernetes namespace for the release
- **outputPathPrefix**: Prefix directory for rendered manifests
- **helmRepository**: URL of the Helm repository
- **helmRepositoryName**: Name to assign to the repository
- **helmChart**: Name of the chart to render
- **version**: (Optional) Specific version of the chart
- **helmValues**: (Optional) Array of values files to use

## Output Structure

When rendered, manifests will be organized as:
```
{outputPathPrefix}/{namespace}/{name}/
├── templates/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── ...
```

## Local Development

1. Clone this repository
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. Package: `npm run package`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests (when available)
5. Submit a pull request

## License

MIT License - see LICENSE file for details. 