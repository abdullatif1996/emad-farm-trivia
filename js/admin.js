// منطق صفحة إدارة الأسئلة
// ملاحظة: هذه حماية بسيطة على مستوى الواجهة فقط، وليست حماية أمنية حقيقية.
const ADMIN_PASSWORD = "admin1234";

const questionsRef = db.ref("questions");

// ---------- بوابة الدخول ----------
function showAdminPanel() {
  document.getElementById("loginGate").classList.add("hidden");
  document.getElementById("adminPanel").classList.remove("hidden");
}

if (sessionStorage.getItem("adminAuthed") === "1") {
  showAdminPanel();
}

document.getElementById("btnLogin").addEventListener("click", attemptLogin);
document.getElementById("passwordInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") attemptLogin();
});

function attemptLogin() {
  const value = document.getElementById("passwordInput").value;
  const errorEl = document.getElementById("loginError");
  if (value === ADMIN_PASSWORD) {
    sessionStorage.setItem("adminAuthed", "1");
    errorEl.classList.add("hidden");
    showAdminPanel();
  } else {
    errorEl.classList.remove("hidden");
  }
}

// ---------- صفوف الإجابات الديناميكية ----------
const answerRowsEl = document.getElementById("answerRows");

function addAnswerRow(text = "", points = "") {
  const row = document.createElement("div");
  row.className = "answer-input-row";
  row.innerHTML = `
    <input type="text" class="answer-text-input" placeholder="نص الإجابة" value="${escapeHtml(text)}" />
    <input type="number" class="answer-points-input" placeholder="نقاط" min="1" value="${escapeHtml(points)}" />
    <button type="button" class="btn btn-sm btn-danger btn-remove-row">حذف</button>
  `;
  row.querySelector(".btn-remove-row").addEventListener("click", () => row.remove());
  answerRowsEl.appendChild(row);
}

document.getElementById("btnAddRow").addEventListener("click", () => addAnswerRow());

// صفان ابتدائيان عند تحميل الصفحة
addAnswerRow();
addAnswerRow();

// ---------- حفظ سؤال جديد ----------
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function sanitizeCategoryKey(category) {
  return category.trim().replace(/[.#$\[\]/]/g, "-");
}

document.getElementById("questionForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("formError");
  errorEl.classList.add("hidden");

  const category = document.getElementById("fieldCategory").value.trim();
  const title = document.getElementById("fieldTitle").value.trim();
  const hint = document.getElementById("fieldHint").value.trim();

  const rows = Array.from(answerRowsEl.querySelectorAll(".answer-input-row"));
  const answers = rows
    .map((row) => ({
      text: row.querySelector(".answer-text-input").value.trim(),
      points: Number(row.querySelector(".answer-points-input").value),
    }))
    .filter((a) => a.text !== "" && !isNaN(a.points) && a.points > 0);

  if (!category || !title) {
    errorEl.textContent = "الرجاء تعبئة التصنيف والعنوان.";
    errorEl.classList.remove("hidden");
    return;
  }

  if (answers.length < 2) {
    errorEl.textContent = "أضف إجابتين على الأقل (نص + نقاط أكبر من صفر).";
    errorEl.classList.remove("hidden");
    return;
  }

  const categoryKey = sanitizeCategoryKey(category);

  questionsRef.child(categoryKey).push({ title, hint, answers }).then(() => {
    document.getElementById("questionForm").reset();
    answerRowsEl.innerHTML = "";
    addAnswerRow();
    addAnswerRow();
  });
});

// ---------- استيراد أسئلة تجريبية ----------
document.getElementById("btnImportSample").addEventListener("click", () => {
  sampleQuestions.forEach((q) => {
    const categoryKey = sanitizeCategoryKey(q.category);
    questionsRef.child(categoryKey).push({
      title: q.title,
      hint: q.hint || "",
      answers: q.answers,
    });
  });
});

// ---------- عرض الأسئلة الموجودة + الحذف ----------
questionsRef.on("value", (snapshot) => {
  const data = snapshot.val() || {};
  const container = document.getElementById("existingQuestions");
  const categoryOptions = document.getElementById("categoryOptions");
  container.innerHTML = "";
  categoryOptions.innerHTML = "";

  const categories = Object.keys(data);

  if (categories.length === 0) {
    container.innerHTML = '<p class="empty-note">لا توجد أسئلة بعد.</p>';
    return;
  }

  categories.forEach((category) => {
    const opt = document.createElement("option");
    opt.value = category;
    categoryOptions.appendChild(opt);

    const heading = document.createElement("h3");
    heading.style.color = "var(--brass)";
    heading.style.fontSize = "0.95rem";
    heading.style.margin = "14px 0 8px";
    heading.textContent = category;
    container.appendChild(heading);

    const questionsInCat = data[category] || {};
    Object.keys(questionsInCat).forEach((qId) => {
      const q = questionsInCat[qId];
      const answerCount = Array.isArray(q.answers)
        ? q.answers.length
        : Object.keys(q.answers || {}).length;

      const item = document.createElement("div");
      item.className = "admin-question-item";
      item.innerHTML = `
        <div>
          <div class="aq-title">${escapeHtml(q.title)}</div>
          <div class="aq-meta">${answerCount} إجابات</div>
        </div>
        <button type="button" class="btn btn-sm btn-danger">حذف</button>
      `;
      item.querySelector("button").addEventListener("click", () => {
        if (confirm(`حذف السؤال "${q.title}"؟`)) {
          questionsRef.child(category).child(qId).remove();
        }
      });
      container.appendChild(item);
    });
  });
});
