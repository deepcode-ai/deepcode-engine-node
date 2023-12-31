import * as readline from 'node:readline';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as S from '@effect/schema/Schema';
import { handleListNamesCommand } from './handleListCliCommand.js';
import { DeepcodeDownloader } from './downloadDeepcode.js';
import { Printer } from './printer.js';
import { handleLearnCliCommand } from './handleLearnCliCommand.js';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
	buildOptions,
	buildUseCacheOption,
	buildUseJsonOption,
} from './buildOptions.js';
import { Runner } from './runner.js';
import * as fs from 'fs';
import { IFs } from 'memfs';
import { loadRepositoryConfiguration } from './repositoryConfiguration.js';
import { parseDeepcodeSettings } from './schemata/deepcodeSettingsSchema.js';
import { parseFlowSettings } from './schemata/flowSettingsSchema.js';
import { runArgvSettingsSchema } from './schemata/runArgvSettingsSchema.js';
import { buildArgumentRecord } from './buildArgumentRecord.js';
import { FileDownloadService } from './fileDownloadService.js';
import Axios from 'axios';
import { TarService } from './services/tarService.js';
import {
	AppInsightsTelemetryService,
	NoTelemetryService,
} from './telemetryService.js';
import { APP_INSIGHTS_INSTRUMENTATION_STRING } from './constants.js';

// the build script contains the version
declare const __DEEPCODE_CLI_VERSION__: string;

export const executeMainThread = async () => {
	const slicedArgv = hideBin(process.argv);

	const interfaze = readline.createInterface(process.stdin);

	const lineHandler = (line: string): void => {
		if (line === 'shutdown') {
			interfaze.off('line', lineHandler);

			process.exit(0);
		}
	};

	interfaze.on('line', lineHandler);

	process.stdin.unref();

	const argvObject = yargs(slicedArgv)
		.scriptName('deepcode')
		.command('*', 'runs a deepcode or recipe', (y) => buildOptions(y))
		.command(
			'runOnPreCommit [files...]',
			'run pre-commit deepcodes against staged files passed positionally',
			(y) => buildUseJsonOption(buildUseCacheOption(y)),
		)
		.command(
			'list',
			'lists all the deepcodes & recipes in the public registry',
			(y) => buildUseJsonOption(buildUseCacheOption(y)),
		)
		.command(
			'syncRegistry',
			'syncs all the deepcodes from the registry',
			(y) => buildUseJsonOption(y),
		)
		.command(
			'learn',
			'exports the current `git diff` in a file to before/after panels in deepcode studio',
			(y) =>
				buildUseJsonOption(y).option('targetPath', {
					type: 'string',
					description: 'Input file path',
				}),
		)
		.help()
		.version(__DEEPCODE_CLI_VERSION__);

	if (slicedArgv.length === 0) {
		argvObject.showHelp();
		return;
	}

	const argv = await Promise.resolve(argvObject.argv);

	const fetchBuffer = async (url: string) => {
		const { data } = await Axios.get(url, {
			responseType: 'arraybuffer',
		});

		return Buffer.from(data);
	};

	const printer = new Printer(argv.useJson);

	const fileDownloadService = new FileDownloadService(
		argv.useCache,
		fetchBuffer,
		() => Date.now(),
		fs as unknown as IFs,
		printer,
	);

	// hack to prevent appInsights from trying to read applicationinsights.json
	// this env should be set before appinsights is imported
	// https://github.com/microsoft/ApplicationInsights-node.js/blob/0217324c477a96b5dd659510bbccad27934084a3/Library/JsonConfig.ts#L122
	process.env['APPLICATIONINSIGHTS_CONFIGURATION_CONTENT'] = '{}';
	const appInsights = await import('applicationinsights');

	// .start() is skipped intentionally, to prevent any non-custom events from tracking
	appInsights.setup(APP_INSIGHTS_INSTRUMENTATION_STRING);

	const telemetryService = argv.telemetryDisable
		? new NoTelemetryService()
		: new AppInsightsTelemetryService(appInsights.defaultClient);

	if (String(argv._) === 'list') {
		try {
			await handleListNamesCommand(fileDownloadService, printer);
		} catch (error) {
			if (!(error instanceof Error)) {
				return;
			}

			printer.printOperationMessage({
				kind: 'error',
				message: error.message,
			});
		}

		return;
	}

	const tarService = new TarService(fs as unknown as IFs);

	if (String(argv._) === 'syncRegistry') {
		const deepcodeDownloader = new DeepcodeDownloader(
			printer,
			join(homedir(), '.deepcode'),
			argv.useCache,
			fileDownloadService,
			tarService,
		);

		try {
			await deepcodeDownloader.syncRegistry();
		} catch (error) {
			if (!(error instanceof Error)) {
				return;
			}

			printer.printOperationMessage({
				kind: 'error',
				message: error.message,
			});
		}

		return;
	}

	if (String(argv._) === 'learn') {
		const printer = new Printer(argv.useJson);
		const targetPath = argv.target ?? argv.targetPath ?? null;

		try {
			await handleLearnCliCommand(printer, targetPath);
		} catch (error) {
			if (!(error instanceof Error)) {
				return;
			}

			printer.printOperationMessage({
				kind: 'error',
				message: error.message,
			});
		}

		return;
	}

	const deepcodeDirectoryPath = join(
		String(argv._) === 'runOnPreCommit' ? process.cwd() : homedir(),
		'.deepcode',
	);

	const deepcodeSettings = parseDeepcodeSettings(argv);
	const flowSettings = parseFlowSettings(argv);
	const runSettings = S.parseSync(runArgvSettingsSchema)(argv);
	const argumentRecord = buildArgumentRecord(argv);

	const lastArgument = argv._[argv._.length - 1];

	const name = typeof lastArgument === 'string' ? lastArgument : null;

	const deepcodeDownloader = new DeepcodeDownloader(
		printer,
		deepcodeDirectoryPath,
		argv.useCache,
		fileDownloadService,
		tarService,
	);

	const runner = new Runner(
		fs as unknown as IFs,
		printer,
		telemetryService,
		deepcodeDownloader,
		loadRepositoryConfiguration,
		deepcodeSettings,
		flowSettings,
		runSettings.dryRun,
		argumentRecord,
		name,
		process.cwd(),
		homedir(),
	);

	await runner.run();
};
