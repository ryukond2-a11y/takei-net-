// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getDatabase, ref, set, push, onValue, update, runTransaction, child 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { 
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// --- ⚙️ Firebase設定（あなたのプロジェクト設定に置き換えてね） ---
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  databaseURL: "YOUR_DATABASE_URL",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// --- 📍 グローバル変数・状態管理 ---
let currentQuoteTargetId = null; // 引用する投稿のID
let currentReplyTargetId = null; // 返信する投稿のID

// ユーティリティ: 表示/非表示の切り替え
function setDisplay(id, val) {
  const el = document.getElementById(id);
  if (el) el.style.display = val;
}

// ユーティリティ: 日付のフォーマット
function formatDate(timestamp) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ユーティリティ: 画像ファイルをBase64文字列に変換
function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

// --- 🔐 認証ゲートウェイ（サインイン・サインアップ・ログアウト） ---

// ログインとサインアップ画面の切り替え
document.getElementById("to-signup").addEventListener("click", () => {
  setDisplay("login-card", "none");
  setDisplay("signup-card", "block");
});

document.getElementById("to-login").addEventListener("click", () => {
  setDisplay("signup-card", "none");
  setDisplay("login-card", "block");
});

// サインアップ（新規アカウント登録）
document.getElementById("btn-signup").addEventListener("click", async () => {
  const name = document.getElementById("signup-name").value.trim();
  const romanId = document.getElementById("signup-name-roman").value.trim().toLowerCase();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const avatarFile = document.getElementById("signup-avatar-file").files[0];

  if (!name || !romanId || !email || !password) {
    alert("すべての必須項目を入力してください。");
    return;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    let photoURL = "🧪"; // デフォルト
    if (avatarFile) {
      photoURL = await toBase64(avatarFile);
    }

    // usersノードにユーザー基本情報を書き込み（説明欄 bio は最初は空）
    await set(ref(db, `users/${user.uid}`), {
      uid: user.uid,
      displayName: name,
      userLoginId: romanId,
      photoURL: photoURL,
      bio: "よろしくお願いします！", 
      createdAt: Date.now()
    });

    alert("アカウント登録が完了しました！");
  } catch (error) {
    alert("登録エラー: " + error.message);
  }
});

// ログイン
document.getElementById("btn-login").addEventListener("click", async () => {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    alert("ログインエラー: " + error.message);
  }
});

// ログアウト
document.getElementById("btn-logout").addEventListener("click", async () => {
  try {
    await signOut(auth);
    location.reload();
  } catch (error) {
    alert("ログアウトエラー: " + error.message);
  }
});

// 認証状態の監視
onAuthStateChanged(auth, (user) => {
  if (user) {
    setDisplay("auth-gateway", "none");
    setDisplay("app-container", "flex");
    
    // 自分のサイドバーアイコン更新
    onValue(ref(db, `users/${user.uid}`), (snap) => {
      const data = snap.val();
      if (data) {
        const avatarEl = document.getElementById("current-user-avatar");
        if (data.photoURL && data.photoURL.startsWith("data:image")) {
          avatarEl.innerText = "";
          avatarEl.style.backgroundImage = `url(${data.photoURL})`;
        } else {
          avatarEl.innerText = data.photoURL || "🧪";
          avatarEl.style.backgroundImage = "none";
        }
      }
    });

    // 初期データのロード
    loadUnifiedTimeline();
    initNotificationObserver();
  } else {
    setDisplay("app-container", "none");
    setDisplay("auth-gateway", "flex");
  }
});


// --- 🏠 タイムライン & 投稿管理（ホームとスレッドの統合） ---

