// منطق شاشة العرض — تحديث فوري من game/current

const currentRef = db.ref("game/current");
const scoresRef = db.ref("game/scores");
const turnTeamRef = db.ref("game/turnTeam");
const teamNamesRef = db.ref("game/teamNames");

const DEFAULT_TEAM_NAMES = { team1: "الفريق الأول", team2: "الفريق الثاني" };

let previousRevealed = []; // لمعرفة أي إجابة اكتُشفت حديثًا لعرض الأنيميشن والصوت
let currentScores = { team1: 0, team2: 0 };
let currentTurnTeam = 1;
let currentTeamNames = { ...DEFAULT_TEAM_NAMES };

// ---------- مؤثرات صوتية (Web Audio API، بدون ملف خارجي) ----------
// AudioContext واحد مشترك للصفحة كلها — يُنشأ (أو يُفعّل) مرة وحدة بضغطة المستخدم
// على بوابة "اضغط لتفعيل الصوت"، لأن متصفحات الجوال تمنع الصوت بدون تفاعل مباشر.
let audioCtx = null;

function ensureAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

document.getElementById("btnUnlockAudio").addEventListener("click", () => {
  ensureAudioContext();
  document.getElementById("audioUnlockOverlay").classList.add("hidden");
});

function playCorrectSound() {
  try {
    const ctx = ensureAudioContext();
    function tone(freq, start, dur, vol = 0.08) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.value = vol;
      o.connect(g);
      g.connect(ctx.destination);
      o.start(ctx.currentTime + start);
      g.gain.setValueAtTime(vol, ctx.currentTime + start + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      o.stop(ctx.currentTime + start + dur + 0.02);
    }
    tone(523, 0, 0.12);
    tone(659, 0.1, 0.12);
    tone(880, 0.2, 0.3);
  } catch (e) {
    // تجاهل أي فشل بتشغيل الصوت (مثلاً منع المتصفح للتشغيل التلقائي)
  }
}

function playWrongSound() {
  try {
    const ctx = ensureAudioContext();
    function tone(freq, start, dur, vol = 0.05) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.value = freq;
      g.gain.value = vol;
      o.connect(g);
      g.connect(ctx.destination);
      o.start(ctx.currentTime + start);
      g.gain.setValueAtTime(vol, ctx.currentTime + start + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      o.stop(ctx.currentTime + start + dur + 0.02);
    }
    tone(220, 0, 0.12);
    tone(180, 0.14, 0.16);
  } catch (e) {
    // تجاهل أي فشل بتشغيل الصوت (مثلاً منع المتصفح للتشغيل التلقائي)
  }
}

// ---------- مؤشر بصري للإجابة الخاطئة ----------
// ملاحظة: نراقب wrongFlashAt من داخل نفس مستمع game/current الرئيسي (بدل ref منفصل)
// عشان نضمن استخدام نفس القناة اللي أثبتت شغلها مع بقية الحقول (العنوان، الفئة، النقاط...)
let lastWrongFlashAt = 0;
let wrongFlashInitialized = false;

function showWrongFlash() {
  const el = document.getElementById("wrongFlash");
  el.classList.remove("is-active");
  void el.offsetWidth; // إعادة تشغيل الأنيميشن لو صار الحدث أكثر من مرة بسرعة
  el.classList.add("is-active");
}

function checkWrongFlash(value) {
  if (!wrongFlashInitialized) {
    lastWrongFlashAt = typeof value === "number" ? value : 0;
    wrongFlashInitialized = true;
    return;
  }

  if (typeof value === "number" && value > lastWrongFlashAt) {
    lastWrongFlashAt = value;
    playWrongSound();
    showWrongFlash();
  }
}

// ---------- نقاط الفريقين والدور (للقراءة فقط) ----------
let animatedScores = { team1: 0, team2: 0 };
let scoreAnimFrames = { team1: null, team2: null };
let scoresInitialized = false;

function renderTeamNamesAndTurn() {
  [1, 2].forEach((teamNum) => {
    const key = `team${teamNum}`;
    document.getElementById(`team${teamNum}NameText`).textContent = currentTeamNames[key];
    document
      .getElementById(`team${teamNum}Card`)
      .classList.toggle("is-turn", currentTurnTeam === teamNum);
  });
}

