import { getDatabase, ref, set, remove, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const db = getDatabase();

// フォローする
export function followUser(myUid, targetUid) {
  if (myUid === targetUid) return alert("自分自身をフォローすることはできません。");
  
  const followRef = ref(db, `follows/${myUid}/${targetUid}`);
  set(followRef, true)
    .then(() => console.log("フォローしました"))
    .catch(err => console.error("フォロー失敗:", err));
}

// フォローを解除する
export function unfollowUser(myUid, targetUid) {
  const followRef = ref(db, `follows/${myUid}/${targetUid}`);
  remove(followRef)
    .then(() => console.log("フォローを解除しました"))
    .catch(err => console.error("解除失敗:", err));
}

// フォロー状態の監視（ボタンの表示を「フォロー中」に切り替える場合など）
export function checkFollowStatus(myUid, targetUid, callback) {
  const followRef = ref(db, `follows/${myUid}/${targetUid}`);
  onValue(followRef, (snapshot) => {
    const isFollowing = snapshot.exists();
    callback(isFollowing);
  });
}
