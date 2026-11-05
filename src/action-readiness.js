// A disabled action must always have an explicit reason. Never drop unresolved requests.
export function blockingReasons({pending=false,busy=false,chainId,waitSeconds=0n}){
 const reasons=[];
 if(chainId!==80002)reasons.push('MetaMaskの接続先がAmoyではありません。「Amoyへ切り替え」を押してください。');
 if(pending)reasons.push('前の送信状況を確認中です。取引欄を確認し、「チェーンから進行を復元」を押してください。');
 if(busy)reasons.push('MetaMaskへの要求処理が続いています。新たな署名要求は送りません。');
 if(BigInt(waitSeconds)>0n)reasons.push(`返金可能になるまでチェーン時刻で約${waitSeconds}秒です。`);
 return reasons;
}
