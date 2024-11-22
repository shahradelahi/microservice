import type { CronTime } from 'cron';

export interface Service {
  name: string;
  interval: CronTime | string;
  running?: boolean;
  preventOverlapping?: boolean;
  verbose?: boolean;
  handle: () => Promise<void>;
}
