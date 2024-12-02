import deepmerge from 'deepmerge';
import { build as originalBuild, type BuildOptions as EsbuildBuildOptions } from 'esbuild';

import { PACKAGE_NAME } from '@/constants';
import { externalPlugin } from '@/lib/esbuild/external-plugin';
import { shimPlugin } from '@/lib/esbuild/shim-plugin';
import { getModuleType } from '@/utils/get-package-info';

export interface BuildConfig extends EsbuildBuildOptions {
  noExternal?: (string | RegExp)[];
}

export async function build(config: BuildConfig) {
  const { noExternal, ...options } = config;

  return await originalBuild(
    deepmerge(
      {
        tsconfig: 'tsconfig.json',
        target: 'esnext',
        bundle: true,
        platform: 'node',
        format: await getModuleType(),
        keepNames: true,
        treeShaking: true,
        plugins: [
          shimPlugin(),
          externalPlugin({
            external: [PACKAGE_NAME, /^node:/],
            noExternal,
          }),
        ],
      },
      options
    )
  );
}
