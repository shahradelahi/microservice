import type { CronTime } from 'cron';

export interface ServiceOptions {
  name?: string;
  interval: CronTime | string;
  /**
   * In milliseconds the maximum amount of time the process is allowed to run.
   * @default undefined
   */
  timeout?: number;
  preventOverlapping?: boolean;
  verbose?: boolean;
  /**
   * @see https://nodejs.org/api/child_process.html#child_process_options_stdin
   * @default inherit
   */
  stdio?: 'inherit' | 'ignore';
  run: () => MaybePromise<any>;
}

export type MaybePromise<T> = T | Promise<T>;
