import process from 'node:process';
import chalk from 'chalk';
import { Command } from 'commander';
import fg from 'fast-glob';
import lodash from 'lodash';
import ora from 'ora';
import { z } from 'zod';

import { BUILD_OUTPUT_DIR } from '@/constants';
import { getServices, RegisterOptions, registerServices } from '@/lib/handler';
import { Service } from '@/lib/service';
import logger from '@/logger';
import { debouncePromise } from '@/utils/debounce';
import { handleError } from '@/utils/handle-error';

const LOADED_JOBS = new Map<string, Service>();

const devOptions = z.object({
  timeZone: z.string().default('UTC'),
  cwd: z.string().default(process.cwd()),
  services: z.array(z.string()).default([]),
  runOnce: z.boolean().default(false),
  onceNow: z.boolean().default(false),
  watch: z.boolean().default(false),
});

type DevOptions = z.infer<typeof devOptions>;

export const dev = new Command()
  .command('dev')
  .description('Start services in development mode')
  .argument('[services...]', 'service names to start', [])
  .option('--time-zone <timeZone>', 'the time zone to use. defaults to "UTC".', 'UTC')
  .option('--once, --run-once', 'Run services once and exit. useful for testing.')
  .option('--once-now', 'Run services once immediately and exit. useful for testing.')
  .option('--watch', 'Watch for changes and restart services.')
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
        services,
      });

      if (!process.env['NODE_ENV']) {
        process.env['NODE_ENV'] = 'development';
      }

      const startTime = new Date().getTime();
      const isOneTime = options.runOnce || options.onceNow;

      if (isOneTime && options.watch) {
        logger.error(`Cannot use --watch option with run-once options.`);
        process.exitCode = 1;
        return;
      }

      const progress = ora('Compiling services.').start();
      const handlers = await getServices({
        cwd: options.cwd,
        services: options.services,
        sourcemap: true,
      });

      if (handlers.length === 0) {
        logger.error(`No services found in ${chalk.bold(options.cwd)} directory.`);
        process.exitCode = 1;
        return;
      }

      progress.succeed(`Compiled ${chalk.bold(handlers.length)} services.`);

      // if options.onceNow is true, run handlers on parallel and exit
      if (options.onceNow) {
        const promises = handlers.map((handler) => handler.dispatch());
        await Promise.all(promises);
        process.exit(0);
      }

      progress.start('Registering services.');
      await runJobs({
        services: handlers,
        timeZone: options.timeZone,
        once: isOneTime,
      });

      const elapsed = new Date().getTime() - startTime;
      progress.succeed(
        `Registered ${chalk.bold(LOADED_JOBS.size)} jobs in ${chalk.bold(elapsed)}ms.`
      );

      printJobs();

      if (options.watch) await startWatcher(options);

      process.on('exit', gracefulExit);
    } catch (e) {
      handleError(e);
    }
  });

const ON_CHANGE_PROGRESS = ora();

const startWatcher = async (options: DevOptions) => {
  const { watch } = await import('chokidar');

  const watchPaths = ['**/+*.service.{ts,js}'];
  const ignored = [`**/{.git,node_modules,${BUILD_OUTPUT_DIR}}/**`];

  logger.info(
    `Watching for changes in ${Array.from(watchPaths)
      .map((v) => `"${v}"`)
      .join(' | ')}`
  );

  logger.info(
    `Ignoring changes in  ${Array.from(ignored)
      .map((v) => `"${v}"`)
      .join(' | ')}`
  );

  const watcher = watch(await fg.glob(watchPaths), {
    ignored,
    ignoreInitial: true,
    ignorePermissionErrors: true,
    cwd: options.cwd,
  });

  const SERVICE_FILE_PATTERN = /\/+([a-z0-9-]+)\.service\.(ts|js)$/i;

  watcher.on('all', (event, file) => {
    logger.info(`Change detected: ${event} "${file}"`);

    if (SERVICE_FILE_PATTERN.test(file)) {
      if (event === 'unlink') {
        watcher.unwatch(file);
      } else if (event === 'add') {
        watcher.add(file);
      }
    }

    debouncedChange(options);
  });
};