function animateScoreTo(teamNum, newValue) {
  const key = `team${teamNum}`;
  const el = document.getElementById(`team${teamNum}ScoreText`);
  const startValue = animatedScores[key];

  if (startValue === newValue) {
    el.textContent = newValue;
    return;
  }

  if (scoreAnimFrames[key]) {
    cancelAnimationFrame(scoreAnimFrames[key]);
  }

  el.classList.remove("score-pulse");
  void el.offsetWidth; // إعادة تشغيل أنيميشن النبضة
  el.classList.add("score-pulse");

  const duration = 500;
  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const value = Math.round(startValue + (newValue - startValue) * eased);
    el.textContent = value;

    if (t < 1) {
      scoreAnimFrames[key] = requestAnimationFrame(step);
    } else {
      el.textContent = newValue;
      animatedScores[key] = newValue;
      scoreAnimFrames[key] = null;
    }
  }

  scoreAnimFrames[key] = requestAnimationFrame(step);
}

scoresRef.on("value", (snapshot) => {
  currentScores = snapshot.val() || { team1: 0, team2: 0 };

  if (!scoresInitialized) {
    [1, 2].forEach((teamNum) => {
      const key = `team${teamNum}`;
      animatedScores[key] = currentScores[key] || 0;
      document.getElementById(`team${teamNum}ScoreText`).textContent = animatedScores[key];
    });
    scoresInitialized = true;
    return;
  }

  [1, 2].forEach((teamNum) => {
    const key = `team${teamNum}`;
    animateScoreTo(teamNum, currentScores[key] || 0);
  });
});

turnTeamRef.on("value", (snapshot) => {
  currentTurnTeam = snapshot.val() || 1;
  renderTeamNamesAndTurn();
});

teamNamesRef.on("value", (snapshot) => {
  currentTeamNames = { ...DEFAULT_TEAM_NAMES, ...(snapshot.val() || {}) };
  renderTeamNamesAndTurn();
});

// ---------- حساب حجم صفوف الإجابات من المساحة الفعلية المتوفرة ----------
// بدل الاعتماد بس على عدد الإجابات (اللي ما يتغيّر بين الوضع العمودي
// والأفقي)، نقيس هنا الارتفاع الحقيقي المتاح لقائمة الإجابات بعد كل
// العناصر الثابتة فوقها (شريط الفريقين، العنوان، الخط، العداد) ونحسب حجم
// الخط والمسافات على أساسه — هذا يضمن عدم التكدس بأي نسبة عرض-لارتفاع
// (خصوصًا الوضع الأفقي اللي يكون فيه ارتفاع الشاشة قصير جدًا).
let lastAnswerCount = 0;

function updateRowSizing(rowCount) {
  const answersEl = document.getElementById("dAnswers");
  if (!answersEl || rowCount <= 0) return;

  const availableHeight = answersEl.clientHeight;
  if (availableHeight <= 0) return;

  const roughPerRow = availableHeight / rowCount;
  const gapPx = Math.max(2, Math.min(8, roughPerRow * 0.12));
  const totalGap = gapPx * Math.max(0, rowCount - 1);

  const rowPaddingBlock = Math.max(1, Math.min(4, roughPerRow * 0.08));
  const contentPerRow = (availableHeight - totalGap) / rowCount - rowPaddingBlock * 2;

  const pointsBoxOverhead = 6; // حدود + حشوة صندوق النقاط تقريبًا (1px*2 + 2px*2)
  const lineHeight = 1.6;

  let fontSize = (contentPerRow - pointsBoxOverhead) / lineHeight;
  fontSize = Math.max(12, Math.min(27, fontSize));

  const root = document.documentElement.style;
  root.setProperty("--row-font-size", fontSize.toFixed(1) + "px");
  root.setProperty("--row-gap", gapPx.toFixed(1) + "px");
  root.setProperty("--row-padding-block", rowPaddingBlock.toFixed(1) + "px");
}

