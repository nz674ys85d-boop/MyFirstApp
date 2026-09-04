// ============================================================
// MyFirstApp STEP 7
// 新DB構造：profiles / settings / accounts / categories /
// transactions / special_expenses に完全移行
// ============================================================

const loginScreen = document.getElementById("loginScreen");
const appScreen = document.getElementById("appScreen");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginButton = document.getElementById("loginButton");
const loginError = document.getElementById("loginError");
const logoutButton = document.getElementById("logoutButton");

const state = {
    user: null,
    settings: { payday_day: 25, living_budget: 0, savings_balance: 0 },
    accounts: [],
    categories: [],
    transactions: [],
    specialExpenses: [],
    transactionType: "expense",
    editingTransactionId: null,
    editingSpecialId: null
};

const $ = (id) => document.getElementById(id);
const yen = (value) => Number(value || 0).toLocaleString("ja-JP");
const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function todayString() {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}

function showLoginScreen() {
    loginScreen.classList.remove("hidden");
    appScreen.classList.add("hidden");
}

function showAppScreen() {
    loginScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");
}

async function getUser() {
    const { data, error } = await mySupabase.auth.getUser();
    if (error) throw error;
    return data.user;
}

async function login() {
    loginError.textContent = "";
    const email = loginEmail.value.trim();
    const password = loginPassword.value;

    if (!email || !password) {
        loginError.textContent = "IDとパスワードを入力してください。";
        return;
    }

    loginButton.disabled = true;
    loginButton.textContent = "ログイン中…";

    try {
        const { data, error } = await mySupabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data.session) throw new Error("ログインセッションを取得できませんでした。");

        loginPassword.value = "";
        showAppScreen();
        await initializeApp();
    } catch (error) {
        console.error(error);
        loginError.textContent = "ログインエラー: " + error.message;
    } finally {
        loginButton.disabled = false;
        loginButton.textContent = "ログイン";
    }
}

async function logout() {
    try {
        await mySupabase.auth.signOut();
        state.user = null;
        showLoginScreen();
        loginEmail.value = "";
        loginPassword.value = "";
    } catch (error) {
        console.error(error);
        alert("ログアウトできませんでした。\n" + error.message);
    }
}

async function initializeApp() {
    state.user = await getUser();
    await Promise.all([
        loadSettings(),
        loadAccounts(),
        loadCategories(),
        loadTransactions(),
        loadSpecialExpenses()
    ]);
    populateTransactionForm();
    populateSettings();
    renderAll();
}

async function loadSettings() {
    const { data, error } = await mySupabase
        .from("settings")
        .select("payday_day, living_budget, savings_balance")
        .eq("user_id", state.user.id)
        .maybeSingle();

    if (error) throw error;

    if (data) {
        state.settings = data;
    } else {
        state.settings = { payday_day: 25, living_budget: 0, savings_balance: 0 };
    }
}

async function loadAccounts() {
    const { data, error } = await mySupabase
        .from("accounts")
        .select("id,name,balance")
        .eq("user_id", state.user.id)
        .order("name");

    if (error) throw error;
    state.accounts = data || [];
}

async function loadCategories() {
    const { data, error } = await mySupabase
        .from("categories")
        .select("id,type,name,is_active,transaction_type")
        .eq("user_id", state.user.id)
        .eq("is_active", true)
        .order("type")
        .order("name");

    if (error) throw error;
    state.categories = data || [];
}

async function loadTransactions() {
    const { data, error } = await mySupabase
        .from("transactions")
        .select(`
            id,user_id,account_id,transaction_date,transaction_type,
            category_id,name,amount,memo,created_at,updated_at,
            categories(type,name),
            accounts(name)
        `)
        .eq("user_id", state.user.id)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false });

    if (error) throw error;
    state.transactions = data || [];
}