// 統一されたタイムラインロード（親投稿のみを全件新着順で取得）
function loadUnifiedTimeline() {
  const postsRef = ref(db, "posts");
  onValue(postsRef, (snapshot) => {
    const timelineContainer = document.getElementById("timeline");
    timelineContainer.innerHTML = "";
    const data = snapshot.val();
    if (!data) {
      timelineContainer.innerHTML = "<div style='padding:20px; color:#71767b; text-align:center;'>まだ投稿はありません。最初の投稿をしてみましょう！</div>";
      return;
    }

    // parentPostId が存在しないもの（＝返信ではなく、大元の新規スレッド投稿）だけを表示
    const posts = Object.keys(data)
      .map(key => ({ id: key, ...data[key] }))
      .filter(post => !post.parentPostId) 
      .sort((a, b) => b.createdAt - a.createdAt);

    posts.forEach(post => {
      const el = renderPost(post);
      timelineContainer.appendChild(el);
    });
  });
}

// 投稿エレメントの生成（最新アバター・プロフィールの動的同期対応）
function renderPost(post) {
  const postElement = document.createElement("div");
  postElement.className = "post";
  postElement.dataset.id = post.id; // ジャンプ用の目印

  // 投稿者の最新プロフィール情報をDBからリアルタイム同期
  const userRef = ref(db, `users/${post.senderId}`);
  onValue(userRef, (userSnap) => {
    const uData = userSnap.val() || {};
    const displayName = uData.displayName || "名無し";
    const userLoginId = uData.userLoginId || "unknown";
    const photoURL = uData.photoURL || "🧪";

    // アバターの設定
    let avatarStyle = "";
    let avatarText = "";
    if (photoURL.startsWith("data:image")) {
      avatarStyle = `background-image: url(${photoURL})`;
    } else {
      avatarText = photoURL;
    }

    const replyCount = post.replyCount || 0;
    const quoteCount = post.quoteCount || 0;

    // 引用プレビューエリアの定義（ある場合）
    let quotedHTML = "";
    if (post.quotedPostId) {
      quotedHTML = `
        <div class="quoted-container" id="quote-preview-box-${post.id}" data-target-id="${post.quotedPostId}">
          <div id="quote-content-area-${post.id}" style="font-size: 13px; color: #71767b;">
            引用元を読み込み中...
          </div>
        </div>
      `;
    }

    postElement.innerHTML = `
      <div class="thread-line-container">
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
        </div>
      </div>
    `;

    // 🟢 アバターアイコンクリックで最新プロフィールを表示（相手でも自分でもOK）
    const avatarBtn = postElement.querySelector(`#avatar-${post.id}`);
    avatarBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // 投稿全体のクリックイベントの発火を防ぐ
      showUserProfile(post.senderId);
    });

    // 💬 返信ボタンの動作
    const replyBtn = postElement.querySelector(`#action-reply-${post.id}`);
    replyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      currentReplyTargetId = post.id;
      document.getElementById("reply-target-post-content").innerText = `"${displayName}: ${post.content}"`;
      setDisplay("reply-modal", "flex");
    });

    // 🔄 引用ボタンの動作
    const quoteBtn = postElement.querySelector(`#action-quote-${post.id}`);
    quoteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      currentQuoteTargetId = post.id;
      document.getElementById("quote-preview-content").innerText = `引用元: @${userLoginId}の投稿`;
      setDisplay("quote-preview", "block");
      document.getElementById("post-input").focus();
    });

    // 🔗 引用元の読み込み＆引用枠タップでジャンプ
    if (post.quotedPostId) {
      loadQuotedPreviewAndSetupJump(post.quotedPostId, `quote-preview-box-${post.id}`, `quote-content-area-${post.id}`);
    }
  });

  return postElement;
}

