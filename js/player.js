// منطق صفحة انضمام اللاعب — لعبة "أسرع واحد يضغط"

const currentRef = db.ref("game2/current");
const playersRef = db.ref("game2/players");

const CHAR_DELAY_MS = 90; // نفس القيمة المستخدمة بـ display.js لحساب موضع الكتابة لحظة الضغط

const STORAGE_KEY = "buzzerPlayerName";

let myName = null;
let currentGameState = null;

function showBuzzerScreen(name) {
  document.getElementById("nameGate").classList.add("hidden");
  document.getElementById("buzzerScreen").classList.remove("hidden");
  document.getElementById("buzzerPlayerName").textContent = name;
}

function registerPlayer(name) {
  const playerRef = playersRef.child(name);
  playerRef.once("value").then((snap) => {
    if (!snap.exists()) {
      playerRef.set({ score: 0 });
    }
  });

  playerRef.child("score").on("value", (snap) => {
    document.getElementById("buzzerScore").textContent = snap.val() || 0;
  });
}

function joinAs(name) {
  myName = name;
  localStorage.setItem(STORAGE_KEY, name);
  showBuzzerScreen(name);
  registerPlayer(name);
}

// ---------- شاشة إدخال الاسم ----------
const savedName = localStorage.getItem(STORAGE_KEY);
if (savedName) {
  joinAs(savedName);
}

document.getElementById("btnJoin").addEventListener("click", attemptJoin);
document.getElementById("playerNameInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") attemptJoin();
});

function attemptJoin() {
  const value = document.getElementById("playerNameInput").value.trim();
  const errorEl = document.getElementById("joinError");
  if (!value) {
    errorEl.classList.remove("hidden");
    return;
  }
  errorEl.classList.add("hidden");
  joinAs(value);
}

document.getElementById("btnChangeName").addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  document.getElementById("buzzerScreen").classList.add("hidden");
  document.getElementById("nameGate").classList.remove("hidden");
  document.getElementById("playerNameInput").value = "";
});

// ---------- زر الإجابة ----------
function updateBuzzButtonState() {
  const btn = document.getElementById("btnBuzz");
  const statusEl = document.getElementById("buzzerStatus");
  const data = currentGameState;

  if (!data || !data.question) {
    btn.disabled = true;
    statusEl.textContent = "بانتظار سؤال جديد...";
    return;
  }

  const isBlocked = Array.isArray(data.blockedPlayers) && data.blockedPlayers.includes(myName);

  if (data.buzzedBy) {
    btn.disabled = true;
    if (data.buzzedBy === myName) {
      statusEl.textContent =
        data.judgement === "correct" ? "✓ صح! أحسنت" : "بانتظار حكم الهوست...";
    } else {
      statusEl.textContent = `${data.buzzedBy} ضغط قبلك...`;
    }
    return;
  }

  if (isBlocked) {
    btn.disabled = true;
    statusEl.textContent = "أجبت غلط بهذا السؤال — بانتظار السؤال التالي";
    return;
  }

  const inGrace = typeof data.graceUntil === "number" && Date.now() < data.graceUntil;

  if (data.typingActive || inGrace) {
    btn.disabled = false;
    statusEl.textContent = inGrace ? "الفرصة مفتوحة! اضغط لو عرفت الجواب" : "اضغط لو عرفت الجواب!";
    return;
  }

  btn.disabled = true;
  statusEl.textContent = "بانتظار الهوست...";
}

currentRef.on("value", (snapshot) => {
  currentGameState = snapshot.val();
  updateBuzzButtonState();
});

document.getElementById("btnBuzz").addEventListener("click", () => {
  if (!myName) return;

  currentRef.transaction((data) => {
    if (!data) return data; // ما فيه سؤال نشط، تجاهل
    if (data.buzzedBy) return data; // لاعب ثاني سبقه، تجاهل (هذا اللي يمنع تعادل الضغط)
    if (Array.isArray(data.blockedPlayers) && data.blockedPlayers.includes(myName)) return data;

    const inGrace = typeof data.graceUntil === "number" && Date.now() < data.graceUntil;
    if (!data.typingActive && !inGrace) return data; // ما فيه فرصة ضغط حاليًا

    const questionText = data.question || "";
    let frozenChars;

    if (data.typingActive && data.typingStartedAt) {
      const elapsed = Date.now() - data.typingStartedAt;
      const extraChars = Math.floor(elapsed / CHAR_DELAY_MS);
      frozenChars = Math.min(questionText.length, (data.revealedCharsAtPause || 0) + extraChars);
    } else {
      // بفترة السماح الكتابة متوقفة أصلاً بنفس النقطة، ما فيه شي يتحسب
      frozenChars = data.revealedCharsAtPause || 0;
    }

    data.buzzedBy = myName;
    data.typingActive = false;
    data.typingStartedAt = null;
    data.revealedCharsAtPause = frozenChars;
    data.graceUntil = null; // يلغي العد التنازلي فورًا لأن حد ضغط
    return data;
  });
});
