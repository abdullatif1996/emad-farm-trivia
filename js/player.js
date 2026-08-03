// منطق صفحة انضمام اللاعب — لعبة "أسرع واحد يضغط"

const currentRef = db.ref("game2/current");
const playersRef = db.ref("game2/players");
const pendingPlayersRef = db.ref("game2/pendingPlayers");

const CHAR_DELAY_MS = 90; // نفس القيمة المستخدمة بـ display.js لحساب موضع الكتابة لحظة الضغط

const STORAGE_KEY = "buzzerPlayerName";

let myName = null;
let currentGameState = null;
let isApproved = false; // لاعب معتمد بقائمة game2/players، وإلا بحالة انتظار

function showJoinedScreens(name) {
  document.getElementById("nameGate").classList.add("hidden");
  document.getElementById("buzzerPlayerName").textContent = name;
  document.getElementById("waitingPlayerName").textContent = name;
  updateApprovalUI();
}

function updateApprovalUI() {
  document.getElementById("waitingApprovalScreen").classList.toggle("hidden", isApproved);
  document.getElementById("buzzerScreen").classList.toggle("hidden", !isApproved);
}

// لاعب لازم يوافق عليه الهوست أول (game2/pendingPlayers) قبل ما ينضم فعليًا
// لقائمة اللاعبين النشطين (game2/players) — راجع host2.html
function registerPlayer(name) {
  const approvedRef = playersRef.child(name);

  approvedRef.on("value", (snap) => {
    if (snap.exists()) {
      isApproved = true;
      document.getElementById("buzzerScore").textContent = (snap.val() && snap.val().score) || 0;
    } else {
      isApproved = false;
      // سجّل طلب انضمام مرة وحدة بس، لو ما فيه طلب مسجّل أصلاً
      pendingPlayersRef.child(name).once("value").then((pendingSnap) => {
        if (!pendingSnap.exists()) {
          pendingPlayersRef.child(name).set({ requestedAt: Date.now() });
        }
      });
    }
    updateApprovalUI();
  });
}

function joinAs(name) {
  myName = name;
  localStorage.setItem(STORAGE_KEY, name);
  showJoinedScreens(name);
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
  document.getElementById("waitingApprovalScreen").classList.add("hidden");
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
  updateTopCategoryBadge();
  updateBuzzRing();
});

function updateTopCategoryBadge() {
  const badge = document.getElementById("topCategoryBadge");
  if (!badge) return;
  const data = currentGameState;
  const category = data && data.question ? data.category || "" : "";
  badge.textContent = category;
  badge.classList.toggle("hidden", !category);
}

// ---------- حلقة عد الـ5 ثواني حول زر اللاعب نفسه لما هو اللي ضغط ----------
const BUZZ_RING_MS = 5000;
const BUZZ_RING_CIRCUMFERENCE = 2 * Math.PI * 46; // نفس نصف قطر الدائرة بـ SVG (r=46)
let ringFrame = null;

function updateBuzzRing() {
  if (ringFrame) {
    cancelAnimationFrame(ringFrame);
    ringFrame = null;
  }

  const ringEl = document.getElementById("buzzRing");
  const progressEl = document.getElementById("buzzRingProgress");
  const data = currentGameState;

  const showRing =
    !!data &&
    data.buzzedBy === myName &&
    data.judgement !== "correct" &&
    typeof data.buzzedAt === "number";

  if (!showRing) {
    ringEl.classList.add("hidden");
    return;
  }

  ringEl.classList.remove("hidden");
  progressEl.style.strokeDasharray = BUZZ_RING_CIRCUMFERENCE.toFixed(2);

  function step() {
    const elapsed = Date.now() - data.buzzedAt;
    const fraction = Math.min(1, Math.max(0, elapsed / BUZZ_RING_MS));
    progressEl.style.strokeDashoffset = (BUZZ_RING_CIRCUMFERENCE * fraction).toFixed(2);

    if (fraction < 1) {
      ringFrame = requestAnimationFrame(step);
    }
  }

  step();
}

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
    data.buzzedAt = Date.now(); // مرجع الوقت لعرض مؤقت الـ5 ثواني (بشاشة العرض وحلقة الزر هنا)
    data.typingActive = false;
    data.typingStartedAt = null;
    data.revealedCharsAtPause = frozenChars;
    data.graceUntil = null; // يلغي العد التنازلي فورًا لأن حد ضغط
    return data;
  });
});
