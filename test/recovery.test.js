import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeEventTopics,encodeAbiParameters,parseAbiParameters} from 'viem';
import {Lab,transactionIntent,UNIT} from '../src/lab.js';
import {ABI} from '../src/abi.js';
const owner='0x1111111111111111111111111111111111111111',token='0x2222222222222222222222222222222222222222',vault='0x3333333333333333333333333333333333333333',escrow='0x4444444444444444444444444444444444444444',B='0x5555555555555555555555555555555555555555';
const hashes=[1,2,3].map(n=>'0x'+String(n).padStart(64,'0'));
const cfg={chainId:80002,token:{address:token},vault,recipientB:B};
const event=(address,abi,eventName,args,types,values)=>({address,topics:encodeEventTopics({abi,eventName,args}),data:encodeAbiParameters(parseAbiParameters(types),values)});
function setup({checkpoint=true,deposit=false,records=[]}={}){
 const through=1000000n,end=through+3n;
 const p={id:'participant-002',address:owner,escrow,startBlock:'1',...(checkpoint?{recoveryCheckpoint:{version:1,verifiedThroughBlock:String(through),transactionHashes:hashes.slice(0,2)}}:{})};
 const txs=new Map(),receipts=new Map(),queried=[];
 for(let i=0;i<(deposit?3:2);i++){
  const intent=transactionIntent(cfg,p,i,[]);txs.set(hashes[i],{hash:hashes[i],from:owner,to:intent.to,input:intent.data,value:0n,nonce:i});
  const logs=i===0?[event(token,ABI.token,'Transfer',{from:owner,to:B},'uint256',[10n*UNIT])]:i===1?[event(token,ABI.token,'Approval',{owner,spender:vault},'uint256',[200n*UNIT])]:[event(vault,ABI.vault,'Deposited',{user:owner},'uint256',[200n*UNIT]),event(token,ABI.token,'Transfer',{from:owner,to:vault},'uint256',[200n*UNIT])];
  receipts.set(hashes[i],{status:'success',blockNumber:i<2?999900n+BigInt(i):through+2n,transactionIndex:0,gasUsed:40000n,effectiveGasPrice:50000000000n,logs});
 }
 const client={getBlockNumber:async()=>end,getTransactionReceipt:async({hash})=>receipts.get(hash),getTransaction:async({hash})=>txs.get(hash),getLogs:async range=>{queried.push(range);return deposit?[{transactionHash:hashes[2],blockNumber:through+2n,transactionIndex:0,removed:false}]:[];}};
 const lab=new Lab({config:cfg,participant:p,client,records});lab.guard=async()=>{};lab.refresh=async()=>({index:lab.next(),pending:lab.pending()});
 return {lab,p,txs,receipts,queried,through};
}
test('long-running participant restores from reverified checkpoint without rescanning old blocks',async()=>{
 const {lab,queried,through}=setup();const view=await lab.recover();assert.equal(view.index,2);assert.equal(view.pending,false);assert.deepEqual(lab.records.map(r=>r.hash),hashes.slice(0,2));assert.equal(queried[0].fromBlock,through+1n);
});
test('new deposit after checkpoint is also verified and recovered',async()=>{
 const {lab}=setup({deposit:true});assert.equal((await lab.recover()).index,3);assert.equal(lab.records[2].state,'confirmed');
});
test('long uncheckpointed history retains the mobile scan limit',async()=>{
 const {lab,queried}=setup({checkpoint:false});await assert.rejects(lab.recover(),/主催者による復元/);assert.equal(queried.length,0);
});
test('checkpoint cannot authorize a transaction from another sender',async()=>{
 const {lab,txs}=setup();txs.get(hashes[0]).from=B;await assert.rejects(lab.recover(),/取引内容/);assert.deepEqual(lab.records,[]);
});
test('successful receipt with wrong approval quantity is rejected',async()=>{
 const {lab,receipts}=setup();receipts.get(hashes[1]).logs=[event(token,ABI.token,'Approval',{owner,spender:vault},'uint256',[1n])];await assert.rejects(lab.recover(),/利用承認イベント/);
});
test('invalid future checkpoint and duplicate seed hashes are rejected',async()=>{
 const a=setup();a.p.recoveryCheckpoint.verifiedThroughBlock='1000010';await assert.rejects(a.lab.recover(),/復元範囲/);
 const b=setup();b.p.recoveryCheckpoint.transactionHashes=[hashes[0],hashes[0]];await assert.rejects(b.lab.recover(),/復元範囲/);
});
test('unresolved send remains blocking; matching lost response is resolved',async()=>{
 const req={index:2,state:'requesting',nonceBefore:2,...transactionIntent(cfg,{escrow},2,[])};
 const {lab}=setup({records:[req]});assert.equal((await lab.recover()).pending,true);assert.ok(lab.records.includes(req));
 const old={index:1,state:'requesting',nonceBefore:1,...transactionIntent(cfg,{escrow},1,[])};
 const match=setup({records:[old]});assert.equal((await match.lab.recover()).pending,false);assert.equal(match.lab.records.length,2);
});
test('manual recovery preserves a reserved retry nonce until the operation confirms',async()=>{
 const reservation={index:2,state:'cancelled-local',nonceBefore:2};const a=setup({records:[reservation]});await a.lab.recover();assert.ok(a.lab.records.includes(reservation));
 const b=setup({deposit:true,records:[reservation]});await b.lab.recover();assert.ok(!b.lab.records.includes(reservation));assert.equal(b.lab.next(),3);
});