async function loadSpecialExpenses() {
    const { data, error } = await mySupabase
        .from("special_expenses")
        .select("*")
        .eq("user_id", state.user.id)
        .order("planned_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });

    if (error) throw error;
    state.specialExpenses = data || [];
}

function getCategoryName(t) {
    return t.categories?.name || "未分類";
}

function getCategoryType(t) {
    return t.categories?.type || "";
}

function getCycleRange() {
    const today = new Date();
    const payday = Math.min(31, Math.max(1, Number(state.settings.payday_day || 25)));
    const year = today.getFullYear();
    const month = today.getMonth();

    let start;
    if (today.getDate() >= payday) {
        start = new Date(year, month, payday);
    } else {
        start = new Date(year, month - 1, payday);
    }

    // 「次の給料日の前日」を、月末をまたいでも正しく求める。
    const nextPayday = new Date(start.getFullYear(), start.getMonth() + 1, payday);
    const end = new Date(nextPayday);
    end.setDate(end.getDate() - 1);
    return { start, end };
}

function dateToLocalString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function transactionDate(t) {
    return new Date(`${t.transaction_date}T00:00:00`);
}

function inRange(t, start, end) {
    const d = transactionDate(t);
    return d >= start && d <= end;
}

function getCycleTransactions() {
    const { start, end } = getCycleRange();
    return state.transactions.filter(t => inRange(t, start, end));
}

function getLivingExpenses(cycleTransactions) {
    return cycleTransactions.filter(t =>
        t.transaction_type === "expense" &&
        getCategoryType(t) === "生活費"
    );
}

function getSpecialTopUps() {
    const { start, end } = getCycleRange();
    return state.specialExpenses.reduce((sum, item) => {
        if (!item.planned_date) return sum;
        const d = new Date(`${item.planned_date}T00:00:00`);
        if (d < start || d > end) return sum;
        return sum + Math.max(0, Number(item.actual_amount || 0) - Number(item.planned_amount || 0));
    }, 0);
}

// Excelの「今月生活費」計算で、今後使う予定として確保されている
// 特別費の残額（予定額－実績額のうちプラスのもの）を合計する。
function getSpecialRemainingReserve() {
    const { start, end } = getCycleRange();
    return state.specialExpenses.reduce((sum, item) => {
        if (!item.planned_date) return sum;
        const d = new Date(`${item.planned_date}T00:00:00`);
        if (d < start || d > end) return sum;
        const remaining = Number(item.planned_amount || 0) - Number(item.actual_amount || 0);
        return sum + Math.max(0, remaining);
    }, 0);
}

function calculateHome() {
    const cycle = getCycleTransactions();
    const expenses = cycle.filter(t => t.transaction_type === "expense");
    const incomes = cycle.filter(t => t.transaction_type === "income");
    const living = getLivingExpenses(cycle);

    const totalBalance = state.accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
    const livingSpent = living.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const savings = Number(state.settings.savings_balance || 0);
    const specialReserve = getSpecialRemainingReserve();
    const specialTopUps = getSpecialTopUps();

    // Excelの「今月生活費」
    // = 現在の総残高 − 貯金 − 今月サイクル内の特別費残額（0より大きいもの）
    // という考え方をそのまま再現する。
    const remaining = Math.max(0, totalBalance - savings - specialReserve);
    const effectiveSpent = livingSpent + specialTopUps;
    const impliedBudget = Math.max(0, remaining + effectiveSpent);

    const { start, end } = getCycleRange();
    const now = new Date();
    const totalDays = Math.max(1, Math.round((end - start) / 86400000) + 1);
    const elapsedDays = Math.min(
        totalDays,
        Math.max(1, Math.floor((now - start) / 86400000) + 1)
    );
    const remainingDays = Math.max(1, totalDays - elapsedDays + 1);

    const averageDaily = effectiveSpent / elapsedDays;
    const dailyGuideline = remaining / remainingDays;
    const forecast = averageDaily * totalDays;
    const progress = impliedBudget > 0
        ? Math.min(100, (effectiveSpent / impliedBudget) * 100)
        : 0;

    const payday = Math.min(31, Math.max(1, Number(state.settings.payday_day || 25)));
    let nextPayday = new Date(now.getFullYear(), now.getMonth(), payday);
    if (nextPayday <= now) {
        nextPayday = new Date(now.getFullYear(), now.getMonth() + 1, payday);
    }
    const daysUntil = Math.max(0, Math.ceil((nextPayday - now) / 86400000));

    return {
        cycle, expenses, incomes, living,
        totalBalance, livingSpent, savings, specialReserve, specialTopUps,
        impliedBudget, remaining,
        averageDaily, dailyGuideline, forecast, progress,
        start, end, daysUntil
    };
}

function renderAll() {
    renderHome();
    renderHistory();
    renderSpecialExpenses();
    renderAccountSettings();
    renderCategorySettings();
}

function renderHome() {
    const d = calculateHome();
    const startText = `${d.start.getMonth() + 1}/${d.start.getDate()}`;
    const endText = `${d.end.getMonth() + 1}/${d.end.getDate()}`;

    $("cycleLabel").textContent = `${startText}〜${endText}`;
    $("paydayLabel").textContent = `給料日：${state.settings.payday_day}日`;

    $("totalBalance").textContent = yen(d.totalBalance);

    const findBalance = (name) => state.accounts.find(a => a.name === name)?.balance || 0;
    $("bankBalance").textContent = yen(findBalance("銀行"));
    $("walletBalance").textContent = yen(findBalance("財布"));
    $("paypayBalance").textContent = yen(findBalance("PayPay"));

    $("cycleExpense").textContent = yen(d.expenses.reduce((s,t)=>s+Number(t.amount),0));
    $("cycleIncome").textContent = yen(d.incomes.reduce((s,t)=>s+Number(t.amount),0));
    $("livingExpense").textContent = yen(d.livingSpent);
    $("daysUntilPayday").textContent = d.daysUntil;

    $("livingRemaining").textContent = yen(d.remaining);
    $("livingSpent").textContent = yen(d.livingSpent + d.specialTopUps);
    $("livingBudget").textContent = yen(d.impliedBudget);
    $("dailyGuideline").textContent = yen(Math.round(d.dailyGuideline));
    $("averageDaily").textContent = yen(Math.round(d.averageDaily));
    $("livingForecast").textContent = yen(Math.round(d.forecast));
    $("livingProgressBar").style.width = `${d.progress}%`;

    $("budgetStatus").textContent = "自動計算";
    $("budgetNote").textContent = d.specialReserve > 0
        ? `特別費として確保中：¥${yen(d.specialReserve)}。貯金 ¥${yen(d.savings)} を除いて計算しています。`
        : `貯金 ¥${yen(d.savings)} を除いて、現在残高から今月生活費を自動計算しています。`;

    const recent = state.transactions
        .filter(t => t.transaction_type === "expense")
        .slice(0, 5);

    $("recentList").innerHTML = recent.length
        ? recent.map(renderTransactionCompact).join("")
        : `<p class="empty-message">まだ支出がありません</p>`;
}

function renderTransactionCompact(t) {
    return `
        <div class="recent-item">
            <div class="item-main">
                <div class="item-name">${escapeHtml(t.name)}</div>
                <div class="item-sub">${escapeHtml(getCategoryName(t))} ・ ${escapeHtml(t.transaction_date)}</div>
            </div>
            <div class="item-amount expense-text">-¥${yen(t.amount)}</div>
        </div>`;
}

function renderHistory() {
    const search = $("historySearch").value.trim().toLowerCase();
    const type = $("historyTypeFilter").value;

    const list = state.transactions.filter(t => {
        if (type !== "all" && t.transaction_type !== type) return false;
        if (!search) return true;
        return `${t.name} ${t.memo || ""} ${getCategoryName(t)}`.toLowerCase().includes(search);
    });

    $("historyList").innerHTML = list.length
        ? list.map(renderHistoryItem).join("")
        : `<p class="empty-message">該当するデータがありません</p>`;
}

function renderHistoryItem(t) {
    const typeLabel = t.transaction_type === "income" ? "収入" :
        t.transaction_type === "opening_balance" ? "初期残高" : "支出";
    const sign = t.transaction_type === "income" ? "+" : t.transaction_type === "opening_balance" ? "" : "-";
    const cls = t.transaction_type === "income" ? "income-text" :
        t.transaction_type === "opening_balance" ? "opening-text" : "expense-text";

    return `
        <div class="history-item">
            <div class="item-main">
                <div class="item-name">${escapeHtml(t.name)}</div>
                <div class="item-sub">${escapeHtml(typeLabel)} ・ ${escapeHtml(getCategoryName(t))} ・ ${escapeHtml(t.transaction_date)}${t.accounts?.name ? " ・ " + escapeHtml(t.accounts.name) : ""}</div>
                ${t.memo ? `<div class="item-sub">${escapeHtml(t.memo)}</div>` : ""}
                <div class="item-actions">
                    ${t.transaction_type !== "opening_balance" ? `<button class="tiny-button" data-edit-transaction="${t.id}">編集</button>` : ""}
                    ${t.transaction_type !== "opening_balance" ? `<button class="tiny-button" data-delete-transaction="${t.id}">削除</button>` : ""}
                </div>
            </div>
            <div class="item-amount ${cls}">${sign}¥${yen(t.amount)}</div>
        </div>`;
}

function getCategoriesForTransactionType(transactionType) {
    const seen = new Set();
    const result = [];

    for (const c of state.categories) {
        if ((c.transaction_type || "expense") !== transactionType) continue;
        const label = String(c.type || c.name || "").trim();
        if (!label || seen.has(label)) continue;
        seen.add(label);
        result.push({ ...c, displayType: label });
    }

    return result.sort((a, b) => a.displayType.localeCompare(b.displayType, "ja"));
}

function findCategoryRepresentative(typeLabel, transactionType = "expense") {
    return state.categories.find(c =>
        (c.transaction_type || "expense") === transactionType &&
        String(c.type || "").trim() === String(typeLabel || "").trim()
    ) || null;
}

function populateTransactionForm() {
    const currentType = state.transactionType;
    const categories = getCategoriesForTransactionType(currentType);

    $("transactionCategory").innerHTML =
        categories.length
            ? `<option value="">選択してください</option>` +
              categories.map(c => `<option value="${c.id}">${escapeHtml(c.displayType)}</option>`).join("")
            : `<option value="">種類が登録されていません</option>`;

    $("transactionAccount").innerHTML =
        `<option value="">口座を選択（任意）</option>` +
        state.accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");

    if (!$("transactionDate").value) $("transactionDate").value = todayString();
}

function setTransactionType(type) {
    state.transactionType = type;
    document.querySelectorAll(".type-tab").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.type === type);
    });
    populateTransactionForm();
}

