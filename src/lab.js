import { encodeFunctionData, decodeFunctionData, decodeEventLog, getAddress, keccak256, toHex } from 'viem';
import { ABI } from './abi.js';
export const UNIT=10n**18n;
export const STEPS=[
 {kind:'transfer',label:'10 PLABをBへ送る',group:'単純送金',amount:10},
 {kind:'approveVault',label:'Vaultに200 PLABの利用を許可',group:'Vault',amount:200},
 {kind:'deposit',label:'200 PLABを預け入れる',group:'Vault',amount:200},
 {kind:'withdraw',label:'50 PLABを引き出す',group:'Vault',amount:50},
 {kind:'withdraw',label:'残り150 PLABを引き出す',group:'Vault',amount:150},
 {kind:'approveEscrow',label:'Escrowに100 PLABの利用を許可',group:'Escrow 決済',amount:100},
 {kind:'create',label:'100 PLABの決済用注文を作成',group:'Escrow 決済',amount:100},
 {kind:'release',label:'Bへ70・Cへ30 PLABを分配',group:'Escrow 決済',amount:100},
 {kind:'approveEscrow',label:'Escrowに40 PLABの利用を許可',group:'Escrow 返金',amount:40},
 {kind:'create',label:'40 PLABの返金用注文を作成',group:'Escrow 返金',amount:40},
 {kind:'refund',label:'期限後に40 PLABを受け取る',group:'Escrow 返金',amount:40},
];
export const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
export function check(condition,message){if(!condition)throw Error(message);}
export function selectParticipant(config,account,invite){
 check(config.chainId===80002,'設定のネットワークがAmoyではありません。');
 const matches=config.participants.filter(p=>same(p.address,account)&&(!invite||p.id===invite));
 check(matches.length===1,'このアカウントはまだ参加準備が完了していません。公開アドレスを主催者へお伝えください。');
 const p=matches[0];check(p.status==='ready'&&p.escrow&&p.escrowCodeHash&&p.startBlock!=null,'主催者が資金と専用Escrowを準備中です。');
 check(/^0x[\da-f]{40}$/i.test(p.escrow)&&!same(p.escrow,config.vault),'参加者設定が不正です。');return p;
}
export function checkStage(s,i,orderBase=0n){
 orderBase=BigInt(orderBase);check(orderBase>=0n,'注文の開始位置が不正です。');
 check(i>=0&&i<=11,'進行記録が不正です。');
 const deposit=[0,0,0,200,150,0,0,0,0,0,0,0][i],av=i===2?200:0,ae=i===6?100:i===9?40:0,locked=i===7?100:i===10?40:0;
 check(s.deposit===BigInt(deposit)*UNIT,'ご自身のVault預入額が記録と一致しません。状態の復元をお試しください。');
 check(s.allowVault===BigInt(av)*UNIT&&s.allowEscrow===BigInt(ae)*UNIT,'利用承認の残量が記録と異なります。主催者へ結果を共有してください。');
 check(s.locked===BigInt(locked)*UNIT&&s.escrowBalance===s.locked&&s.allowSplitter===0n,'ご自身のEscrowの状態が記録と異なります。');
 check(s.vaultBalance>=s.vaultTotal,'Vault全体の残高と台帳が一致しません。操作を停止しました。');
 check(s.nextOrderId===orderBase+(i>=10?2n:i>=7?1n:0n),'注文数が記録と異なります。状態の復元をお試しください。');
}
export function transactionIntent(config,p,index,records,deadline){
 const step=STEPS[index];check(step,'すべての操作が完了しています。');
 let to=config.token.address,abi=ABI.token,functionName,args;
 if(step.kind==='transfer'){functionName='transfer';args=[config.recipientB,10n*UNIT];}
 else if(step.kind.startsWith('approve')){functionName='approve';args=[step.kind==='approveVault'?config.vault:p.escrow,BigInt(step.amount)*UNIT];}
 else{
  to=step.group==='Vault'?config.vault:p.escrow;abi=step.group==='Vault'?ABI.vault:ABI.escrow;
  if(step.kind==='create'){check(deadline!=null,'注文期限が必要です。');functionName='createOrder';args=[BigInt(step.amount)*UNIT,BigInt(deadline)];}
  else if(['release','refund'].includes(step.kind)){const order=records.find(r=>r.index===(step.kind==='release'?6:9)&&r.state==='confirmed');check(order?.orderId!==undefined,'確定取引からの注文IDが見つかりません。');functionName=step.kind;args=[BigInt(order.orderId)];}
  else{functionName=step.kind;args=[BigInt(step.amount)*UNIT];}
 }
 return {to:getAddress(to),data:encodeFunctionData({abi,functionName,args})};
}
const missing=e=>['TransactionReceiptNotFoundError','TransactionNotFoundError'].includes(e?.name);
export class Lab {
 constructor({config,participant,client,provider,records=[],persist=()=>{}}){Object.assign(this,{config,p:participant,client,provider,records,persist});this.busy=false;}
 save(){this.persist(this.records);}
 next(){return this.records.filter(r=>r.state==='confirmed'&&!r.recovery).length;}
 pending(){return this.records.some(r=>r.state==='pending'||r.state==='requesting');}
 read(address,abi,functionName,args=[],blockNumber){return this.client.readContract({address,abi,functionName,args,...(blockNumber!=null?{blockNumber}:{})});}
 async guard(signing=false){
  const c=this.config,p=this.p;
  check((await this.client.getChainId())===80002&&c.chainId===80002,'読取り接続先がAmoyではありません。');
  selectParticipant(c,p.address,p.id);
  for(const [key,address,expected] of [['token',c.token.address,c.codeHashes.token],['vault',c.vault,c.codeHashes.vault],['splitter',c.splitter,c.codeHashes.splitter],['escrow',p.escrow,p.escrowCodeHash]]){
   const code=await this.client.getCode({address});check(code&&expected&&keccak256(code)===expected,`${key}のコードが登録結果と一致しません。`);
  }
  for(const [address,abi,fn,expected]of [[c.vault,ABI.vault,'token',c.token.address],[c.splitter,ABI.splitter,'token',c.token.address],[c.splitter,ABI.splitter,'recipientB',c.recipientB],[c.splitter,ABI.splitter,'recipientC',c.recipientC],[p.escrow,ABI.escrow,'token',c.token.address],[p.escrow,ABI.escrow,'splitter',c.splitter],[p.escrow,ABI.escrow,'payer',p.address]])check(same(await this.read(address,abi,fn),expected),'コントラクトの連携先が一致しません。');
  check(await this.read(c.splitter,ABI.splitter,'B_PERCENT')===70n,'分配率が一致しません。');
  check(await this.read(c.token.address,ABI.token,'totalSupply')===1000000n*UNIT,'PLABの総発行量が異なります。');
  if(signing){
   check(this.provider,'ウォレットに接続してください。');
   check(Number(BigInt(await this.provider.request({method:'eth_chainId'})))===80002,'ウォレットをAmoyへ切り替えてください。');
   check(same((await this.provider.request({method:'eth_accounts'}))[0],p.address),'登録したテスト用アカウントへ戻してください。');
  }
 }
 async snapshot(){
  const c=this.config,p=this.p,b=await this.client.getBlock();
  const read=(address,abi,fn,args=[])=>this.read(address,abi,fn,args,b.number);
  const [balance,pol,deposit,vaultTotal,vaultBalance,escrowBalance,locked,allowVault,allowEscrow,allowSplitter,nextOrderId]=await Promise.all([
   read(c.token.address,ABI.token,'balanceOf',[p.address]),this.client.getBalance({address:p.address,blockNumber:b.number}),read(c.vault,ABI.vault,'deposits',[p.address]),read(c.vault,ABI.vault,'totalDeposits'),read(c.token.address,ABI.token,'balanceOf',[c.vault]),read(c.token.address,ABI.token,'balanceOf',[p.escrow]),read(p.escrow,ABI.escrow,'totalLocked'),read(c.token.address,ABI.token,'allowance',[p.address,c.vault]),read(c.token.address,ABI.token,'allowance',[p.address,p.escrow]),read(c.token.address,ABI.token,'allowance',[p.escrow,c.splitter]),read(p.escrow,ABI.escrow,'nextOrderId')]);
  return {balance,pol,deposit,vaultTotal,vaultBalance,escrowBalance,locked,allowVault,allowEscrow,allowSplitter,nextOrderId,timestamp:b.timestamp,blockNumber:b.number};
 }
 async verifyRecord(record,history=this.records){
  let receipt;try{receipt=await this.client.getTransactionReceipt({hash:record.hash});}catch(e){if(missing(e))return false;throw e;}
  if(receipt.status!=='success'){record.state='failed';this.save();return false;}
  const tx=await this.client.getTransaction({hash:record.hash});
  if(record.recovery){
   const creation=history.find(r=>r.index===6&&r.state==='confirmed');check(creation,'返金する注文の記録がありません。');
   const input=encodeFunctionData({abi:ABI.escrow,functionName:'refund',args:[BigInt(creation.orderId)]});
   check(record.recovery==='expired-refund'&&same(tx.from,this.p.address)&&same(tx.to,this.p.escrow)&&same(tx.input,input)&&tx.value===0n,'回復用返金の内容が不一致です。');
   const block=await this.client.getBlock({blockNumber:receipt.blockNumber});check(block.timestamp>=BigInt(creation.deadline),'返金期限が不一致です。');
   const events=receipt.logs.flatMap(l=>{try{return [{address:l.address,...decodeEventLog({abi:same(l.address,this.p.escrow)?ABI.escrow:ABI.token,topics:l.topics,data:l.data})}];}catch{return [];}});
   check(events.some(e=>same(e.address,this.p.escrow)&&e.eventName==='OrderRefunded'&&e.args.orderId===BigInt(creation.orderId)&&e.args.amount===100n*UNIT),'100 PLABの返金イベントがありません。');
   check(events.some(e=>same(e.address,this.config.token.address)&&e.eventName==='Transfer'&&same(e.args.from,this.p.escrow)&&same(e.args.to,this.p.address)&&e.args.value===100n*UNIT),'100 PLABの返金送金がありません。');
   Object.assign(record,{state:'confirmed',blockNumber:String(receipt.blockNumber),gasUsed:String(receipt.gasUsed),feeWei:String(receipt.gasUsed*receipt.effectiveGasPrice)});return true;
  }
  const intent=transactionIntent(this.config,this.p,record.index,history,record.deadline);
  check(same(tx.from,this.p.address)&&same(tx.to,intent.to)&&same(tx.input,intent.data)&&tx.value===0n,'取引内容が予定と一致しません。');
  const events=receipt.logs.flatMap(log=>{try{const abi=same(log.address,this.config.token.address)?ABI.token:same(log.address,this.p.escrow)?ABI.escrow:same(log.address,this.config.vault)?ABI.vault:same(log.address,this.config.splitter)?ABI.splitter:[];return [{address:log.address,...decodeEventLog({abi,topics:log.topics,data:log.data,strict:true})}];}catch{return [];}});
  const step=STEPS[record.index],amount=BigInt(step.amount)*UNIT;
  const event=(address,name,test)=>events.some(e=>same(e.address,address)&&e.eventName===name&&test(e.args));
  const transfer=(from,to,n)=>event(this.config.token.address,'Transfer',a=>same(a.from,from)&&same(a.to,to)&&a.value===n);
  if(step.kind==='transfer')check(transfer(this.p.address,this.config.recipientB,amount),'送金イベントを確認できません。');
  else if(step.kind.startsWith('approve'))check(event(this.config.token.address,'Approval',a=>same(a.owner,this.p.address)&&same(a.spender,step.kind==='approveVault'?this.config.vault:this.p.escrow)&&a.value===amount),'利用承認イベントが不一致です。');
  else if(['deposit','withdraw'].includes(step.kind)){
   check(event(this.config.vault,step.kind==='deposit'?'Deposited':'Withdrawn',a=>same(a.user,this.p.address)&&a.amount===amount),'Vaultイベントが不一致です。');
   check(transfer(step.kind==='deposit'?this.p.address:this.config.vault,step.kind==='deposit'?this.config.vault:this.p.address,amount),'Vaultの移動量が不一致です。');
  }else if(step.kind==='create'){
   const funded=events.filter(e=>same(e.address,this.p.escrow)&&e.eventName==='OrderFunded');check(funded.length===1&&same(funded[0].args.payer,this.p.address)&&funded[0].args.amount===amount&&funded[0].args.deadline===BigInt(record.deadline),'注文イベントが不一致です。');
   record.orderId=String(funded[0].args.orderId);check(transfer(this.p.address,this.p.escrow,amount),'注文への入金が不一致です。');
  }else{
   const creation=history.find(r=>r.index===(step.kind==='release'?6:9)&&r.state==='confirmed');check(creation,'先行注文が見つかりません。');
   check(event(this.p.escrow,step.kind==='release'?'OrderReleased':'OrderRefunded',a=>a.orderId===BigInt(creation.orderId)&&a.amount===amount),'決済または返金イベントが不一致です。');
   const block=await this.client.getBlock({blockNumber:receipt.blockNumber});
   check(step.kind==='release'?block.timestamp<BigInt(creation.deadline):block.timestamp>=BigInt(creation.deadline),'注文期限の条件が一致しません。');
   if(step.kind==='release'){
    check(transfer(this.p.escrow,this.config.recipientB,70n*UNIT)&&transfer(this.p.escrow,this.config.recipientC,30n*UNIT),'70対30の送金が不一致です。');
    check(event(this.config.splitter,'SplitExecuted',a=>same(a.payer,this.p.escrow)&&a.amount===100n*UNIT&&a.toB===70n*UNIT&&a.toC===30n*UNIT),'分配イベントが不一致です。');
   }else check(transfer(this.p.escrow,this.p.address,amount),'返金額が不一致です。');
  }
  Object.assign(record,{state:'confirmed',blockNumber:String(receipt.blockNumber),gasUsed:String(receipt.gasUsed),feeWei:String(receipt.gasUsed*receipt.effectiveGasPrice)});return true;
 }
 async refresh(){
  await this.guard();
  for(const r of this.records.filter(r=>r.hash&&r.state!=='failed'))await this.verifyRecord(r);
  this.save();const state=await this.snapshot(),index=this.next();
  if(this.records.some(r=>r.recovery&&r.state==='confirmed')){checkStage(state,8,this.p.orderBase??0);return {state,index,aborted:true,pending:false,waitSeconds:0n,expired:false};}
  if(!this.pending())checkStage(state,index,this.p.orderBase??0);
  let waitSeconds=0n,expired=false;
  if(index===7||index===10){const creation=this.records.find(r=>r.index===(index===7?6:9)&&r.state==='confirmed');check(creation,'注文記録を復元してください。');const actual=await this.read(this.p.escrow,ABI.escrow,'orders',[BigInt(creation.orderId)]);check(actual[0]===BigInt(index===7?100:40)*UNIT&&actual[1]===BigInt(creation.deadline)&&actual[2]===1,'注文状態が一致しません。');expired=index===7&&state.timestamp>=BigInt(creation.deadline);if(index===10&&state.timestamp<BigInt(creation.deadline))waitSeconds=BigInt(creation.deadline)-state.timestamp;}
  return {state,index,waitSeconds,expired,pending:this.pending()};
 }
 async send(index){
  check(!this.busy,'署名要求が進行中です。');this.busy=true;
  try{
   const view=await this.refresh();check(!view.pending&&view.index===index,'未確定の取引または記録を確認してください。');check(!view.expired,'決済用注文の期限を過ぎています。主催者へ結果を共有して返金してください。');check(view.waitSeconds===0n,'返金期限までお待ちください。');await this.guard(true);
   const step=STEPS[index],deadline=step.kind==='create'?String(view.state.timestamp+(index===6?86400n:180n)):undefined;
   const intent=transactionIntent(this.config,this.p,index,this.records,deadline),gasCap=step.group==='単純送金'?100000n:step.group==='Vault'?200000n:300000n;
   if(['transfer','deposit','create'].includes(step.kind))check(view.state.balance>=BigInt(step.amount)*UNIT,'PLAB残高が不足しています。');
   const fees=await this.client.estimateFeesPerGas();check(fees.maxFeePerGas!=null&&fees.maxFeePerGas<=60000000000n,'現在の推奨手数料が上限60 Gweiを超えています。時間を置いてください。');
   const simulation={account:this.p.address,...intent,value:0n,gas:gasCap,maxFeePerGas:60000000000n,maxPriorityFeePerGas:50000000000n};
   await this.client.call(simulation);const estimate=await this.client.estimateGas(simulation),gas=(estimate*120n+99n)/100n;check(gas<=gasCap,'ガス見積もりが上限を超えました。');check(view.state.pol>=gas*60000000000n,'手数料用のテストPOLが不足しています。');
   await this.guard(true);
   const record={index,to:intent.to,data:intent.data,...(deadline?{deadline}:{}),state:'requesting',requestedAt:new Date().toISOString(),nonceBefore:await this.client.getTransactionCount({address:this.p.address,blockTag:'pending'})};this.records.push(record);this.save();
   try{
    record.hash=await this.provider.request({method:'eth_sendTransaction',params:[{from:this.p.address,...intent,value:'0x0',chainId:'0x13882',gas:toHex(gas),maxFeePerGas:toHex(60000000000n),maxPriorityFeePerGas:toHex(50000000000n)}]});record.state='pending';this.save();
   }catch(e){if(e?.code===4001||e?.code===-32602){this.records.splice(this.records.indexOf(record),1);this.save();}throw e;}
   return record.hash;
  }finally{this.busy=false;}
 }
 async recover(){
  check(!this.busy,'署名要求中は復元できません。');await this.guard();
  const start=BigInt(this.p.startBlock),end=await this.client.getBlockNumber();check(end-start<=150000n,'照会期間が長いため主催者による復元が必要です。');
  const hashes=new Map();
  for(let from=start;from<=end;from+=1000n){
   const logs=await this.client.getLogs({address:[this.config.token.address,this.config.vault,this.p.escrow],fromBlock:from,toBlock:from+999n<end?from+999n:end});
   for(const l of logs)if(!l.removed)hashes.set(l.transactionHash,{block:l.blockNumber,index:l.transactionIndex});
  }
  const history=[];let next=0;
  for(const [hash]of [...hashes].sort((a,b)=>a[1].block<b[1].block?-1:a[1].block>b[1].block?1:a[1].index-b[1].index)){
   if(next>=11)break;const tx=await this.client.getTransaction({hash});if(!same(tx.from,this.p.address)||!tx.to)continue;
   if(next===7&&history.find(r=>r.index===6)?.orderId!==undefined){
    const creation=history.find(r=>r.index===6),refund=encodeFunctionData({abi:ABI.escrow,functionName:'refund',args:[BigInt(creation.orderId)]});
    if(same(tx.to,this.p.escrow)&&same(tx.input,refund)){const r={index:7,recovery:'expired-refund',hash,to:tx.to,data:tx.input,state:'pending'};if(await this.verifyRecord(r,history)){history.push(r);break;}}
   }
   let deadline;try{if(STEPS[next].kind==='create'){const d=decodeFunctionData({abi:ABI.escrow,data:tx.input});if(d.functionName!=='createOrder')continue;deadline=String(d.args[1]);}
    const intent=transactionIntent(this.config,this.p,next,history,deadline);if(!same(tx.to,intent.to)||!same(tx.input,intent.data))continue;
   }catch{continue;}
   const record={index:next,hash,to:tx.to,data:tx.input,...(deadline?{deadline}:{}),state:'pending'};
   if(await this.verifyRecord(record,history)){history.push(record);next++;}
  }
  // Keep unresolved requests: absence from successful logs does not prove non-broadcast.
  const unresolved=this.records.filter(r=>['requesting','pending'].includes(r.state)&&!history.some(h=>h.hash&&h.hash===r.hash));
  this.records=[...history,...unresolved];this.save();return this.refresh();
 }
 async refundExpired(){
  check(!this.busy,'操作中です。');this.busy=true;
  try{
   const view=await this.refresh();check(view.expired&&!view.pending,'期限切れの注文を確認できません。');await this.guard(true);
   const creation=this.records.find(r=>r.index===6&&r.state==='confirmed'),data=encodeFunctionData({abi:ABI.escrow,functionName:'refund',args:[BigInt(creation.orderId)]});
   const quote=await this.client.estimateFeesPerGas();check(quote.maxFeePerGas!=null&&quote.maxFeePerGas<=60000000000n,'現在の手数料が上限を超えています。');
   const simulation={account:this.p.address,to:this.p.escrow,data,value:0n,gas:300000n,maxFeePerGas:60000000000n,maxPriorityFeePerGas:50000000000n};await this.client.call(simulation);const gas=((await this.client.estimateGas(simulation))*120n+99n)/100n;check(gas<=300000n&&view.state.pol>=gas*60000000000n,'ガス上限またはPOL残高を確認してください。');
   await this.guard(true);const record={index:7,recovery:'expired-refund',to:this.p.escrow,data,state:'requesting',requestedAt:new Date().toISOString()};this.records.push(record);this.save();
   try{record.hash=await this.provider.request({method:'eth_sendTransaction',params:[{from:this.p.address,to:this.p.escrow,data,value:'0x0',chainId:'0x13882',gas:toHex(gas),maxFeePerGas:toHex(60000000000n),maxPriorityFeePerGas:toHex(50000000000n)}]});record.state='pending';this.save();return record.hash;}catch(e){if(e?.code===4001){this.records.splice(this.records.indexOf(record),1);this.save();}throw e;}
  }finally{this.busy=false;}
 }
 result(){return {version:1,chainId:80002,participant:this.p.address,experimentId:this.p.id,token:this.config.token.address,vault:this.config.vault,escrow:this.p.escrow,splitter:this.config.splitter,transactions:this.records};}
}
