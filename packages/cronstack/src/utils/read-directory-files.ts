import { promises } from 'node:fs';
import { basename, resolve } from 'node:path';
import { trySafe } from 'p-safe';

export type Content = {
  type: 'file' | 'directory';
  basename: string;
  path: string;
};

export async function readDirectory(
  path: string,
  { recursive = false }: { recursive?: boolean } = {}
) {
  return trySafe<Content[]>(async () => {
    const fileNames = await promises.readdir(path); // returns a JS array of just short/local file-names, not paths.
    const filePaths = fileNames.map((fn) => resolve(path, fn));

    const contents: Content[] = [];
    for (const filePath of filePaths) {
      const stats = await promises.stat(filePath);
      if (stats.isDirectory()) {
        contents.push({ type: 'directory', basename: basename(filePath), path: filePath });

        if (recursive) {
          const directoryContents = await readDirectory(filePath, { recursive });
          if (directoryContents.error) {
            throw directoryContents.error;
          }
          contents.push(...directoryContents.data);
        }
      } else if (stats.isFile()) {
        contents.push({ type: 'file', basename: basename(filePath), path: filePath });
      }
    }

    return { data: contents };
  });
}

export async function readDirectoryFiles(directoryPath: string) {
  return trySafe<string[]>(async () => {
    const contents = await readDirectory(directoryPath);
    if (contents.error) {
      return { error: contents.error };
    }

    const files = (contents.data || [])
      .filter((content) => content.type === 'file')
      .map((content) => content.path);

    return { data: files };
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