// 🔗 引用プレビューの読み込みとジャンプ機能
function loadQuotedPreviewAndSetupJump(quotedPostId, boxId, contentId) {
  const quoteRef = ref(db, `posts/${quotedPostId}`);
  onValue(quoteRef, (snap) => {
    const quotedPost = snap.val();
    const box = document.getElementById(boxId);
    const contentArea = document.getElementById(contentId);
    
    if (!box || !contentArea) return;

    if (!quotedPost) {
      contentArea.innerText = "⚠️ この投稿は削除されました。";
      return;
    }

    // 引用元のユーザー情報を引っ張る
    onValue(ref(db, `users/${quotedPost.senderId}`), (userSnap) => {
      const uData = userSnap.val() || {};
      contentArea.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 4px; color: #fff;">
          ${uData.displayName || "名無し"} <span style="font-weight: normal; color: #71767b; font-size: 12px;">@${uData.userLoginId || "unknown"}</span>
        </div>
        <div>${quotedPost.content}</div>
      `;
    }, { onlyOnce: true });

    // 🌟 引用をタップしたらその投稿へジャンプして光らせる
    box.onclick = (e) => {
      e.stopPropagation();
      const targetElement = document.querySelector(`.post[data-id="${quotedPostId}"]`);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
        targetElement.style.transition = "background-color 0.3s";
        targetElement.style.backgroundColor = "#1d9bf033"; // 水色のハイライト
        setTimeout(() => {
          targetElement.style.backgroundColor = "transparent";
        }, 1500);
      } else {
        alert("該当の投稿は現在のタイムライン上で読み込まれていないか、さらに過去の投稿です。");
      }
    };
  });
}


// --- 🚀 新規投稿、返信、引用、およびカウンター＆通知連動 ---

// 共通送信ロジック
async function submitPostData(content, parentPostId = null, quotedPostId = null) {
  const user = auth.currentUser;
  if (!user) return;

  const newPostKey = push(child(ref(db), 'posts')).key;
  const postData = {
    id: newPostKey,
    senderId: user.uid,
    content: content,
    createdAt: Date.now(),
    replyCount: 0,
    quoteCount: 0
  };

  if (parentPostId) postData.parentPostId = parentPostId;
  if (quotedPostId) postData.quotedPostId = quotedPostId;

  // 1. 新しい投稿をDBに登録
  await set(ref(db, `posts/${newPostKey}`), postData);

  // 2. 返信（スレッド）の場合は、親投稿の replyCount カウンターを増やして通知を送る
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

  // 3. 引用投稿の場合は、引用元の quoteCount カウンターを増やして通知を送る
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

// 投稿するボタン
document.getElementById("submit-post").addEventListener("click", async () => {
  const input = document.getElementById("post-input");
  const content = input.value.trim();
  if (!content) return;

  await submitPostData(content, null, currentQuoteTargetId);

  // 送信後初期化
  input.value = "";
  currentQuoteTargetId = null;
  setDisplay("quote-preview", "none");
});

// 引用プレビューのキャンセル
document.getElementById("close-quote-preview").addEventListener("click", () => {
  currentQuoteTargetId = null;
  setDisplay("quote-preview", "none");
});

// 返信送信処理
document.getElementById("submit-reply").addEventListener("click", async () => {
  const input = document.getElementById("reply-input");
  const content = input.value.trim();
  if (!content || !currentReplyTargetId) return;

  await submitPostData(content, currentReplyTargetId, null);

  input.value = "";
  currentReplyTargetId = null;
  setDisplay("reply-modal", "none");
});

document.getElementById("close-reply-modal").addEventListener("click", () => {
  currentReplyTargetId = null;
  setDisplay("reply-modal", "none");
});


// --- 👥 プロフィール詳細表示（自己紹介 bio 付き） & 編集 ---

// プロフィール編集の保存
document.getElementById("btn-save-profile").addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return;

  const newName = document.getElementById("edit-display-name").value.trim();
  const newBio = document.getElementById("edit-bio").value.trim();
  const avatarFile = document.getElementById("edit-avatar-file").files[0];

  if (!newName) {
    alert("名前は空にできません。");
    return;
  }

  const updates = {
    displayName: newName,
    bio: newBio
  };

  if (avatarFile) {
    updates.photoURL = await toBase64(avatarFile);
  }

  await update(ref(db, `users/${user.uid}`), updates);
  alert("プロフィールを更新しました！");
  setDisplay("profile-modal", "none");
});

// 編集モーダルを閉じる
document.getElementById("close-profile-modal").addEventListener("click", () => {
  setDisplay("profile-modal", "none");
});

// 🧪 ユーザー情報をモーダルに読み込んで表示する（自分／相手 兼用）
function showUserProfile(uid) {
  const currentUser = auth.currentUser;
  const userRef = ref(db, `users/${uid}`);

  onValue(userRef, (snapshot) => {
    const userData = snapshot.val();
    if (!userData) return;

    const detailsAvatar = document.getElementById("details-avatar");
    const detailsName = document.getElementById("details-display-name");
    const detailsId = document.getElementById("details-login-id");
    const detailsBio = document.getElementById("details-bio");
    const detailsDate = document.getElementById("details-created-at");
    const editBtn = document.getElementById("btn-open-edit-from-details");

    // アバターの設定
    if (userData.photoURL && userData.photoURL.startsWith("data:image")) {
      detailsAvatar.innerText = "";
      detailsAvatar.style.backgroundImage = `url(${userData.photoURL})`;
    } else {
      detailsAvatar.innerText = userData.photoURL || "🧪";
      detailsAvatar.style.backgroundImage = "none";
    }

    detailsName.innerText = userData.displayName;
    detailsId.innerText = `@${userData.userLoginId}`;
    detailsBio.innerText = userData.bio || "自己紹介はまだ登録されていません。";

    // 登録日のフォーマット
    if (userData.createdAt) {
      const date = new Date(userData.createdAt);
      detailsDate.innerText = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
    } else {
      detailsDate.innerText = "不明";
    }

    // 自分のプロフィールの時だけ「編集」ボタンを表示する
    if (currentUser && currentUser.uid === uid) {
      editBtn.style.display = "block";
      editBtn.onclick = () => {
        document.getElementById("edit-display-name").value = userData.displayName;
        document.getElementById("edit-bio").value = userData.bio || "";
        setDisplay("user-details-modal", "none");
        setDisplay("profile-modal", "flex");
      };
    } else {
      editBtn.style.display = "none";
    }

    // このユーザーの全投稿を一括取得
    loadUserPostsOnly(uid);

    setDisplay("user-details-modal", "flex");
  }, { onlyOnce: true });
}

// プロフィール内の過去投稿ロード
function loadUserPostsOnly(uid) {
  const postsRef = ref(db, "posts");
  const listContainer = document.getElementById("details-posts-list");

  onValue(postsRef, (snapshot) => {
    listContainer.innerHTML = "";
    const postsData = snapshot.val();
    if (!postsData) {
      listContainer.innerHTML = "<div style='padding:15px; color:#71767b; font-size:13px; text-align:center;'>投稿はありません</div>";
      return;
    }

    const sorted = Object.keys(postsData)
      .map(key => ({ id: key, ...postsData[key] }))
      .filter(post => post.senderId === uid)
      .sort((a, b) => b.createdAt - a.createdAt);

    if (sorted.length === 0) {
      listContainer.innerHTML = "<div style='padding:15px; color:#71767b; font-size:13px; text-align:center;'>投稿はありません</div>";
      return;
    }

    sorted.forEach(post => {
      const div = document.createElement("div");
      div.className = "profile-post-item";
      div.innerHTML = `
        <div style="font-size:11px; color:#71767b; margin-bottom:4px;">${formatDate(post.createdAt)}</div>
        <div style="line-break:anywhere; color:white;">${post.content}</div>
      `;
      listContainer.appendChild(div);
    });
  }, { onlyOnce: true });
}

// 自分のアイコンクリック時にプロフィールを開く
document.getElementById("current-user-avatar").addEventListener("click", () => {
  if (auth.currentUser) {
    showUserProfile(auth.currentUser.uid);
  }
});

// プロフィール詳細モーダルを閉じる
document.getElementById("close-user-details-modal").addEventListener("click", () => {
  setDisplay("user-details-modal", "none");
});


// --- 🔔 通知機能（通知保存 ＆ 未読バッジ） ---

// 1. 通知を相手のノードに書き込む
function sendNotification(targetUid, type, actorUid, postId) {
  if (targetUid === actorUid) return; // 自分のアクションなら通知しない

  const notifRef = push(ref(db, `notifications/${targetUid}`));
  set(notifRef, {
    type: type, // "reply" もしくは "quote"
    actorUid: actorUid,
    postId: postId,
    createdAt: Date.now(),
    isRead: false
  });
}

// 2. 通知の監視（バッジ更新 ＆ 描画）
function initNotificationObserver() {
  const user = auth.currentUser;
  if (!user) return;

  const notifRef = ref(db, `notifications/${user.uid}`);
  onValue(notifRef, (snapshot) => {
    const notifs = snapshot.val();
    const badge = document.getElementById("notif-badge");
    const container = document.getElementById("notification-timeline");

    if (!notifs) {
      badge.style.display = "none";
      container.innerHTML = "<div style='padding:20px; color:#71767b; text-align:center;'>通知はまだありません。</div>";
      return;
    }

    const list = Object.keys(notifs).map(key => ({ id: key, ...notifs[key] }));
    const unreadCount = list.filter(n => !n.isRead).length;

    // 未読数バッジの切り替え
    if (unreadCount > 0) {
      badge.style.display = "inline-block";
      badge.innerText = unreadCount;
    } else {
      badge.style.display = "none";
    }

    list.sort((a, b) => b.createdAt - a.createdAt);
    container.innerHTML = "";

    list.forEach(n => {
      const item = document.createElement("div");
      item.className = "notification-item";
      item.id = `notif-item-${n.id}`;
      
      // 行動した人の情報を動的取得してテキスト化
      onValue(ref(db, `users/${n.actorUid}`), (userSnap) => {
        const uData = userSnap.val() || {};
        const actionText = n.type === "reply" ? "あなたの投稿に返信しました" : "あなたの投稿を引用しました";
        
        item.innerHTML = `
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="font-size:22px;">${n.type === 'reply' ? '💬' : '🔄'}</div>
            <div>
              <strong>${uData.displayName || "名無し"}</strong> さんが${actionText}
              <div style="font-size:12px; color:#71767b; margin-top:4px;">${formatDate(n.createdAt)}</div>
            </div>
          </div>
        `;
      }, { onlyOnce: true });

      // 通知項目をタップしたら、該当の投稿へジャンプ
      item.addEventListener("click", async () => {
        // 既読フラグを立てる
        await update(ref(db, `notifications/${user.uid}/${n.id}`), { isRead: true });
        
        // 画面をタイムラインに戻す
        setDisplay("notification-timeline", "none");
        setDisplay("timeline", "block");
        setDisplay("global-tweet-box", "block");
        document.getElementById("page-title").innerText = "ホーム";

        // 該当投稿へスクロール
        setTimeout(() => {
          const targetElement = document.querySelector(`.post[data-id="${n.postId}"]`);
          if (targetElement) {
            targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
            targetElement.style.backgroundColor = "#1d9bf033";
            setTimeout(() => { targetElement.style.backgroundColor = "transparent"; }, 1500);
          }
        }, 300);
      });

      container.appendChild(item);
    });
  });
}


// --- 🧭 ナビゲーション制御 ---

document.getElementById("nav-home").addEventListener("click", () => {
  setDisplay("timeline", "block");
  setDisplay("global-tweet-box", "block");
  setDisplay("notification-timeline", "none");
  setDisplay("dm-content", "none");
  document.getElementById("page-title").innerText = "ホーム";
});

document.getElementById("nav-notifications").addEventListener("click", () => {
  setDisplay("timeline", "none");
  setDisplay("global-tweet-box", "none");
  setDisplay("notification-timeline", "block");
  setDisplay("dm-content", "none");
  document.getElementById("page-title").innerText = "通知";
});
