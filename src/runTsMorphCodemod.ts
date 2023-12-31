import vm from 'node:vm';
import tsmorph from 'ts-morph';
import * as S from '@effect/schema/Schema';
import type { FileCommand } from './fileCommands.js';
import { SafeArgumentRecord } from './safeArgumentRecord.js';
import { ConsoleKind } from './schemata/consoleKindSchema.js';
import { CONSOLE_OVERRIDE } from './consoleOverride.js';
import { buildVmConsole } from './buildVmConsole.js';

const transform = (
	deepcodeSource: string,
	oldPath: string,
	oldData: string,
	safeArgumentRecord: SafeArgumentRecord,
	consoleCallback: (kind: ConsoleKind, message: string) => void,
): string | undefined | null => {
	const codeToExecute = `
		${CONSOLE_OVERRIDE}

		const __module__ = { exports: {} };

		const keys = ['module', 'exports'];
		const values = [__module__, __module__.exports];

		new Function(...keys, __CODEMOD_SOURCE__).apply(null, values);

		const handleSourceFile = typeof __module__.exports === 'function'
			? __module__.exports
			: __module__.exports.__esModule &&
			typeof __module__.exports.default === 'function'
			? __module__.exports.default
			: typeof __module__.exports.handleSourceFile === 'function'
			? __module__.exports.handleSourceFile
			: null;

		const { Project } = require('ts-morph');

		const project = new Project({
			useInMemoryFileSystem: true,
			skipFileDependencyResolution: true,
			compilerOptions: {
				allowJs: true,
			},
		});
	
		const sourceFile = project.createSourceFile(__DEEPCODE__oldPath, __DEEPCODE__oldData);

		handleSourceFile(sourceFile, __DEEPCODE__argumentRecord);
	`;

	const exports = Object.freeze({});

	const context = vm.createContext({
		module: Object.freeze({
			exports,
		}),
		exports,
		__DEEPCODE__oldPath: oldPath,
		__DEEPCODE__oldData: oldData,
		__DEEPCODE__argumentRecord: { ...safeArgumentRecord[0] },
		__DEEPCODE__console__: buildVmConsole(consoleCallback),
		__CODEMOD_SOURCE__: deepcodeSource,
		require: (name: string) => {
			if (name === 'ts-morph') {
				return tsmorph;
			}
		},
	});

	const value = vm.runInContext(codeToExecute, context);

	return S.parseSync(S.union(S.string, S.undefined, S.null))(value);
};

export const runTsMorphDeepcode = (
	deepcodeSource: string,
	oldPath: string,
	oldData: string,
	formatWithPrettier: boolean,
	safeArgumentRecord: SafeArgumentRecord,
	consoleCallback: (kind: ConsoleKind, message: string) => void,
): readonly FileCommand[] => {
	const newData = transform(
		deepcodeSource,
		oldPath,
		oldData,
		safeArgumentRecord,
		consoleCallback,
	);

	if (typeof newData !== 'string' || oldData === newData) {
		return [];
	}

	return [
		{
			kind: 'updateFile',
			oldPath,
			oldData,
			newData,
			formatWithPrettier,
		},
	];
};
