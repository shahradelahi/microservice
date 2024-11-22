import path from 'node:path';
import { CronTime } from 'cron';
import deepmerge from 'deepmerge';

import { Service } from '@/typings';

export interface ServiceOptions {
  name?: string;
  interval: CronTime | string;
  preventOverlapping?: boolean;
  verbose?: boolean;
}

export function createConfig(options: ServiceOptions): Service {
  return deepmerge(
    {
      name: path.basename(path.dirname(process.cwd())),
      preventOverlapping: true,
      running: false,
    },
    options
  ) as Service;
}

// -- Types ---------------------------

export type * from '@/typings';
