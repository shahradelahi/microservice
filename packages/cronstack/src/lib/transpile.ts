import deepmerge from 'deepmerge';
import { build, type BuildOptions, type Plugin, type PluginBuild } from 'esbuild';
import { trySafe, type SafeReturn } from 'p-safe';

import { PACKAGE_NAME } from '@/constants';
import { getPackageInfo } from '@/utils/get-package-info';

export async function transpileFile(options: BuildOptions): Promise<SafeReturn<boolean>> {
  return trySafe(async () => {
    // deepmerge(
    //   {
    //     skipNodeModulesBundle: true,
    //     target: 'esnext',
    //     tsconfig: 'tsconfig.json',
    //     clean: true,
    //     bundle: true,
    //     sourcemap: true,
    //     platform: 'node',
    //     keepNames: true,
    //     config: false,
    //     silent: true,
    //     shims: true,
    //     splitting: true,
    //     external: [PACKAGE_NAME]
    //   },
    //   options
    // );

    const packageJson = await getPackageInfo(true);

    await build(
      deepmerge(
        {
          tsconfig: 'tsconfig.json',
          target: 'esnext',
          bundle: true,
          platform: 'node',
          keepNames: true,
          splitting: true,
          plugins: [shimPlugin()],
          external: [PACKAGE_NAME, 'node:module', 'node:url', 'node:path'].concat(
            Object.keys(packageJson?.dependencies ?? {})
          ),
        },
        options
      )
    );
  });
}

const shimPlugin = (): Plugin => ({
  name: 'shimPlugin',
  setup(build: PluginBuild) {
    const options = build.initialOptions;

    if (!options.format) {
      throw new Error(`options.format needs to be defined in order to use plugin`);
    }

    if (options.format === 'esm') {
      options.banner = {
        js: `\
const shimRequire = /* @__PURE__ */ (await import("node:module")).createRequire(import.meta.url);
const __filename = /* @__PURE__ */ (await import("node:url")).fileURLToPath(import.meta.url);
const __dirname = /* @__PURE__ */ (await import("node:path")).dirname(__filename);`,
      };
      options.define = {
        ...options.define,
        ...{
          require: 'shimRequire',
        },
      };
    }

    if (options.format === 'cjs') {
      options.banner = {
        js: `\
const getImportMetaUrl = () => require("node:url").pathToFileURL(__filename).toString();
export const importMetaUrl = /* @__PURE__ */ getImportMetaUrl();`,
      };
      options.define = {
        ...options.define,
        ...{
          'import.meta.url': 'importMetaUrl',
        },
      };
    }
  },
});
