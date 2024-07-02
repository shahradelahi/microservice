import path from 'node:path';

import { HandlerPath } from '@/lib/handler';
import { fsAccess } from '@/utils/fs-extra';
import {
  readDirectory,
  readDirectoryFiles,
  separateFilesAndDirectories
} from '@/utils/read-directory-files';

/**
 * Get all handler file paths.
 *
 * @param cwd
 * @param serviceDir The directory where the services are located. Defaults to `services`.
 */
export async function getHandlerPaths(cwd: string, serviceDir?: string): Promise<HandlerPath[]> {
  if (serviceDir === undefined) {
    const isSrcDir = fsAccess(path.join(cwd, 'src', 'services'));
    const isServicesDir = fsAccess(path.join(cwd, 'services'));
    if (isSrcDir && isServicesDir) {
      throw new Error(
        'Both "src/services" and "services" directories exist. Please rename one of them to avoid conflicts.'
      );
    }

    serviceDir = isSrcDir ? 'src/services' : 'services';
  }

  const handlerPath = path.join(cwd, serviceDir);

  const { data: contents, error } = await readDirectory(handlerPath);
  if (!contents || error) {
    throw new Error(`Failed to read directory ${handlerPath}`);
  }

  const { files, directories } = separateFilesAndDirectories(contents || []);

  const paths: HandlerPath[] = [];

  // FILE_BASED
  for (const file of files) {
    if (isFileBasedHandler(file.basename)) {
      paths.push({
        name: readNameOfFileBasedHandler(file.basename) || file.basename,
        path: file.path
      });
    }
  }

  for (const directory of directories) {
    const { data: files, error } = await readDirectoryFiles(directory.path);
    if (!files || error) {
      throw new Error(`Failed to read directory ${directory.path}`);
    }

    // DIRECTORY_BASED
    for (const file of files) {
      const filename = path.basename(file);
      if (isDirectoryBasedHandler(filename)) {
        paths.push({
          name: directory.basename,
          path: file
        });
      } else if (isFileBasedHandler(file)) {
        paths.push({
          name: readNameOfFileBasedHandler(file) || filename,
          path: file
        });
      }
    }

    // loop through subdirectories
    const subdirectories = await getHandlerPaths(directory.path, '');
    paths.push(...subdirectories);
  }

  return paths;
}

const FILE_BASED_HANDLER_REGEX = /^\+([a-z0-9-]+)\.service\.(ts|js)$/i;

const DIRECTORY_BASED_HANDLER_REGEX = /^\+service\.(ts|js)$/i;

function isFileBasedHandler(handlerPath: string) {
  return FILE_BASED_HANDLER_REGEX.test(handlerPath);
}

function isDirectoryBasedHandler(handlerPath: string) {
  return DIRECTORY_BASED_HANDLER_REGEX.test(path.basename(handlerPath));
}

function readNameOfFileBasedHandler(handlerPath: string) {
  const match = handlerPath.match(FILE_BASED_HANDLER_REGEX);
  if (!match || match[1] === undefined) {
    return;
  }
  return match[1].toString();
}
