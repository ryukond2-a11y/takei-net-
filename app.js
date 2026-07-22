// app.js
import  {initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getDatabase, 
  ref, 
  query, 
  limitToLast, 
  onValue 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
// ※ Firebaseの初期化設定（firebaseConfig や db の定義がある場所）
// 例:
// const app = initializeApp(firebaseConfig);
// const db = getDatabase(app);

// 全データを保持する配列（フィルター切替用）
let allAnnouncements = [];
let currentFilter = 'all';

function initAnnouncements() {
  const NEWS_PATH = 'announcements';
  const newsQuery = query(ref(db, NEWS_PATH), limitToLast(20));

  onValue(newsQuery, (snapshot) => {
    const data = snapshot.val();
    const container = document.getElementById('announcements-container');

    if (!data) {
      container.innerHTML = '<p style="color: #71767b; text-align: center;">現在お知らせはありません。</p>';
      allAnnouncements = [];
      return;
    }

    allAnnouncements = Object.keys(data).map(key => ({
      id: key,
      ...data[key]
    })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    renderAnnouncements();
  }, (error) => {
    console.error("お知らせの取得に失敗しました:", error);
  });
}


// 画面へ描画する関数
function renderAnnouncements() {
  const container = document.getElementById('announcements-container');
  container.innerHTML = '';

  // フィルター処理
  const filteredList = allAnnouncements.filter(item => {
    if (currentFilter === 'all') return true;
    return item.category === currentFilter;
  });

  if (filteredList.length === 0) {
    container.innerHTML = '<p style="color: #71767b; text-align: center;">該当するお知らせはありません。</p>';
    return;
  }

  filteredList.forEach(item => {
    const card = document.createElement('div');
    card.className = 'announcement-card';

    const isPatch = item.category === 'patchnote';
    const badgeClass = isPatch ? 'badge-patch' : 'badge-qa';
    const badgeText = isPatch ? 'パッチノート' : 'Q&A';
    const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleString('ja-JP') : '';

    card.innerHTML = `
      <div class="announcement-header">
        <span class="${badgeClass}">${badgeText}</span>
        <span class="announcement-title">${escapeHtml(item.title)}</span>
      </div>
      <div class="announcement-body">${escapeHtml(item.content)}</div>
      <div class="announcement-date">${dateStr}</div>
    `;

    container.appendChild(card);
  });
}

// サブタブ（フィルター）切り替え用関数
window.filterAnnouncements = function(category) {
  currentFilter = category;
  
  // ボタンの見た目を更新
  document.querySelectorAll('.sub-tab-btn').forEach(btn => btn.classList.remove('active'));
  if (event && event.target) {
    event.target.classList.add('active');
  }

  renderAnnouncements();
};

// XSS対策のエスケープ関数
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// アプリ起動時に初期化を実行
initAnnouncements();


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
// --- 🔐 スレッド保護設定 & 認証状態管理 ---
const unlockedCategories = new Set(["general"]); // 全体タイムラインは初期状態で解放

const categoryConfig = {
  "1a": {
    name: "1-A",
    quizQuestion: "クイズ: 1-Aの担任のフルネームは？",
    answers: ["岡崎靖", "岡崎 靖", "おかざきやすし"]
  },
  "takehaya": {
    name: "竹早全体",
    quizQuestion: "クイズ: 学年集会が開かれる場所は？",
    answers: ["学ロビ", "学年ロビー"]
  },
  "nakajima": {
    name: "中島小",
    quizQuestion: "クイズ: 武井先生のフルネームは？",
    answers: ["武井健二", "武井 健二"]
  }
};
// 通知許可を求める関数を作っておく
async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    alert("お使いのブラウザは通知に対応していません。");
    return;
  }
  
  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    alert("通知が有効になりました！");
  } else if (permission === "denied") {
    alert("通知がブロックされています。ブラウザの設定から許可してください。");
  }
}

