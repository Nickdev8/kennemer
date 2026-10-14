import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createModuleLoader} from '../scripts/module-loader.mjs';
test('mock bell settings persist without external transport',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'kennemer-mock-bells-'));
 const previous=process.env.KENNEMER_MOCK_STATE_PATH,originalFetch=globalThis.fetch;
 process.env.KENNEMER_MOCK_STATE_PATH=join(directory,'physical.json');let loader;
 try{
  globalThis.fetch=()=>{throw new Error('External request forbidden');};
  loader=await createModuleLoader();const {mockBells}=await loader.ssrLoadModule('/src/lib/server/mock-bells.ts');
  const get=()=>mockBells(new Request('http://localhost/api/bells/config'),'config').then(r=>r.json());
  const initial=await get();assert.equal(initial.preview,false);
  initial.config.gap_seconds=.3;initial.config.bell_duration_seconds=.2;
  const response=await mockBells(new Request('http://localhost/api/bells/config',{method:'POST',body:JSON.stringify({revision:initial.revision,config:initial.config})}),'config');
  assert.equal(response.status,200);
  const saved=await get();assert.equal(saved.config.gap_seconds,.3);assert.equal(saved.config.bell_duration_seconds,.2);assert.equal(saved.revision,initial.revision+1);
  assert.equal((await mockBells(new Request('http://localhost/api/bells/demo',{method:'POST',body:JSON.stringify({count:2})}),'demo')).status,200);
 }finally{globalThis.fetch=originalFetch;if(previous===undefined)delete process.env.KENNEMER_MOCK_STATE_PATH;else process.env.KENNEMER_MOCK_STATE_PATH=previous;await loader?.close();await rm(directory,{recursive:true,force:true});}
});
