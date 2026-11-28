import assert from 'node:assert/strict';
import {resolveMediaAsset,sourceImageAllowed} from './media-resolver.mjs';

assert.equal(sourceImageAllowed('https://foreverdb.net/icons/133216.webp'),true);
assert.equal(sourceImageAllowed('https://render.worldofwarcraft.com/forever-eu/icons/56/458223.jpg'),true);
assert.equal(sourceImageAllowed('https://render-eu.worldofwarcraft.com/npcs/zoom/creature-display-3292.jpg'),true);
assert.equal(sourceImageAllowed('https://render.worldofwarcraft.com/eu/npcs/portrait/creature-display-1484.jpg'),true);
assert.equal(sourceImageAllowed('https://example.com/icon.png'),false);

const previousToken=process.env.BLOB_READ_WRITE_TOKEN;
process.env.BLOB_READ_WRITE_TOKEN='test-token';
let storedPath=null;
const result=await resolveMediaAsset({
  entityType:'item',
  entityId:2840,
  role:'icon',
  sourceUrl:'https://foreverdb.net/icons/133216.webp',
  fetchImpl:async(_,options)=>{
    assert.equal(options.redirect,'error');
    return new Response(new Uint8Array([1,2,3,4]),{headers:{'content-type':'image/webp'}});
  },
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

const missingNpc=await resolveMediaAsset({
  entityType:'npc',
  entityId:5498,
  role:'portrait',
  sourceUrl:'https://render-eu.worldofwarcraft.com/npcs/zoom/creature-display-3293.jpg',
  fetchImpl:async()=>({ok:false,status:403,headers:{get:()=>null}})
});
assert.equal(missingNpc,null,'Dauerhaft fehlendes Blizzard-NPC-Renderbild fällt ohne Exception auf den UI-Fallback zurück');

let chunks=0,cancelled=false,uploads=0;
const oversized=()=>new ReadableStream({
  pull(controller){
    chunks++;
    controller.enqueue(new Uint8Array(1024*1024));
  },
  cancel(){cancelled=true;}
},{highWaterMark:0});
const mediaFixture={
  entityType:'spell',entityId:133,role:'icon',sourceUrl:'https://foreverdb.net/icons/133216.webp',
  putImpl:async()=>{uploads++;},
};
await assert.rejects(resolveMediaAsset({...mediaFixture,fetchImpl:async()=>new Response(oversized(),{
  headers:{'content-type':'image/webp','content-length':'5000001'}
})}),/Bildgröße unzulässig/);
assert.deepEqual([chunks,cancelled,uploads],[0,true,0]);
cancelled=false;
await assert.rejects(resolveMediaAsset({...mediaFixture,fetchImpl:async()=>new Response(oversized(),{
  headers:{'content-type':'image/webp'}
})}),/Bildgröße unzulässig/);
assert.deepEqual([chunks,cancelled,uploads],[5,true,0]);
await assert.rejects(resolveMediaAsset({...mediaFixture,fetchImpl:async()=>({
  redirected:true,url:'https://outside.invalid/logo.webp',body:oversized()
})}),/erlaubten Ziele/);
assert.equal(uploads,0);

if(previousToken===undefined)delete process.env.BLOB_READ_WRITE_TOKEN;
else process.env.BLOB_READ_WRITE_TOKEN=previousToken;

console.log('Media resolver: stable IDs, approved sources and Blob-only delivery: OK');
