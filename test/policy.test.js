import {test}from 'node:test';import assert from 'node:assert/strict';
import {selectParticipant,checkStage,transactionIntent,UNIT,Lab,unresolvedRequests}from '../src/lab.js';
const P='0x1111111111111111111111111111111111111111',E='0x2222222222222222222222222222222222222222',V='0x3333333333333333333333333333333333333333',B='0x4444444444444444444444444444444444444444';
const cfg={chainId:80002,token:{address:P},vault:V,recipientB:B,participants:[{id:'pilot-001',address:P,status:'ready',escrow:E,escrowCodeHash:'0x1234',startBlock:1}]},p=cfg.participants[0];
test('unregistered, wrong-chain and unprepared participants cannot operate',()=>{
 assert.equal(selectParticipant(cfg,P).id,p.id);assert.throws(()=>selectParticipant(cfg,B));assert.throws(()=>selectParticipant({...cfg,chainId:1},P));assert.throws(()=>selectParticipant({...cfg,participants:[{...p,status:'prepared'}]},P));
});
test('shared Vault does not require other participants to withdraw',()=>{
 const state={deposit:200n*UNIT,allowVault:0n,allowEscrow:0n,locked:0n,escrowBalance:0n,allowSplitter:0n,nextOrderId:0n,vaultTotal:250n*UNIT,vaultBalance:260n*UNIT};
 assert.doesNotThrow(()=>checkStage(state,3));assert.throws(()=>checkStage({...state,deposit:201n*UNIT},3));assert.throws(()=>checkStage({...state,vaultBalance:249n*UNIT},3));
});
test('exact approvals and fixed recipients are encoded; release requires receipt-derived order id',()=>{
 assert.equal(transactionIntent(cfg,p,0,[]).to,P);
 const a=transactionIntent(cfg,p,1,[]);assert.equal(a.to,P);assert.ok(a.data.startsWith('0x095ea7b3'));assert.ok(a.data.endsWith((200n*UNIT).toString(16).padStart(64,'0')));
 assert.throws(()=>transactionIntent(cfg,p,7,[]));assert.ok(transactionIntent(cfg,p,7,[{index:6,state:'confirmed',orderId:'17'}]).data.endsWith('11'.padStart(64,'0')));
});
test('ambiguous pre-send record blocks repeating a request',()=>{
 const l=new Lab({config:cfg,participant:p,records:[{index:0,state:'requesting'}]});assert.equal(l.pending(),true);assert.equal(l.next(),0);
});

test('reused Escrow keeps previous orders separate from this run',()=>{
 const state={deposit:0n,allowVault:0n,allowEscrow:0n,locked:0n,escrowBalance:0n,allowSplitter:0n,nextOrderId:2n,vaultTotal:0n,vaultBalance:0n};
 assert.doesNotThrow(()=>checkStage(state,0,2));assert.throws(()=>checkStage(state,0));
 assert.doesNotThrow(()=>checkStage({...state,nextOrderId:4n},11,2));
});

test('lost wallet response resolves only with verified matching nonce, action and payload',()=>{
 const req={index:8,state:'requesting',nonceBefore:19,to:P,data:'0x095ea7b3'};
 const confirmed={...req,state:'confirmed',nonce:'19',hash:'0xabc'};
 assert.equal(unresolvedRequests([req],[confirmed]).length,0);
 for(const change of [{nonce:'20'},{index:5},{to:E},{data:'0x1234'},{state:'pending'},{recovery:'expired-refund'}])assert.equal(unresolvedRequests([req],[{...confirmed,...change}]).length,1);
 assert.equal(unresolvedRequests([{...req,nonceBefore:undefined}],[confirmed]).length,1);
});
