import Module from 'module';
import path from 'node:path';

import { getModuleType } from '@/utils/get-package-info';

const require = Module.createRequire(import.meta.url);

export async function getModule<T = any>(modulePath: string): Promise {
  const absolutePath = path.isAbsolute(modulePath)
    ? modulePath
    : path.resolve(process.cwd(), modulePath);

  const format = await getModuleType();
  if (format === 'cjs') {
    return require(absolutePath);
  }

  return import(`${absolutePath}?_t=${Date.now()}`);
}
