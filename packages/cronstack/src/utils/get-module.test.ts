import { resolve } from 'node:path';
import { expect } from 'chai';

import { isNodeModule, isResolvableModule } from '@/utils/get-module';

describe('isNodeModule', () => {
  it('"typescript" is in node_modules', async () => {
    const res = await isNodeModule('typescript');
    expect(res).to.be.true;
  });
  it('"./time.js" in not in node_modules', async () => {
    const res = await isNodeModule('./time.js');
    expect(res).to.be.false;
  });
  it('"./time.js" with base "./node_modules/cron/dist" is in node_modules', async () => {
    const res = await isNodeModule(resolve('./node_modules/cron/dist/time.js'));
    expect(res).to.be.true;
  });
  it('"./node_modules/cron/dist/time.js" is in node_modules', async () => {
    const res = await isNodeModule(resolve('./node_modules/cron/dist/time.js'));
    expect(res).to.be.true;
  });
});

describe('isResolvableModule', () => {
  it('"typescript" module is resolvable', async () => {
    const res = await isResolvableModule('typescript');
    expect(res).to.be.true;
  });
  it('"./time.js" module is not resolvable', async () => {
    const res = await isResolvableModule('./time.js');
    expect(res).to.be.false;
  });
});