function resetTransactionForm() {
    state.editingTransactionId = null;
    $("formTitle").textContent = "追加";
    $("transactionDate").value = todayString();
    $("transactionAmount").value = "";
    $("transactionName").value = "";
    $("transactionMemo").value = "";
    $("transactionAccount").value = "";
    setTransactionType("expense");
    $("saveTransactionButton").textContent = "登録する";
    $("cancelEditButton").classList.add("hidden");
}

async function saveTransaction() {
    const date = $("transactionDate").value;
    const amount = Number($("transactionAmount").value);
    const categoryId = $("transactionCategory").value || null;
    const name = $("transactionName").value.trim();
    const accountId = $("transactionAccount").value || null;
    const memo = $("transactionMemo").value.trim();

    if (!date || !amount || amount <= 0 || !name) {
        alert("日付・金額・名目を入力してください。");
        return;
    }

    if (!categoryId) {
        alert("種類を選択してください。");
        return;
    }

    const button = $("saveTransactionButton");
    button.disabled = true;

    try {
        const payload = {
            transaction_date: date,
            transaction_type: state.transactionType,
            category_id: categoryId,
            name,
            amount,
            memo: memo || null,
            account_id: accountId
        };

        // -----------------------------------------------------
        // DBへの保存だけを「取引処理」として扱う。
        // 保存後の画面再読込でエラーが起きても、
        // 「保存に失敗した」と誤表示しない。
        // -----------------------------------------------------
        if (state.editingTransactionId) {
            const { error } = await mySupabase
                .from("transactions")
                .update(payload)
                .eq("id", state.editingTransactionId)
                .eq("user_id", state.user.id);

            if (error) throw error;
        } else {
            const { error } = await mySupabase
                .from("transactions")
                .insert({
                    ...payload,
                    user_id: state.user.id
                });

            if (error) throw error;
        }

        // -----------------------------------------------------
        // DB保存は成功。
        // ここからは画面データを最新状態へ同期する。
        // accounts.balance はSTEP8のDBトリガーが自動更新する。
        // -----------------------------------------------------
        try {
            await Promise.all([
                loadTransactions(),
                loadAccounts()
            ]);
        } catch (refreshError) {
            console.error("保存後の画面データ更新エラー:", refreshError);
            // 保存自体は成功しているので、
            // 「取引を実行できませんでした」は表示しない。
        }

        resetTransactionForm();
        renderAll();
        showView("historyView");

    } catch (error) {
        console.error("取引保存エラー:", error);
        alert("取引を保存できませんでした。\n" + (error.message || "原因不明のエラー"));
    } finally {
        button.disabled = false;
    }
}

async function deleteTransaction(id) {
    if (!confirm("この取引を削除しますか？")) return;

    try {
        // -----------------------------------------------------
        // DBから削除。
        // accounts.balance はSTEP8のDELETEトリガーが
        // 自動的に元へ戻す。
        // -----------------------------------------------------
        const { error } = await mySupabase
            .from("transactions")
            .delete()
            .eq("id", id)
            .eq("user_id", state.user.id);

        if (error) throw error;

        // -----------------------------------------------------
        // 削除成功後、履歴と口座残高を同時に最新化。
        // 以前はloadAccounts()を呼んでいなかったため、
        // 財布残高が画面上だけ古いままになる問題があった。
        // -----------------------------------------------------
        try {
            await Promise.all([
                loadTransactions(),
                loadAccounts()
            ]);
        } catch (refreshError) {
            console.error("削除後の画面データ更新エラー:", refreshError);
            // 削除自体は成功しているので、
            // 削除失敗のメッセージは表示しない。
        }

        renderAll();

    } catch (error) {
        console.error("取引削除エラー:", error);
        alert("削除できませんでした。\n" + (error.message || "原因不明のエラー"));
    }
}

