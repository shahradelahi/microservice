import chalk from 'chalk';

import logger from '@/logger';

export function handleError(error: unknown) {
  logger.log();

  if (typeof error === 'string') {
    logger.error(error);
    process.exit(1);
  }

  if (error instanceof Error) {
    logger.error(error.message);
    sendError(error);
    process.exit(1);
  }

  logger.error('Something went wrong. Please try again.');
  process.exit(1);
}

/* eslint-disable no-console */
export function sendError(error: any) {
  console.log();
  console.log(chalk.gray('--------------------ERROR--------------------'));
  console.log(error);
  console.log(chalk.gray('--------------------ERROR--------------------'));
  console.log();
}