// 💡 画面上の「通知を有効化」ボタン等に割り当てる
// document.getElementById("btn-enable-notif")?.addEventListener("click", requestNotificationPermission);
function promptCategoryQuiz(targetCat) {
  const config = categoryConfig[targetCat];
  if (!config) return true; // 設定がないカテゴリはスルー

  const answer = prompt(`【${config.name} のアクセス認証】\n\n${config.quizQuestion}`);
  if (answer === null) return false;

  const cleanAnswer = answer.trim();
  if (config.answers.includes(cleanAnswer)) {
    unlockedCategories.add(targetCat);
    alert("認証成功！スレッドを表示します。");
    return true;
  } else {
    alert("不正解です。アクセスできません。");
    return false;
  }
}

// 既存の category-tab イベントハンドラを以下に置き換え
const tabElements = document.querySelectorAll(".category-tab");
tabElements.forEach(tab => {
  tab.addEventListener("click", (e) => {
    const selectedCat = e.target.getAttribute("data-category");

    if (!unlockedCategories.has(selectedCat)) {
      const isSuccess = promptCategoryQuiz(selectedCat);
      if (!isSuccess) return;
    }

    tabElements.forEach(t => t.classList.remove("active"));
    e.target.classList.add("active");
    currentCategory = selectedCat;
    loadUnifiedTimeline();
  });
});
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
// デバイス（ブラウザ）通知を送信する関数
function showDeviceNotification(title, body) {
  // ブラウザが通知に対応していて、許可されている場合のみ実行
  if ("Notification" in window && Notification.permission === "granted") {
    // 画面が非表示（裏で開いている/別タブにいる）の時だけ出す場合
    if (document.hidden) {
      new Notification(title, {
        body: body,
        icon: "🧪" // アイコン画像がある場合はパスを指定（例: "/icon.png"）
      });
    }
  }
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

// 📌 投稿＆引用表示の本体処理（画像表示対応版）
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

    // 📸 【超重要】データベースに画像が保存されていたら表示用のHTMLを作る
    let imageHTML = "";
    if (post.image) {
      imageHTML = `
        <div class="post-image-container" style="margin-top: 10px; max-width: 100%; border-radius: 12px; overflow: hidden; border: 1px solid #2f3336;">
          <img src="${post.image}" style="width: 100%; max-height: 350px; object-fit: cover; display: block;" alt="投稿画像">
        </div>
      `;
    }

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

    // 📸 内側のHTMLに ${imageHTML} をしっかり埋め込む！
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
        ${imageHTML} <!-- 👈 ここに画像がレンダリングされるよ！ -->
        ${quotedHTML}
        <div class="post-actions">
          <div class="action-btn" id="action-reply-${post.id}">💬 <span>${replyCount}</span></div>
          <div class="action-btn" id="action-quote-${post.id}">🔄 <span>${quoteCount}</span></div>
          <div class="action-btn" id="action-like-${post.id}">❤️ <span id="like-count-num-${post.id}">${likeCount}</span></div>
        </div>
      </div>
    `;

    // 💡 ここから下にあるはずの「クリックイベント（詳細画面への遷移やいいね、引用の処理）」はそのまま残してね！

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

    // 🔗 引用元の実体読み込み処理（クラッシュ対策の安全版）
    if (post.quotedPostId) {
      const quoteRef = ref(db, `posts/${post.quotedPostId}`);
      onValue(quoteRef, async (quoteSnap) => {
        const quotedPost = quoteSnap.val();
        const box = document.getElementById(`quote-preview-box-${post.id}`);
        const contentArea = document.getElementById(`quote-content-area-${post.id}`);
        if (!box || !contentArea) return;

        if (!quotedPost) {
          contentArea.innerHTML = `<div style="color: #71767b; font-style: italic; padding: 4px;">⚠️ この投稿は削除されました。</div>`;
          return;
        }

        // get() を使って確実に一度だけ安全にユーザー情報を取得する
        try {
          const qUserSnap = await get(ref(db, `users/${quotedPost.senderId}`));
          const quData = qUserSnap.val() || {};
          contentArea.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 4px; color: #fff; font-size: 13px;">
              ${quData.displayName || "名無し"} <span style="font-weight: normal; color: #71767b; font-size: 11px;">@${quData.userLoginId || "unknown"}</span>
            </div>
            <div style="font-size: 13px; color: #e7e9ea;">${quotedPost.content}</div>
          `;
        } catch (err) {
          console.error("引用ユーザー情報の取得に失敗:", err);
          contentArea.innerHTML = `<div style="font-size: 13px; color: #e7e9ea;">${quotedPost.content}</div>`;
        }

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