function startEditTransaction(id) {
    const t = state.transactions.find(x => x.id === id);
    if (!t || t.transaction_type === "opening_balance") return;

    state.editingTransactionId = id;
    state.transactionType = t.transaction_type;
    $("formTitle").textContent = "取引を編集";
    $("transactionDate").value = t.transaction_date;
    $("transactionAmount").value = t.amount;
    $("transactionName").value = t.name;
    $("transactionMemo").value = t.memo || "";
    populateTransactionForm();
    const categoryType = getCategoryType(t);
    const representative = findCategoryRepresentative(categoryType, t.transaction_type);
    $("transactionCategory").value = representative?.id || "";
    $("transactionAccount").value = t.account_id || "";
    $("saveTransactionButton").textContent = "変更を保存";
    $("cancelEditButton").classList.remove("hidden");
    document.querySelectorAll(".type-tab").forEach(btn => btn.classList.toggle("active", btn.dataset.type === t.transaction_type));
    showView("addView");
}

function renderSpecialExpenses() {
    const list = $("specialList");

    if (!state.specialExpenses.length) {
        list.innerHTML = `<p class="empty-message">特別費はまだありません</p>`;
        return;
    }

    list.innerHTML = state.specialExpenses.map(item => {
        const planned = Number(item.planned_amount || 0);
        const actual = Number(item.actual_amount || 0);
        const remaining = planned - actual;
        const topUp = Math.max(0, -remaining);

        return `
            <div class="special-item">
                <div class="special-top">
                    <div>
                        <div class="special-name">${escapeHtml(item.name)}</div>
                        <div class="special-date">${item.planned_date ? escapeHtml(item.planned_date) : "予定日なし"}</div>
                    </div>
                    ${topUp > 0 ? `<span class="badge over">¥${yen(topUp)}補填</span>` : ""}
                </div>
                <div class="special-values">
                    <div><span>予定</span><strong>¥${yen(planned)}</strong></div>
                    <div><span>実績</span><strong>¥${yen(actual)}</strong></div>
                    <div><span>${remaining >= 0 ? "残り" : "超過"}</span><strong class="${remaining < 0 ? "over" : ""}">¥${yen(Math.abs(remaining))}</strong></div>
                </div>
                ${item.memo ? `<div class="item-sub">${escapeHtml(item.memo)}</div>` : ""}
                <div class="special-actions">
                    <button class="tiny-button" data-edit-special="${item.id}">編集</button>
                    <button class="tiny-button" data-delete-special="${item.id}">削除</button>
                </div>
            </div>`;
    }).join("");
}

function openSpecialModal(id = null) {
    state.editingSpecialId = id;
    const item = id ? state.specialExpenses.find(x => x.id === id) : null;
    $("specialModalTitle").textContent = item ? "特別費を編集" : "特別費を追加";
    $("specialDate").value = item?.planned_date || todayString();
    $("specialName").value = item?.name || "";
    $("specialPlanned").value = item?.planned_amount ?? "";
    $("specialActual").value = item?.actual_amount ?? 0;
    $("specialMemo").value = item?.memo || "";
    $("specialModal").classList.remove("hidden");
}

function closeSpecialModal() {
    state.editingSpecialId = null;
    $("specialModal").classList.add("hidden");
}

async function saveSpecialExpense() {
    const plannedDate = $("specialDate").value || null;
    const name = $("specialName").value.trim();
    const plannedAmount = Number($("specialPlanned").value);
    const actualAmount = Number($("specialActual").value || 0);
    const memo = $("specialMemo").value.trim();

    if (!name || plannedAmount < 0 || actualAmount < 0) {
        alert("名目・金額を正しく入力してください。");
        return;
    }

    const payload = {
        planned_date: plannedDate,
        name,
        planned_amount: plannedAmount,
        actual_amount: actualAmount,
        memo: memo || null
    };

    const button = $("saveSpecialButton");
    button.disabled = true;

    try {
        let error;
        if (state.editingSpecialId) {
            ({ error } = await mySupabase
                .from("special_expenses")
                .update(payload)
                .eq("id", state.editingSpecialId)
                .eq("user_id", state.user.id));
        } else {
            ({ error } = await mySupabase
                .from("special_expenses")
                .insert({ ...payload, user_id: state.user.id }));
        }

        if (error) throw error;

        await loadSpecialExpenses();
        closeSpecialModal();
        renderAll();
    } catch (error) {
        console.error(error);
        alert("特別費を保存できませんでした。\n" + error.message);
    } finally {
        button.disabled = false;
    }
}

async function deleteSpecialExpense(id) {
    if (!confirm("この特別費を削除しますか？")) return;

    try {
        const { error } = await mySupabase
            .from("special_expenses")
            .delete()
            .eq("id", id)
            .eq("user_id", state.user.id);

        if (error) throw error;

        await loadSpecialExpenses();
        renderAll();
    } catch (error) {
        console.error(error);
        alert("削除できませんでした。\n" + error.message);
    }
}

function renderAccountSettings() {
    const list = $("accountSettingsList");
    if (!list) return;

    list.innerHTML = state.accounts.length
        ? state.accounts.map(a => `
            <div class="settings-row">
                <div class="settings-row-main">
                    <strong>${escapeHtml(a.name)}</strong>
                    <span>現在残高：¥${yen(a.balance)}</span>
                </div>
                <div class="settings-row-actions">
                    <button class="small-button" data-edit-account="${a.id}">編集</button>
                    <button class="small-button danger-button" data-delete-account="${a.id}">削除</button>
                </div>
            </div>
        `).join("")
        : `<p class="empty-message">口座がありません</p>`;
}

function getUniqueCategoryTypes() {
    const map = new Map();
    for (const c of state.categories) {
        const typeLabel = String(c.type || "").trim();
        if (!typeLabel) continue;
        if (!map.has(typeLabel)) {
            map.set(typeLabel, {
                type: typeLabel,
                transaction_type: c.transaction_type || "expense",
                categoryIds: []
            });
        }
        const item = map.get(typeLabel);
        item.categoryIds.push(c.id);
        // If any category in this type is used for income only, preserve that
        // information; otherwise default to expense.
        if (c.transaction_type === "income") item.transaction_type = "income";
    }
    return [...map.values()].sort((a,b) => a.type.localeCompare(b.type, "ja"));
}

