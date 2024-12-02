import { promises } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { z } from 'zod';

import { BUILD_OUTPUT_DIR } from '@/constants';
import { getHandlerPaths } from '@/lib/service-finder';
import { transpile } from '@/lib/transpile';
import logger from '@/logger';
import { fsAccess } from '@/utils/fs-extra';
import { getModuleType } from '@/utils/get-package-info';
import { handleError } from '@/utils/handle-error';
import { randomString } from '@/utils/random';

export const build = new Command()
  .command('build')
  .description('Build all services')
  .option(
    '-c, --cwd <cwd>',
    'the working directory. defaults to the current directory.',
    process.cwd()
  )
  .action(async (opts) => {
    logger.log('');

    try {
      const options = z
        .object({
          cwd: z.string().default(process.cwd()),
        })
        .parse({
          ...opts,
        });

      const startTime = new Date().getTime();
      const progress = ora('Compiling services.').start();

      const buildDir = path.join(options.cwd, BUILD_OUTPUT_DIR);
      if (fsAccess(buildDir)) {
        await promises.rm(buildDir, { recursive: true });
      }

      const format = await getModuleType();

      const rawPaths = await getHandlerPaths(options.cwd);

      if (rawPaths.length === 0) {
        logger.error(`No services found in ${chalk.bold(options.cwd)} directory.`);
        process.exitCode = 1;
        return;
      }

      // transpile handlers
      const { error } = await transpile({
        entryPoints: rawPaths.map((handler) => handler.path),
        outdir: buildDir,
        format,
        minify: true,
        sourcemap: false,
      });

      if (error) {
        handleError(error);
      }

      const buildId = getBuildId();
      await promises.writeFile(path.join(buildDir, 'BUILD_ID'), buildId);

      const elapsed = new Date().getTime() - startTime;
      progress.succeed(`All services compiled in ${elapsed}ms.`);
      logger.log('');
    } catch (e) {
      handleError(e);
    }
  });

function getBuildId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const id = randomString(8, chars);
  if (id[0]!.match(/[0-9]/)) {
    return getBuildId();
  }
  return `${id}-${randomString(4, chars)}`;
}
