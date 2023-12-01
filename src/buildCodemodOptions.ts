import { IFs } from 'memfs';
import * as S from '@effect/schema/Schema';
import path from 'node:path';
import {
	Deepcode,
	JavaScriptDeepcodeEngine,
	javaScriptDeepcodeEngineSchema,
} from './deepcode.js';
import { DeepcodeSettings } from './schemata/deepcodeSettingsSchema.js';

const extractMainScriptRelativePath = async (
	fs: IFs,
	filePath: string,
): Promise<string | null> => {
	try {
		const data = await fs.promises.readFile(filePath, {
			encoding: 'utf-8',
		});

		const schema = S.struct({
			main: S.string,
		});

		const { main } = S.parseSync(schema)(data);

		return main;
	} catch {
		return null;
	}
};

const extractEngine = async (
	fs: IFs,
	filePath: string,
): Promise<JavaScriptDeepcodeEngine | null> => {
	try {
		const data = await fs.promises.readFile(filePath, {
			encoding: 'utf-8',
		});

		const schema = S.struct({
			engine: javaScriptDeepcodeEngineSchema,
		});

		const { engine } = S.parseSync(schema)(data);

		return engine;
	} catch {
		return null;
	}
};

export const buildSourcedDeepcodeOptions = async (
	fs: IFs,
	deepcodeOptions: DeepcodeSettings & { kind: 'runSourced' },
): Promise<Deepcode & { source: 'fileSystem' }> => {
	const isDirectorySource = await fs.promises
		.lstat(deepcodeOptions.sourcePath)
		.then((pathStat) => pathStat.isDirectory());

	if (!isDirectorySource) {
		if (deepcodeOptions.deepcodeEngine === null) {
			throw new Error(
				'--deepcodeEngine has to be defined when running local deepcode',
			);
		}

		return {
			source: 'fileSystem' as const,
			engine: deepcodeOptions.deepcodeEngine,
			indexPath: deepcodeOptions.sourcePath,
		};
	}

	if (
		!['config.json', 'package.json']
			.map((lookedupFilePath) =>
				path.join(deepcodeOptions.sourcePath, lookedupFilePath),
			)
			.every(fs.existsSync)
	) {
		throw new Error(
			`Deepcode directory is of incorrect structure at ${deepcodeOptions.sourcePath}`,
		);
	}

	const mainScriptRelativePath = await extractMainScriptRelativePath(
		fs,
		path.join(deepcodeOptions.sourcePath, 'package.json'),
	);

	if (!mainScriptRelativePath) {
		throw new Error(
			`No main script specified for deepcode at ${deepcodeOptions.sourcePath}`,
		);
	}

	const mainScriptPath = path.join(
		deepcodeOptions.sourcePath,
		mainScriptRelativePath,
	);

	const engine = await extractEngine(
		fs,
		path.join(deepcodeOptions.sourcePath, 'config.json'),
	);

	if (engine === null) {
		throw new Error(
			`Engine specified in config.json at ${deepcodeOptions.sourcePath} is not a JavaScript deepcode engine or does not exist.`,
		);
	}

	return {
		source: 'fileSystem' as const,
		engine,
		indexPath: mainScriptPath,
	};
};