function renderCategorySettings() {
    const list = $("categorySettingsList");
    if (!list) return;

    const types = getUniqueCategoryTypes();
    list.innerHTML = types.length
        ? types.map(c => `
            <div class="settings-row">
                <div class="settings-row-main">
                    <strong>${escapeHtml(c.type)}</strong>
                    <span>${c.transaction_type === "income" ? "収入" : "支出"}</span>
                </div>
                <div class="settings-row-actions">
                    <button class="small-button" data-edit-category-type="${escapeHtml(c.type)}">編集</button>
                    <button class="small-button danger-button" data-delete-category-type="${escapeHtml(c.type)}">削除</button>
                </div>
            </div>
        `).join("")
        : `<p class="empty-message">種類がありません</p>`;
}

function populateSettings() {
    $("paydaySetting").value = state.settings.payday_day ?? 25;
    $("livingBudgetSetting").value = state.settings.living_budget ?? 0;
    $("savingsBalanceSetting").value = state.settings.savings_balance ?? 0;
    renderAccountSettings();
    renderCategorySettings();
}

async function saveSettings() {
    const payday = Number($("paydaySetting").value);
    const budget = Number($("livingBudgetSetting").value);
    const savings = Number($("savingsBalanceSetting").value);

    if (!Number.isInteger(payday) || payday < 1 || payday > 31 ||
        !Number.isFinite(budget) || budget < 0 ||
        !Number.isFinite(savings) || savings < 0) {
        alert("給料日・生活費予算・貯金額を正しく入力してください。");
        return;
    }

    try {
        const { data, error } = await mySupabase
            .from("settings")
            .upsert({
                user_id: state.user.id,
                payday_day: payday,
                living_budget: budget,
                savings_balance: savings
            }, { onConflict: "user_id" })
            .select("payday_day,living_budget,savings_balance")
            .single();

        if (error) throw error;

        state.settings = data;
        $("settingsMessage").textContent = "設定を保存しました。";
        renderAll();
    } catch (error) {
        console.error(error);
        alert("設定を保存できませんでした。\n" + error.message);
    }
}

function openAccountModal(accountId = null) {
    const account = accountId
        ? state.accounts.find(a => a.id === accountId)
        : null;

    $("accountModalTitle").textContent = account ? "口座を編集" : "口座を追加";
    $("accountId").value = account?.id || "";
    $("accountName").value = account?.name || "";
    $("accountBalance").value = account ? Number(account.balance) : 0;
    $("accountModal").classList.remove("hidden");
}

function closeAccountModal() {
    $("accountModal").classList.add("hidden");
}

async function saveAccount() {
    const id = $("accountId").value;
    const name = $("accountName").value.trim();
    const balance = Number($("accountBalance").value);

    if (!name || !Number.isFinite(balance) || balance < 0) {
        alert("口座名と残高を正しく入力してください。");
        return;
    }

    try {
        if (id) {
            const { error } = await mySupabase
                .from("accounts")
                .update({
                    name,
                    balance,
                    updated_at: new Date().toISOString()
                })
                .eq("id", id)
                .eq("user_id", state.user.id);

            if (error) throw error;
        } else {
            const { error } = await mySupabase
                .from("accounts")
                .insert({
                    user_id: state.user.id,
                    name,
                    balance
                });

            if (error) throw error;
        }

        await loadAccounts();
        closeAccountModal();
        renderAll();
    } catch (error) {
        console.error(error);
        alert("口座を保存できませんでした。\n" + error.message);
    }
}

async function deleteAccount(id) {
    const account = state.accounts.find(a => a.id === id);
    if (!account) return;

    const { count, error: countError } = await mySupabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("account_id", id)
        .eq("user_id", state.user.id);

    if (countError) {
        console.error(countError);
        alert("口座の使用状況を確認できませんでした。\n" + countError.message);
        return;
    }

    if (count > 0) {
        alert("この口座には取引履歴が紐づいているため削除できません。\n先に取引の口座を変更してください。");
        return;
    }

    if (!confirm(`「${account.name}」を削除しますか？`)) return;

    try {
        const { error } = await mySupabase
            .from("accounts")
            .delete()
            .eq("id", id)
            .eq("user_id", state.user.id);

        if (error) throw error;

        await loadAccounts();
        renderAll();
    } catch (error) {
        console.error(error);
        alert("口座を削除できませんでした。\n" + error.message);
    }
}

function openCategoryModal(typeLabel = null) {
    const type = typeLabel ? String(typeLabel) : "";
    const item = type ? getUniqueCategoryTypes().find(x => x.type === type) : null;

    $("categoryModalTitle").textContent = item ? "種類を編集" : "種類を追加";
    $("categoryId").value = type;
    $("categoryName").value = item?.type || "";
    $("categoryGroup").value = item?.type || "";
    $("categoryTransactionType").value = item?.transaction_type || "expense";
    $("categoryModal").classList.remove("hidden");
}

function closeCategoryModal() {
    $("categoryModal").classList.add("hidden");
}

async function saveCategory() {
    const oldType = $("categoryId").value.trim();
    const newType = $("categoryName").value.trim();
    const transactionType = $("categoryTransactionType").value;

    if (!newType || !["expense", "income"].includes(transactionType)) {
        alert("種類名と支出／収入を正しく入力してください。");
        return;
    }

    try {
        if (oldType) {
            const { error } = await mySupabase
                .from("categories")
                .update({
                    type: newType,
                    transaction_type: transactionType,
                    is_active: true
                })
                .eq("user_id", state.user.id)
                .eq("type", oldType);

            if (error) throw error;
        } else {
            const { error } = await mySupabase
                .from("categories")
                .insert({
                    user_id: state.user.id,
                    type: newType,
                    name: newType,
                    transaction_type: transactionType,
                    is_active: true
                });

            if (error) throw error;
        }

        await loadCategories();
        closeCategoryModal();
        renderAll();
        populateTransactionForm();
    } catch (error) {
        console.error("種類保存エラー:", error);
        if (error.code === "23505") {
            alert("同じ分類・種類名のカテゴリがすでに登録されています。別の種類名にしてください。");
        } else {
            alert("種類を保存できませんでした。\n" + (error.message || "原因不明のエラー"));
        }
    }
}

