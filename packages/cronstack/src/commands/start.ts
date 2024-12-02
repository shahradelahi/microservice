import { Command } from 'commander';
import ora from 'ora';
import { z } from 'zod';

import { BUILD_OUTPUT_DIR, PACKAGE_NAME } from '@/constants';
import { getServiceInstances, registerServices } from '@/lib/handler';
import { getHandlerPaths } from '@/lib/service-finder';
import logger from '@/logger';
import { handleError } from '@/utils/handle-error';

export const start = new Command()
  .command('start')
  .description('Start all services')
  .argument('[services...]', 'service names to start', [])
  .option('--time-zone <timeZone>', 'the time zone to use. defaults to "UTC".', 'UTC')
  .option('--once, --run-once', 'Run services once and exit. useful for testing.')
  .option('--once-now', 'Run services once immediately and exit. useful for testing.')
  .option(
    '-c, --cwd <cwd>',
    'the working directory. defaults to the current directory.',
    process.cwd()
  )
  .action(async (serviceNames, opts) => {
    logger.log('');

    try {
      const options = z
        .object({
          timeZone: z.string().default('UTC'),
          cwd: z.string().default(process.cwd()),
          serviceNames: z.array(z.string()).default([]),
          runOnce: z.boolean().default(false),
          onceNow: z.boolean().default(false),
        })
        .parse({
          serviceNames,
          ...opts,
        });

      const startTime = new Date().getTime();
      const progress = ora('Registering services').start();

      let rawPaths = await getHandlerPaths(options.cwd, BUILD_OUTPUT_DIR);
      if (options.serviceNames.length > 0) {
        rawPaths = rawPaths.filter((handler) => options.serviceNames.includes(handler.name));
      }

      if (rawPaths.length === 0) {
        logger.error(
          `No services found. Make sure you run ${logger.yellow(`${PACKAGE_NAME} build`)} first.`
        );
        process.exitCode = 1;
        return;
      }

      if (Array.isArray(options.serviceNames) && options.serviceNames.length > 0) {
        rawPaths = rawPaths.filter((handler) => options.serviceNames.includes(handler.name));
      }

      const services = await getServiceInstances(rawPaths);

      // register handlers
      const jobs = await registerServices({
        services: services,
        timeZone: options.timeZone,
        once: options.runOnce || options.onceNow,
      });
      for (const { cron } of jobs.values()) {
        cron.start();
      }

      const elapsed = new Date().getTime() - startTime;
      progress.succeed(`All services registered in ${elapsed}ms`);
      logger.log('');
    } catch (e) {
      handleError(e);
    }
  });
