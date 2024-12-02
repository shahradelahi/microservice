import { promises } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { Command } from 'commander';
import { execa } from 'execa';
import ora from 'ora';
import { z } from 'zod';

import { BUILD_OUTPUT_DIR, PACKAGE_NAME } from '@/constants';
import logger from '@/logger';
import { fsAccess } from '@/utils/fs-extra';
import { getPackageInfo } from '@/utils/get-package-info';
import { getPackageManager } from '@/utils/get-package-manager';
import { handleError } from '@/utils/handle-error';
import { namedMicroservice } from '@/utils/templates';

export const init = new Command()
  .command('init')
  .description('Initialize your project.')
  .option(
    '--nodep',
    'skip installing dependencies. useful if you want to install dependencies yourself.',
    false
  )
  .option(
    '--package-manager <package-manager>',
    'the package manager to use. defaults to the detected package manager.'
  )
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
          nodep: z.boolean().default(false),
          packageManager: z.string().optional(),
          cwd: z.string().default(process.cwd()),
        })
        .parse(opts);

      const cwd = path.resolve(options.cwd);
      const servicesPath = path.join(cwd, 'services');

      if (!fsAccess(servicesPath)) {
        await promises.mkdir(servicesPath);
      }

      const helloPath = path.join(servicesPath, '+hello.service.ts');
      if (!fsAccess(helloPath)) {
        await promises.writeFile(helloPath, namedMicroservice('hello'));
      }

      await updateGitignore();

      // install dependencies
      if (options.nodep) {
        logger.log('');
        logger.log(chalk.yellow('Warning!'), 'Dependencies not installed.');
        logger.log('');
      } else {
        const dependenciesSpinner = ora(`Installing dependencies...`)?.start();

        const packageManager = options.packageManager ?? (await getPackageManager(cwd));

        if (!fsAccess(path.join(cwd, 'package.json'))) {
          await execa(packageManager, [packageManager === 'npm' ? 'init' : 'init', '-y'], {
            cwd: options.cwd,
          });
        }

        await installDeps(options.cwd, false, ['cronstack']);
        await installDeps(options.cwd, true, ['typescript']);

        await addScripts(options.cwd);

        dependenciesSpinner?.succeed('Done!');
        logger.log('');
      }

      logger.log(chalk.green('Success!'), 'Project initialized.');
      logger.log('');
    } catch (e) {
      handleError(e);
    }
  });

async function installDeps(cwd: string, dev: boolean, packages: string[]) {
  const packageManager = await getPackageManager(cwd);

  await execa(
    packageManager,
    [packageManager === 'npm' ? 'install' : 'add', dev ? '-D' : '', ...packages],
    {
      cwd,
    }
  );
}

async function updateGitignore() {
  if (fsAccess('.gitignore')) {
    const gitignore = (await promises.readFile('.gitignore')).toString();
    const hasMicroservice = gitignore.includes(BUILD_OUTPUT_DIR);
    const hasEnv = gitignore.includes('.env');
    if (!hasMicroservice) {
      await promises.appendFile(
        '.gitignore',
        ['', '# CronStack', hasMicroservice ? false : BUILD_OUTPUT_DIR, hasEnv ? false : '.env', '']
          .filter(Boolean)
          .join('\n')
      );
    }
  }
}

async function addScripts(cwd: string) {
  const packageInfo = (await getPackageInfo(cwd)) ?? {};

  const scripts = {
    start: `${PACKAGE_NAME} start`,
    build: `${PACKAGE_NAME} build`,
    dev: `${PACKAGE_NAME} dev`,
  };

  if (!packageInfo?.scripts) {
    packageInfo.scripts = {};
  }

  // if there are already scripts with the same name, add "cronstack" prefix
  let hasConflicts = false;
  for (const scriptName of Object.keys(scripts)) {
    if (packageInfo.scripts[scriptName]) {
      hasConflicts = true;
      break;
    }
  }

  // add scripts
  for (const scriptName of Object.keys(scripts)) {
    packageInfo.scripts[hasConflicts ? `${PACKAGE_NAME}:${scriptName}` : scriptName] =
      packageInfo.scripts[scriptName];
  }

  await promises.writeFile('package.json', JSON.stringify(packageInfo, null, 2) + '\n', 'utf-8');
}
