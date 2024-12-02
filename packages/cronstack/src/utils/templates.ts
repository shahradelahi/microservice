import cronstrue from 'cronstrue';

import { PACKAGE_NAME } from '@/constants';

export const MICROSERVICE = `import { defineService } from '${PACKAGE_NAME}';

export default defineService({
  name: '%NAME%',
  interval: '%INTERVAL%', // %HUMAN_INTERVAL%
  run: function () {
    console.log('Hello from %NAME% microservice!');
  },
});`;

export function namedMicroservice(name: string, interval: string = '*/10 * * * * *'): string {
  return MICROSERVICE.replace(/%NAME%/g, name)
    .replace(/%INTERVAL%/g, interval)
    .replace(/%HUMAN_INTERVAL%/g, cronstrue.toString(interval));
}
