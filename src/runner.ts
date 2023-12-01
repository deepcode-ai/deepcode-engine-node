import { randomBytes } from 'crypto';
import { join } from 'path';
import terminalLink from 'terminal-link';

import type { ArgumentRecord } from './schemata/argumentRecordSchema.js';
import {
	modifyFileSystemUponCommand,
	type FormattedFileCommand,
	buildPrinterMessageUponCommand,
} from './fileCommands.js';
import type { PrinterBlueprint } from './printer.js';
import { runDeepcode } from './runDeepcode.js';

import { buildSafeArgumentRecord } from './safeArgumentRecord.js';
import type { IFs } from 'memfs';
import type { DeepcodeDownloaderBlueprint } from './downloadDeepcode.js';
import type { RepositoryConfiguration } from './repositoryConfiguration.js';
import type { DeepcodeSettings } from './schemata/deepcodeSettingsSchema.js';
import type { FlowSettings } from './schemata/flowSettingsSchema.js';
import type { TelemetryBlueprint } from './telemetryService.js';
import { buildSourcedDeepcodeOptions } from './buildDeepcodeOptions.js';
import { RunSettings } from './runSettings.js';

export class Runner {
	private __caseHashDigest: Buffer;
	private __modifiedFileCount: number;
	private __runSettings: RunSettings;

	public constructor(
		protected readonly _fs: IFs,
		protected readonly _printer: PrinterBlueprint,
		protected readonly _telemetry: TelemetryBlueprint,
		protected readonly _deepcodeDownloader: DeepcodeDownloaderBlueprint,
		protected readonly _loadRepositoryConfiguration: () => Promise<RepositoryConfiguration>,
		protected readonly _deepcodeSettings: DeepcodeSettings,
		protected readonly _flowSettings: FlowSettings,
		protected readonly _dryRun: boolean,
		protected readonly _argumentRecord: ArgumentRecord,
		protected readonly _name: string | null,
		protected readonly _currentWorkingDirectory: string,
		homeDirectoryPath: string,
	) {
		this.__caseHashDigest = randomBytes(20);
		this.__modifiedFileCount = 0;

		this.__runSettings = _dryRun
			? {
					dryRun: true,
					outputDirectoryPath: join(
						homeDirectoryPath,
						'cases',
						this.__caseHashDigest.toString('base64url'),
					),
			  }
			: {
					dryRun: false,
			  };
	}

	public async run() {
		const EXTENSION_LINK_START = terminalLink(
			'Click to view the live results of this run in the Deepcode VSCode Extension!',
			`vscode://deepcode.deepcode-vscode-extension/case/${this.__caseHashDigest}`,
		);

		const EXTENSION_LINK_END = terminalLink(
			'The run has finished! Click to open the Deepcode VSCode Extension and view the results.',
			`vscode://deepcode.deepcode-vscode-extension/case/${this.__caseHashDigest}`,
		);

		try {
			if (this._deepcodeSettings.kind === 'runSourced') {
				if (this._dryRun) {
					this._printer.printConsoleMessage(
						'log',
						EXTENSION_LINK_START,
					);
				}

				const deepcodeOptions = await buildSourcedDeepcodeOptions(
					this._fs,
					this._deepcodeSettings,
				);

				const safeArgumentRecord = buildSafeArgumentRecord(
					deepcodeOptions,
					this._argumentRecord,
				);

				await runDeepcode(
					this._fs,
					this._printer,
					deepcodeOptions,
					this._flowSettings,
					this.__runSettings,
					(command) => this._handleCommand(command),
					(message) => this._printer.printMessage(message),
					safeArgumentRecord,
					this._currentWorkingDirectory,
				);

				this._telemetry.sendEvent({
					kind: 'deepcodeExecuted',
					deepcodeName: 'Deepcode from FS',
					executionId: this.__caseHashDigest.toString('base64url'),
					fileCount: this.__modifiedFileCount,
				});

				if (this._dryRun) {
					this._printer.printConsoleMessage(
						'log',
						EXTENSION_LINK_END,
					);
				}

				return;
			}

			if (this._deepcodeSettings.kind === 'runOnPreCommit') {
				const { preCommitDeepcodes } =
					await this._loadRepositoryConfiguration();

				for (const preCommitDeepcode of preCommitDeepcodes) {
					if (preCommitDeepcode.source === 'registry') {
						const deepcode =
							await this._deepcodeDownloader.download(
								preCommitDeepcode.name,
								this._flowSettings.useCache,
							);

						const safeArgumentRecord = buildSafeArgumentRecord(
							deepcode,
							preCommitDeepcode.arguments,
						);

						await runDeepcode(
							this._fs,
							this._printer,
							deepcode,
							this._flowSettings,
							this.__runSettings,
							(command) => this._handleCommand(command),
							(message) => this._printer.printMessage(message),
							safeArgumentRecord,
							this._currentWorkingDirectory,
						);

						this._telemetry.sendEvent({
							kind: 'deepcodeExecuted',
							deepcodeName: deepcode.name,
							executionId:
								this.__caseHashDigest.toString('base64url'),
							fileCount: this.__modifiedFileCount,
						});
					}
				}

				return;
			}

			if (this._name !== null) {
				this._printer.printConsoleMessage(
					'info',
					`Executing the "${this._name}" deepcode against "${this._flowSettings.targetPath}"`,
				);

				if (this._dryRun) {
					this._printer.printConsoleMessage(
						'log',
						EXTENSION_LINK_START,
					);
				}

				const deepcode = await this._deepcodeDownloader.download(
					this._name,
					this._flowSettings.useCache,
				);

				const safeArgumentRecord = buildSafeArgumentRecord(
					deepcode,
					this._argumentRecord,
				);

				await runDeepcode(
					this._fs,
					this._printer,
					deepcode,
					this._flowSettings,
					this.__runSettings,
					(command) => this._handleCommand(command),
					(message) => this._printer.printMessage(message),
					safeArgumentRecord,
					this._currentWorkingDirectory,
				);

				this._telemetry.sendEvent({
					kind: 'deepcodeExecuted',
					deepcodeName: deepcode.name,
					executionId: this.__caseHashDigest.toString('base64url'),
					fileCount: this.__modifiedFileCount,
				});

				if (this._dryRun) {
					this._printer.printConsoleMessage(
						'log',
						EXTENSION_LINK_END,
					);
				}
			}
		} catch (error) {
			if (!(error instanceof Error)) {
				return;
			}

			this._printer.printOperationMessage({
				kind: 'error',
				message: error.message,
			});
			this._telemetry.sendEvent({
				kind: 'failedToExecuteCommand',
				commandName: 'deepcode.executeDeepcode',
			});
		}
	}

	protected async _handleCommand(
		command: FormattedFileCommand,
	): Promise<void> {
		await modifyFileSystemUponCommand(
			this._fs,
			this.__runSettings,
			command,
		);

		if (!this.__runSettings.dryRun) {
			++this.__modifiedFileCount;
		}

		const printerMessage = buildPrinterMessageUponCommand(
			this.__runSettings,
			command,
		);

		if (printerMessage) {
			this._printer.printOperationMessage(printerMessage);
		}
	}
}
