import deepmerge from 'deepmerge';
import { BuildResult } from 'esbuild';
import { trySafe } from 'p-safe';

import { getConfig } from '@/lib/config';
import { build, type BuildConfig } from '@/lib/esbuild';

export async function transpile(options: BuildConfig) {
  return trySafe<BuildResult>(async (resolve) => {
    const config = await getConfig();
    return resolve(
      await build(
        Object.assign(
          {
            splitting: true,
          },
          deepmerge(options, config?.esbuild ?? {})
        )
      )
    );
  });
}
