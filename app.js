// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getDatabase, ref, set, push, onValue, update, runTransaction, child, get 
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

// --- 📍 グローバル状態管理 ---
let currentQuoteTargetId = null; 
let currentReplyTargetId = null; 
let activeDmChatPartnerId = null; 
let currentCategory = "general"; // 初期表示のカテゴリ

// ユーティリティ: 表示非表示
function setDisplay(id, val) {
  const el = document.getElementById(id);
  if (el) el.style.display = val;
}

// ユーティリティ: 日付フォーマット
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

// --- 🔐 認証・アカウント登録・ログイン処理 ---
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

// 新規登録処理（メアドが空でもOK！）
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

    // ログインIDがすでに使われていないかチェック
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

    // メールアドレスの入力を省略した場合、自動生成
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
        email: email, // メアドも保存
        photoURL: photoURL,
        bio: "よろしくお願いします！", 
        createdAt: Date.now()
      });

      alert("登録に成功しました！");
    } catch (e) {
      alert("登録失敗: " + e.message);
    }
  });
}

// ログイン処理（IDでもメアドでもログイン可能に）
const btnLogin = document.getElementById("btn-login");
if (btnLogin) {
  btnLogin.addEventListener("click", async () => {
    const identifier = document.getElementById("login-identifier").value.trim().toLowerCase();
    const password = document.getElementById("login-password").value;
    
    if (!identifier || !password) {
      alert("ログインIDまたはメールアドレスと、パスワードを入力してください。");
      return;
    }

    let targetEmail = identifier;

    // 入力された文字がメールアドレス形式（@を含む）でない場合、ログインIDとして検索
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
          alert("このログインIDは見つかりませんでした。スペルを確認するか、新規登録してください。");
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

onAuthStateChanged(auth, (user) => {
  if (user) {
    setDisplay("auth-gateway", "none");
    setDisplay("app-container", "flex");
    
    onValue(ref(db, `users/${user.uid}`), (snap) => {
      const data = snap.val();
      if (data) {
        const avatarEl = document.getElementById("current-user-avatar");
        if (avatarEl) {
          if (data.photoURL && data.photoURL.startsWith("data:image")) {
            avatarEl.innerText = "";
            avatarEl.style.backgroundImage = `url(${data.photoURL})`;
          } else {
            avatarEl.innerText = data.photoURL || "🧪";
            avatarEl.style.backgroundImage = "none";
          }
        }
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


// --- 🏷️ スレッドカテゴリ切り替え ---
const tabElements = document.querySelectorAll(".category-tab");
tabElements.forEach(tab => {
  tab.addEventListener("click", (e) => {
    tabElements.forEach(t => t.classList.remove("active"));
    e.target.classList.add("active");
    currentCategory = e.target.getAttribute("data-category");
    loadUnifiedTimeline(); // タイムラインの再読み込み
  });
});


// --- タイムラインの読込 & 引用機能修正 ---
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

    // 選択中のカテゴリ（general、takehaya、nakajima、takehaya-1a）に一致し、かつ親ポストがないものだけ抽出
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

// 投稿データのレンダー（引用元もここから直接読み込み）
function renderPost(post, isThreadDetail = false) {
  const postElement = document.createElement("div");
  postElement.className = "post";
  postElement.dataset.id = post.id;

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
        <div class="quoted-container" id="quote-preview-box-${post.id}" data-target-id="${post.quotedPostId}">
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
          <div class="action-btn" id="action-like-${post.id}" style="color: #f91880;">❤️ <span>${likeCount}</span></div>
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

    // ❤️ いいね
    const likeBtn = postElement.querySelector(`#action-like-${post.id}`);
    if (likeBtn) {
      likeBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const postRef = ref(db, `posts/${post.id}`);
        await runTransaction(postRef, (currentPost) => {
          if (currentPost) {
            currentPost.likeCount = (currentPost.likeCount || 0) + 1;
          }
          return currentPost;
        });
      });
    }

    // 🌟 引用元の読み込み
    if (post.quotedPostId) {
      const quoteRef = ref(db, `posts/${post.quotedPostId}`);
      onValue(quoteRef, (snap) => {
        const quotedPost = snap.val();
        const box = document.getElementById(`quote-preview-box-${post.id}`);
        const contentArea = document.getElementById(`quote-content-area-${post.id}`);
        
        if (!box || !contentArea) return;
        if (!quotedPost) {
          contentArea.innerText = "⚠️ この投稿は削除されました。";
          return;
        }

        onValue(ref(db, `users/${quotedPost.senderId}`), (userSnap) => {
          const quData = userSnap.val() || {};
          contentArea.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 4px; color: #fff; font-size: 13px;">
              ${quData.displayName || "名無し"} <span style="font-weight: normal; color: #71767b; font-size: 11px;">@${quData.userLoginId || "unknown"}</span>
            </div>
            <div style="font-size: 13px; color: #e7e9ea;">${quotedPost.content}</div>
          `;
        }, { onlyOnce: true });

        // 引用プレビューをクリックした際にその親スレッドにスクロール
        box.onclick = (e) => {
          e.stopPropagation();
          const targetElement = document.querySelector(`.post[data-id="${post.quotedPostId}"]`);
          if (targetElement) {
            targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
            targetElement.style.transition = "background-color 0.3s";
            targetElement.style.backgroundColor = "#1d9bf033";
            setTimeout(() => { targetElement.style.backgroundColor = "transparent"; }, 1500);
          } else {
            alert("このスレッド、または別のスレッドにある引用元の投稿です。");
          }
        };
      });
    }
  });

  if (!isThreadDetail) {
    postElement.addEventListener("click", () => {
      openPostThreadDetail(post);
    });
  }

  return postElement;
}


// --- 🧵 スレッド（返信ツリー）詳細表示 ---
function openPostThreadDetail(parentPost) {
  setDisplay("timeline", "none");
  setDisplay("global-tweet-box", "none");
  setDisplay("category-tabs-container", "none"); // カテゴリ一覧も非表示にする
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


// --- 🚀 新規投稿 & 返信・引用の送信 ---
async function submitPostData(content, parentPostId = null, quotedPostId = null) {
  const user = auth.currentUser;
  if (!user) return;

  const newPostKey = push(child(ref(db), 'posts')).key;
  const postData = {
    id: newPostKey,
    senderId: user.uid,
    content: content,
    category: currentCategory, // 投稿時点のアクティブなカテゴリ（ general / takehaya / nakajima / takehaya-1a ）を登録
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

const closeReplyModalBtn = document.getElementById("close-reply-modal");
if (closeReplyModalBtn) {
  closeReplyModalBtn.addEventListener("click", () => {
    currentReplyTargetId = null;
    setDisplay("reply-modal", "none");
  });
}


// --- 💬 DM機能 ---
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
      alert("入力されたIDのユーザーが見つかりませんでした。");
    }
  });
}

function loadDmUserList() {
  const directMsgsRef = ref(db, "direct_messages");
  onValue(directMsgsRef, (snapshot) => {
    const container = document.getElementById("dm-users-container");
    if (!container) return;
    container.innerHTML = "";

    const data = snapshot.val();
    if (!data) {
      container.innerHTML = "<div style='padding:20px; color:#71767b; text-align:center;'>チャット履歴はありません。IDを入力して開始してください。</div>";
      return;
    }

    const myUid = auth.currentUser ? auth.currentUser.uid : "";
    const activePartnerUids = new Set();

    Object.keys(data).forEach(roomKey => {
      if (roomKey.includes(myUid)) {
        const uids = roomKey.split("_");
        const partnerUid = uids.find(id => id !== myUid);
        if (partnerUid) activePartnerUids.add(partnerUid);
      }
    });

    if (activePartnerUids.size === 0) {
      container.innerHTML = "<div style='padding:20px; color:#71767b; text-align:center;'>チャット履歴はありません。IDを入力して開始してください。</div>";
      return;
    }

    activePartnerUids.forEach(pUid => {
      onValue(ref(db, `users/${pUid}`), (uSnap) => {
        const uData = uSnap.val();
        if (!uData) return;

        const existing = document.getElementById(`dm-list-item-${pUid}`);
        if (existing) existing.remove();

        const item = document.createElement("div");
        item.id = `dm-list-item-${pUid}`;
        item.className = "dm-user-item";
        item.style.cssText = "padding: 15px; border-bottom: 1px solid #2f3336; cursor: pointer; display: flex; align-items: center; gap: 12px;";
        
        let avatarStyle = "";
        let avatarText = "";
        if (uData.photoURL && uData.photoURL.startsWith("data:image")) {
          avatarStyle = `background-image: url(${uData.photoURL})`;
        } else {
          avatarText = uData.photoURL || "🧪";
        }

        item.innerHTML = `
          <div class="avatar" style="${avatarStyle} width: 40px; height: 40px; font-size: 16px;">${avatarText}</div>
          <div>
            <div style="font-weight: bold; color: white;">${uData.displayName}</div>
            <div style="font-size: 12px; color: #71767b;">@${uData.userLoginId}</div>
          </div>
        `;

        item.addEventListener("click", () => {
          openDmChatWith(pUid, uData.displayName);
        });

        container.appendChild(item);
      });
    });
  });
}

function openDmChatWith(partnerUid, partnerName) {
  activeDmChatPartnerId = partnerUid;
  const headerEl = document.getElementById("dm-chat-partner-name");
  if (headerEl) headerEl.innerText = `${partnerName} さん`;

  setDisplay("dm-users-list", "none");
  setDisplay("dm-chat-window", "flex");

  const myUid = auth.currentUser.uid;
  const dmRoomId = myUid < partnerUid ? `${myUid}_${partnerUid}` : `${partnerUid}_${myUid}`;
  
  const dmRef = ref(db, `direct_messages/${dmRoomId}`);
  onValue(dmRef, (snapshot) => {
    const msgsContainer = document.getElementById("dm-messages-container");
    if (!msgsContainer) return;

    msgsContainer.innerHTML = "";
    const msgsData = snapshot.val();
    if (!msgsData) {
      msgsContainer.innerHTML = "<div style='padding:20px; color:#71767b; text-align:center;'>メッセージはまだありません。</div>";
      return;
    }

    const list = Object.keys(msgsData).map(key => msgsData[key]).sort((a, b) => a.createdAt - b.createdAt);

    list.forEach(msg => {
      const bubble = document.createElement("div");
      const isMe = msg.senderId === myUid;
      bubble.style.maxWidth = "70%";
      bubble.style.padding = "10px 14px";
      bubble.style.borderRadius = "16px";
      bubble.style.marginBottom = "8px";
      bubble.style.lineBreak = "anywhere";
      bubble.style.fontSize = "14px";

      if (isMe) {
        bubble.style.alignSelf = "flex-end";
        bubble.style.backgroundColor = "#1d9bf0";
        bubble.style.color = "white";
      } else {
        bubble.style.alignSelf = "flex-start";
        bubble.style.backgroundColor = "#2f3336";
        bubble.style.color = "white";
      }

      bubble.innerText = msg.text;
      msgsContainer.appendChild(bubble);
    });

    msgsContainer.scrollTop = msgsContainer.scrollHeight;
  });
}

const sendDmBtn = document.getElementById("btn-send-dm");
if (sendDmBtn) {
  sendDmBtn.addEventListener("click", async () => {
    const input = document.getElementById("dm-input");
    if (!input || !activeDmChatPartnerId) return;

    const text = input.value.trim();
    if (!text) return;

    const myUid = auth.currentUser.uid;
    const dmRoomId = myUid < activeDmChatPartnerId ? `${myUid}_${activeDmChatPartnerId}` : `${activeDmChatPartnerId}_${myUid}`;

    const newDmRef = push(ref(db, `direct_messages/${dmRoomId}`));
    await set(newDmRef, {
      senderId: myUid,
      text: text,
      createdAt: Date.now()
    });

    input.value = "";
  });
}

const backToDmUsersBtn = document.getElementById("btn-back-to-dm-users");
if (backToDmUsersBtn) {
  backToDmUsersBtn.addEventListener("click", () => {
    activeDmChatPartnerId = null;
    setDisplay("dm-chat-window", "none");
    setDisplay("dm-users-list", "block");
  });
}


// --- 👥 プロフィールモーダル ---
const btnSaveProfile = document.getElementById("btn-save-profile");
if (btnSaveProfile) {
  btnSaveProfile.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;

    const newName = document.getElementById("edit-display-name").value.trim();
    const newBio = document.getElementById("edit-bio").value.trim();
    const avatarFileInput = document.getElementById("edit-avatar-file");
    const avatarFile = avatarFileInput ? avatarFileInput.files[0] : null;

    if (!newName) {
      alert("名前は必須です。");
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
    alert("プロフィールを変更しました！");
    setDisplay("profile-modal", "none");
  });
}

const closeProfileModalBtn = document.getElementById("close-profile-modal");
if (closeProfileModalBtn) {
  closeProfileModalBtn.addEventListener("click", () => {
    setDisplay("profile-modal", "none");
  });
}

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

    if (detailsAvatar) {
      if (userData.photoURL && userData.photoURL.startsWith("data:image")) {
        detailsAvatar.innerText = "";
        detailsAvatar.style.backgroundImage = `url(${userData.photoURL})`;
      } else {
        detailsAvatar.innerText = userData.photoURL || "🧪";
        detailsAvatar.style.backgroundImage = "none";
      }
    }

    if (detailsName) detailsName.innerText = userData.displayName;
    if (detailsId) detailsId.innerText = `@${userData.userLoginId}`;
    if (detailsBio) detailsBio.innerText = userData.bio || "自己紹介は未登録です。";

    if (detailsDate) {
      if (userData.createdAt) {
        const date = new Date(userData.createdAt);
        detailsDate.innerText = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
      } else {
        detailsDate.innerText = "不明";
      }
    }

    if (editBtn) {
      if (currentUser && currentUser.uid === uid) {
        editBtn.style.display = "block";
        editBtn.onclick = () => {
          const editNameEl = document.getElementById("edit-display-name");
          const editBioEl = document.getElementById("edit-bio");
          if (editNameEl) editNameEl.value = userData.displayName;
          if (editBioEl) editBioEl.value = userData.bio || "";
          setDisplay("user-details-modal", "none");
          setDisplay("profile-modal", "flex");
        };
      } else {
        editBtn.style.display = "none";
      }
    }

    loadUserPostsOnly(uid);
    setDisplay("user-details-modal", "flex");
  }, { onlyOnce: true });
}

function loadUserPostsOnly(uid) {
  const postsRef = ref(db, "posts");
  const listContainer = document.getElementById("details-posts-list");
  if (!listContainer) return;

  onValue(postsRef, (snapshot) => {
    listContainer.innerHTML = "";
    const postsData = snapshot.val();
    if (!postsData) {
      listContainer.innerHTML = "<div style='padding:15px; color:#71767b; text-align:center;'>投稿はありません</div>";
      return;
    }

    const sorted = Object.keys(postsData)
      .map(key => ({ id: key, ...postsData[key] }))
      .filter(post => post.senderId === uid)
      .sort((a, b) => b.createdAt - a.createdAt);

    if (sorted.length === 0) {
      listContainer.innerHTML = "<div style='padding:15px; color:#71767b; text-align:center;'>投稿はありません</div>";
      return;
    }

    sorted.forEach(post => {
      const div = document.createElement("div");
      div.className = "profile-post-item";
      div.style.cssText = "padding: 10px 0; border-bottom: 1px solid #2f3336;";
      div.innerHTML = `
        <div style="font-size:11px; color:#71767b; margin-bottom:4px;">${formatDate(post.createdAt)}</div>
        <div style="line-break:anywhere; color:white;">${post.content}</div>
      `;
      listContainer.appendChild(div);
    });
  }, { onlyOnce: true });
}

const currentUserAvatar = document.getElementById("current-user-avatar");
if (currentUserAvatar) {
  currentUserAvatar.addEventListener("click", () => {
    if (auth.currentUser) {
      showUserProfile(auth.currentUser.uid);
    }
  });
}

const closeUserDetailsBtn = document.getElementById("close-user-details-modal");
if (closeUserDetailsBtn) {
  closeUserDetailsBtn.addEventListener("click", () => {
    setDisplay("user-details-modal", "none");
  });
}


// --- 🔔 通知機能 ---
function sendNotification(targetUid, type, actorUid, postId) {
  if (targetUid === actorUid) return;

  const notifRef = push(ref(db, `notifications/${targetUid}`));
  set(notifRef, {
    type: type,
    actorUid: actorUid,
    postId: postId,
    createdAt: Date.now(),
    isRead: false
  });
}

function initNotificationObserver() {
  const user = auth.currentUser;
  if (!user) return;

  const notifRef = ref(db, `notifications/${user.uid}`);
  onValue(notifRef, (snapshot) => {
    const notifs = snapshot.val();
    const badge = document.getElementById("notif-badge");
    const container = document.getElementById("notification-timeline");

    if (!container) return;
    if (!notifs) {
      if (badge) badge.style.display = "none";
      container.innerHTML = "<div style='padding:20px; color:#71767b; text-align:center;'>通知はまだありません。</div>";
      return;
    }

    const list = Object.keys(notifs).map(key => ({ id: key, ...notifs[key] }));
    const unreadCount = list.filter(n => !n.isRead).length;

    if (badge) {
      if (unreadCount > 0) {
        badge.style.display = "inline-block";
        badge.innerText = unreadCount;
      } else {
        badge.style.display = "none";
      }
    }

    list.sort((a, b) => b.createdAt - a.createdAt);
    container.innerHTML = "";

    list.forEach(n => {
      const item = document.createElement("div");
      item.className = "notification-item";
      item.style.cssText = "padding: 15px; border-bottom: 1px solid #2f3336; cursor: pointer;";
      
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

      item.addEventListener("click", async () => {
        await update(ref(db, `notifications/${user.uid}/${n.id}`), { isRead: true });
        
        setDisplay("notification-timeline", "none");
        setDisplay("dm-content", "none");
        setDisplay("thread-detail-container", "none");
        setDisplay("timeline", "block");
        setDisplay("global-tweet-box", "block");
        setDisplay("category-tabs-container", "flex");
        const pageTitle = document.getElementById("page-title");
        if (pageTitle) pageTitle.innerText = "ホーム";

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
const navHome = document.getElementById("nav-home");
if (navHome) {
  navHome.addEventListener("click", () => {
    setDisplay("timeline", "block");
    setDisplay("global-tweet-box", "block");
    setDisplay("category-tabs-container", "flex"); // カテゴリタブを出す
    setDisplay("notification-timeline", "none");
    setDisplay("dm-content", "none");
    setDisplay("thread-detail-container", "none");
    const pageTitle = document.getElementById("page-title");
    if (pageTitle) pageTitle.innerText = "ホーム";
  });
}

const navNotifications = document.getElementById("nav-notifications");
if (navNotifications) {
  navNotifications.addEventListener("click", () => {
    setDisplay("timeline", "none");
    setDisplay("global-tweet-box", "none");
    setDisplay("category-tabs-container", "none");
    setDisplay("notification-timeline", "block");
    setDisplay("dm-content", "none");
    setDisplay("thread-detail-container", "none");
    const pageTitle = document.getElementById("page-title");
    if (pageTitle) pageTitle.innerText = "通知";
  });
}

const navDms = document.getElementById("nav-dms");
if (navDms) {
  navDms.addEventListener("click", () => {
    setDisplay("timeline", "none");
    setDisplay("global-tweet-box", "none");
    setDisplay("category-tabs-container", "none");
    setDisplay("notification-timeline", "none");
    setDisplay("thread-detail-container", "none");
    setDisplay("dm-content", "block"); 
    setDisplay("dm-chat-window", "none"); 
    setDisplay("dm-users-list", "block"); 

    const pageTitle = document.getElementById("page-title");
    if (pageTitle) pageTitle.innerText = "メッセージ";
  });
}
