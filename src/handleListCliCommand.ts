import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import * as S from '@effect/schema/Schema';
import type { FileDownloadService } from './fileDownloadService.js';
import type { PrinterBlueprint } from './printer.js';

export const handleListNamesCommand = async (
	fileDownloadService: FileDownloadService,
	printer: PrinterBlueprint,
) => {
	const deepcodeDirectoryPath = join(homedir(), '.deepcode');

	await mkdir(deepcodeDirectoryPath, { recursive: true });

	const path = join(deepcodeDirectoryPath, 'names.json');

	const buffer = await fileDownloadService.download(
		'https://deepcode-public.s3.us-west-1.amazonaws.com/deepcode-registry/names.json',
		path,
	);

	const data = buffer.toString('utf8');

	const parsedJson = JSON.parse(data);

	const names = S.parseSync(S.array(S.string))(parsedJson);

	printer.printOperationMessage({ kind: 'names', names });
};
