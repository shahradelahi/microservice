import { promises } from 'node:fs';
import path from 'node:path';
import { trySafe, type SafeReturn } from 'p-safe';

export type Content = {
  type: 'file' | 'directory';
  basename: string;
  path: string;
};

export async function readDirectory(directoryPath: string): Promise {
  return trySafe(async (resolve) => {
    const fileNames = await promises.readdir(directoryPath); // returns a JS array of just short/local file-names, not paths.
    const filePaths = fileNames.map((fn) => path.join(directoryPath, fn));

    const contents: Content[] = [];
    for (const filePath of filePaths) {
      const stats = await promises.stat(filePath);
      if (stats.isDirectory()) {
        contents.push({ type: 'directory', basename: path.basename(filePath), path: filePath });
      } else if (stats.isFile()) {
        contents.push({ type: 'file', basename: path.basename(filePath), path: filePath });
      }
    }

    return resolve(contents);
  });
}

export async function readDirectoryFiles(directoryPath: string): Promise {
  return trySafe(async (resolve, reject) => {
    const contents = await readDirectory(directoryPath);
    if (contents.error) {
      return reject(contents.error);
    }

    const files = (contents.data || [])
      .filter((content) => content.type === 'file')
      .map((content) => content.path);

    return resolve(files);
  });
}

export function separateFilesAndDirectories(contents: Content[]): {
  files: Content[];
  directories: Content[];
} {
  const [files, directories] = contents.reduce(
    (acc, content) => {
      if (content.type === 'file') {
        acc[0].push(content);
      } else if (content.type === 'directory') {
        acc[1].push(content);
      }
      return acc;
    },
    [[], []] as [typeof contents, typeof contents]
  );

  return { files, directories };
}