async function deleteCategoryType(typeLabel) {
    const type = String(typeLabel || "").trim();
    if (!type) return;

    const { data: rows, error: rowsError } = await mySupabase
        .from("categories")
        .select("id,type,name")
        .eq("user_id", state.user.id)
        .eq("type", type);

    if (rowsError) {
        console.error(rowsError);
        alert("種類の使用状況を確認できませんでした。\n" + rowsError.message);
        return;
    }

    const ids = (rows || []).map(r => r.id);
    if (!ids.length) return;

    const { count, error: countError } = await mySupabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", state.user.id)
        .in("category_id", ids);

    if (countError) {
        console.error(countError);
        alert("種類の使用状況を確認できませんでした。\n" + countError.message);
        return;
    }

    if (count > 0) {
        alert("この種類には取引履歴が紐づいているため削除できません。\n履歴を残したまま安全に管理するためです。");
        return;
    }

    if (!confirm(`「${type}」を削除しますか？`)) return;

    try {
        const { error } = await mySupabase
            .from("categories")
            .update({ is_active: false })
            .eq("user_id", state.user.id)
            .eq("type", type);

        if (error) throw error;

        await loadCategories();
        renderAll();
        populateTransactionForm();
    } catch (error) {
        console.error("種類削除エラー:", error);
        alert("種類を削除できませんでした。\n" + (error.message || "原因不明のエラー"));
    }
}

function showView(viewId) {
    document.querySelectorAll(".view").forEach(view => view.classList.add("hidden"));
    $(viewId).classList.remove("hidden");

    document.querySelectorAll(".nav-button").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.view === viewId);
    });

    if (viewId === "historyView") renderHistory();
    if (viewId === "specialView") renderSpecialExpenses();
    if (viewId === "settingsView") populateSettings();
}

document.querySelectorAll(".nav-button").forEach(btn => {
    btn.addEventListener("click", () => {
        if (btn.dataset.view === "addView") resetTransactionForm();
        showView(btn.dataset.view);
    });
});

document.querySelectorAll(".type-tab").forEach(btn => {
    btn.addEventListener("click", () => setTransactionType(btn.dataset.type));
});

$("goHistoryButton").addEventListener("click", () => showView("historyView"));
$("loginButton").addEventListener("click", login);
$("logoutButton").addEventListener("click", logout);
$("saveTransactionButton").addEventListener("click", saveTransaction);
$("cancelEditButton").addEventListener("click", resetTransactionForm);
$("historySearch").addEventListener("input", renderHistory);
$("historyTypeFilter").addEventListener("change", renderHistory);
$("saveSettingsButton").addEventListener("click", saveSettings);
$("newSpecialButton").addEventListener("click", () => openSpecialModal());
$("closeSpecialModalButton").addEventListener("click", closeSpecialModal);
$("saveSpecialButton").addEventListener("click", saveSpecialExpense);
document.querySelector(".modal-backdrop").addEventListener("click", closeSpecialModal);

document.addEventListener("click", (event) => {
    const editTransaction = event.target.closest("[data-edit-transaction]");
    const deleteTransactionButton = event.target.closest("[data-delete-transaction]");
    const editSpecial = event.target.closest("[data-edit-special]");
    const deleteSpecial = event.target.closest("[data-delete-special]");

    if (editTransaction) startEditTransaction(editTransaction.dataset.editTransaction);
    if (deleteTransactionButton) deleteTransaction(deleteTransactionButton.dataset.deleteTransaction);
    if (editSpecial) openSpecialModal(editSpecial.dataset.editSpecial);
    if (deleteSpecial) deleteSpecialExpense(deleteSpecial.dataset.deleteSpecial);
});

// 設定画面：口座・種類
$("newAccountButton").addEventListener("click", () => openAccountModal());
$("closeAccountModalButton").addEventListener("click", closeAccountModal);
$("saveAccountButton").addEventListener("click", saveAccount);

$("newCategoryButton").addEventListener("click", () => openCategoryModal());
$("closeCategoryModalButton").addEventListener("click", closeCategoryModal);
$("saveCategoryButton").addEventListener("click", saveCategory);

$("accountModal").querySelector(".modal-backdrop").addEventListener("click", closeAccountModal);
$("categoryModal").querySelector(".modal-backdrop").addEventListener("click", closeCategoryModal);

document.addEventListener("click", (event) => {
    const editAccount = event.target.closest("[data-edit-account]");
    const deleteAccountButton = event.target.closest("[data-delete-account]");
    const editCategory = event.target.closest("[data-edit-category-type]");
    const deleteCategoryButton = event.target.closest("[data-delete-category-type]");

    if (editAccount) openAccountModal(editAccount.dataset.editAccount);
    if (deleteAccountButton) deleteAccount(deleteAccountButton.dataset.deleteAccount);
    if (editCategory) openCategoryModal(editCategory.dataset.editCategoryType);
    if (deleteCategoryButton) deleteCategoryType(deleteCategoryButton.dataset.deleteCategoryType);
});


async function checkLogin() {
    try {
        const { data, error } = await mySupabase.auth.getSession();
        if (error) throw error;

        if (data.session) {
            showAppScreen();
            await initializeApp();
        } else {
            showLoginScreen();
        }
    } catch (error) {
        console.error(error);
        showLoginScreen();
        loginError.textContent = "起動時にエラーが発生しました。";
    }
}

// ============================================================
// STEP12：データバックアップ
// 現在読み込まれている自分のデータだけをJSONとして保存する。
// Supabase上のデータは変更しない。
// ============================================================

function makeBackupFileName() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `MyFirstApp_backup_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.json`;
}

