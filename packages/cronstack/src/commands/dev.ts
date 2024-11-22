import chalk from 'chalk';
import { watch } from 'chokidar';
import { Command } from 'commander';
import { CronJob } from 'cron';
import debounce from 'debounce';
import ora from 'ora';
import { z } from 'zod';

import { createHandlePromise, getHandlers, RegisterOptions, registerServices } from '@/lib/handler';
import logger from '@/logger';
import { Service } from '@/typings';
import { handleError } from '@/utils/handle-error';

const LOADED_JOBS = new Map<string, CronJob>();

const devOptions = z.object({
  timeZone: z.string().default('UTC'),
  cwd: z.string().default(process.cwd()),
  services: z.array(z.string()).default([]),
  runOnce: z.boolean().default(false),
  onceNow: z.boolean().default(false)
});

type DevOptions = z.infer<typeof devOptions>;

export const dev = new Command()
  .command('dev')
  .description('Start services in development mode')
  .argument('[services...]', 'service names to start', [])
  .option('--time-zone <timeZone>', 'the time zone to use. defaults to "UTC".', 'UTC')
  .option('--once, --run-once', 'Run services once and exit. useful for testing.')
  .option('--once-now', 'Run services once immediately and exit. useful for testing.')
  .option(
    '-c, --cwd <cwd>',
    'the working directory. defaults to the current directory.',
    process.cwd()
  )
  .action(async (services, opts) => {
    logger.log('');

    try {
      const options = devOptions.parse({
        ...opts,
        services
      });

      const { NODE_ENV } = process.env;
      if (!NODE_ENV) {
        process.env['NODE_ENV'] = 'development';
      }

      const startTime = new Date().getTime();
      const isOneTime = options.runOnce || options.onceNow;

      const progress = ora('Compiling services.').start();
      const handlers: Service[] = await getHandlers({
        cwd: options.cwd,
        services: options.services
      });

      if (handlers.length === 0) {
        logger.log(
          logger.red('[error]'),
          `No services found in ${chalk.bold(options.cwd)} directory.`
        );
        process.exitCode = 1;
        return;
      }

      progress.succeed(`Compiled ${chalk.bold(handlers.length)} services.`);

      // if options.onceNow is true, run handlers on parallel and exit
      if (options.onceNow) {
        const promises = handlers.map(createHandlePromise);
        await Promise.all(promises);
        process.exit(0);
      }

      progress.start('Registering services.');
      await runJobs({
        services: handlers,
        timeZone: options.timeZone,
        once: isOneTime
      });

      if (!isOneTime) {
        watch(['services/**/*.{ts,js}', 'src/services/**/*.{ts,js}'], {
          cwd: options.cwd,
          ignoreInitial: true
        }).on('all', (eventName) => {
          if (eventName === 'add' || eventName === 'unlink' || eventName === 'change') {
            handleOnChange(options);
          }
        });
      }

      const elapsed = new Date().getTime() - startTime;
      progress.succeed(
        `Registered ${chalk.bold(LOADED_JOBS.size)} jobs in ${chalk.bold(elapsed)}ms.`
      );
      logger.log('');
    } catch (e) {
      handleError(e);
    }
  });

const ON_CHANGE_PROGRESS = ora();

const handleOnChange = debounce(async (options: DevOptions) => {
  logger.log(logger.highlight('[notice]'), 'Change detected. Reloading services.');

  for (const job of LOADED_JOBS.values()) {
    job.stop();
  }

  // wait till all jobs are stopped
  await new Promise((resolve) => {
    const interval = setInterval(() => {
      if (LOADED_JOBS.size === 0) {
        clearInterval(interval);
        return resolve(null);
      }

      for (const [name, job] of LOADED_JOBS.entries()) {
        if (job.running) {
          return;
        }
        LOADED_JOBS.delete(name);
      }
    }, 100);
  });

  try {
    ON_CHANGE_PROGRESS.start('Compiling services.');
    const handler = await getHandlers({
      cwd: options.cwd,
      services: options.services,
      failOnError: false
    });

    ON_CHANGE_PROGRESS.start('Reloading services.');
    await runJobs({
      services: handler,
      timeZone: options.timeZone,
      once: false
    });

    ON_CHANGE_PROGRESS.succeed(`Reloaded ${chalk.bold(LOADED_JOBS.size)} jobs.`);
  } catch (_) {
    logger.log('');
    ON_CHANGE_PROGRESS.start('Waiting for changes.');
  }
}, 100);

async function runJobs(options: RegisterOptions) {
  const newJobs = await registerServices(options);
  for (const [name, job] of newJobs.entries()) {
    job.start();
    LOADED_JOBS.set(name, job);
  }
  if (options.once) {
    setInterval(() => {
      for (const [name, job] of LOADED_JOBS.entries()) {
        if (!job.running) {
          LOADED_JOBS.delete(name);
        }
      }
      if (LOADED_JOBS.size === 0) {
        process.exit(0);
      }
    }, 1000);
  }
}

process.on('SIGTERM', function () {
  logger.log('SIGTERM received. Exiting...');

  for (const job of LOADED_JOBS.values()) {
    job.stop();
  }

  LOADED_JOBS.clear();

  logger.log('');
  process.exit(0);
});
