// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
getDatabase, ref, set, push, onValue, update, runTransaction, child, get, remove
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import {
getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// --- ⚙️ Firebase設定 ---
const firebaseConfig = {
apiKey: "AIzaSyBdT1yWLsKQ8hyktm0TgCtkc3jLKlOVllY",
authDomain: "takei-netplus.firebaseapp.com",
databaseURL: "https://takei-netplus-default-rtdb.asia-southeast1.firebasedatabase.app",
projectId: "takei-netplus",
storageBucket: "takei-netplus.firebasestorage.app",
messagingSenderId: "180284787102",
appId: "1:180284787102:web:4c9880b6930f323a94ee8f",
measurementId: "G-HM4ELHCT3V"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// --- 📍 グローバル状態 ---
let currentQuoteTargetId = null;
let currentReplyTargetId = null;
let activeDmChatPartnerId = null;
let currentCategory = "general";

// 表示切り替えユーティリティ
function setDisplay(id, val) {
const el = document.getElementById(id);
if (el) el.style.display = val;
}

// 日付フォーマット
function formatDate(timestamp) {
if (!timestamp) return "";
const d = new Date(timestamp);
return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Base64エンコード
function toBase64(file) {
return new Promise((resolve, reject) => {
const reader = new FileReader();
reader.readAsDataURL(file);
reader.onload = () => resolve(reader.result);
reader.onerror = error => reject(error);
});
}

// --- 🔐 ログイン・新規登録処理 ---
const toSignupBtn = document.getElementById("to-signup");
if (toSignupBtn) {
toSignupBtn.addEventListener("click", () => {
setDisplay("login-card", "none");
setDisplay("signup-card", "block");
});
}

const toLoginBtn = document.getElementById("to-login");
if (toLoginBtn) {
toLoginBtn.addEventListener("click", () => {
setDisplay("signup-card", "none");
setDisplay("login-card", "block");
});
}

const btnSignup = document.getElementById("btn-signup");
if (btnSignup) {
btnSignup.addEventListener("click", async () => {
const name = document.getElementById("signup-name").value.trim();
const romanId = document.getElementById("signup-name-roman").value.trim().toLowerCase();
let email = document.getElementById("signup-email").value.trim();
const password = document.getElementById("signup-password").value;
const avatarFileInput = document.getElementById("signup-avatar-file");
const avatarFile = avatarFileInput ? avatarFileInput.files[0] : null;

if (!name || !romanId || !password) {
alert("必須項目（表示名、ログインID、パスワード）をすべて入力してください。");
return;
}

const usersRef = ref(db, "users");
const usersSnap = await get(usersRef);
if (usersSnap.exists()) {
const usersData = usersSnap.val();
for (const uid in usersData) {
if (usersData[uid].userLoginId === romanId) {
alert("このログインIDはすでに使われています。別のIDにしてください。");
return;
}
}
}

if (!email) {
email = `${romanId}@takei.net`;
}

try {
const userCredential = await createUserWithEmailAndPassword(auth, email, password);
const user = userCredential.user;

let photoURL = "🧪";
if (avatarFile) {
photoURL = await toBase64(avatarFile);
}

await set(ref(db, `users/${user.uid}`), {
uid: user.uid,
displayName: name,
userLoginId: romanId,
email: email,
photoURL: photoURL,
bio: "よろしくお願いします！",
createdAt: Date.now()
});

alert("登録が完了しました！");
} catch (e) {
alert("登録失敗: " + e.message);
}
});
}

const btnLogin = document.getElementById("btn-login");
if (btnLogin) {
btnLogin.addEventListener("click", async () => {
const identifier = document.getElementById("login-identifier").value.trim().toLowerCase();
const password = document.getElementById("login-password").value;
if (!identifier || !password) {
alert("ログイン情報を入力してください。");
return;
}

let targetEmail = identifier;

if (!identifier.includes("@")) {
const usersRef = ref(db, "users");
const snapshot = await get(usersRef);
if (snapshot.exists()) {
const users = snapshot.val();
let found = false;
for (const uid in users) {
if (users[uid].userLoginId === identifier) {
targetEmail = users[uid].email || `${identifier}@takei.net`;
found = true;
break;
}
}
if (!found) {
alert("このログインIDは見つかりませんでした。");
return;
}
}
}

try {
await signInWithEmailAndPassword(auth, targetEmail, password);
} catch (e) {
alert("ログイン失敗: " + e.message);
}
});
}

const btnLogout = document.getElementById("btn-logout");
if (btnLogout) {
btnLogout.addEventListener("click", async () => {
await signOut(auth);
location.reload();
});
}

const btnMobileLogout = document.getElementById("btn-mobile-logout");
if (btnMobileLogout) {
btnMobileLogout.addEventListener("click", async () => {
await signOut(auth);
location.reload();
});
}

onAuthStateChanged(auth, (user) => {
if (user) {
setDisplay("auth-gateway", "none");
setDisplay("app-container", "flex");
// ヘッダーやアバターの同期
onValue(ref(db, `users/${user.uid}`), (snap) => {
const data = snap.val();
if (data) {
const updateAvatar = (el) => {
if (!el) return;
if (data.photoURL && data.photoURL.startsWith("data:image")) {
el.innerText = "";
el.style.backgroundImage = `url(${data.photoURL})`;
} else {
el.innerText = data.photoURL || "🧪";
el.style.backgroundImage = "none";
}
};
updateAvatar(document.getElementById("current-user-avatar"));
updateAvatar(document.getElementById("header-user-avatar"));
}
});

loadUnifiedTimeline();
initNotificationObserver();
loadDmUserList();
} else {
setDisplay("app-container", "none");
setDisplay("auth-gateway", "flex");
}
});


// --- 🏷️ カテゴリ（スレッド）切り替え ---
const tabElements = document.querySelectorAll(".category-tab");
tabElements.forEach(tab => {
tab.addEventListener("click", (e) => {
tabElements.forEach(t => t.classList.remove("active"));
e.target.classList.add("active");
currentCategory = e.target.getAttribute("data-category");
loadUnifiedTimeline();
});
});


// --- 📱 タイムライン表示 ＆ 引用機能・いいね制限の修正 ---
function loadUnifiedTimeline() {
const postsRef = ref(db, "posts");
onValue(postsRef, (snapshot) => {
const timelineContainer = document.getElementById("timeline");
if (!timelineContainer) return;

timelineContainer.innerHTML = "";
const data = snapshot.val();
if (!data) {
timelineContainer.innerHTML = "<div style='padding:20px; color:#71767b; text-align:center;'>まだ投稿はありません。</div>";
return;
}

const posts = Object.keys(data)
.map(key => ({ id: key, ...data[key] }))
.filter(post => !post.parentPostId && (post.category === currentCategory || (!post.category && currentCategory === "general")))
.sort((a, b) => b.createdAt - a.createdAt);

if (posts.length === 0) {
timelineContainer.innerHTML = `<div style='padding:20px; color:#71767b; text-align:center;'>このスレッドにはまだ投稿がありません。</div>`;
return;
}

posts.forEach(post => {
timelineContainer.appendChild(renderPost(post));
});
});
}

// 📌 投稿＆引用表示の本体処理
function renderPost(post, isThreadDetail = false) {
const postElement = document.createElement("div");
postElement.className = "post";
postElement.dataset.id = post.id;

const myUid = auth.currentUser ? auth.currentUser.uid : "";

// ユーザー情報を引く
const userRef = ref(db, `users/${post.senderId}`);
onValue(userRef, (userSnap) => {
const uData = userSnap.val() || {};
const displayName = uData.displayName || "名無し";
const userLoginId = uData.userLoginId || "unknown";
const photoURL = uData.photoURL || "🧪";

let avatarStyle = "";
let avatarText = "";
if (photoURL.startsWith("data:image")) {
avatarStyle = `background-image: url(${photoURL})`;
} else {
avatarText = photoURL;
}

const replyCount = post.replyCount || 0;
const quoteCount = post.quoteCount || 0;
const likeCount = post.likeCount || 0;

let quotedHTML = "";
if (post.quotedPostId) {
quotedHTML = `
<div class="quoted-container" id="quote-preview-box-${post.id}">
<div id="quote-content-area-${post.id}" style="font-size: 13px; color: #71767b;">
引用元を読み込み中...
</div>
</div>
`;
}

postElement.innerHTML = `
<div style="flex-shrink:0;">
<div id="avatar-${post.id}" class="avatar" style="${avatarStyle}">${avatarText}</div>
</div>
<div class="post-body">
<div class="post-header">
<span class="display-name">${displayName}</span>
<span>@${userLoginId}</span>
<span>·</span>
<span>${formatDate(post.createdAt)}</span>
</div>
<div class="post-content">${post.content}</div>
${quotedHTML}
<div class="post-actions">
<div class="action-btn" id="action-reply-${post.id}">💬 <span>${replyCount}</span></div>
<div class="action-btn" id="action-quote-${post.id}">🔄 <span>${quoteCount}</span></div>
<div class="action-btn" id="action-like-${post.id}">❤️ <span id="like-count-num-${post.id}">${likeCount}</span></div>
</div>
</div>
`;

// アバタータップ
const avatarBtn = postElement.querySelector(`#avatar-${post.id}`);
if (avatarBtn) {
avatarBtn.addEventListener("click", (e) => {
e.stopPropagation();
showUserProfile(post.senderId);
});
}

// 返信ボタン
const replyBtn = postElement.querySelector(`#action-reply-${post.id}`);
if (replyBtn) {
replyBtn.addEventListener("click", (e) => {
e.stopPropagation();
currentReplyTargetId = post.id;
const targetContentEl = document.getElementById("reply-target-post-content");
if (targetContentEl) {
targetContentEl.innerText = `"${displayName}: ${post.content}"`;
}
setDisplay("reply-modal", "flex");
});
}

// 引用ボタン
const quoteBtn = postElement.querySelector(`#action-quote-${post.id}`);
if (quoteBtn) {
quoteBtn.addEventListener("click", (e) => {
e.stopPropagation();
currentQuoteTargetId = post.id;
const previewContentEl = document.getElementById("quote-preview-content");
if (previewContentEl) {
previewContentEl.innerText = `引用元: @${userLoginId}の投稿`;
}
setDisplay("quote-preview", "block");
const postInput = document.getElementById("post-input");
if (postInput) postInput.focus();
});
}

// ❤️ いいねボタン（1人1個まで！）
const likeBtn = postElement.querySelector(`#action-like-${post.id}`);
if (likeBtn && myUid) {
const userLikeRef = ref(db, `likes/${post.id}/${myUid}`);
// 自分がすでにいいねしているかリアルタイム監視
onValue(userLikeRef, (likeSnap) => {
if (likeSnap.exists()) {
likeBtn.classList.add("liked");
} else {
likeBtn.classList.remove("liked");
}
});

likeBtn.addEventListener("click", async (e) => {
e.stopPropagation();
const likeCheck = await get(userLikeRef);
const postRef = ref(db, `posts/${post.id}`);

if (likeCheck.exists()) {
// すでにいいねしている場合は、いいね解除（トグル）
await remove(userLikeRef);
await runTransaction(postRef, (currentPost) => {
if (currentPost) {
currentPost.likeCount = Math.max(0, (currentPost.likeCount || 0) - 1);
}
return currentPost;
});
} else {
// いいねしていない場合は、新規いいね登録
await set(userLikeRef, true);
await runTransaction(postRef, (currentPost) => {
if (currentPost) {
currentPost.likeCount = (currentPost.likeCount || 0) + 1;
sendNotification(currentPost.senderId, "like", myUid, post.id);
}
return currentPost;
});
}
});
}

// 🔗 引用元の実体読み込み処理
if (post.quotedPostId) {
const quoteRef = ref(db, `posts/${post.quotedPostId}`);
onValue(quoteRef, (quoteSnap) => {
const quotedPost = quoteSnap.val();
const box = document.getElementById(`quote-preview-box-${post.id}`);
const contentArea = document.getElementById(`quote-content-area-${post.id}`);
if (!box || !contentArea) return;
if (!quotedPost) {
contentArea.innerText = "⚠️ この投稿は削除されました。";
return;
}

// 引用元のユーザー情報を取得して表示
onValue(ref(db, `users/${quotedPost.senderId}`), (qUserSnap) => {
const quData = qUserSnap.val() || {};
contentArea.innerHTML = `
<div style="font-weight: bold; margin-bottom: 4px; color: #fff; font-size: 13px;">
${quData.displayName || "名無し"} <span style="font-weight: normal; color: #71767b; font-size: 11px;">@${quData.userLoginId || "unknown"}</span>
</div>
<div style="font-size: 13px; color: #e7e9ea;">${quotedPost.content}</div>
`;
}, { onlyOnce: true });

// 引用元タップ時にスレッド移動
box.onclick = (e) => {
e.stopPropagation();
openPostThreadDetail(quotedPost);
};
});
}
}, { onlyOnce: true });

if (!isThreadDetail) {
postElement.addEventListener("click", () => {
openPostThreadDetail(post);
});
}

return postElement;
}


// --- 🧵 スレッド詳細表示 ---
function openPostThreadDetail(parentPost) {
setDisplay("timeline", "none");
setDisplay("global-tweet-box", "none");
setDisplay("category-tabs-container", "none");
setDisplay("thread-detail-container", "block");

const mainPostArea = document.getElementById("thread-main-post");
const repliesArea = document.getElementById("thread-replies-list");
const pageTitle = document.getElementById("page-title");

if (pageTitle) pageTitle.innerText = "スレッド";
if (mainPostArea) {
mainPostArea.innerHTML = "";
mainPostArea.appendChild(renderPost(parentPost, true));
}

const postsRef = ref(db, "posts");
onValue(postsRef, (snapshot) => {
if (!repliesArea) return;
repliesArea.innerHTML = "";
const data = snapshot.val();
if (!data) return;

const replies = Object.keys(data)
.map(key => ({ id: key, ...data[key] }))
.filter(post => post.parentPostId === parentPost.id)
.sort((a, b) => a.createdAt - b.createdAt);

if (replies.length === 0) {
repliesArea.innerHTML = "<div style='padding:15px; color:#71767b; font-size:13px; text-align:center;'>返信はまだありません。</div>";
return;
}

replies.forEach(reply => {
repliesArea.appendChild(renderPost(reply, false));
});
});
}

const backToHomeFromThread = document.getElementById("btn-back-to-home");
if (backToHomeFromThread) {
backToHomeFromThread.addEventListener("click", () => {
setDisplay("thread-detail-container", "none");
setDisplay("timeline", "block");
setDisplay("global-tweet-box", "block");
setDisplay("category-tabs-container", "flex");
const pageTitle = document.getElementById("page-title");
if (pageTitle) pageTitle.innerText = "ホーム";
});
}


// --- 🚀 新規投稿処理 ---
async function submitPostData(content, parentPostId = null, quotedPostId = null) {
const user = auth.currentUser;
if (!user) return;

const newPostKey = push(child(ref(db), 'posts')).key;
const postData = {
id: newPostKey,
senderId: user.uid,
content: content,
category: currentCategory,
createdAt: Date.now(),
replyCount: 0,
quoteCount: 0,
likeCount: 0
};

if (parentPostId) postData.parentPostId = parentPostId;
if (quotedPostId) postData.quotedPostId = quotedPostId;

await set(ref(db, `posts/${newPostKey}`), postData);

if (parentPostId) {
const parentRef = ref(db, `posts/${parentPostId}`);
await runTransaction(parentRef, (currentPost) => {
if (currentPost) {
currentPost.replyCount = (currentPost.replyCount || 0) + 1;
sendNotification(currentPost.senderId, "reply", user.uid, newPostKey);
}
return currentPost;
});
}

if (quotedPostId) {
const quoteRef = ref(db, `posts/${quotedPostId}`);
await runTransaction(quoteRef, (currentPost) => {
if (currentPost) {
currentPost.quoteCount = (currentPost.quoteCount || 0) + 1;
sendNotification(currentPost.senderId, "quote", user.uid, newPostKey);
}
return currentPost;
});
}
}

const submitPostBtn = document.getElementById("submit-post");
if (submitPostBtn) {
submitPostBtn.addEventListener("click", async () => {
const input = document.getElementById("post-input");
if (!input) return;
const content = input.value.trim();
if (!content) return;

await submitPostData(content, null, currentQuoteTargetId);
input.value = "";
currentQuoteTargetId = null;
setDisplay("quote-preview", "none");
});
}

const closeQuotePreviewBtn = document.getElementById("close-quote-preview");
if (closeQuotePreviewBtn) {
closeQuotePreviewBtn.addEventListener("click", () => {
currentQuoteTargetId = null;
setDisplay("quote-preview", "none");
});
}

const submitReplyBtn = document.getElementById("submit-reply");
if (submitReplyBtn) {
submitReplyBtn.addEventListener("click", async () => {
const input = document.getElementById("reply-input");
if (!input || !currentReplyTargetId) return;
const content = input.value.trim();
if (!content) return;

await submitPostData(content, currentReplyTargetId, null);
input.value = "";
currentReplyTargetId = null;
setDisplay("reply-modal", "none");
});
}


// --- 💬 DMチャット機能 ---
const btnStartChat = document.getElementById("btn-start-chat");
if (btnStartChat) {
btnStartChat.addEventListener("click", async () => {
const input = document.getElementById("dm-target-id-input");
if (!input) return;
const rawTargetId = input.value.trim().toLowerCase();
if (!rawTargetId) {
alert("ログインIDを入力してください。");
return;
}

if (!auth.currentUser) return;

const usersRef = ref(db, "users");
const snapshot = await get(usersRef);
const users = snapshot.val();
let foundPartner = null;
if (users) {
for (const uid in users) {
if (users[uid].userLoginId === rawTargetId) {
foundPartner = users[uid];
break;
}
}
}

if (foundPartner) {
if (foundPartner.uid === auth.currentUser.uid) {
alert("自分自身とチャットすることはできません！");
return;
}
input.value = "";
openDmChatWith(foundPartner.uid, foundPartner.displayName);
} else {
alert("ユーザーが見つかりませんでした。");
}
});
これを元にルール厳守で完全版を
}

function loadDmUserList() {
const directMsgsRef = ref(db, "direct_messages");
onValue(directMsgsRef, (snapshot) => {
const container = document.getElementById("dm-users-container");
if (!container) return;
container.innerHTML = "";

const data = snapshot.val();
if (!data) {
container.innerHTML = "<div style='padding:20px; color:#71767b; text-align:center;'>メッセージ履歴がありません。</div>";
return;
}

const myUid = auth.currentUser ? auth.currentUser.uid : "";
const activePartnerUids = new Set();

Object.keys(data).forEach(roomKey => {
if (roomKey.includes(myUid)) {
const uids = roomKey.split("_");
