import { promises } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { CronJob, CronTime } from 'cron';
import type { BuildOptions } from 'esbuild';

import { BUILD_OUTPUT_DIR } from '@/constants';
import { getHandlerPaths } from '@/lib/service-finder';
import { transpileFile } from '@/lib/transpile';
import logger from '@/logger';
import type { Service } from '@/typings';
import { fsAccess } from '@/utils/fs-extra';
import { getModule } from '@/utils/get-module';
import { getModuleType } from '@/utils/get-package-info';
import { sendError } from '@/utils/handle-error';

type TranspiledHandler = {
  filePath: string;
  name: string;
};

export async function getHandlerInstance({ filePath, name }: TranspiledHandler): Promise {
  const module = await getModule(filePath);
  let handler: ((...args: unknown[]) => any) | undefined;

  if ('default' in module) {
    handler = module['default'];
  } else if ('handler' in module) {
    handler = module['handler'];
  }

  if (!handler) {
    throw new Error(
      `Handler not found in ${filePath}. Handlers must be exported as default or "handler".`
    );
  }

  if (typeof handler !== 'function') {
    throw new Error(`Handler ${filePath} is not a function`);
  }

  return {
    name,
    handle: handler,
    ...(module['config'] || {}),
  };
}

type GetHandlerOptions = Omit & {
  cwd: string;
};

export async function getHandlers(opts: GetHandlerOptions): Promise {
  const { cwd, failOnError, services, ...options } = opts;

  const outDir = path.join(cwd, BUILD_OUTPUT_DIR);
  if (fsAccess(outDir)) {
    await promises.rm(outDir, { recursive: true });
  }

  const format = await getModuleType();
  let entryPaths = await getHandlerPaths(cwd);

  if (Array.isArray(services) && services.length > 0) {
    entryPaths = entryPaths.filter((handler) => services.includes(handler.name));
  }

  entryPaths = entryPaths.filter((handler) => fsAccess(handler.path)); // filter out non-existent files

  // transpile handlers
  const { error } = await transpileFile({
    outdir: outDir,
    entryPoints: entryPaths.map((handler) => handler.path),
    format,
    ...options,
  });

  if (failOnError !== false && error) {
    throw error;
  }

  const transpiledHandlers = await getHandlerPaths(outDir, '');

  const modulePaths = transpiledHandlers.map((handler) => ({
    filePath: handler.path,
    name: handler.name,
  }));

  const handlers: Service[] = [];
  for (const modulePath of modulePaths) {
    const handler = await getHandlerInstance(modulePath);
    handlers.push(handler);
  }

  return handlers;
}

type TranspileServicesOptions = Pick & {
  cwd: string;
  outDir: string;
  services?: string[];
  failOnError?: boolean;
};

export type HandlerPath = {
  path: string;
  name: string;
};

export type RegisterOptions = {
  services: Service[];
  once?: boolean;
  timeZone?: string;
};

export async function registerServices(options: RegisterOptions) {
  const { services, ...opts } = options;

  const jobs: Map = new Map();

  for (const service of services) {
    if (jobs.has(service.name)) {
      logger.log(
        logger.yellow('[warn]'),
        `Job "${chalk.bold(
          service.name
        )}" not registered because another job with the same name already exists.`
      );
      continue;
    }

    const handleTick = async () => {
      if (service.preventOverlapping && service.running) {
        if (service.verbose) {
          logger.log(
            logger.yellow('[warn]'),
            `Job "${chalk.bold(service.name)}" skipped because it is already running.`
          );
        }
        return;
      }

      service.running = true;

      await Promise.resolve(createHandlePromise(service));

      if (service.preventOverlapping) {
        service.running = false;
      }
    };

    const job: CronJob = new CronJob('* * * * *', handleTick, null, false, opts.timeZone);
    job.addCallback(() => {
      // if opts.once is true, stop the job
      if (opts.once) {
        job.stop();
      }
    });

    const { interval } = service;
    if (interval instanceof CronTime) {
      job.setTime(interval);
    } else if (typeof (interval as any) === 'string') {
      job.setTime(new CronTime(interval));
    } else {
      throw new Error(
        `Invalid interval type "${typeof service.interval}" for job "${service.name}"`
      );
    }

    jobs.set(service.name, job);
  }

  return jobs;
}

export function createHandlePromise(handler: Service) {
  return new Promise<void>((resolve) => {
    if (handler.verbose) {
      logger.log(chalk.cyan('[info]'), chalk.gray(`[${handler.name}]`), `Job has started.`);
    }
    handler
      .handle()
      .then(() => {
        if (handler.verbose) {
          logger.log(
            chalk.green('[success]'),
            chalk.gray(`[${handler.name}]`),
            `Job has completed.`
          );
        }
        resolve();
      })
      .catch((err) => {
        logger.log(chalk.red('[error]'), chalk.gray(`[${handler.name}]`), `Job has crashed.`);
        sendError(err);
      })
      .finally(resolve);
  });
}
