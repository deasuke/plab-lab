import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blockingReasons} from '../src/action-readiness.js';
test('verified stage on Amoy with no pending request is actionable',()=>{assert.deepEqual(blockingReasons({chainId:80002,pending:false,busy:false,waitSeconds:0n}),[]);});
test('correct account alone cannot enable a wrong or unknown network',()=>{for(const chainId of [undefined,1,11155111])assert.match(blockingReasons({chainId})[0],/Amoy/);});
test('unresolved local request remains blocked even without a pending chain transaction',()=>{assert.match(blockingReasons({chainId:80002,pending:true})[0],/前の送信状況/);});
test('wallet request in flight and refund delay remain blocked with explicit reasons',()=>{assert.match(blockingReasons({chainId:80002,busy:true})[0],/要求処理/);assert.match(blockingReasons({chainId:80002,waitSeconds:90n})[0],/90秒/);});
