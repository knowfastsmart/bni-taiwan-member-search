/* Firebase modules load separately so search and device favorites work even if login is unavailable. */
const $=id=>document.getElementById(id);
const store=window.BNI_FAVORITES_STORE;
let auth,db,authAPI,fireAPI,user=null,unsubscribe=null,busy=false,actionError='';
const config=window.BNI_FIREBASE_CONFIG;
const message=$('accountMessage'),login=$('googleLogin'),logout=$('googleLogout'),importButton=$('importFavorites'),retry=$('retrySync');
function ui(s=store.snapshot()){
  $('accountName').textContent=user?(user.displayName||'Google 帳號'):'讓收藏跟著你';
  $('accountEmail').textContent=user?(user.email||'已登入 Google'):'使用 Google 帳號同步收藏';
  login.hidden=!!user;logout.hidden=!user;login.disabled=busy||!auth;logout.disabled=busy;
  importButton.hidden=!user||!s.ready||!s.importable;importButton.disabled=busy;
  importButton.textContent=`匯入此裝置的 ${s.importable} 筆收藏`;
  retry.hidden=!user||!s.error;retry.disabled=busy;
  if(user){message.textContent=s.error||(!s.ready?'正在讀取你的雲端收藏…':s.pending?`有 ${s.pending} 筆收藏待同步${s.offline?'，連線後會繼續':'…'}`:s.offline?'目前離線，已顯示此連線的收藏快取。':'收藏已同步，可在其他裝置登入查看。');}
  else if(auth)message.textContent='未登入時，收藏只儲存在這台裝置。';
  if(actionError)message.textContent=actionError;
  if(s.storageError)message.textContent+=' 此瀏覽器限制本機儲存，請保持連線完成同步。';
}
function errorMessage(error){return {'auth/popup-closed-by-user':'已取消登入，可隨時重試。','auth/cancelled-popup-request':'登入視窗已關閉，請重試。','auth/popup-blocked':'瀏覽器阻擋登入視窗，請允許此網站的彈出視窗後重試。','auth/unauthorized-domain':'目前網址尚未完成 Google 登入設定，請聯絡網站管理者。','auth/network-request-failed':'無法連線至 Google，請檢查網路後重試。','auth/web-storage-unsupported':'瀏覽器限制登入所需的儲存空間，請改用一般瀏覽模式。'}[error?.code]||'Google 登入暫時無法使用，請稍後重試。';}
function watch(){
  unsubscribe?.();unsubscribe=null;const current=user;
  const version=store.connect(current?.uid,(uid,key,active)=>fireAPI.setDoc(fireAPI.doc(db,'users',uid,'favorites',key),{active,updatedAt:fireAPI.serverTimestamp()}));
  if(!current)return;
  unsubscribe=fireAPI.onSnapshot(fireAPI.collection(db,'users',current.uid,'favorites'),{includeMetadataChanges:true},snapshot=>store.receive(version,snapshot.docs.map(d=>({id:d.id,active:d.data().active===true})),snapshot.metadata.fromCache),()=>store.fail(version,'無法讀取雲端收藏，請檢查網路或聯絡網站管理者。'));
}
store.subscribe(ui);
login.onclick=async()=>{if(!auth||busy)return;busy=true;actionError='';ui();try{const provider=new authAPI.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});await authAPI.signInWithPopup(auth,provider);}catch(error){actionError=errorMessage(error);}finally{busy=false;ui();}};
logout.onclick=async()=>{if(busy)return;busy=true;actionError='';ui();try{await authAPI.signOut(auth);}catch{actionError='登出失敗，請檢查網路後重試。';}finally{busy=false;ui();}};
importButton.onclick=()=>{store.importGuest();};
retry.onclick=()=>watch();
window.addEventListener('online',()=>{if(user){if(!store.ready||store.error)watch();else store.retry();}});
async function start(){
  if(!config?.apiKey||!config?.projectId){message.textContent='Google 登入設定中；目前仍可搜尋及使用此裝置的收藏。';return;}
  try{
    const [appAPI,a,f]=await Promise.all([import('https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js')]);
    authAPI=a;fireAPI=f;const app=appAPI.initializeApp(config);auth=a.getAuth(app);db=f.getFirestore(app);
    // Auth persists only in the browser; no Google access token is copied into app storage or logs.
    a.onAuthStateChanged(auth,next=>{user=next;watch();ui();},()=>{message.textContent='登入狀態讀取失敗，請重新整理後再試。';});ui();
  }catch{message.textContent='Google 登入服務暫時無法載入；搜尋與此裝置的收藏仍可使用。';}
}
start();
