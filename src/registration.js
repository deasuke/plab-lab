import {getAddress}from 'viem';
export function joinRequest(config,address,invite){
 if(config.chainId!==80002)throw Error('Amoyの設定ではありません。');
 if(!config.invitations?.some(i=>i.id===invite&&i.status==='open'))throw Error('実験者から受け取った参加用リンクを開いてください。');
 const account=getAddress(address);
 if(config.participants.some(p=>p.address.toLowerCase()===account.toLowerCase()))throw Error('このアカウントは登録済みです。実験者に参加リンクをご確認ください。');
 if(config.participants.some(p=>p.id===invite))throw Error('この参加番号は別のアカウントで準備済みです。実験者へご連絡ください。');
 return {version:1,kind:'plab-participant-join',chainId:80002,id:invite,address:account};
}
export function sameDeployment(a,b){return a.chainId===80002&&b.chainId===80002&&['vault','splitter','recipientB','recipientC'].every(k=>a[k]?.toLowerCase()===b[k]?.toLowerCase())&&a.token.address.toLowerCase()===b.token.address.toLowerCase()&&JSON.stringify(a.codeHashes)===JSON.stringify(b.codeHashes);}
