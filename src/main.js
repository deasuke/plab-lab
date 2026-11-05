import './style.css';
import {blockingReasons}from './action-readiness.js';
import {connectionAccount,authorizedAccount,reselectAccount}from './account-session.js';
import {createPublicClient,http,fallback,formatEther,getAddress}from 'viem';
import {polygonAmoy}from 'viem/chains';
import {Lab,STEPS,selectParticipant}from './lab.js';
import {joinRequest,sameDeployment}from './registration.js';
const $=id=>document.getElementById(id);let config=await fetch('./lab.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('公開設定を取得できません。');return r.json();});
const client=createPublicClient({chain:polygonAmoy,transport:fallback(config.rpcUrls.map(url=>http(url,{retryCount:1,timeout:15000})))});
let provider,connector,account,lab,key,demo=false,poll,connectedChain,accountAuthorized=false,useConnector=false,lastMessage='',lastBlockReasons=[];const boundProviders=new WeakSet();
const message=(text,error=false)=>{lastMessage=text;$('status').textContent=text;$('status').classList.toggle('error',error);};
const friendly=e=>{if(e?.code===4001)return 'ウォレットでキャンセルされました。資金は移動していません。';return String(e?.shortMessage||e?.message||e).replace(/https?:\/\/[^\s"'<>]+/g,'[接続先]').slice(0,900);};
const amount=n=>Number(formatEther(n)).toLocaleString('ja-JP',{maximumFractionDigits:6});
function stored(){try{return JSON.parse(localStorage.getItem(key)||'[]');}catch{throw Error('保存記録を読み込めません。主催者へご連絡ください。');}}
function persist(records){localStorage.setItem(key,JSON.stringify(records));renderRecords();}
const lock=()=>{$('send').disabled=true;};
const invitedParticipant=()=>config.participants.find(p=>p.id===new URLSearchParams(location.search).get('invite'));
function showConnectionCheck(){
 const expected=invitedParticipant()?.address;
 $('connection-check').textContent=expected?`この招待の登録アドレス：${getAddress(expected)}\n${account?(accountAuthorized&&account.toLowerCase()===expected.toLowerCase()?'接続アカウント：登録アドレスと一致':'接続アカウント：不一致または未許可。接続アカウントを選び直してください。'):'接続後に一致を確認します。'}${connectedChain!=null?`\n接続ネットワーク：${connectedChain===80002?'Amoy（80002）':`Chain ID ${connectedChain}。Amoyへの切替が必要です。`}`:''}`:'接続後、サイトに許可された公開アドレスを表示します。';
}
showConnectionCheck();
function renderRecords(){
 $('results').replaceChildren();$('unsent-recovery').hidden=!lab||lab.busy||!lab.records.some(r=>r.state==='requesting'&&!r.hash);if(!lab)return;
 $('results-panel').hidden=lab.records.length===0;
 for(const r of lab.records){const li=document.createElement('li');li.textContent=`${r.recovery?'回復用返金':r.index+1+'. '+STEPS[r.index]?.label}　${({confirmed:'確定',pending:'確定待ち',requesting:'送信状況の確認が必要',failed:'失敗','cancelled-local':'未送信確認済み（記録保持）'})[r.state]||r.state}`;if(r.hash){const a=document.createElement('a');a.href=`${config.explorer}/tx/${r.hash}`;a.target='_blank';a.rel='noopener noreferrer';a.textContent=r.hash;li.append(a);}$('results').append(li);}
}
const phase=i=>i===0?0:i<5?1:i<8?2:3;
function draw(view){
 $('dashboard').hidden=false;for(const [id,value]of Object.entries({balance:view.state.balance,deposits:view.state.deposit,locked:view.state.locked,pol:view.state.pol}))$(id).textContent=amount(value);
 $('progress-count').textContent=`${view.index} / 11 操作を確認`;
 if(view.aborted){$('action-box').hidden=true;message('期限切れの100 PLABを返金しました。資金はロックされていません。今回は決済実験未完了として、取引結果を主催者へ共有してください。');return;}
 for(let i=0;i<4;i++){$(`phase${i}`).classList.toggle('active',view.index<11&&phase(view.index)===i);$(`phase${i}`).classList.toggle('done',view.index===11||phase(view.index)>i);}
 $('action-box').hidden=view.index===11;
 if(view.index===11){message('実験がすべて完了しました。預入額・ロック額・利用承認残量は0です。取引結果を主催者へ共有してください。');return;}
 const step=STEPS[view.index];$('action-label').textContent=`${step.group} · 操作 ${view.index+1} / 11`;$('action-title').textContent=step.label;
 const approval=step.kind.startsWith('approve');$('action-description').textContent=approval?`今回は${step.amount} PLABの利用だけを許可します。この承認だけではPLABは移動しません。`:`ウォレットアプリで内容を確認して署名します。${step.kind==='refund'?'期限後に自分のアカウントへ返金されます。':''}`;
 $('action-effect').textContent=approval?'利用上限は今回の数量のみ':step.kind==='transfer'?'あなた → 受取先B':step.kind==='deposit'?'あなた → 共用Vault':step.kind==='withdraw'?'共用Vault → あなた':step.kind==='create'?'あなた → 専用Escrow':step.kind==='release'?'専用Escrow → Bへ70・Cへ30 PLAB':'専用Escrow → あなた';
 $('action-cap').textContent=step.group==='単純送金'?'0.006':step.group==='Vault'?'0.012':'0.018';
 $('send').textContent=demo?'見本で次の状態を見る':`${view.index+1}. ${step.label}`;
 lastBlockReasons=demo?[]:blockingReasons({pending:view.pending,busy:lab?.busy,chainId:connectedChain,waitSeconds:view.waitSeconds});
 $('send').disabled=lastBlockReasons.length>0;
 if(lastBlockReasons.length)message('操作ボタンを停止しています。\n'+lastBlockReasons.join('\n'));
 else if(view.expired){$('action-title').textContent='期限切れの100 PLABを返金';$('send').textContent='100 PLABを自分のアカウントへ返金';$('action-description').textContent='元の注文を返金して資金を戻します。決済実験の完了には数えず、次の実施方法を主催者と確認します。';$('action-effect').textContent='専用Escrow → あなた';message('100 PLAB注文の期限を過ぎています。決済の代わりに返金できます。',true);}

 else message(demo?'見本モードです。説明用の状態を切り替えています。':`次は「${step.label}」です。ボタンを押すとウォレットで確認します。`);
}
async function refresh(){
 if(demo){drawDemo();return;}if(!lab)return;lock();
 if(lab.busy){lastBlockReasons=blockingReasons({busy:true,pending:lab.pending(),chainId:connectedChain});message('操作ボタンを停止しています。\n'+lastBlockReasons.join('\n'));return;}
 message('接続とチェーン上の記録を確認しています…');
 try{
  connectedChain=Number(BigInt(await provider.request({method:'eth_chainId'})));$('switch').hidden=connectedChain===80002;
  const permitted=await provider.request({method:'eth_accounts'});accountAuthorized=Boolean(authorizedAccount(permitted,lab.p.address));showConnectionCheck();
  if(!accountAuthorized)throw Error('登録アドレスがこのサイトに許可されていません。「接続アカウントを選び直す」を押してください。');
  let view;if(lab.records.length===0&&lab.p.recoveryCheckpoint){message('確認済み取引から進行を復元しています…');view=await lab.recover();}else view=await lab.refresh();
  if(lab.records.some(r=>r.state==='requesting')){message('確定済み取引と送信記録を照合しています…');view=await lab.recover();}
  draw(view);renderRecords();
 }catch(e){lastBlockReasons=[friendly(e)];message('操作ボタンを停止しています。\n'+friendly(e),true);}
}
function storageKey(p){return `plab-mobile-v1:${config.chainId}:${p.address.toLowerCase()}:${p.escrow.toLowerCase()}:${p.id}`;}
async function reloadRegistry(){const latest=await fetch('./lab.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('準備状況を取得できません。');return r.json();});if(!sameDeployment(config,latest))throw Error('契約設定が変更されています。画面を再読み込みしてください。');config=latest;}
async function afterConnect(){
 demo=false;$('demo-note').hidden=true;$('demo').hidden=false;const permitted=await provider.request({method:'eth_accounts'});account=connectionAccount(permitted,invitedParticipant()?.address);accountAuthorized=Boolean(authorizedAccount(permitted,invitedParticipant()?.address??account));if(!account)throw Error('ウォレットのアカウントを選んでください。');
 $('account').textContent=getAddress(account);$('account').hidden=false;$('disconnect').hidden=false;$('connection-badge').textContent='接続済み';const invite=new URLSearchParams(location.search).get('invite');$('invitation-label').textContent=invite?`参加番号：${invite}`:'';$('invitation-label').hidden=!invite;$('connect').textContent='接続アカウントを再確認';
 const chain=Number(BigInt(await provider.request({method:'eth_chainId'})));connectedChain=chain;$('switch').hidden=chain===80002;$('reselect').hidden=false;showConnectionCheck();if(invitedParticipant()&&account.toLowerCase()!==invitedParticipant().address.toLowerCase())$('connection-badge').textContent='アカウント不一致';
 try{const p=selectParticipant(config,account,new URLSearchParams(location.search).get('invite'));key=storageKey(p);lab=new Lab({config,participant:p,client,provider,records:stored(),persist,onStatus:message});$('registration').hidden=true;$('recover').hidden=false;await refresh();}
 catch(e){lab=null;lock();$('action-box').hidden=true;$('dashboard').hidden=true;$('results-panel').hidden=true;$('registration').hidden=false;$('copy-join').hidden=true;try{joinRequest(config,account,invite);$('copy-join').hidden=false;message('接続できました。「参加登録情報をコピー」で実験者へ登録情報を渡してください。準備完了後に「準備状況を再確認」を押します。');}catch{message(friendly(e),true);}}
}
$('connect').onclick=async()=>{
 lock();message('MetaMaskへの接続を確認しています。ウォレットアプリの画面をご確認ください。');
 try{
  // The injected provider is used only where a wallet actually supplies one.
  if(window.ethereum?.isMetaMask){useConnector=false;provider=window.ethereum;await provider.request({method:'eth_requestAccounts'});}
  else{useConnector=true;const {createEVMClient}=await import('@metamask/connect-evm');connector??=await createEVMClient({dapp:{name:'PLAB 実験室',url:location.origin+location.pathname,iconUrl:new URL('./icon.svg',location.href).href},api:{supportedNetworks:{'0x13882':config.rpcUrls[0]}}});await connector.connect({chainIds:['0x13882']});provider=connector.getProvider();}
  if(!boundProviders.has(provider)){boundProviders.add(provider);for(const event of ['accountsChanged','chainChanged'])provider.on?.(event,()=>{lock();lab=null;$('action-box').hidden=true;$('account').hidden=true;$('connection-badge').textContent='再確認が必要';$('connection-check').textContent='接続が変更されました。「接続アカウントを再確認」を押してください。';message('接続が変更されました。「接続アカウントを再確認」を押してください。');});}
  await afterConnect();
 }catch(e){message(friendly(e),true);}
};
$('reselect').onclick=async()=>{
 if(lab?.busy){message('署名要求中です。先にMetaMaskで現在の要求をご確認ください。');return;}lock();
 try{message(`MetaMaskで接続アカウントを選び直してください。${invitedParticipant()?`登録アドレス：${invitedParticipant().address}`:''}`);await reselectAccount({connector:useConnector?connector:null,provider});if(useConnector)provider=connector.getProvider();await afterConnect();}
 catch(e){message(friendly(e)+' アカウント選択が開かない場合は、MetaMaskのPermissions（権限）でこのサイトの接続アカウントを確認してください。',true);}
};
$('switch').onclick=async()=>{try{if(connector)await connector.switchChain({chainId:'0x13882',chainConfiguration:{chainId:'0x13882',chainName:'Polygon Amoy',nativeCurrency:{name:'POL',symbol:'POL',decimals:18},rpcUrls:config.rpcUrls,blockExplorerUrls:[config.explorer]}});else{try{await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x13882'}]});}catch(e){if(e.code!==4902)throw e;await provider.request({method:'wallet_addEthereumChain',params:[{chainId:'0x13882',chainName:'Polygon Amoy',nativeCurrency:{name:'POL',symbol:'POL',decimals:18},rpcUrls:config.rpcUrls,blockExplorerUrls:[config.explorer]}]});}}await afterConnect();}catch(e){message(friendly(e),true);}};
$('disconnect').onclick=async()=>{try{await connector?.disconnect();}finally{provider=null;lab=null;lock();$('action-box').hidden=true;$('dashboard').hidden=true;$('connection-badge').textContent='未接続';$('account').hidden=true;$('registration').hidden=true;$('disconnect').hidden=true;$('reselect').hidden=true;account=null;accountAuthorized=false;connectedChain=null;showConnectionCheck();message('接続を解除しました。取引の記録はこのブラウザに保持されています。');}};
$('refresh').onclick=refresh;
$('send').onclick=async()=>{
 if(demo){demoIndex=Math.min(11,demoIndex+1);drawDemo();return;}if(!lab||lab.busy)return;lock();
 try{
  const send=async()=>{lab.records=stored();message('送信前の確認中です。その後、ウォレットで内容を確認してください。');const view=await lab.refresh();if(view.expired)await lab.refundExpired();else await lab.send(lab.next());message('送信済みです。確定を待っています。');await refresh();clearInterval(poll);let count=0;poll=setInterval(async()=>{if(lab&&!lab.busy)await refresh();if(!lab?.pending()||++count>15)clearInterval(poll);},5000);};
  if(navigator.locks)await navigator.locks.request(key,{ifAvailable:true},async lock=>{if(!lock)throw Error('別のタブで操作中です。そちらの確定を待ってください。');await send();});else await send();
 }catch(e){message(friendly(e),true);renderRecords();}
};
$('recover').onclick=async()=>{if(!lab||lab.busy)return;lock();message('参加開始後のイベントから進行を復元しています…');try{draw(await lab.recover());renderRecords();}catch(e){message('復元を完了できませんでした。既存の記録は保持しています。'+friendly(e),true);}};
$('recover-results').onclick=$('recover').onclick;
$('copy-join').onclick=async()=>{try{if(!provider)throw Error('MetaMaskへ接続してください。');const current=authorizedAccount(await provider.request({method:'eth_accounts'}),account);if(Number(BigInt(await provider.request({method:'eth_chainId'})))!==80002)throw Error('先にAmoyへ切り替えてください。');if(current?.toLowerCase()!==account?.toLowerCase())throw Error('アカウントが変わりました。接続アカウントを再確認してください。');const request=joinRequest(config,current,new URLSearchParams(location.search).get('invite'));await navigator.clipboard.writeText(JSON.stringify(request,null,2));message('参加登録情報をコピーしました。実験者へ貼り付けてお渡しください。資金の移動や署名はしていません。');}catch(e){message(friendly(e),true);}};
$('registration-refresh').onclick=async()=>{try{await reloadRegistry();await afterConnect();}catch(e){message(friendly(e),true);}};
$('copy-address').onclick=async()=>{try{await navigator.clipboard.writeText(getAddress(account));message('公開アドレスをコピーしました。主催者へお伝えください。');}catch{message('上に表示されている公開アドレスを選択してコピーしてください。');}};
$('release-unsent').onclick=async()=>{
 if(!lab||lab.busy)return;
 if(!$('unsent-ack').checked){message('先にMetaMaskに古い署名要求が残っていないことを確認し、チェックを入れてください。',true);return;}
 lock();message('確定取引・未確定取引・残高を照合しています。署名・送金は行いません。');
 try{const view=await lab.releaseUnsentRequest();$('unsent-ack').checked=false;draw(view);renderRecords();if(!view.pending)message(`未送信を確認しました。次は「${STEPS[view.index]?.label}」です。`);}
 catch(e){lastBlockReasons=[friendly(e)];message(friendly(e),true);renderRecords();}
};
$('copy-diagnostics').onclick=async()=>{
 const statusBefore=lastMessage;
 try{
  const expected=invitedParticipant()?.address??lab?.p.address??null;
  const [accounts,chain]=provider?await Promise.all([provider.request({method:'eth_accounts'}),provider.request({method:'eth_chainId'})]):[[],null];
  const diagnostic={kind:'plab-connection-diagnostic',checkedAt:new Date().toISOString(),participantId:new URLSearchParams(location.search).get('invite'),expectedAccount:expected,siteAccount:account??null,registeredAccountAuthorized:Boolean(authorizedAccount(accounts,expected)),walletChainId:chain?Number(BigInt(chain)):null,confirmedOperations:lab?.next()??null,localBusy:lab?.busy??false,actionDisabled:$('send').disabled,blockingReasons:lastBlockReasons,statusMessage:statusBefore,records:(lab?.records??[]).map(({index,state,hash,nonceBefore,nonce})=>({step:index+1,state,hash:hash??null,nonceBefore:nonceBefore??null,nonce:nonce??null}))};
  await navigator.clipboard.writeText(JSON.stringify(diagnostic,null,2));message('接続診断をコピーしました。実験者へ貼り付けてください。署名・送金は行っていません。');
 }catch(e){message('診断をコピーできませんでした。画面のメッセージをそのまま実験者へお伝えください。'+friendly(e),true);}
};
$('copy-results').onclick=async()=>{try{await navigator.clipboard.writeText(JSON.stringify(lab.result(),null,2));message('取引結果をコピーしました。');}catch{message('「結果をダウンロード」をご利用ください。');}};
$('export').onclick=()=>{if(!lab)return;const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(lab.result(),null,2)],{type:'application/json'}));a.href=url;a.download='plab-results.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('wallet-browser').href='https://link.metamask.io/dapp/'+location.host+location.pathname+location.search;
for(const [label,address]of [['PLAB',config.token.address],['共用Vault',config.vault],['共用Splitter',config.splitter]]){const a=document.createElement('a');a.href=`${config.explorer}/address/${address}`;a.target='_blank';a.rel='noopener noreferrer';a.textContent=`${label} ${address}`;$('contract-links').append(a);}
window.addEventListener('storage',e=>{if(e.key===key&&lab){lock();lab.records=stored();message('別のタブで進行が更新されました。「状態を更新」で確認してください。');}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&lab&&!lab.busy)refresh();});
let demoIndex=0;
function drawDemo(){const U=10n**18n,bal=[400,390,390,190,240,390,390,290,290,290,250,290][demoIndex],dep=demoIndex===3?200:demoIndex===4?150:0,locked=demoIndex===7?100:demoIndex===10?40:0;draw({index:demoIndex,state:{balance:BigInt(bal)*U,deposit:BigInt(dep)*U,locked:BigInt(locked)*U,pol:200000000000000000n},waitSeconds:0n,expired:false,pending:false});$('send').disabled=false;}
$('demo').onclick=()=>{if(lab?.pending()||lab?.busy){message('送信状況の確認が終わるまで見本は開けません。');return;}demo=true;lab=null;demoIndex=0;clearInterval(poll);$('connection-badge').textContent='見本';$('demo-note').hidden=false;$('demo').hidden=true;$('registration').hidden=true;$('recover').hidden=true;$('results-panel').hidden=true;drawDemo();};
