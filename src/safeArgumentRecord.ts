import { ArgumentRecord } from './schemata/argumentRecordSchema.js';
import { Deepcode } from './deepcode.js';

export type SafeArgumentRecord = readonly [ArgumentRecord];

export const buildSafeArgumentRecord = (
	deepcode: Deepcode,
	argumentRecord: ArgumentRecord,
): SafeArgumentRecord => {
	if (deepcode.source === 'fileSystem') {
		// no checks performed for local deepcodes
		// b/c no source of truth for the arguments
		return [argumentRecord];
	}

	const safeArgumentRecord: [{ [x: string]: string | number | boolean }] = [
		{},
	];

	deepcode.arguments.forEach((descriptor) => {
		const unsafeValue = argumentRecord[descriptor.name];

		if (typeof unsafeValue === descriptor.kind) {
			safeArgumentRecord[0][descriptor.name] = unsafeValue;
		} else if (descriptor.default !== undefined) {
			safeArgumentRecord[0][descriptor.name] = descriptor.default;
		}
	});

	return safeArgumentRecord;
};
