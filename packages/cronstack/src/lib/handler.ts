import { promises } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import type { BuildOptions } from 'esbuild';

import { BUILD_OUTPUT_DIR } from '@/constants';
import { Service } from '@/lib/service';
import { getHandlerPaths } from '@/lib/service-finder';
import { transpile } from '@/lib/transpile';
import logger from '@/logger';
import { fsAccess } from '@/utils/fs-extra';
import { getModuleType } from '@/utils/get-package-info';

interface GetHandlerOptions extends Partial<BuildOptions> {
  cwd: string;
  services?: string[];
  failOnError?: boolean;
}

export async function getServiceInstances(handlers: HandlerPath[]): Promise<Service[]> {
  const services: Service[] = [];

  for (const { name, path } of handlers) {
    const service = await Service.loadFrom(name, path);
    services.push(service);
  }

  return services;
}

export async function getServices(opts: GetHandlerOptions): Promise<Service[]> {
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

  if (entryPaths.length === 0) {
    throw new Error(`No services found in "${cwd}" directory.`);
  }

  // transpile handlers
  const { error } = await transpile({
    outdir: outDir,
    entryPoints: entryPaths.map((handler) => handler.path),
    format,
    ...options,
  });

  if (failOnError !== false && error) {
    throw error;
  }

  // Reads from output directory
  const handlers = await getHandlerPaths(outDir, false);

  return await getServiceInstances(handlers);
}

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

  const jobs: Map<string, Service> = new Map();

  for (const service of services) {
    if (jobs.has(service.name)) {
      logger.error(
        `Job "${chalk.bold(
          service.name
        )}" can not be registered because its name is already in use.`
      );
      process.exit(1);
    }

    service.cron.addCallback(() => {
      // if opts.once is true, stop the job
      if (opts.once) {
        service.stop();
      }
    });

    jobs.set(service.name, service);
  }

  return jobs;
}
