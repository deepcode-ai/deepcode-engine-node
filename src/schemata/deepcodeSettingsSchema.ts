import * as S from '@effect/schema/Schema';

const deepcodeEngineSchema = S.union(
	S.literal('jscodeshift'),
	S.literal('repomod-engine'),
	S.literal('filemod'),
	S.literal('ts-morph'),
);

export const deepcodeSettingsSchema = S.union(
	S.struct({
		_: S.array(S.string),
		source: S.optional(S.string),
		sourcePath: S.optional(S.string),
		deepcodeEngine: S.optional(deepcodeEngineSchema),
	}),
);

export type DeepcodeSettings =
	| Readonly<{
			kind: 'runOnPreCommit';
	  }>
	| Readonly<{
			kind: 'runNamed';
			name: string;
	  }>
	| Readonly<{
			kind: 'runSourced';
			sourcePath: string;
			deepcodeEngine: S.To<typeof deepcodeEngineSchema> | null;
	  }>;

export const parseDeepcodeSettings = (input: unknown): DeepcodeSettings => {
	const deepcodeSettings = S.parseSync(deepcodeSettingsSchema)(input);

	if (deepcodeSettings._.includes('runOnPreCommit')) {
		return {
			kind: 'runOnPreCommit',
		};
	}

	const deepcodeName = deepcodeSettings._.at(-1);
	if (deepcodeName) {
		return {
			kind: 'runNamed',
			name: deepcodeName,
		};
	}

	const sourcePath =
		'source' in deepcodeSettings
			? deepcodeSettings.source
			: deepcodeSettings.sourcePath;

	if (!sourcePath) {
		throw new Error('sourcePath is not present');
	}

	return {
		kind: 'runSourced',
		sourcePath,
		deepcodeEngine: deepcodeSettings.deepcodeEngine ?? null,
	};
};