function downloadTextFile(fileName, text, mimeType) {
    const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildBackupData() {
    return {
        backup_version: 1,
        app: "MyFirstApp",
        exported_at: new Date().toISOString(),
        user_id: state.user?.id ?? null,
        settings: state.settings,
        accounts: state.accounts,
        categories: state.categories,
        transactions: state.transactions,
        special_expenses: state.specialExpenses
    };
}

function exportBackup() {
    const exportMessage = $("exportMessage");
    if (!state.user) {
        exportMessage.textContent = "ログイン後にバックアップできます。";
        return;
    }

    try {
        const backup = buildBackupData();
        const json = JSON.stringify(backup, null, 2);
        const fileName = makeBackupFileName();
        downloadTextFile(fileName, json, "application/json");
        exportMessage.textContent = "バックアップファイルを作成しました。";
    } catch (error) {
        console.error(error);
        exportMessage.textContent = "バックアップを作成できませんでした。";
    }
}

const exportBackupButton = $("exportBackupButton");
if (exportBackupButton) {
    exportBackupButton.addEventListener("click", exportBackup);
}

// ============================================================
// STEP13：データ整合性チェック
// DBを変更せず、現在読み込まれているデータの基本的な整合性だけを確認する。
// ============================================================

function checkDataIntegrity() {
    const el = $("dataIntegrityMessage");
    if (!el) return;

    if (!state.user) {
        el.className = "data-integrity-message error";
        el.textContent = "ログイン後にデータを確認できます。";
        return;
    }

    const errors = [];

    const accountIds = new Set((state.accounts || []).map(a => a.id));
    const categoryIds = new Set((state.categories || []).map(c => c.id));

    (state.transactions || []).forEach(t => {
        if (!t.id) errors.push("取引にIDがありません。");
        if (!t.transaction_date) errors.push("日付がない取引があります。");
        if (!t.name) errors.push("名目がない取引があります。");
        if (!(Number(t.amount) > 0)) errors.push(`金額が不正な取引があります：${t.name || "名称なし"}`);
        if (t.account_id && !accountIds.has(t.account_id)) {
            errors.push(`存在しない口座を参照している取引があります：${t.name || "名称なし"}`);
        }
        if (t.category_id && !categoryIds.has(t.category_id)) {
            errors.push(`存在しない種類を参照している取引があります：${t.name || "名称なし"}`);
        }
        if (!["income", "expense", "opening_balance"].includes(t.transaction_type)) {
            errors.push(`取引種別が不正な取引があります：${t.name || "名称なし"}`);
        }
    });

    (state.accounts || []).forEach(a => {
        if (!a.id || !a.name) errors.push("口座にIDまたは名前がありません。");
        if (Number(a.balance) < 0) errors.push(`口座残高がマイナスです：${a.name}`);
    });

    (state.categories || []).forEach(c => {
        if (!c.id || !c.name) errors.push("種類にIDまたは名前がありません。");
        if (!["expense", "income"].includes(c.transaction_type || "expense")) {
            errors.push(`種類の取引区分が不正です：${c.name || "名称なし"}`);
        }
    });

    (state.specialExpenses || []).forEach(s => {
        if (!s.id || !s.name) errors.push("特別費にIDまたは名前がありません。");
        if (Number(s.planned_amount) < 0 || Number(s.actual_amount) < 0) {
            errors.push(`特別費の金額が不正です：${s.name || "名称なし"}`);
        }
    });

    if (errors.length) {
        el.className = "data-integrity-message error";
        el.innerHTML = `<strong>確認結果：要確認</strong><ul class="integrity-list">${errors.slice(0, 10).map(e => `<li>${escapeHtml(e)}</li>`).join("")}</ul>`;
        if (errors.length > 10) {
            el.innerHTML += `<div>ほか ${errors.length - 10} 件あります。</div>`;
        }
        return;
    }

    el.className = "data-integrity-message ok";
    el.innerHTML = `<strong>確認結果：問題ありません</strong><br>現在読み込まれているデータの基本的な整合性を確認しました。`;
}

const checkDataIntegrityButton = $("checkDataIntegrityButton");
if (checkDataIntegrityButton) {
    checkDataIntegrityButton.addEventListener("click", checkDataIntegrity);
}

// ============================================================
// STEP14：バックアップからの復元
// ・JSONを読み込んで検証→プレビュー→明示確認→DBへ反映
// ・現在ログインしているユーザー自身のデータだけを対象にする
// ・バックアップ内のuser_idが現在ユーザーと一致しない場合は拒否
// ・既存データを削除してから復元する方式は採用せず、upsertで反映する
// ============================================================

let selectedBackup = null;

const backupFileInput = $("backupFileInput");
const selectBackupFileButton = $("selectBackupFileButton");
const backupFileName = $("backupFileName");
const previewRestoreButton = $("previewRestoreButton");
const restorePreview = $("restorePreview");
const restoreBackupButton = $("restoreBackupButton");
const restoreMessage = $("restoreMessage");

function setRestoreMessage(message, isError = false) {
    if (!restoreMessage) return;
    restoreMessage.textContent = message;
    restoreMessage.className = isError ? "success-message error-message" : "success-message";
}

function validateBackupShape(data) {
    if (!data || typeof data !== "object") return "JSONの内容が正しくありません。";
    if (data.app !== "MyFirstApp") return "MyFirstAppのバックアップではありません。";
    if (data.backup_version !== 1) return "対応していないバックアップ形式です。";
    if (!data.user_id || !state.user?.id || data.user_id !== state.user.id) {
        return "現在ログインしているユーザーのバックアップではありません。";
    }

    const arrays = ["accounts", "categories", "transactions", "special_expenses"];
    for (const key of arrays) {
        if (!Array.isArray(data[key])) return `${key} のデータ形式が正しくありません。`;
    }
    if (!data.settings || typeof data.settings !== "object" || Array.isArray(data.settings)) {
        return "設定データの形式が正しくありません。";
    }

    const accountIds = new Set();
    for (const a of data.accounts) {
        if (!a.id || !a.name) return "口座データにIDまたは名前がありません。";
        if (accountIds.has(a.id)) return `口座IDが重複しています：${a.id}`;
        accountIds.add(a.id);
        if (Number(a.balance) < 0) return `口座残高が不正です：${a.name}`;
    }

    const categoryIds = new Set();
    for (const c of data.categories) {
        if (!c.id || !c.name) return "種類データにIDまたは名前がありません。";
        if (categoryIds.has(c.id)) return `種類IDが重複しています：${c.id}`;
        categoryIds.add(c.id);
        if (!["expense","income"].includes(c.transaction_type || "expense")) {
            return `種類の取引区分が不正です：${c.name}`;
        }
    }

    const txIds = new Set();
    for (const t of data.transactions) {
        if (!t.id || !t.transaction_date || !t.name) return "取引データに必須項目がありません。";
        if (txIds.has(t.id)) return `取引IDが重複しています：${t.id}`;
        txIds.add(t.id);
        if (!(Number(t.amount) > 0)) return `取引金額が不正です：${t.name}`;
        if (!["income","expense","opening_balance"].includes(t.transaction_type)) {
            return `取引種別が不正です：${t.name}`;
        }
        if (t.account_id && !accountIds.has(t.account_id)) return `存在しない口座を参照しています：${t.name}`;
        if (t.category_id && !categoryIds.has(t.category_id)) return `存在しない種類を参照しています：${t.name}`;
    }

    for (const s of data.special_expenses) {
        if (!s.id || !s.name) return "特別費データに必須項目がありません。";
        if (Number(s.planned_amount) < 0 || Number(s.actual_amount) < 0) {
            return `特別費の金額が不正です：${s.name}`;
        }
    }

    if (Number(data.settings.payday_day) < 1 || Number(data.settings.payday_day) > 31) {
        return "給料日が不正です。";
    }
    if (Number(data.settings.living_budget) < 0 || Number(data.settings.savings_balance) < 0) {
        return "設定の金額が不正です。";
    }
    return null;
}

function renderRestorePreview(data) {
    restorePreview.innerHTML = `
        <strong>復元内容</strong>
        <ul>
            <li>口座：${data.accounts.length}件</li>
            <li>種類：${data.categories.length}件</li>
            <li>取引：${data.transactions.length}件</li>
            <li>特別費：${data.special_expenses.length}件</li>
            <li>給料日：${escapeHtml(String(data.settings.payday_day))}日</li>
            <li>貯金額：¥${Number(data.settings.savings_balance || 0).toLocaleString()}</li>
        </ul>
        <p>※復元実行前に、現在のデータをSTEP12のバックアップ機能で保存してください。</p>
    `;
}

if (selectBackupFileButton && backupFileInput) {
    selectBackupFileButton.addEventListener("click", () => backupFileInput.click());

    backupFileInput.addEventListener("change", async () => {
        selectedBackup = null;
        previewRestoreButton.disabled = true;
        restoreBackupButton.disabled = true;
        restorePreview.innerHTML = "";
        setRestoreMessage("");

        const file = backupFileInput.files?.[0];
        if (!file) return;

        backupFileName.textContent = file.name;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const error = validateBackupShape(data);
            if (error) {
                setRestoreMessage(error, true);
                return;
            }
            selectedBackup = data;
            previewRestoreButton.disabled = false;
            setRestoreMessage("バックアップを読み込みました。まず「復元内容を確認」を押してください。");
        } catch (error) {
            console.error(error);
            setRestoreMessage("バックアップJSONを読み込めませんでした。", true);
        }
    });
}

