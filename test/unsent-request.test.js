import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Lab,UNIT,transactionIntent} from '../src/lab.js';
const A='0x1111111111111111111111111111111111111111',P='0x2222222222222222222222222222222222222222',V='0x3333333333333333333333333333333333333333';
const cfg={token:{address:P},vault:V},p={address:A};
const state={deposit:0n,allowVault:200n*UNIT,allowEscrow:0n,locked:0n,escrowBalance:0n,allowSplitter:0n,nextOrderId:0n,vaultTotal:0n,vaultBalance:0n,balance:390n*UNIT,pol:UNIT};
function setup(confirmed=2,pending=2){
 const request={index:2,state:'requesting',nonceBefore:2,...transactionIntent(cfg,p,2,[])};
 const lab=new Lab({config:cfg,participant:p,records:[{index:0,state:'confirmed',nonce:'0'},{index:1,state:'confirmed',nonce:'1'},request],client:{getTransactionCount:async args=>args.blockTag==='pending'?pending:confirmed}});
 lab.guard=async()=>{};lab.recover=async()=>({state,index:2,pending:lab.pending()});lab.refresh=async()=>({state,index:2,pending:lab.pending(),expired:false,waitSeconds:0n});return {lab,request};
}
test('unbroadcast unresolved request is retained as a nonce reservation, not deleted',async()=>{
 const {lab,request}=setup();const v=await lab.releaseUnsentRequest();assert.equal(v.pending,false);assert.equal(v.index,2);assert.equal(request.state,'cancelled-local');assert.equal(request.nonceBefore,2);assert.equal(lab.records.length,3);
});
test('broadcast or mined nonce prevents releasing an ambiguous request',async()=>{
 for(const pair of [[2,3],[3,3]]){const {lab,request}=setup(...pair);await assert.rejects(lab.releaseUnsentRequest(),/取引が送信または確定/);assert.equal(request.state,'requesting');}
});
test('hashed transaction and active wallet request cannot be cleared',async()=>{
 const a=setup();a.request.hash='0x'+'a'.repeat(64);await assert.rejects(a.lab.releaseUnsentRequest(),/送信済み/);
 const b=setup();b.lab.busy=true;await assert.rejects(b.lab.releaseUnsentRequest(),/署名要求中/);
});
test('retry sends explicitly with the old nonce so a delayed original and retry cannot both execute',async()=>{
 const {lab}=setup();await lab.releaseUnsentRequest();const sends=[];
 lab.client.estimateFeesPerGas=async()=>({maxFeePerGas:50000000000n});lab.client.call=async()=>({});lab.client.estimateGas=async()=>50000n;
 lab.provider={request:async args=>{assert.equal(args.method,'eth_sendTransaction');sends.push(args.params[0]);return '0x'+'b'.repeat(64);}};
 await lab.send(2);assert.equal(sends.length,1);assert.equal(sends[0].nonce,'0x2');assert.equal(sends[0].to,V);
});
test('retry blocks before requesting a signature if the nonce changed after local release',async()=>{
 const {lab}=setup();await lab.releaseUnsentRequest();lab.client.estimateFeesPerGas=async()=>({maxFeePerGas:50000000000n});lab.client.call=async()=>({});lab.client.estimateGas=async()=>50000n;lab.client.getTransactionCount=async()=>3;lab.provider={request:()=>assert.fail('Must not request another signature')};
 await assert.rejects(lab.send(2),/送信状況が変わりました/);
});
test('a lost local reservation still cannot advance the nonce past the previous confirmed operation',async()=>{
 const {lab}=setup(2,3);lab.records=lab.records.filter(r=>r.state==='confirmed');lab.client.estimateFeesPerGas=async()=>({maxFeePerGas:50000000000n});lab.client.call=async()=>({});lab.client.estimateGas=async()=>50000n;lab.provider={request:()=>assert.fail('Must not sign a second deposit at a newer nonce')};await assert.rejects(lab.send(2),/未確定取引/);
});
