import deepmerge from 'deepmerge';
import { serialize } from 'error-serializer';
import sourceMapSupport from 'source-map-support';

import type { ServiceOptions } from '@/typings';

export function defineService(options: ServiceOptions): ServiceOptions {
  const service = deepmerge(
    {
      IS_CRONSTACK_SERVICE: true,
      preventOverlapping: true,
      timeout: undefined,
      running: false,
    },
    options
  ) as ServiceOptions;
  if (process.env['CRONSTACK_SERVICE_NAME'] && process.argv[2] === '-child') {
    service.name = process.env['CRONSTACK_SERVICE_NAME'];
    sourceMapSupport.install();
    Promise.resolve(service.run())
      .then(() => {
        process.send && process.send({ success: true });
        process.exit(0);
      })
      .catch((err) => {
        process.send && process.send({ success: false, error: serialize(err) });
        process.exit(1);
      });
  }
  return service;
}

export { defineConfig, type CronstackConfig } from '@/lib/config';

// -- Types ---------------------------

export type * from '@/typings';
