import type { Plugin, PluginBuild } from 'esbuild';

export const shimPlugin = (): Plugin => ({
  name: 'shimPlugin',
  setup(build: PluginBuild) {
    const options = build.initialOptions;

    if (!options.format) {
      throw new Error(`options.format needs to be defined in order to use plugin`);
    }

    if (options.format === 'esm') {
      options.banner = {
        js: `\
const require = /* @__PURE__ */ (await import("node:module")).createRequire(import.meta.url);
const __filename = /* @__PURE__ */ (await import("node:url")).fileURLToPath(import.meta.url);
const __dirname = /* @__PURE__ */ (await import("node:path")).dirname(__filename);`,
      };
    }

    if (options.format === 'cjs') {
      options.banner = {
        js: `\
export const importMetaUrl = /* @__PURE__ */ require("node:url").pathToFileURL(__filename).toString();`,
      };
      options.define = Object.assign(options.define || {}, {
        'import.meta.url': 'importMetaUrl',
      });
    }
  },
});
