import { expect } from 'chai';

import { fsAccess } from '@/utils/fs-extra';
import { readDirectory } from '@/utils/read-directory-files';

describe('utils', () => {
  it('should read directory files', async () => {
    const res = await readDirectory('.');
    expect(res.data).to.be.an('array');
    expect(res.data!.find((x) => x.basename === 'node_modules')).to.not.be.undefined;
  });

  it('should check if a file exists', async () => {
    const res = fsAccess('.');
    expect(res).to.be.true;
  });
});
