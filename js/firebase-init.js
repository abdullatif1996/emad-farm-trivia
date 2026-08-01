// تهيئة Firebase (يُستخدم من host.html و display.html و admin.html)
// يفترض أن firebase-config.js وسكربتات Firebase compat SDK محمّلة قبله.

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// شارة حالة الاتصال بقاعدة البيانات — تبحث عن عنصر بمعرّف #connectionStatus
function watchConnectionStatus() {
  const el = document.getElementById("connectionStatus");
  if (!el) return;

  db.ref(".info/connected").on("value", (snap) => {
    const connected = snap.val() === true;
    el.classList.toggle("is-online", connected);
    el.classList.toggle("is-offline", !connected);
    el.querySelector(".status-text").textContent = connected
      ? "متصل"
      : "غير متصل";
  });
}

document.addEventListener("DOMContentLoaded", watchConnectionStatus);
