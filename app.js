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
let usersMap = {}; 
let firstDmLoadFinished = false;
let previousDmCount = 0;

// DOMContentLoaded で囲むことで、HTMLの読み込み完了を確実に待つ
document.addEventListener("DOMContentLoaded", () => {

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
      const nameEl = document.getElementById("signup-name");
      const romanIdEl = document.getElementById("signup-name-roman");
      const emailEl = document.getElementById("signup-email");
      const passwordEl = document.getElementById("signup-password");
      const avatarFileInput = document.getElementById("signup-avatar-file");

      if (!nameEl || !romanIdEl || !passwordEl) return;

      const name = nameEl.value.trim();
      const romanId = romanIdEl.value.trim().toLowerCase();
      let email = emailEl ? emailEl.value.trim() : "";
      const password = passwordEl.value;
      const avatarFile = avatarFileInput ? avatarFileInput.files[0] : null;

      if (!name || !romanId || !password) {
        alert("必須項目（表示名、ログインID、パスワード）をすべて入力してください。");
        return;
      }

      try {
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
          status: "active",
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
      const idEl = document.getElementById("login-identifier");
      const pwEl = document.getElementById("login-password");
      if (!idEl || !pwEl) return;

      const identifier = idEl.value.trim().toLowerCase();
      const password = pwEl.value;
      
      if (!identifier || !password) {
        alert("ログイン情報を入力してください。");
        return;
      }

      let targetEmail = identifier;

      try {
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

  // Auth 状態監視＆アカウント凍結監視
  onAuthStateChanged(auth, (user) => {
    if (user) {
      const userStatusRef = ref(db, `users/${user.uid}/status`);
      onValue(userStatusRef, (snap) => {
        const status = snap.val();
        if (status === "frozen") {
          alert("⚠️ このアカウントは管理者により凍結されました。");
          signOut(auth).then(() => {
            location.reload();
          });
        }
      });

      setDisplay("auth-gateway", "none");
      setDisplay("app-container", "flex");
      
      onValue(ref(db, "users"), (snapshot) => {
        usersMap = snapshot.val() || {};
        const myData = usersMap[user.uid];
        if (myData) {
          const updateAvatar = (el) => {
            if (!el) return;
            if (myData.photoURL && myData.photoURL.startsWith("data:image")) {
              el.innerText = "";
              el.style.backgroundImage = `url(${myData.photoURL})`;
            } else {
              el.innerText = myData.photoURL || "🧪";
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
      observeNewDmMessages(user.uid); 
    } else {
      setDisplay("app-container", "none");
      setDisplay("auth-gateway", "flex");
    }
  });

  // --- 🏷️ カテゴリ切り替え ---
  const tabElements = document.querySelectorAll(".category-tab");
  tabElements.forEach(tab => {
    tab.addEventListener("click", (e) => {
      tabElements.forEach(t => t.classList.remove("active"));
      e.target.classList.add("active");
      currentCategory = e.target.getAttribute("data-category");
      loadUnifiedTimeline();
    });
  });

  // --- 📱 タイムライン表示 ---
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

  function renderPost(post, isThreadDetail = false) {
    const postElement = document.createElement("div");
    postElement.className = "post";
    postElement.dataset.id = post.id;

    const myUid = auth.currentUser ? auth.currentUser.uid : "";

    const userRef = ref(db, `users/${post.senderId}`);
    onValue(userRef, (userSnap) => {
      const uData = userSnap.val() || {};
      const displayName = uData.displayName || "名無し";
      const userLoginId = uData.userLoginId || "unknown";
      const photoURL = uData.photoURL || "🧪";

      let avatarStyle = "";
      let avatarText = "";
      if (photoURL && photoURL.startsWith("data:image")) {
        avatarStyle = `background-image: url(${photoURL})`;
      } else {
        avatarText = photoURL || "🧪";
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

      const avatarBtn = postElement.querySelector(`#avatar-${post.id}`);
      if (avatarBtn) {
        avatarBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          showUserProfile(post.senderId);
        });
      }

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

      const likeBtn = postElement.querySelector(`#action-like-${post.id}`);
      if (likeBtn && myUid) {
        const userLikeRef = ref(db, `likes/${post.id}/${myUid}`);
        
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
            await remove(userLikeRef);
            await runTransaction(postRef, (currentPost) => {
              if (currentPost) {
                currentPost.likeCount = Math.max(0, (currentPost.likeCount || 0) - 1);
              }
              return currentPost;
            });
          } else {
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

          onValue(ref(db, `users/${quotedPost.senderId}`), (qUserSnap) => {
            const quData = qUserSnap.val() || {};
            contentArea.innerHTML = `
              <div style="font-weight: bold; margin-bottom: 4px; color: #fff; font-size: 13px;">
                ${quData.displayName || "名無し"} <span style="font-weight: normal; color: #71767b; font-size: 11px;">@${quData.userLoginId || "unknown"}</span>
              </div>
              <div style="font-size: 13px; color: #e7e9ea;">${quotedPost.content}</div>
            `;
          }, { onlyOnce: true });

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

  // --- 👥 プロフィール ---
  function showUserProfile(targetUid) {
    const myUid = auth.currentUser ? auth.currentUser.uid : "";
    setDisplay("profile-modal", "flex");

    const nameEl = document.getElementById("profile-display-name");
    const loginIdEl = document.getElementById("profile-login-id");
    const bioEl = document.getElementById("profile-bio");
    const avatarEl = document.getElementById("profile-avatar");
    const followBtn = document.getElementById("btn-toggle-follow");

    if (nameEl) nameEl.innerText = "読み込み中...";
    if (loginIdEl) loginIdEl.innerText = "";
    if (bioEl) bioEl.innerText = "";
    if (avatarEl) {
      avatarEl.style.backgroundImage = "none";
      avatarEl.innerText = "🧪";
    }
    if (followBtn) followBtn.style.display = "none";

    onValue(ref(db, `users/${targetUid}`), (snapshot) => {
      const uData = snapshot.val();
      if (!uData) return;

      if (nameEl) nameEl.innerText = uData.displayName || "名無し";
      if (loginIdEl) loginIdEl.innerText = `@${uData.userLoginId || "unknown"}`;
      if (bioEl) bioEl.innerText = uData.bio || "よろしくお願いします！";
      if (avatarEl) {
        if (uData.photoURL && uData.photoURL.startsWith("data:image")) {
          avatarEl.innerText = "";
          avatarEl.style.backgroundImage = `url(${uData.photoURL})`;
        } else {
          avatarEl.innerText = uData.photoURL || "🧪";
          avatarEl.style.backgroundImage = "none";
        }
      }

      if (myUid && myUid !== targetUid && followBtn) {
        followBtn.style.display = "block";

        const followRef = ref(db, `follows/${myUid}/${targetUid}`);
        onValue(followRef, (fSnap) => {
          if (fSnap.exists()) {
            followBtn.innerText = "フォロー解除";
            followBtn.className = "follow-btn unfollow";
          } else {
            followBtn.innerText = "フォローする";
            followBtn.className = "follow-btn";
          }
        });

        followBtn.onclick = async () => {
          const followCheck = await get(followRef);
          if (followCheck.exists()) {
            await remove(followRef);
          } else {
            await set(followRef, true);
            sendNotification(targetUid, "follow", myUid, null);
          }
        };
      }
    }, { onlyOnce: true });
  }

  const closeProfileBtn = document.getElementById("close-profile-modal");
  if (closeProfileBtn) {
    closeProfileBtn.addEventListener("click", () => {
      setDisplay("profile-modal", "none");
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
        alert("ユーザーが見つかりませんでした。");
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
        container.innerHTML = "<div style='padding:20px; color:#71767b; text-align:center;'>メッセージ履歴がありません。</div>";
        return;
      }

      const myUid = auth.currentUser ? auth.currentUser.uid : "";
      const activePartnerUids = new Set();

      Object.keys(data).forEach(roomKey => {
        if (roomKey.includes(myUid)) {
          const uids = roomKey.split("_");
          const partnerUid = uids.find(id => id !== myUid);
          if (partnerUid) {
            activePartnerUids.add(partnerUid);
          }
        }
      });

      if (activePartnerUids.size === 0) {
        container.innerHTML = "<div style='padding:20px; color:#71767b; text-align:center;'>メッセージ履歴がありません。</div>";
        return;
      }

      activePartnerUids.forEach(pUid => {
        onValue(ref(db, `users/${pUid}`), (uSnap) => {
          const pData = uSnap.val() || {};
          const displayName = pData.displayName || "名無し";
          const loginId = pData.userLoginId || "unknown";
          const avatar = pData.photoURL || "🧪";

          const userRow = document.createElement("div");
          userRow.className = "dm-user-row";
          
          let avatarStyle = "";
          let avatarText = "";
          if (avatar && avatar.startsWith("data:image")) {
            avatarStyle = `background-image: url(${avatar})`;
          } else {
            avatarText = avatar || "🧪";
          }

          userRow.innerHTML = `
            <div class="avatar" style="${avatarStyle}; flex-shrink:0;">${avatarText}</div>
            <div style="margin-left: 10px;">
              <div style="font-weight: bold; color: #fff;">${displayName}</div>
              <div style="font-size: 12px; color: #71767b;">@${loginId}</div>
            </div>
          `;

          userRow.addEventListener("click", () => {
            openDmChatWith(pUid, displayName);
          });

          container.appendChild(userRow);
        }, { onlyOnce: true });
      });
    });
  }

  function openDmChatWith(partnerUid, partnerDisplayName) {
    activeDmChatPartnerId = partnerUid;
    setDisplay("dm-user-selector-view", "none");
    setDisplay("dm-active-chat-view", "block");

    const headerName = document.getElementById("dm-chat-partner-name");
    if (headerName) headerName.innerText = partnerDisplayName;

    const myUid = auth.currentUser.uid;
    const roomKey = myUid < partnerUid ? `${myUid}_${partnerUid}` : `${partnerUid}_${myUid}`;

    const chatMessagesArea = document.getElementById("dm-chat-messages");
    const dmRef = ref(db, `direct_messages/${roomKey}`);

    onValue(dmRef, (snapshot) => {
      if (!chatMessagesArea) return;
      chatMessagesArea.innerHTML = "";

      const messages = snapshot.val();
      if (!messages) {
        chatMessagesArea.innerHTML = "<div style='padding:20px; color:#71767b; text-align:center;'>メッセージはまだありません。</div>";
        return;
      }

      Object.keys(messages).forEach(msgId => {
        const msg = messages[msgId];
        const isMe = msg.senderId === myUid;

        const bubbleWrapper = document.createElement("div");
        bubbleWrapper.style.display = "flex";
        bubbleWrapper.style.justifyContent = isMe ? "flex-end" : "flex-start";
        bubbleWrapper.style.marginBottom = "10px";

        const bubble = document.createElement("div");
        bubble.style.padding = "10px 14px";
        bubble.style.borderRadius = "18px";
        bubble.style.maxWidth = "70%";
        bubble.style.wordBreak = "break-all";
        bubble.style.fontSize = "14px";

        if (isMe) {
          bubble.style.backgroundColor = "#1d9bf0";
          bubble.style.color = "#fff";
        } else {
          bubble.style.backgroundColor = "#2f3e56";
          bubble.style.color = "#f3f4f6";
        }

        bubble.innerText = msg.text || "";
        bubbleWrapper.appendChild(bubble);
        chatMessagesArea.appendChild(bubbleWrapper);
      });

      chatMessagesArea.scrollTop = chatMessagesArea.scrollHeight;
    });
  }

  const btnBackToDmList = document.getElementById("btn-back-to-dm-list");
  if (btnBackToDmList) {
    btnBackToDmList.addEventListener("click", () => {
      activeDmChatPartnerId = null;
      setDisplay("dm-active-chat-view", "none");
      setDisplay("dm-user-selector-view", "block");
    });
  }

  const btnSendDm = document.getElementById("btn-send-dm");
  if (btnSendDm) {
    btnSendDm.addEventListener("click", async () => {
      const input = document.getElementById("dm-chat-input");
      if (!input || !activeDmChatPartnerId) return;

      const text = input.value.trim();
      if (!text) return;

      const myUid = auth.currentUser.uid;
      const partnerUid = activeDmChatPartnerId;
      const roomKey = myUid < partnerUid ? `${myUid}_${partnerUid}` : `${partnerUid}_${myUid}`;

      const newMsgKey = push(child(ref(db), `direct_messages/${roomKey}`)).key;
      const msgData = {
        id: newMsgKey,
        senderId: myUid,
        text: text,
        createdAt: Date.now()
      };

      await set(ref(db, `direct_messages/${roomKey}/${newMsgKey}`), msgData);
      input.value = "";
    });
  }

  function observeNewDmMessages(myUid) {
    const directMsgsRef = ref(db, "direct_messages");
    onValue(directMsgsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      let currentTotalDms = 0;

      Object.keys(data).forEach(roomKey => {
        if (roomKey.includes(myUid)) {
          const thread = data[roomKey];
          if (thread && typeof thread === 'object') {
            currentTotalDms += Object.keys(thread).length;
          }
        }
      });

      if (firstDmLoadFinished && currentTotalDms > previousDmCount) {
        const dmBadge = document.getElementById("dm-nav-badge");
        if (dmBadge) {
          dmBadge.style.display = "inline-block";
        }
      }

      previousDmCount = currentTotalDms;
      firstDmLoadFinished = true;
    });
  }

  const dmNavBtn = document.getElementById("nav-dm-tab");
  if (dmNavBtn) {
    dmNavBtn.addEventListener("click", () => {
      const dmBadge = document.getElementById("dm-nav-badge");
      if (dmBadge) {
        dmBadge.style.display = "none";
      }
    });
  }

  // --- 🔔 通知送信システム ---
  async function sendNotification(targetUid, type, senderUid, postId = null) {
    if (targetUid === senderUid) return;
    
    const notifRef = ref(db, `notifications/${targetUid}`);
    const newNotifKey = push(notifRef).key;
    
    await set(ref(db, `notifications/${targetUid}/${newNotifKey}`), {
      id: newNotifKey,
      type: type, 
      senderId: senderUid,
      postId: postId || "",
      checked: false,
      createdAt: Date.now()
    });
  }

  function initNotificationObserver() {
    const myUid = auth.currentUser ? auth.currentUser.uid : "";
    if (!myUid) return;

    const notifRef = ref(db, `notifications/${myUid}`);
    onValue(notifRef, (snapshot) => {
      const data = snapshot.val();
      const notificationContainer = document.getElementById("notification-list");
      const navBadge = document.getElementById("notification-nav-badge");
      
      if (!notificationContainer) return;
      notificationContainer.innerHTML = "";

      if (!data) {
        notificationContainer.innerHTML = "<div style='padding:20px; color:#71767b; text-align:center;'>通知はまだありません。</div>";
        if (navBadge) navBadge.style.display = "none";
        return;
      }

      const notifs = Object.keys(data)
        .map(key => ({ id: key, ...data[key] }))
        .sort((a, b) => b.createdAt - a.createdAt);

      const hasUnread = notifs.some(n => !n.checked);
      if (navBadge) {
        navBadge.style.display = hasUnread ? "inline-block" : "none";
      }

      notifs.forEach(notif => {
        const row = document.createElement("div");
        row.className = `notification-item ${notif.checked ? 'read' : 'unread'}`;
        row.style.padding = "15px";
        row.style.borderBottom = "1px solid #2f3e56";
        row.style.display = "flex";
        row.style.alignItems = "center";

        onValue(ref(db, `users/${notif.senderId}`), (uSnap) => {
          const uData = uSnap.val() || {};
          let text = "";
          let icon = "🔔";

          if (notif.type === "like") {
            icon = "❤️";
            text = `${uData.displayName || "名無し"}さんがあなたの投稿をいいねしました。`;
          } else if (notif.type === "reply") {
            icon = "💬";
            text = `${uData.displayName || "名無し"}さんがあなたに返信しました。`;
          } else if (notif.type === "quote") {
            icon = "🔄";
            text = `${uData.displayName || "名無し"}さんがあなたの投稿を引用しました。`;
          } else if (notif.type === "follow") {
            icon = "👥";
            text = `${uData.displayName || "名無し"}さんにフォローされました！`;
          }

          row.innerHTML = `
            <div style="font-size: 20px; margin-right: 15px;">${icon}</div>
            <div>
              <div style="color: #fff; font-size: 14px;">${text}</div>
              <div style="font-size: 11px; color: #71767b; margin-top: 4px;">${formatDate(notif.createdAt)}</div>
            </div>
          `;
        }, { onlyOnce: true });

        row.addEventListener("click", () => {
          update(ref(db, `notifications/${myUid}/${notif.id}`), { checked: true });
          if (notif.postId) {
            get(ref(db, `posts/${notif.postId}`)).then((pSnap) => {
              if (pSnap.exists()) openPostThreadDetail(pSnap.val());
            });
          }
        });

        notificationContainer.appendChild(row);
      });
    });
  }

}); // DOMContentLoaded 終了
