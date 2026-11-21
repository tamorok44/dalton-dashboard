import assert from 'node:assert/strict';
import {resolveMediaAsset,sourceImageAllowed} from './media-resolver.mjs';

assert.equal(sourceImageAllowed('https://foreverdb.net/icons/133216.webp'),true);
assert.equal(sourceImageAllowed('https://render.worldofwarcraft.com/forever-eu/icons/56/458223.jpg'),true);
assert.equal(sourceImageAllowed('https://example.com/icon.png'),false);

const previousToken=process.env.BLOB_READ_WRITE_TOKEN;
process.env.BLOB_READ_WRITE_TOKEN='test-token';
let storedPath=null;
const result=await resolveMediaAsset({
  entityType:'item',
  entityId:2840,
  role:'icon',
  sourceUrl:'https://foreverdb.net/icons/133216.webp',
  fetchImpl:async()=>({
    ok:true,
    headers:{get:name=>name==='content-type'?'image/webp':null},
    arrayBuffer:async()=>new Uint8Array([1,2,3,4]).buffer
  }),
  putImpl:async(path,body,options)=>{
    storedPath=path;
    assert.equal(body.length,4);
    assert.equal(options.contentType,'image/webp');
    return {url:'https://blob.example/media/item/2840/icon.webp'};
  }
});
assert.equal(result,'https://blob.example/media/item/2840/icon.webp');
assert.match(storedPath,/^media\/item\/2840\/icon-[a-f0-9]{24}\.webp$/);

const prior=await resolveMediaAsset({
  entityType:'item',
  entityId:2840,
  role:'icon',
  sourceUrl:'https://foreverdb.net/icons/133216.webp',
  priorStoredUrl:'https://blob.example/already-stored.webp',
  fetchImpl:async()=>{throw new Error('must not fetch prior media')}
});
assert.equal(prior,'https://blob.example/already-stored.webp');

assert.equal(await resolveMediaAsset({
  entityType:'item',
  entityId:1,
  role:'icon',
  sourceUrl:'https://example.com/not-allowed.png'
}),null);

if(previousToken===undefined)delete process.env.BLOB_READ_WRITE_TOKEN;
else process.env.BLOB_READ_WRITE_TOKEN=previousToken;

console.log('Media resolver: stable IDs, approved sources and Blob-only delivery: OK');
