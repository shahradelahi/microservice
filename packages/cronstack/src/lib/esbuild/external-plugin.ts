import { match } from 'bundle-require';
import { type Plugin } from 'esbuild';

// Must not start with "/" or "./" or "../" or "C:\" or be the exact strings ".." or "."
const NON_NODE_MODULE_RE = /^[A-Z]:[/\\]|^\.{0,2}\/|^\.{1,2}$/;

export const externalPlugin = ({
  external,
  noExternal,
}: {
  external?: (string | RegExp)[];
  noExternal?: (string | RegExp)[];
}): Plugin => {
  return {
    name: `external`,
    setup(build) {
      build.onResolve({ filter: /.*/ }, async (args) => {
        if (match(args.path, noExternal)) {
          return { external: false };
        }

        if (match(args.path, external)) {
          return { external: true };
        }

        const isDynamicImport = args.kind === 'require-call' || args.kind === 'dynamic-import';
        if (NON_NODE_MODULE_RE.test(args.path) && isDynamicImport) {
          return { external: false };
        }

        // Respect explicit external/noExternal conditions
        return;
      });
    },
  };
};
