import { Arguments } from './schemata/argumentsSchema.js';

import * as S from '@effect/schema/Schema';

export const javaScriptDeepcodeEngineSchema = S.union(
	S.literal('jscodeshift'),
	S.literal('repomod-engine'),
	S.literal('filemod'),
	S.literal('ts-morph'),
);

export type JavaScriptDeepcodeEngine = S.To<
	typeof javaScriptDeepcodeEngineSchema
>;

export type Deepcode =
	| Readonly<{
			source: 'registry';
			name: string;
			engine: 'recipe';
			directoryPath: string;
			codemods: ReadonlyArray<Deepcode>;
			arguments: Arguments;
	  }>
	| Readonly<{
			source: 'registry';
			name: string;
			engine: JavaScriptDeepcodeEngine;
			directoryPath: string;
			indexPath: string;
			arguments: Arguments;
	  }>
	| Readonly<{
			source: 'registry';
			name: string;
			engine: 'piranha';
			directoryPath: string;
			arguments: Arguments;
	  }>
	| Readonly<{
			source: 'fileSystem';
			engine: JavaScriptDeepcodeEngine;
			indexPath: string;
	  }>;
