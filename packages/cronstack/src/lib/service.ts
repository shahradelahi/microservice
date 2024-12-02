import { fork, type ChildProcess } from 'node:child_process';
import chalk from 'chalk';
import { CronJob, CronTime } from 'cron';
import cronstrue from 'cronstrue';
import { parse } from 'error-serializer';

import logger from '@/logger';
import type { MaybePromise, ServiceOptions } from '@/typings';
import { getModule } from '@/utils/get-module';
import { sendError } from '@/utils/handle-error';

export class Service implements ServiceOptions {
  name: string;
  modulePath: string;

  subprocess?: ChildProcess;
  running?: boolean;
  cron: CronJob;

  interval: CronTime | string;
  humanInterval: string;
  preventOverlapping: boolean;

  stdio: 'inherit' | 'ignore';
  timeout: number;
  verbose: boolean;

  run(): MaybePromise<any> {
    throw new Error('Method not implemented.');
  }

  cancel(_reason?: string) {}

  isRunning() {
    if (this.subprocess) {
      const killed = this.subprocess.killed;
      if (killed) {
        this.subprocess = undefined;
        this.running = false;
      }
      return !killed;
    }

    return this.cron.running;
  }

  stop() {
    this.cron.stop();
    this.subprocess?.kill('SIGINT');
  }

  constructor(name: string, modulePath: string, options: ServiceOptions) {
    this.name = name;
    this.modulePath = modulePath;

    this.interval = options.interval;
    this.preventOverlapping = options.preventOverlapping ?? true;
    this.stdio = options.stdio ?? 'inherit';
    this.timeout = options.timeout ?? 0;
    this.verbose = options.verbose ?? false;

    this.run = options.run;

    this.cron = new CronJob(
      '* * * * *',
      async () => {
        if (this.preventOverlapping && this.running) {
          if (this.verbose) {
            logger.warn(`Job "${chalk.bold(this.name)}" skipped because it is already running.`);
          }
          return;
        }

        await this.dispatch();
      },
      null,
      false
    );

    if (this.interval instanceof CronTime) {
      this.cron.setTime(this.interval);
    } else if (typeof (this.interval as unknown) === 'string') {
      this.cron.setTime(new CronTime(this.interval));
    } else {
      throw new Error(`Invalid interval type "${typeof this.interval}" for job "${this.name}"`);
    }

    this.humanInterval = cronstrue.toString(this.cron.cronTime.toString());
  }

  static async loadFrom(name: string, path: string) {
    const module = await getModule(path);
    const options: ServiceOptions | undefined = module['default'];

    if (!options) {
      throw new Error(
        `No service not found in ${path}. Services must be created using "defineService" function and exported as "default".`
      );
    }

    if (
      typeof options !== 'object' ||
      (typeof options === 'object' && typeof options['run'] !== 'function')
    ) {
      throw new Error(`Service in ${path} is not a valid.`);
    }

    return new Service(name, path, options);
  }

  async dispatch(): Promise<void> {
    this.running = true;
    const controller = new AbortController();
    this.cancel = (reason?: string) => controller.abort(reason);

    try {
      const nodeOptions = new Set((process.env['NODE_OPTIONS'] ?? '').split(' '));
      nodeOptions.add('--no-warnings');
      const subprocess = fork(this.modulePath, ['-child'], {
        signal: controller.signal,
        env: Object.assign(process.env, {
          NODE_OPTIONS: Array.from(nodeOptions).join(' '),
          CRONSTACK_SERVICE_NAME: this.name,
          CRONSTACK_MODULE_PATH: this.modulePath,
        }),
        detached: false,
        stdio: this.stdio ?? 'inherit',
      });

      this.subprocess = subprocess;

      const promise = new Promise<void>((resolve) => {
        if (this.verbose) {
          logger.info(chalk.gray(`[${this.name}]`), `Job has started.`);
        }

        const resolveThis = () => {
          subprocess?.kill();
          resolve();
        };

        const handleError = (err: Error) => {
          logger.error(chalk.gray(`[${this.name}]`), `Job has crashed.`);
          sendError(err);
          resolveThis();
        };

        subprocess.once('error', handleError);

        subprocess.once('message', (msg: { success: boolean; error?: any }) => {
          if (msg.success) {
            if (this.verbose) {
              logger.success(chalk.gray(`[${this.name}]`), `Job has completed.`);
            }
            return resolveThis();
          }

          if (msg.error) {
            handleError(parse(msg.error));
          }
        });
      });

      if (!this.timeout) {
        await promise;
      } else {
        await Promise.race([
          promise,
          new Promise((resolve) => {
            setTimeout(() => {
              this.running = false;
              this.cancel(`Timeout! Execution took longer than ${this.timeout}ms`);
              resolve(null);
            }, this.timeout);
          }),
        ]);
      }
    } finally {
      this.running = false;
      this.subprocess = undefined;
    }
  }
}
