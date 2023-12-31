import {
	FileCommand,
	FormattedFileCommand,
	buildFormattedFileCommands,
	modifyFileSystemUponCommand,
} from './fileCommands.js';
import { Dependencies, runRepomod } from './runRepomod.js';
import { escape, glob, Glob } from 'glob';
import { dirname } from 'node:path';
import { Filemod } from '@intuita-inc/filemod';
import { PrinterBlueprint } from './printer.js';
import { Deepcode } from './deepcode.js';
import { IFs, Volume, createFsFromVolume } from 'memfs';
import { createHash } from 'node:crypto';
import { WorkerThreadManager } from './workerThreadManager.js';
import { getTransformer, transpile } from './getTransformer.js';
import { OperationMessage } from './messages.js';
import { minimatch } from 'minimatch';
import { SafeArgumentRecord } from './safeArgumentRecord.js';
import { FlowSettings } from './schemata/flowSettingsSchema.js';
import { WorkerThreadMessage } from './workerThreadMessages.js';
import { RunSettings } from './runSettings.js';

const TERMINATE_IDLE_THREADS_TIMEOUT = 30 * 1000;

const buildPaths = async (
	fileSystem: IFs,
	flowSettings: FlowSettings,
	deepcode: Deepcode,
	filemod: Filemod<Dependencies, Record<string, unknown>> | null,
): Promise<ReadonlyArray<string>> => {
	const patterns = flowSettings.files ?? flowSettings.include ?? [];

	if (
		(deepcode.engine === 'repomod-engine' ||
			deepcode.engine === 'filemod') &&
		filemod !== null
	) {
		const filemodPaths = await glob(
			filemod.includePatterns?.slice() ?? [],
			{
				absolute: true,
				cwd: flowSettings.targetPath,
				// @ts-expect-error type inconsistency
				fs: fileSystem,
				ignore: filemod.excludePatterns?.slice(),
				nodir: true,
			},
		);

		const flowPaths = await glob(patterns.slice(), {
			absolute: true,
			cwd: flowSettings.targetPath,
			// @ts-expect-error type inconsistency
			fs: fileSystem,
			ignore: flowSettings.exclude.slice(),
			nodir: true,
		});

		return filemodPaths
			.filter((path) => flowPaths.includes(path))
			.map((path) => escape(path))
			.slice(0, flowSettings.fileLimit);
	}

	const paths = await glob(patterns.slice(), {
		absolute: true,
		cwd: flowSettings.targetPath,
		// @ts-expect-error type inconsistency
		fs: fileSystem,
		ignore: flowSettings.exclude.slice(),
		nodir: true,
	});

	return paths.slice(0, flowSettings.fileLimit);
};

async function* buildPathGenerator(
	fileSystem: IFs,
	flowSettings: FlowSettings,
	deepcode: Deepcode,
	filemod: Filemod<Dependencies, Record<string, unknown>> | null,
): AsyncGenerator<string, void, unknown> {
	const patterns = flowSettings.files ?? flowSettings.include ?? [];
	const ignore =
		flowSettings.files === undefined
			? flowSettings.exclude.slice()
			: undefined;

	const controller = new AbortController();

	const glob = new Glob(patterns.slice(), {
		absolute: true,
		cwd: flowSettings.targetPath,
		// @ts-expect-error type inconsistency
		fs: fileSystem,
		ignore,
		nodir: true,
		withFileTypes: false,
		signal: controller.signal,
	});

	const asyncGenerator = glob.iterate();

	let fileCount = 0;

	while (fileCount < flowSettings.fileLimit) {
		const iteratorResult = await asyncGenerator.next();

		if (iteratorResult.done) {
			return;
		}

		const { value } = iteratorResult;

		const path = typeof value === 'string' ? value : value.fullpath();

		if (
			(deepcode.engine === 'repomod-engine' ||
				deepcode.engine === 'filemod') &&
			filemod !== null
		) {
			// what about this one?
			const includePatterns = filemod.includePatterns?.slice() ?? [];
			const excludePatterns = filemod.excludePatterns?.slice() ?? [];

			if (
				includePatterns.some((pattern) =>
					minimatch(path, pattern, {}),
				) &&
				excludePatterns.every(
					(pattern) => !minimatch(path, pattern, {}),
				)
			) {
				yield path;
			}
		} else {
			yield path;
		}

		++fileCount;
	}

	controller.abort();
}

