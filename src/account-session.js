// eth_accounts lists accounts authorized for this site, not the app's selected tab.
const valid=a=>typeof a==='string'&&/^0x[0-9a-f]{40}$/i.test(a);
export function authorizedAccount(accounts,expected){
 if(!Array.isArray(accounts)||!valid(expected))return null;
 return accounts.find(a=>valid(a)&&a.toLowerCase()===expected.toLowerCase())??null;
}
export function connectionAccount(accounts,expected){
 return authorizedAccount(accounts,expected)??(Array.isArray(accounts)?accounts.find(valid):null)??null;
}
// User-clicked connection operation only: no signing or transaction methods.
export async function reselectAccount({connector,provider}){
 if(connector)return connector.connect({chainIds:['0x13882'],forceRequest:true});
 if(!provider)throw Error('MetaMaskへ接続してください。');
 return provider.request({method:'wallet_requestPermissions',params:[{eth_accounts:{}}]});
}