// لو المستخدم دوّر الجوال (عمودي ↔ أفقي) وسط اللعبة، نعيد حساب الأحجام
// فورًا بدل ما ننتظر تحديث جديد من قاعدة البيانات
let resizeDebounce = null;
window.addEventListener("resize", () => {
  if (resizeDebounce) clearTimeout(resizeDebounce);
  resizeDebounce = setTimeout(() => {
    if (lastAnswerCount > 0) updateRowSizing(lastAnswerCount);
  }, 120);
});

currentRef.on("value", (snapshot) => {
  const data = snapshot.val();
  const emptyState = document.getElementById("emptyState");
  const preparingState = document.getElementById("preparingState");
  const questionView = document.getElementById("questionView");
  const categoryBadge = document.getElementById("categoryBadge");

  if (!data || !Array.isArray(data.answers) || data.answers.length === 0) {
    emptyState.classList.remove("hidden");
    preparingState.classList.add("hidden");
    questionView.classList.add("hidden");
    categoryBadge.classList.add("hidden");
    previousRevealed = [];
    return;
  }

  categoryBadge.textContent = data.category || "";
  categoryBadge.classList.toggle("hidden", !data.category);

  checkWrongFlash(data.wrongFlashAt);

  if (!data.questionVisible) {
    emptyState.classList.add("hidden");
    preparingState.classList.remove("hidden");
    questionView.classList.add("hidden");
    previousRevealed = [];
    return;
  }

  emptyState.classList.add("hidden");
  preparingState.classList.add("hidden");
  questionView.classList.remove("hidden");

  document.getElementById("dTitle").textContent = data.title || "";
  const hintEl = document.getElementById("dHint");
  hintEl.textContent = data.hint || "";
  hintEl.style.display = data.hint ? "block" : "none";

  const total = data.answers.length;
  const revealedCount = data.answers.filter((a) => a.revealed).length;
  document.getElementById("dCounter").innerHTML =
    `تم اكتشاف <span class="counter-highlight">${revealedCount}</span> من ${total}`;

  // يقود حساب حجم عنوان السؤال (clamp/calc حسب --answer-count، مع حد أعلى
  // بالـ vh عشان ينكمش بالوضع الأفقي أيضًا)
  document.documentElement.style.setProperty("--answer-count", total);
  lastAnswerCount = total;
  updateRowSizing(total);

  // نحدّث كل صف بمكانه بدل ما نهدم القائمة كاملة ونعيد بناءها بكل تحديث —
  // هدم/بناء متكرر (خصوصًا مع كشف عدة إجابات بسرعة) يقدر يعطّل حساب ارتفاع
  // الصفوف (flex:1 المتداخل) بمتصفحات الجوال ويخلي الصفوف تتكدس فوق بعض.
  // كل صف يُنشأ مرة وحدة فقط، وبعدين نعدّل محتواه وحالته بمكانه.
  const answersEl = document.getElementById("dAnswers");
  let anyJustRevealed = false;

  data.answers.forEach((answer, index) => {
    const wasRevealed = previousRevealed[index] === true;
    const isRevealed = !!answer.revealed;
    const justRevealed = isRevealed && !wasRevealed;
    if (justRevealed) anyJustRevealed = true;

    let row = answersEl.children[index];
    if (!row) {
      row = document.createElement("div");
      row.innerHTML = `
        <span class="d-index"></span>
        <span class="d-text"></span>
        <span class="d-points"></span>
      `;
      answersEl.appendChild(row);
    }

    row.className = "display-answer" + (isRevealed ? " is-revealed" : "") + (justRevealed ? " just-revealed" : "");
    row.querySelector(".d-index").textContent = index + 1;
    row.querySelector(".d-text").textContent = isRevealed ? answer.text : "?????";
    row.querySelector(".d-points").textContent = isRevealed ? answer.points + " نقطة" : "";
  });

  // احذف أي صفوف زايدة لو السؤال الجديد فيه إجابات أقل من السابق
  while (answersEl.children.length > data.answers.length) {
    answersEl.removeChild(answersEl.lastChild);
  }

  if (anyJustRevealed) {
    playCorrectSound();
  }

  previousRevealed = data.answers.map((a) => !!a.revealed);
});