// --- 🚀 新規投稿処理（画像対応版） ---
async function submitPostData(content, parentPostId = null, quotedPostId = null, imageBase64 = null) {
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
  if (imageBase64) postData.image = imageBase64; // 📸 画像データを追加！

  await set(ref(db, `posts/${newPostKey}`), postData);



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

// ==========================================
// 📌 新規投稿ボタン（画像対応・リセット機能付き）
// ==========================================
const submitPostBtn = document.getElementById("submit-post");
if (submitPostBtn) {
  submitPostBtn.addEventListener("click", async () => {
    const input = document.getElementById("post-input");
    const imageInput = document.getElementById("post-image-file"); // 📸 HTMLの画像ファイル選択を取得
    if (!input) return;

    const content = input.value.trim();
    const imageFile = imageInput && imageInput.files ? imageInput.files[0] : null;

    // 💡 文字も画像も、両方とも空っぽなら何もしない
    if (!content && !imageFile) return;

    let imageBase64 = null;
    if (imageFile) {
      try {
        // 画像を Base64 文字列に変換
        imageBase64 = await toBase64(imageFile);
      } catch (e) {
        console.error("画像の変換に失敗しました:", e);
        alert("画像の読み込みに失敗しました。");
        return;
      }
    }

    // 🚀 送信処理！4番目の引数に imageBase64 をしっかり渡す
    await submitPostData(content, null, currentQuoteTargetId, imageBase64);

    // ✨ 送信完了したら、すべてをきれいにリセット！
    input.value = "";
    if (imageInput) {
      imageInput.value = ""; // 📸 これで上に残っていたファイル名が消えて「選択されていません」に戻るよ！
    }
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

// ==========================================
// 📌 返信（リプライ）ボタンの送信処理
// ==========================================
const submitReplyBtn = document.getElementById("submit-reply");
if (submitReplyBtn) {
  submitReplyBtn.addEventListener("click", async () => {
    const input = document.getElementById("reply-input");
    if (!input || !currentReplyTargetId) return;
    const content = input.value.trim();
    if (!content) return;

    // 返信時は画像なし（null）で送信
    await submitPostData(content, currentReplyTargetId, null, null);
    input.value = "";
    currentReplyTargetId = null;
    setDisplay("reply-modal", "none");
  });
}


// --- 💬 DMチャット機能 ---
// 💬 ID検索からDMを開く
const btnStartChat = document.getElementById("btn-start-chat");
if (btnStartChat) {
  btnStartChat.addEventListener("click", async () => {
    const input = document.getElementById("dm-target-id-input");
    if (!input) return;
    const rawTargetId = input.value.trim().toLowerCase().replace("@", "");
    if (!rawTargetId) return alert("ログインIDを入力してください。");

    const myUid = auth.currentUser.uid;
    const usersRef = ref(db, "users");
    const snapshot = await get(usersRef);
    const users = snapshot.val();
    
    let foundPartner = null;
    if (users) {
      for (const uid in users) {
        if (users[uid].userLoginId && users[uid].userLoginId.toLowerCase() === rawTargetId) {
          foundPartner = users[uid];
          break;
        }
      }
    }

    if (foundPartner) {
      if (foundPartner.uid === myUid) {
        alert("自分自身とチャットすることはできません！");
        return;
      }

      input.value = "";
      openDmChatWith(foundPartner.uid, foundPartner.displayName || "名無し");
    } else {
      alert("ユーザーが見つかりませんでした。");
    }
  });
}
// 3. DMユーザー一覧の取得（HTMLの id="dm-users-container" に描画）
function loadDmUserList() {
  const myUid = auth.currentUser ? auth.currentUser.uid : "";
  if (!myUid) return;

  const dmRef = ref(db, "direct_messages");
  onValue(dmRef, async (snapshot) => {
    // 🛠️ 【修正】HTMLの id="dm-users-container" を取得！
    const container = document.getElementById("dm-users-container");
    if (!container) return;
    container.innerHTML = "";

    const allRooms = snapshot.val();
    if (!allRooms) {
      container.innerHTML = "<div style='padding:20px; color:#71767b; text-align:center;'>メッセージ履歴がありません。</div>";
      return;
    }

    const myPartnerUids = [];
    Object.keys(allRooms).forEach(roomKey => {
      if (roomKey.includes(myUid)) {
        const uids = roomKey.split("_");
        const partnerUid = uids.find(id => id !== myUid);
        if (partnerUid && !myPartnerUids.includes(partnerUid)) {
          myPartnerUids.push(partnerUid);
        }
      }
    });

    if (myPartnerUids.length === 0) {
      container.innerHTML = "<div style='padding:20px; color:#71767b; text-align:center;'>メッセージ履歴がありません。</div>";
      return;
    }

    for (const pUid of myPartnerUids) {
      const uSnap = await get(ref(db, `users/${pUid}`));
      const uData = uSnap.val() || {};

      const div = document.createElement("div");
      div.style.display = "flex";
      div.style.alignItems = "center";
      div.style.padding = "12px 15px";
      div.style.borderBottom = "1px solid #2f3336";
      div.style.cursor = "pointer";

      const photoURL = uData.photoURL || "🧪";
      let avatarStyle = "";
      let avatarText = "";
      if (photoURL.startsWith("data:image")) {
        avatarStyle = `background-image: url(${photoURL}); background-size: cover; background-position: center;`;
      } else {
        avatarText = photoURL;
      }

      div.innerHTML = `
        <div class="avatar" style="width: 40px; height: 40px; border-radius: 50%; background: #2f3336; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px; margin-right: 12px; ${avatarStyle}">${avatarText}</div>
        <div>
          <div style="font-weight: bold; color: white;">${uData.displayName || "名無し"}</div>
          <div style="font-size: 12px; color: #71767b;">@${uData.userLoginId || "unknown"}</div>
        </div>
      `;

      div.onclick = () => {
        openDmChatWith(pUid, uData.displayName || "名無し");
      };

      container.appendChild(div);
    }
  });
}

// ==========================================
// 💬 DM（ダイレクトメッセージ）機能の修正版コード
// ==========================================

// 1. DMチャット画面を開いてメッセージを読み込む
function openDmChatWith(partnerUid, partnerName) {
  activeDmChatPartnerId = partnerUid;

  // HTMLの要素に合わせて表示切り替え
  setDisplay("dm-users-list", "none");
  setDisplay("dm-chat-window", "flex");

  // 🛠️ 【修正】HTMLの id="dm-chat-partner-name" に相手の名前をセット
  const titleEl = document.getElementById("dm-chat-partner-name");
  if (titleEl) titleEl.innerText = partnerName;

  // 🛠️ 【修正】HTMLの id="dm-messages-container" を取得！
  const container = document.getElementById("dm-messages-container");
  if (!container) return;

  const myUid = auth.currentUser ? auth.currentUser.uid : "";
  if (!myUid || !partnerUid) return;

  // [自分のUID, 相手のUID] をソートして一意の roomKey を作成
  const roomKey = [myUid, partnerUid].sort().join("_");
  const roomRef = ref(db, `direct_messages/${roomKey}`);

  // リアルタイムでメッセージを監視・読み込み
  onValue(roomRef, (snapshot) => {
    container.innerHTML = "";
    const data = snapshot.val();

    if (!data) {
      container.innerHTML = "<div style='text-align:center; color:#71767b; padding:20px;'>メッセージはまだありません。</div>";
      return;
    }

    // 日時順に並び替え
    const msgs = Object.keys(data)
      .map(k => data[k])
      .sort((a, b) => (a.timestamp || a.createdAt) - (b.timestamp || b.createdAt));

    msgs.forEach(msg => {
      const isMe = msg.senderId === myUid;

      const wrap = document.createElement("div");
      wrap.style.display = "flex";
      wrap.style.flexDirection = "column";
      wrap.style.alignItems = isMe ? "flex-end" : "flex-start";
      wrap.style.width = "100%";

      const bubble = document.createElement("div");
      bubble.style.padding = "10px 15px";
      bubble.style.borderRadius = "20px";
      bubble.style.maxWidth = "70%";
      bubble.style.wordBreak = "break-all";
      bubble.style.background = isMe ? "#1d9bf0" : "#2f3336";
      bubble.style.color = "white";

      let imageHTML = "";
      if (msg.image) {
        imageHTML = `<img src="${msg.image}" style="max-width:100%; border-radius:12px; margin-bottom:5px; display:block;">`;
      }

      bubble.innerHTML = `${imageHTML}${msg.text ? `<div>${msg.text}</div>` : ""}`;
      wrap.appendChild(bubble);
      container.appendChild(wrap);
    });

    // 最新のメッセージの位置まで自動スクロール
    container.scrollTop = container.scrollHeight;
  });
}
// 2. DMメッセージ送信処理
// 💬 メッセージ送信
const btnSendDm = document.getElementById("btn-send-dm");
if (btnSendDm) {
  btnSendDm.addEventListener("click", async () => {
    const input = document.getElementById("dm-input");
    const imageInput = document.getElementById("dm-image-file");
    if (!input || !activeDmChatPartnerId) return;

    const text = input.value.trim();
    // ファイルが選択されているか確認
    const imageFile = (imageInput && imageInput.files && imageInput.files.length > 0) ? imageInput.files[0] : null;

    if (!text && !imageFile) return;

    let imageBase64 = null;

    // 💡 画像が実際に選択されている時だけ変換を行う
    if (imageFile) {
      try {
        if (typeof compressAndConvertToBase64 === "function") {
          imageBase64 = await compressAndConvertToBase64(imageFile);
        } else {
          // 圧縮関数がない場合のフォールバック（簡易Base64変換）
          imageBase64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(imageFile);
          });
        }
      } catch (e) {
        console.error("画像変換エラー:", e);
        alert("画像の変換に失敗しました。");
        return;
      }
    }

    const myUid = auth.currentUser.uid;
    const roomKey = [myUid, activeDmChatPartnerId].sort().join("_");

    // direct_messages に送信
    const newMsgRef = push(ref(db, `direct_messages/${roomKey}`));
    await set(newMsgRef, {
      senderId: myUid,
      text: text,
      image: imageBase64,
      timestamp: Date.now()
    });

    input.value = "";
    if (imageInput) imageInput.value = "";
  });
}
const btnBackToDmUsers = document.getElementById("btn-back-to-dm-users");
if (btnBackToDmUsers) {
  btnBackToDmUsers.addEventListener("click", () => {
    activeDmChatPartnerId = null;
    setDisplay("dm-chat-window", "none");
    setDisplay("dm-users-list", "block");
    const form = document.querySelector(".dm-start-form");
    if (form) form.style.display = "flex";
  });
}


// --- 🔔 通知機能 ---
async function sendNotification(receiverId, type, senderId, postId) {
  if (receiverId === senderId) return; // 自分宛ての通知は送らない
  const notifRef = push(ref(db, `notifications/${receiverId}`));
  await set(notifRef, {
    type: type,
    senderId: senderId,
    postId: postId,
    read: false,
    createdAt: Date.now()
  });
}

function initNotificationObserver() {
  const myUid = auth.currentUser ? auth.currentUser.uid : null;
  if (!myUid) return;

  const notifRef = ref(db, `notifications/${myUid}`);
  onValue(notifRef, (snap) => {
    const data = snap.val();
    let unreadCount = 0;
    const listContainer = document.getElementById("notification-timeline");
    if (listContainer) listContainer.innerHTML = "";

    if (data) {
      const sortedNotifs = Object.keys(data)
        .map(k => ({ key: k, ...data[k] }))
        .sort((a, b) => b.createdAt - a.createdAt);

      sortedNotifs.forEach(notif => {
        // 未読（read === false）のみを正しくカウント＆デバイス通知
        if (notif.read === false) {
          unreadCount++;

          // ▼【ここに移動】デバイス通知を飛ばす（相手の名前と内容）
          get(ref(db, `users/${notif.senderId}`)).then((userSnap) => {
            const uData = userSnap.val() || {};
            const name = uData.displayName || "名無し";
            let message = "新着通知があります";
            
            if (notif.type === "like") message = `${name}さんがあなたの投稿にいいねしました❤️`;
            if (notif.type === "reply") message = `${name}さんが返信しました💬`;
            if (notif.type === "quote") message = `${name}さんが引用しました🔄`;
            if (notif.type === "dm") message = `${name}さんからメッセージが届きました📩`;

            showDeviceNotification("takei.net", message);
          });
        }

        if (listContainer) {
          const div = document.createElement("div");
          div.style.padding = "15px";
          div.style.borderBottom = "1px solid #2f3336";
          div.style.display = "flex";
          div.style.alignItems = "center";
          div.style.gap = "10px";
          div.style.cursor = "pointer";
          
          // 未読の場合はほんのり青くハイライト
          if (!notif.read) div.style.backgroundColor = "rgba(29, 155, 240, 0.1)";

          get(ref(db, `users/${notif.senderId}`)).then((userSnap) => {
            const uData = userSnap.val() || {};
            let typeText = "";
            if (notif.type === "like") typeText = "さんがあなたの投稿にいいねしました❤️";
            if (notif.type === "reply") typeText = "さんがあなたに返信しました💬";
            if (notif.type === "quote") typeText = "さんがあなたの投稿を引用しました🔄";
            if (notif.type === "dm") typeText = "さんからダイレクトメッセージが届きました📩";

            div.innerHTML = `
              <div style="font-weight: bold; color: #fff;">${uData.displayName || "名無し"}</div>
              <div style="color: #71767b;">${typeText}</div>
            `;
          });

          // クリックしたら既読（read: true）にする
          div.onclick = async () => {
            await update(ref(db, `notifications/${myUid}/${notif.key}`), { read: true });
          };

          listContainer.appendChild(div);
        }
      });
    }

    // 画面上のバッジ（赤丸数字）の表示更新
    const notifBadge = document.getElementById("notif-badge");
    const mNotifBadge = document.getElementById("m-notif-badge");

    if (unreadCount > 0) {
      if (notifBadge) { notifBadge.innerText = unreadCount; notifBadge.style.display = "inline-block"; }
      if (mNotifBadge) { mNotifBadge.innerText = unreadCount; mNotifBadge.style.display = "block"; }
    } else {
      if (notifBadge) notifBadge.style.display = "none";
      if (mNotifBadge) mNotifBadge.style.display = "none";
    }
  });
}
// --- 👤 プロフィール画面 & 編集 ---
async function showUserProfile(uid) {
  const userRef = ref(db, `users/${uid}`);
  const snap = await get(userRef);
  if (!snap.exists()) return;
  const data = snap.val();

  const detailsAvatar = document.getElementById("details-avatar");
  const detailsName = document.getElementById("details-display-name");
  const detailsLoginId = document.getElementById("details-login-id");
  const detailsBio = document.getElementById("details-bio");
  const detailsCreatedAt = document.getElementById("details-created-at");
  const btnEdit = document.getElementById("btn-open-edit-from-details");
  const btnMobileLogout = document.getElementById("btn-mobile-logout");

  if (detailsAvatar) {
    if (data.photoURL && data.photoURL.startsWith("data:image")) {
      detailsAvatar.innerText = "";
      detailsAvatar.style.backgroundImage = `url(${data.photoURL})`;
    } else {
      detailsAvatar.innerText = data.photoURL || "🧪";
      detailsAvatar.style.backgroundImage = "none";
    }
  }

  if (detailsName) detailsName.innerText = data.displayName || "名無し";
  if (detailsLoginId) detailsLoginId.innerText = `@${data.userLoginId || "unknown"}`;
  if (detailsBio) detailsBio.innerText = data.bio || "自己紹介はありません。";
  if (detailsCreatedAt) detailsCreatedAt.innerText = formatDate(data.createdAt);

  const myUid = auth.currentUser ? auth.currentUser.uid : null;
  if (myUid === uid) {
    if (btnEdit) btnEdit.style.display = "block";
    if (btnMobileLogout) btnMobileLogout.style.display = "block";
  } else {
    if (btnEdit) btnEdit.style.display = "none";
    if (btnMobileLogout) btnMobileLogout.style.display = "none";
  }

  // プロフィール内での投稿一覧読み込み
  const postsRef = ref(db, "posts");
  const postsSnap = await get(postsRef);
  const postsList = document.getElementById("details-posts-list");
  if (postsList) {
    postsList.innerHTML = "";
    const pData = postsSnap.val();
    if (pData) {
      const myPosts = Object.keys(pData)
        .map(key => ({ id: key, ...pData[key] }))
        .filter(post => post.senderId === uid && !post.parentPostId)
        .sort((a, b) => b.createdAt - a.createdAt);

      if (myPosts.length === 0) {
        postsList.innerHTML = "<div style='padding:10px; color:#71767b; font-size:12px; text-align:center;'>投稿はまだありません。</div>";
      } else {
        myPosts.forEach(p => {
          postsList.appendChild(renderPost(p, true));
        });
      }
    }
  }

  setDisplay("user-details-modal", "flex");
}

const closeUserDetailsBtn = document.getElementById("close-user-details-modal");
if (closeUserDetailsBtn) {
  closeUserDetailsBtn.addEventListener("click", () => {
    setDisplay("user-details-modal", "none");
  });
}

const btnOpenEditFromDetails = document.getElementById("btn-open-edit-from-details");
if (btnOpenEditFromDetails) {
  btnOpenEditFromDetails.addEventListener("click", async () => {
    const myUid = auth.currentUser.uid;
    const snap = await get(ref(db, `users/${myUid}`));
    const data = snap.val();
    if (!data) return;

    const editName = document.getElementById("edit-display-name");
    const editBio = document.getElementById("edit-bio");

    if (editName) editName.value = data.displayName || "";
    if (editBio) editBio.value = data.bio || "";

    setDisplay("user-details-modal", "none");
    setDisplay("profile-modal", "flex");
  });
}

const btnSaveProfile = document.getElementById("btn-save-profile");
if (btnSaveProfile) {
  btnSaveProfile.addEventListener("click", async () => {
    const myUid = auth.currentUser.uid;
    const newName = document.getElementById("edit-display-name").value.trim();
    const newBio = document.getElementById("edit-bio").value.trim();
    const editAvatarFile = document.getElementById("edit-avatar-file");
    const newFile = editAvatarFile ? editAvatarFile.files[0] : null;

    if (!newName) {
      alert("名前を入力してください。");
      return;
    }

    const updates = {
      displayName: newName,
      bio: newBio
    };

    if (newFile) {
      updates.photoURL = await toBase64(newFile);
    }

    try {
      await update(ref(db, `users/${myUid}`), updates);
      alert("プロフィールを保存しました！");
      setDisplay("profile-modal", "none");
      location.reload();
    } catch (e) {
      alert("保存失敗: " + e.message);
    }
  });
}

const closeProfileModalBtn = document.getElementById("close-profile-modal");
if (closeProfileModalBtn) {
  closeProfileModalBtn.addEventListener("click", () => {
    setDisplay("profile-modal", "none");
  });
}

const closeReplyModalBtn = document.getElementById("close-reply-modal");
if (closeReplyModalBtn) {
  closeReplyModalBtn.addEventListener("click", () => {
    setDisplay("reply-modal", "none");
  });
}

// --- 📱 ナビゲーション切り替え (ホーム、通知、メッセージ、設定) ---
const navHome = document.getElementById("nav-home");
const mNavHome = document.getElementById("m-nav-home");
const navNotif = document.getElementById("nav-notifications");
const mNavNotif = document.getElementById("m-nav-notifications");
const navDms = document.getElementById("nav-dms");
const mNavDms = document.getElementById("m-nav-dms");
const mNavProfile = document.getElementById("m-nav-profile");

function resetActiveNav() {
  const navBtns = [mNavHome, mNavNotif, mNavDms, mNavProfile];
  navBtns.forEach(btn => { if (btn) btn.classList.remove("active"); });
}

function showHomeSection() {
  resetActiveNav();
  if (mNavHome) mNavHome.classList.add("active");
  setDisplay("thread-detail-container", "none");
  setDisplay("timeline", "block");
  setDisplay("global-tweet-box", "block");
  setDisplay("category-tabs-container", "flex");
  setDisplay("notification-timeline", "none");
  setDisplay("dm-content", "none");
  const pageTitle = document.getElementById("page-title");
  if (pageTitle) pageTitle.innerText = "ホーム";
}

if (navHome) navHome.addEventListener("click", showHomeSection);
if (mNavHome) mNavHome.addEventListener("click", showHomeSection);

function showNotificationSection() {
  resetActiveNav();
  if (mNavNotif) mNavNotif.classList.add("active");
  setDisplay("thread-detail-container", "none");
  setDisplay("timeline", "none");
  setDisplay("global-tweet-box", "none");
  setDisplay("category-tabs-container", "none");
  setDisplay("notification-timeline", "block");
  setDisplay("dm-content", "none");
  const pageTitle = document.getElementById("page-title");
  if (pageTitle) pageTitle.innerText = "通知";
}

if (navNotif) navNotif.addEventListener("click", showNotificationSection);
if (mNavNotif) mNavNotif.addEventListener("click", showNotificationSection);

function showDmSection() {
  resetActiveNav();
  if (mNavDms) mNavDms.classList.add("active");
  setDisplay("thread-detail-container", "none");
  setDisplay("timeline", "none");
  setDisplay("global-tweet-box", "none");
  setDisplay("category-tabs-container", "none");
  setDisplay("notification-timeline", "none");
  setDisplay("dm-content", "flex");
  setDisplay("dm-users-list", "block");
  setDisplay("dm-chat-window", "none");
  const form = document.querySelector(".dm-start-form");
  if (form) form.style.display = "flex";
  const pageTitle = document.getElementById("page-title");
  if (pageTitle) pageTitle.innerText = "メッセージ";
}

if (navDms) navDms.addEventListener("click", showDmSection);
if (mNavDms) mNavDms.addEventListener("click", showDmSection);

if (mNavProfile) {
  mNavProfile.addEventListener("click", () => {
    resetActiveNav();
    mNavProfile.classList.add("active");
    if (auth.currentUser) {
      showUserProfile(auth.currentUser.uid);
    }
  });
}
const btnBackDm = document.getElementById("btn-back-to-dm-users");
if (btnBackDm) {
  btnBackDm.addEventListener("click", () => {
    setDisplay("dm-chat-window", "none");
    setDisplay("dm-users-list", "block");
  });
}
