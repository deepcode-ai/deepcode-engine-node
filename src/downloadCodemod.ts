import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { PrinterBlueprint } from './printer.js';
import { Deepcode } from './deepcode.js';

import * as S from '@effect/schema/Schema';
import Axios from 'axios';
import { deepcodeConfigSchema } from './schemata/deepcodeConfigSchema.js';
import { FileDownloadServiceBlueprint } from './fileDownloadService.js';
import { TarService } from './services/tarService.js';

const CODEMOD_REGISTRY_URL =
	'https://deepcode-public.s3.us-west-1.amazonaws.com/deepcode-registry';

export type DeepcodeDownloaderBlueprint = Readonly<{
	syncRegistry: () => Promise<void>;
	download(
		name: string,
		cache: boolean,
	): Promise<Deepcode & { source: 'registry' }>;
}>;

export class DeepcodeDownloader implements DeepcodeDownloaderBlueprint {
	public constructor(
		private readonly __printer: PrinterBlueprint,
		private readonly __deepcodeDirectoryPath: string,
		protected readonly _cacheUsed: boolean,
		protected readonly _fileDownloadService: FileDownloadServiceBlueprint,
		protected readonly _tarService: TarService,
	) {}

	public async syncRegistry() {
		this.__printer.printConsoleMessage(
			'info',
			`Syncing the Deepcode Registry into ${this.__deepcodeDirectoryPath}`,
		);

		await mkdir(this.__deepcodeDirectoryPath, { recursive: true });

		const getResponse = await Axios.get(
			`${CODEMOD_REGISTRY_URL}/registry.tar.gz`,
			{
				responseType: 'arraybuffer',
			},
		);

		const buffer = Buffer.from(getResponse.data);

		await this._tarService.extract(this.__deepcodeDirectoryPath, buffer);
	}

	public async download(
		name: string,
	): Promise<Deepcode & { source: 'registry' }> {
		this.__printer.printConsoleMessage(
			'info',
			`Downloading the "${name}" deepcode, ${
				this._cacheUsed ? '' : 'not '
			}using cache`,
		);

		await mkdir(this.__deepcodeDirectoryPath, { recursive: true });

		// make the deepcode directory
		const hashDigest = createHash('ripemd160')
			.update(name)
			.digest('base64url');

		const directoryPath = join(this.__deepcodeDirectoryPath, hashDigest);

		await mkdir(directoryPath, { recursive: true });

		// download the config
		const configPath = join(directoryPath, 'config.json');

		const buffer = await this._fileDownloadService.download(
			`${CODEMOD_REGISTRY_URL}/${hashDigest}/config.json`,
			configPath,
		);

		const parsedConfig = JSON.parse(buffer.toString('utf8'));

		const config = S.parseSync(deepcodeConfigSchema)(parsedConfig);

		{
			const descriptionPath = join(directoryPath, 'description.md');

			try {
				await this._fileDownloadService.download(
					`${CODEMOD_REGISTRY_URL}/${hashDigest}/description.md`,
					descriptionPath,
				);
			} catch {
				// do nothing, descriptions might not exist
			}
		}

		if (config.engine === 'piranha') {
			const rulesPath = join(directoryPath, 'rules.toml');

			await this._fileDownloadService.download(
				`${CODEMOD_REGISTRY_URL}/${hashDigest}/rules.toml`,
				rulesPath,
			);

			return {
				source: 'registry',
				name,
				engine: config.engine,
				directoryPath,
				arguments: config.arguments,
			};
		}

		if (
			config.engine === 'jscodeshift' ||
			config.engine === 'repomod-engine' ||
			config.engine === 'filemod' ||
			config.engine === 'ts-morph'
		) {
			const indexPath = join(directoryPath, 'index.cjs');

			const data = await this._fileDownloadService.download(
				`${CODEMOD_REGISTRY_URL}/${hashDigest}/index.cjs`,
				indexPath,
			);

			await writeFile(indexPath, data);

			return {
				source: 'registry',
				name,
				engine: config.engine,
				indexPath,
				directoryPath,
				arguments: config.arguments,
			};
		}

		if (config.engine === 'recipe') {
			const deepcodes: Deepcode[] = [];

			for (const name of config.names) {
				const deepcode = await this.download(name);
				deepcodes.push(deepcode);
			}

			return {
				source: 'registry',
				name,
				engine: config.engine,
				deepcodes,
				directoryPath,
				arguments: config.arguments,
			};
		}

		throw new Error('Unsupported engine');
	}
}
