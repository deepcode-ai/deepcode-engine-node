# Deepcode's Deepcode Engine Node

Deepcode gives you multiple ways to discover, run & share supported codemods and code automation recipes.

![Running Deepcode CLI](https://raw.githubusercontent.com/deepcode-ai/deepcode-website/main/theme/assets/images/hero-video.gif)

## Installation

    npm i deepcode

## Global installation (recommended)

    npm i -g deepcode

## Usage

### Running a codemod

    deepcode [framework/version/codemod-name]

#### Example (running Next.js app router receipe codemod)

    deepcode next/13/app-router-recipe

### List available codemods

The `list` command can be used to list all codemods available in the [Deepcode Registry](https://github.com/deepcode-ai/codemod-registry).

    deepcode list

### Sync registry

The `syncRegistry` command can be used to sync local codemods with the public [Deepcode Registry](https://github.com/deepcode-ai/codemod-registry).

    deepcode syncRegistry

### Generate codemod from file diff

The `learn` command can be used to send the diff of the latest edited file to Deepcode Studio and have it automatically build an explainable and debuggable codemod.

After running this command, if any git diff exists, Deepcode will use the diff as before/after snippets in [Deepcode Studio](https://codemod.studio).

    deepcode learn

### Options

-   [`--include`](https://docs.deepcode.khulnasoft.com/docs/cli/advanced-usage#--include)
-   [`--exclude`](https://docs.deepcode.khulnasoft.com/docs/cli/advanced-usage#--exclude)
-   [`--targetPath`](https://docs.deepcode.khulnasoft.com/docs/cli/advanced-usage#--targetpath)
-   [`--sourcePath`](https://docs.deepcode.khulnasoft.com/docs/cli/advanced-usage#--sourcepath)
-   [`--codemodEngine`](https://docs.deepcode.khulnasoft.com/docs/cli/advanced-usage#--codemodengine)
-   [`--fileLimit`](https://docs.deepcode.khulnasoft.com/docs/cli/advanced-usage#--filelimit)
-   [`--usePrettier`](https://docs.deepcode.khulnasoft.com/docs/cli/advanced-usage#--useprettier)
-   [`--useCache`](https://docs.deepcode.khulnasoft.com/docs/cli/advanced-usage#--usecache)
-   [`--useJson`](https://docs.deepcode.khulnasoft.com/docs/cli/advanced-usage#--usejson)
-   [`--threadCount`](https://docs.deepcode.khulnasoft.com/docs/cli/advanced-usage#--threadcount)
-   [`--dryRun`](https://docs.deepcode.khulnasoft.com/docs/cli/advanced-usage#--dryrun)
-   [`--telemetryDisable`](https://docs.deepcode.khulnasoft.com/docs/cli/advanced-usage#--telemetrydisable)

## Contribution

We'd love for you to contribute to the [Deepcode Engine](https://github.com/deepcode-ai/deepcode-engine-node) and the [Deepcode Registry](https://github.com/deepcode-ai/codemod-registry). Please note that once you create a pull request, you will be asked to sign our [Contributor License Agreement](https://cla-assistant.io/deepcode-ai/codemod-registry).

We're always excited to support codemods for more frameworks and libraries. Contributing allows us to make codemods more accessible to more framework builders, developers, and more.

## Telemetry 🔭

We collect anonymous usage data to improve our product. Collected data cannot be linked to individual users. We do not store personal data/code.

For more details and samples of collected data see our [telemetry compliance considerations](https://docs.deepcode.khulnasoft.com/docs/about-deepcode/legal/telemetry-compliance) doc.