export const runDeepcode = async (
	fileSystem: IFs,
	printer: PrinterBlueprint,
	deepcode: Deepcode,
	flowSettings: FlowSettings,
	runSettings: RunSettings,
	onCommand: (command: FormattedFileCommand) => Promise<void>,
	onPrinterMessage: (
		message: OperationMessage | (WorkerThreadMessage & { kind: 'console' }),
	) => void,
	safeArgumentRecord: SafeArgumentRecord,
	currentWorkingDirectory: string,
): Promise<void> => {
	const name = 'name' in deepcode ? deepcode.name : deepcode.indexPath;

	printer.printConsoleMessage(
		'info',
		`Running the "${name}" deepcode using "${deepcode.engine}"`,
	);

	if (deepcode.engine === 'piranha') {
		throw new Error('Piranha not supported');
	}

	if (deepcode.engine === 'recipe') {
		if (!runSettings.dryRun) {
			for (const subDeepcode of deepcode.deepcodes) {
				const commands: FormattedFileCommand[] = [];

				await runDeepcode(
					fileSystem,
					printer,
					subDeepcode,
					flowSettings,
					runSettings,
					async (command) => {
						commands.push(command);
					},
					(message) => {
						if (message.kind === 'error') {
							onPrinterMessage(message);
						}
						// we are discarding any printer messages from subdeepcodes
						// if we are within a recipe
					},
					safeArgumentRecord,
					currentWorkingDirectory,
				);

				for (const command of commands) {
					await modifyFileSystemUponCommand(
						fileSystem,
						runSettings,
						command,
					);
				}
			}

			return;
		}

		// establish a in-memory file system
		const volume = Volume.fromJSON({});
		const mfs = createFsFromVolume(volume);

		const paths = await buildPaths(
			fileSystem,
			flowSettings,
			deepcode,
			null,
		);

		const fileMap = new Map<string, string>();

		for (const path of paths) {
			const data = await fileSystem.promises.readFile(path, {
				encoding: 'utf8',
			});

			await mfs.promises.mkdir(dirname(path), { recursive: true });
			await mfs.promises.writeFile(path, data);

			const dataHashDigest = createHash('ripemd160')
				.update(data)
				.digest('base64url');

			fileMap.set(path, dataHashDigest);
		}

		for (let i = 0; i < deepcode.deepcodes.length; ++i) {
			const subDeepcode = deepcode.deepcodes[i];

			const commands: FormattedFileCommand[] = [];

			await runDeepcode(
				mfs,
				printer,
				subDeepcode,
				flowSettings,
				{
					dryRun: false,
				},
				async (command) => {
					commands.push(command);
				},
				(message) => {
					if (message.kind === 'error') {
						onPrinterMessage(message);
					}

					if (message.kind === 'progress') {
						onPrinterMessage({
							kind: 'progress',
							processedFileNumber:
								message.totalFileNumber * i +
								message.processedFileNumber,
							totalFileNumber:
								message.totalFileNumber *
								deepcode.deepcodes.length,
						});
					}

					// we are discarding any printer messages from subdeepcodes
					// if we are within a recipe
				},
				safeArgumentRecord,
				currentWorkingDirectory,
			);

			for (const command of commands) {
				await modifyFileSystemUponCommand(
					mfs,
					{ dryRun: false },
					command,
				);
			}
		}

		const newPaths = await glob(['**/*.*'], {
			absolute: true,
			cwd: flowSettings.targetPath,
			// @ts-expect-error type inconsistency
			fs: mfs,
			nodir: true,
		});

		const fileCommands: FileCommand[] = [];

		for (const newPath of newPaths) {
			const newDataBuffer = await mfs.promises.readFile(newPath);
			const newData = newDataBuffer.toString();

			const oldDataFileHash = fileMap.get(newPath) ?? null;

			if (oldDataFileHash === null) {
				// the file has been created
				fileCommands.push({
					kind: 'createFile',
					newPath,
					newData,
					formatWithPrettier: false,
				});
			} else {
				const newDataFileHash = createHash('ripemd160')
					.update(newData)
					.digest('base64url');

				if (newDataFileHash !== oldDataFileHash) {
					fileCommands.push({
						kind: 'updateFile',
						oldPath: newPath,
						newData,
						oldData: '', // TODO no longer necessary
						formatWithPrettier: false,
					});
				}

				// no changes to the file
			}

			fileMap.delete(newPath);
		}

		for (const oldPath of fileMap.keys()) {
			fileCommands.push({
				kind: 'deleteFile',
				oldPath,
			});
		}

		const commands = await buildFormattedFileCommands(fileCommands);

		for (const command of commands) {
			await onCommand(command);
		}

		return;
	}

	const deepcodeSource = await fileSystem.promises.readFile(
		deepcode.indexPath,
		{ encoding: 'utf8' },
	);

	const transpiledSource = deepcode.indexPath.endsWith('.ts')
		? transpile(deepcodeSource.toString())
		: deepcodeSource.toString();

	const transformer = getTransformer(transpiledSource);

	if (transformer === null) {
		throw new Error(
			`The transformer cannot be null: ${deepcode.indexPath} ${deepcode.engine}`,
		);
	}

	if (deepcode.engine === 'repomod-engine' || deepcode.engine === 'filemod') {
		const paths = await buildPaths(
			fileSystem,
			flowSettings,
			deepcode,
			transformer as Filemod<Dependencies, Record<string, unknown>>,
		);

		const fileCommands = await runRepomod(
			fileSystem,
			{ ...transformer, includePatterns: paths, excludePatterns: [] },
			flowSettings.targetPath,
			flowSettings.usePrettier,
			safeArgumentRecord,
			onPrinterMessage,
			currentWorkingDirectory,
		);

		const commands = await buildFormattedFileCommands(fileCommands);

		for (const command of commands) {
			await onCommand(command);
		}

		return;
	}

	// jscodeshift or ts-morph
	const pathGenerator = buildPathGenerator(
		fileSystem,
		flowSettings,
		deepcode,
		null,
	);

	const { engine } = deepcode;

	await new Promise<void>((resolve) => {
		let timeout: NodeJS.Timeout | null = null;

		const workerThreadManager = new WorkerThreadManager(
			flowSettings.threadCount,
			deepcode.indexPath,
			engine,
			transpiledSource,
			flowSettings.usePrettier,
			async (path) => {
				const data = await fileSystem.promises.readFile(path, {
					encoding: 'utf8',
				});

				return data as string;
			},
			(message) => {
				onPrinterMessage(message);

				if (timeout) {
					clearTimeout(timeout);
				}

				if (message.kind === 'finish') {
					resolve();

					return;
				}

				timeout = setTimeout(async () => {
					await workerThreadManager.terminateWorkers();

					resolve();
				}, TERMINATE_IDLE_THREADS_TIMEOUT);
			},
			onCommand,
			pathGenerator,
			safeArgumentRecord,
		);
	});
};
