import './style.css';
import {createPublicClient,http,fallback,formatEther,getAddress}from 'viem';
import {polygonAmoy}from 'viem/chains';
import {Lab,STEPS,selectParticipant}from './lab.js';
const $=id=>document.getElementById(id),config=await fetch('./lab.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('公開設定を取得できません。');return r.json();});
const client=createPublicClient({chain:polygonAmoy,transport:fallback(config.rpcUrls.map(url=>http(url,{retryCount:1,timeout:15000})))});
let provider,connector,account,lab,key,demo=false,poll;
const message=(text,error=false)=>{$('status').textContent=text;$('status').classList.toggle('error',error);};
const friendly=e=>{if(e?.code===4001)return 'ウォレットでキャンセルされました。資金は移動していません。';return String(e?.shortMessage||e?.message||e).replace(/https?:\/\/[^\s"'<>]+/g,'[接続先]').slice(0,900);};
const amount=n=>Number(formatEther(n)).toLocaleString('ja-JP',{maximumFractionDigits:6});
function stored(){try{return JSON.parse(localStorage.getItem(key)||'[]');}catch{throw Error('保存記録を読み込めません。主催者へご連絡ください。');}}
function persist(records){localStorage.setItem(key,JSON.stringify(records));renderRecords();}
const lock=()=>{$('send').disabled=true;};
function renderRecords(){
 $('results').replaceChildren();if(!lab)return;
 $('results-panel').hidden=lab.records.length===0;
 for(const r of lab.records){const li=document.createElement('li');li.textContent=`${r.recovery?'回復用返金':r.index+1+'. '+STEPS[r.index]?.label}　${({confirmed:'確定',pending:'確定待ち',requesting:'送信状況の確認が必要',failed:'失敗'})[r.state]||r.state}`;if(r.hash){const a=document.createElement('a');a.href=`${config.explorer}/tx/${r.hash}`;a.target='_blank';a.rel='noopener noreferrer';a.textContent=r.hash;li.append(a);}$('results').append(li);}
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
 $('send').disabled=!demo&&(view.pending||view.waitSeconds>0n||lab?.busy);
 if(view.pending)message('送信状況を確認しています。ウォレットへ署名を要求した後に通信が途切れた場合も、操作ボタンを押し直さず「状態を更新」または「進行を復元」を使ってください。');
 else if(view.expired){$('action-title').textContent='期限切れの100 PLABを返金';$('send').textContent='100 PLABを自分のアカウントへ返金';$('action-description').textContent='元の注文を返金して資金を戻します。決済実験の完了には数えず、次の実施方法を主催者と確認します。';$('action-effect').textContent='専用Escrow → あなた';message('100 PLAB注文の期限を過ぎています。決済の代わりに返金できます。',true);}
 else if(view.waitSeconds>0n)message(`返金可能になるまで、チェーン時刻で約${view.waitSeconds}秒です。時間が来たら「状態を更新」を押してください。この画面を閉じても後から再開できます。`);
 else message(demo?'見本モードです。説明用の状態を切り替えています。':`次は「${step.label}」です。ボタンを押すとウォレットで確認します。`);
}
async function refresh(){if(demo){drawDemo();return;}if(!lab)return;lock();message('チェーン上の記録を確認しています…');try{draw(await lab.refresh());renderRecords();}catch(e){message(friendly(e),true);}}
function storageKey(p){return `plab-mobile-v1:${config.chainId}:${p.address.toLowerCase()}:${p.escrow.toLowerCase()}:${p.id}`;}
async function afterConnect(){
 demo=false;$('demo-note').hidden=true;$('demo').hidden=false;account=(await provider.request({method:'eth_accounts'}))[0];if(!account)throw Error('ウォレットのアカウントを選んでください。');
 $('account').textContent=getAddress(account);$('account').hidden=false;$('disconnect').hidden=false;$('connection-badge').textContent='接続済み';$('connect').textContent='接続アカウントを再確認';
 const chain=Number(BigInt(await provider.request({method:'eth_chainId'})));$('switch').hidden=chain===80002;
 try{const p=selectParticipant(config,account,new URLSearchParams(location.search).get('invite'));key=storageKey(p);lab=new Lab({config,participant:p,client,provider,records:stored(),persist});$('registration').hidden=true;$('recover').hidden=false;await refresh();}
 catch(e){lab=null;lock();$('action-box').hidden=true;$('dashboard').hidden=true;$('registration').hidden=false;message(friendly(e),true);}
}
$('connect').onclick=async()=>{
 lock();message('MetaMaskへの接続を確認しています。ウォレットアプリの画面をご確認ください。');
 try{
  // The injected provider is used only where a wallet actually supplies one.
  if(window.ethereum?.isMetaMask){provider=window.ethereum;await provider.request({method:'eth_requestAccounts'});}
  else{const {createEVMClient}=await import('@metamask/connect-evm');connector??=await createEVMClient({dapp:{name:'PLAB 実験室',url:location.origin+location.pathname,iconUrl:new URL('./icon.svg',location.href).href},api:{supportedNetworks:{'0x13882':config.rpcUrls[0]}}});await connector.connect({chainIds:['0x13882']});provider=connector.getProvider();}
  for(const event of ['accountsChanged','chainChanged'])provider.on?.(event,()=>{lock();lab=null;$('action-box').hidden=true;message('接続が変更されました。「接続アカウントを再確認」を押してください。');});
  await afterConnect();
 }catch(e){message(friendly(e),true);}
};
$('switch').onclick=async()=>{try{if(connector)await connector.switchChain({chainId:'0x13882',chainConfiguration:{chainId:'0x13882',chainName:'Polygon Amoy',nativeCurrency:{name:'POL',symbol:'POL',decimals:18},rpcUrls:config.rpcUrls,blockExplorerUrls:[config.explorer]}});else{try{await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x13882'}]});}catch(e){if(e.code!==4902)throw e;await provider.request({method:'wallet_addEthereumChain',params:[{chainId:'0x13882',chainName:'Polygon Amoy',nativeCurrency:{name:'POL',symbol:'POL',decimals:18},rpcUrls:config.rpcUrls,blockExplorerUrls:[config.explorer]}]});}}await afterConnect();}catch(e){message(friendly(e),true);}};
$('disconnect').onclick=async()=>{try{await connector?.disconnect();}finally{provider=null;lab=null;lock();$('action-box').hidden=true;$('dashboard').hidden=true;$('connection-badge').textContent='未接続';$('account').hidden=true;$('registration').hidden=true;$('disconnect').hidden=true;message('接続を解除しました。取引の記録はこのブラウザに保持されています。');}};
$('refresh').onclick=refresh;
$('send').onclick=async()=>{
 if(demo){demoIndex=Math.min(11,demoIndex+1);drawDemo();return;}if(!lab||lab.busy)return;lock();
 try{
  const send=async()=>{lab.records=stored();message('送信前の確認中です。その後、ウォレットで内容を確認してください。');const view=await lab.refresh();if(view.expired)await lab.refundExpired();else await lab.send(lab.next());message('送信済みです。確定を待っています。');await refresh();clearInterval(poll);let count=0;poll=setInterval(async()=>{if(lab&&!lab.busy)await refresh();if(!lab?.pending()||++count>15)clearInterval(poll);},5000);};
  if(navigator.locks)await navigator.locks.request(key,{ifAvailable:true},async lock=>{if(!lock)throw Error('別のタブで操作中です。そちらの確定を待ってください。');await send();});else await send();
 }catch(e){message(friendly(e),true);renderRecords();}
};
$('recover').onclick=async()=>{if(!lab||lab.busy)return;lock();message('参加開始後のイベントから進行を復元しています…');try{draw(await lab.recover());renderRecords();}catch(e){message('復元を完了できませんでした。既存の記録は保持しています。'+friendly(e),true);}};
$('copy-address').onclick=async()=>{try{await navigator.clipboard.writeText(getAddress(account));message('公開アドレスをコピーしました。主催者へお伝えください。');}catch{message('上に表示されている公開アドレスを選択してコピーしてください。');}};
$('copy-results').onclick=async()=>{try{await navigator.clipboard.writeText(JSON.stringify(lab.result(),null,2));message('取引結果をコピーしました。');}catch{message('「結果をダウンロード」をご利用ください。');}};
$('export').onclick=()=>{if(!lab)return;const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(lab.result(),null,2)],{type:'application/json'}));a.href=url;a.download='plab-results.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('wallet-browser').href='https://link.metamask.io/dapp/'+location.host+location.pathname+location.search;
for(const [label,address]of [['PLAB',config.token.address],['共用Vault',config.vault],['共用Splitter',config.splitter]]){const a=document.createElement('a');a.href=`${config.explorer}/address/${address}`;a.target='_blank';a.rel='noopener noreferrer';a.textContent=`${label} ${address}`;$('contract-links').append(a);}
window.addEventListener('storage',e=>{if(e.key===key&&lab){lock();lab.records=stored();message('別のタブで進行が更新されました。「状態を更新」で確認してください。');}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&lab&&!lab.busy)refresh();});
let demoIndex=0;
function drawDemo(){const U=10n**18n,bal=[400,390,390,190,240,390,390,290,290,290,250,290][demoIndex],dep=demoIndex===3?200:demoIndex===4?150:0,locked=demoIndex===7?100:demoIndex===10?40:0;draw({index:demoIndex,state:{balance:BigInt(bal)*U,deposit:BigInt(dep)*U,locked:BigInt(locked)*U,pol:200000000000000000n},waitSeconds:0n,expired:false,pending:false});$('send').disabled=false;}
$('demo').onclick=()=>{if(lab?.pending()||lab?.busy){message('送信状況の確認が終わるまで見本は開けません。');return;}demo=true;lab=null;demoIndex=0;clearInterval(poll);$('connection-badge').textContent='見本';$('demo-note').hidden=false;$('demo').hidden=true;$('registration').hidden=true;$('recover').hidden=true;$('results-panel').hidden=true;drawDemo();};