if (previewRestoreButton) {
    previewRestoreButton.addEventListener("click", () => {
        if (!selectedBackup) return;
        renderRestorePreview(selectedBackup);
        restoreBackupButton.disabled = false;
    });
}

async function restoreBackup() {
    if (!selectedBackup || !state.user) return;

    const latestError = validateBackupShape(selectedBackup);
    if (latestError) {
        setRestoreMessage(latestError, true);
        return;
    }

    const confirmed = window.confirm(
        "このバックアップのデータを現在の家計簿へ反映します。\n\n" +
        "先に現在のデータをバックアップしましたか？\n\n" +
        "この操作は元に戻すボタンがありません。続行しますか？"
    );
    if (!confirmed) return;

    restoreBackupButton.disabled = true;
    previewRestoreButton.disabled = true;
    setRestoreMessage("復元しています。画面を閉じないでください。");

    try {
        const settingsPayload = {
            user_id: state.user.id,
            payday_day: Number(selectedBackup.settings.payday_day),
            living_budget: Number(selectedBackup.settings.living_budget || 0),
            savings_balance: Number(selectedBackup.settings.savings_balance || 0)
        };

        const { error: settingsError } = await mySupabase
            .from("settings")
            .upsert(settingsPayload, { onConflict: "user_id" });
        if (settingsError) throw settingsError;

        const accounts = selectedBackup.accounts.map(a => ({
            id: a.id,
            user_id: state.user.id,
            name: a.name,
            balance: Number(a.balance),
            created_at: a.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString()
        }));
        if (accounts.length) {
            const { error } = await mySupabase.from("accounts").upsert(accounts, { onConflict: "id" });
            if (error) throw error;
        }

        const categories = selectedBackup.categories.map(c => ({
            id: c.id,
            user_id: state.user.id,
            type: c.type,
            name: c.name,
            is_active: c.is_active !== false,
            transaction_type: c.transaction_type || "expense",
            created_at: c.created_at || new Date().toISOString()
        }));
        if (categories.length) {
            const { error } = await mySupabase.from("categories").upsert(categories, { onConflict: "id" });
            if (error) throw error;
        }

        const transactions = selectedBackup.transactions.map(t => ({
            id: t.id,
            user_id: state.user.id,
            account_id: t.account_id || null,
            transaction_date: t.transaction_date,
            transaction_type: t.transaction_type,
            category_id: t.category_id || null,
            name: t.name,
            amount: Number(t.amount),
            memo: t.memo ?? null,
            created_at: t.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString()
        }));
        if (transactions.length) {
            const { error } = await mySupabase.from("transactions").upsert(transactions, { onConflict: "id" });
            if (error) throw error;
        }

        const specialExpenses = selectedBackup.special_expenses.map(s => ({
            id: s.id,
            user_id: state.user.id,
            planned_date: s.planned_date || null,
            name: s.name,
            planned_amount: Number(s.planned_amount || 0),
            actual_amount: Number(s.actual_amount || 0),
            memo: s.memo ?? null,
            created_at: s.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString()
        }));
        if (specialExpenses.length) {
            const { error } = await mySupabase.from("special_expenses").upsert(specialExpenses, { onConflict: "id" });
            if (error) throw error;
        }

        // DBへの反映後、最新値を再取得して画面を同期。
        await Promise.all([
            loadSettings(),
            loadAccounts(),
            loadCategories(),
            loadTransactions(),
            loadSpecialExpenses()
        ]);
        renderAll();

        setRestoreMessage("復元が完了しました。現在の画面も更新しました。");
        restorePreview.innerHTML = "";
        backupFileInput.value = "";
        backupFileName.textContent = "";
        selectedBackup = null;
    } catch (error) {
        console.error("restoreBackup error:", error);
        setRestoreMessage(`復元できませんでした：${error.message || "不明なエラー"}`, true);
    } finally {
        previewRestoreButton.disabled = !selectedBackup;
        restoreBackupButton.disabled = !selectedBackup;
    }
}

if (restoreBackupButton) {
    restoreBackupButton.addEventListener("click", restoreBackup);
}

checkLogin();
