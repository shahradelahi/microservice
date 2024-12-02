import { promises } from 'node:fs';
import { resolve } from 'node:path';
import fg from 'fast-glob';

import { build, BuildConfig } from '@/lib/esbuild';
import { getModule } from '@/utils/get-module';

export interface CronstackConfig {
  esbuild?: BuildConfig;
}

export async function getConfig(): Promise<CronstackConfig | undefined> {
  await unlinkWaste();

  const file = await getConfigFilePath();
  if (!file) {
    return;
  }

  const outputPath = `cronstack.config.${Date.now()}.js`;
  const buildResult = await build({
    entryPoints: [file],
    outfile: outputPath,
    bundle: false,
    platform: 'node',
  });

  const buildError = buildResult.errors?.at(0);
  if (buildError) {
    throw new Error(buildError.text);
  }

  const output = resolve(outputPath);
  const configExports = await getModule(output);

  if (!configExports.default) {
    throw new Error('Can not find default export in config file');
  }

  if (typeof configExports.default !== 'object') {
    throw new Error('Default export in config file is not a valid config object');
  }

  const config = configExports.default as CronstackConfig;

  await promises.unlink(output);

  return config;
}

async function unlinkWaste() {
  const files = await fg('cronstack.config.*.js');
  for (const f of files) {
    if (/cronstack.config.\d+.js/.test(f)) {
      await promises.unlink(f);
    }
  }
}

async function getConfigFilePath() {
  const files = await fg('cronstack.config.{ts,js}');
  return files.at(0);
}

export function defineConfig(config: CronstackConfig): CronstackConfig {
  return Object.assign({}, config);
}