const debouncedChange = debouncePromise(
  async (options: DevOptions) => {
    // Wait till all jobs are stopped
    await waitJobsForStop(true);

    ON_CHANGE_PROGRESS.start('Compiling services.');
    const handler = await getServices({
      cwd: options.cwd,
      services: options.services,
      sourcemap: true,
      failOnError: false,
    });

    ON_CHANGE_PROGRESS.start('Reloading services.');
    await runJobs({
      services: handler,
      timeZone: options.timeZone,
      once: false,
    });

    ON_CHANGE_PROGRESS.succeed(`Reloaded ${chalk.bold(LOADED_JOBS.size)} jobs.`);

    printJobs();
  },
  100,
  (err) => {
    handleError(err);
    logger.log('');
    ON_CHANGE_PROGRESS.start('Waiting for changes.');
  }
);

async function waitJobsForStop(verbose: boolean) {
  for (const service of LOADED_JOBS.values()) {
    service.stop();
  }

  return new Promise((resolve) => {
    const start = Date.now();
    const loggedWaiting = new Set<string>();
    const interval = setInterval(() => {
      if (LOADED_JOBS.size === 0) {
        clearInterval(interval);
        return resolve(null);
      }

      for (const [name, job] of LOADED_JOBS.entries()) {
        if (job.running) {
          if (verbose && !loggedWaiting.has(name) && Date.now() - start > 5000) {
            loggedWaiting.add(name);
            logger.info(`Waiting for ${chalk.bold(name)} for graceful shutdown...`);
          }

          return;
        }

        LOADED_JOBS.delete(name);
      }
    }, 100);
  });
}

function gracefulExit() {
  for (const service of LOADED_JOBS.values()) {
    service.stop();
  }

  logger.log();

  if (isAnyJobRunning()) {
    logger.info(`Received ${chalk.bold('EXIT')} signal, Waiting for graceful shutdown...`);
    const start = Date.now();

    while (throttledIsAnyJobRunning()) {
      // If it was a minute passed and still there are jobs running,
      // then become terminator and kill them all
      if (Date.now() - start > 60000) {
        for (const service of LOADED_JOBS.values()) {
          logger.warn(`Killing ${chalk.bold(service.name)}...`);
          service.subprocess?.kill('SIGKILL');
        }
        break;
      }
    }
  }

  logger.info('Exiting...');
  process.exit();
}

function isAnyJobRunning() {
  for (const service of LOADED_JOBS.values()) {
    if (service.isRunning()) {
      return true;
    }
  }
  return false;
}

const throttledIsAnyJobRunning = lodash.throttle(isAnyJobRunning, 100);

async function runJobs(options: RegisterOptions) {
  LOADED_JOBS.clear();
  const newJobs = await registerServices(options);
  for (const service of newJobs.values()) {
    LOADED_JOBS.set(service.name, service);
    service.cron.start();
  }
}

function printJobs() {
  logger.log();
  logger.log('╭', chalk.green('⏲️'), 'Service Schedule:');
  logger.log('│');

  const services = Array.from(LOADED_JOBS.values()).sort((a, b) => a.name.localeCompare(b.name));
  const largestName = Math.max(...services.map((v) => String(v.name).length));
  const largestInterval = Math.max(...services.map((v) => String(v.interval).length));

  for (const service of services) {
    // <NAME>   <INTERVAL> (Next: <NEXT_RUN>)
    // JobName   Interval  (Next: NextRun)
    const name = `${chalk.bold(service.name)}${' '.repeat(largestName - service.name.length)}`;
    const interval = `${chalk.gray(service.interval)}${' '.repeat(largestInterval - String(service.interval).length)}`;
    const nextRun = chalk.gray(service.cron.nextDate().toRelative());
    const isLastJob = service === services[services.length - 1];
    logger.log(`${isLastJob ? '╰' : '├'} ${name}  ${interval} (Next: ${nextRun})`);
  }
  logger.log();
}
