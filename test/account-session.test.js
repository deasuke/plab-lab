import {test} from 'node:test';
import assert from 'node:assert/strict';
import {keccak256} from 'viem';
import {authorizedAccount,connectionAccount,reselectAccount} from '../src/account-session.js';
import {Lab,UNIT} from '../src/lab.js';
const A='0x1111111111111111111111111111111111111111',P='0x2222222222222222222222222222222222222222',E='0x3333333333333333333333333333333333333333',V='0x4444444444444444444444444444444444444444',B='0x5555555555555555555555555555555555555555',C='0x6666666666666666666666666666666666666666',S='0x7777777777777777777777777777777777777777';
test('registered account is selected from all authorized accounts regardless of order',()=>{
 assert.equal(connectionAccount([B,A],A),A);assert.equal(connectionAccount([A,B],A),A);assert.equal(authorizedAccount([B,A],A),A);
});
test('missing permission never fabricates the registered account',()=>{
 assert.equal(authorizedAccount([B],A),null);assert.equal(connectionAccount([B],A),B);assert.equal(connectionAccount([],A),null);assert.equal(connectionAccount(['invalid'],A),null);
});
test('SDK account reselection explicitly opens the picker without requesting a signature',async()=>{
 const calls=[];await reselectAccount({connector:{connect:async options=>calls.push(options)},provider:{request:()=>assert.fail('No provider request expected')}});assert.deepEqual(calls,[{chainIds:['0x13882'],forceRequest:true}]);
});
test('injected account reselection requests only account permissions',async()=>{
 const calls=[];await reselectAccount({provider:{request:async args=>calls.push(args)}});assert.deepEqual(calls,[{method:'wallet_requestPermissions',params:[{eth_accounts:{}}]}]);
});
function guarded(accounts,chain='0x13882'){
 const code='0x6000',hash=keccak256(code),p={id:'participant-002',address:A,escrow:E,escrowCodeHash:hash,startBlock:'1',status:'ready'};
 const cfg={chainId:80002,token:{address:P},vault:V,splitter:S,recipientB:B,recipientC:C,participants:[p],codeHashes:{token:hash,vault:hash,splitter:hash}};
 const client={getChainId:async()=>80002,getCode:async()=>code,readContract:async({functionName})=>({token:P,splitter:S,payer:A,recipientB:B,recipientC:C,B_PERCENT:70n,totalSupply:1000000n*UNIT})[functionName]};
 const provider={request:async({method})=>{if(method==='eth_accounts')return accounts;if(method==='eth_chainId')return chain;assert.fail('Read-only guard must not request signing or a transaction');}};
 return new Lab({config:cfg,participant:p,client,provider});
}
test('pre-sign guard accepts the authorized participant in the second list position',async()=>{await guarded([B,A]).guard(true);});
test('pre-sign guard rejects a participant without permission',async()=>{await assert.rejects(guarded([B]).guard(true),/登録したテスト用アカウント/);});
test('pre-sign guard still rejects the wrong wallet network',async()=>{await assert.rejects(guarded([B,A],'0x1').guard(true),/Amoy/);});
