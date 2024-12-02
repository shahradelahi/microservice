import Module from 'module';
import { isAbsolute, resolve } from 'node:path';
import fg from 'fast-glob';
import MicroMatch from 'micromatch';

import { debouncePromise } from '@/utils/debounce';
import { getModuleType } from '@/utils/get-package-info';

const require = Module.createRequire(import.meta.url);

export async function getModule<T = any>(modulePath: string): Promise<T> {
  const absPath = isAbsolute(modulePath) ? modulePath : resolve(process.cwd(), modulePath);
  return dynamicImport(absPath);
}

export async function dynamicImport(module: string): Promise<any> {
  const format = await getModuleType();
  if (format === 'cjs') {
    return require(module);
  }
  return import(module);
}

export async function isResolvableModule(modulePath: string): Promise<boolean> {
  const resolved = await dynamicImport(modulePath)
    .then(() => true)
    .catch(() => false);

  return Boolean(resolved);
}

const CACHE_GLOB = new Map<string, string[]>();

async function getGlob(pattern: string): Promise<string[]> {
  const cached = CACHE_GLOB.get(pattern);
  if (cached) {
    return cached;
  }
  const files = await fg(pattern, { onlyDirectories: true });
  CACHE_GLOB.set(pattern, files);
  return files;
}

export const dumpCache = debouncePromise(
  async () => {
    CACHE_GLOB.clear();
  },
  2000,
  () => {}
);

/**
 * Check if a module is a node_module
 * @param module
 */
export async function isNodeModule(module: string): Promise<boolean> {
  const paths = await getGlob('node_modules/**');
  dumpCache();

  if (isAbsolute(module)) {
    return module.startsWith(resolve('node_modules'));
  }

  return MicroMatch.isMatch(`node_modules/${module}`, paths);
}
