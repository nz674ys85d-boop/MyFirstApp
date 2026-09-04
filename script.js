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
    settings: { payday_day: 25, living_budget: 0 },
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
        .select("payday_day, living_budget")
        .eq("user_id", state.user.id)
        .maybeSingle();

    if (error) throw error;

    if (data) {
        state.settings = data;
    } else {
        state.settings = { payday_day: 25, living_budget: 0 };
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
        .select("id,type,name,is_active")
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
    const payday = Number(state.settings.payday_day || 25);
    const year = today.getFullYear();
    const month = today.getMonth();

    let start;
    if (today.getDate() >= payday) {
        start = new Date(year, month, payday);
    } else {
        start = new Date(year, month - 1, payday);
    }

    const end = new Date(start.getFullYear(), start.getMonth() + 1, payday - 1);
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

function calculateHome() {
    const cycle = getCycleTransactions();
    const expenses = cycle.filter(t => t.transaction_type === "expense");
    const incomes = cycle.filter(t => t.transaction_type === "income");
    const living = getLivingExpenses(cycle);

    const totalBalance = state.accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
    const livingSpent = living.reduce((sum, t) => sum + Number(t.amount), 0);
    const budget = Number(state.settings.living_budget || 0);
    const specialTopUps = getSpecialTopUps();
    const effectiveSpent = livingSpent + specialTopUps;
    const remaining = Math.max(0, budget - effectiveSpent);

    const { start, end } = getCycleRange();
    const now = new Date();
    const endDate = end;
    const totalDays = Math.max(1, Math.round((endDate - start) / 86400000) + 1);
    const elapsedDays = Math.min(totalDays, Math.max(1, Math.floor((now - start) / 86400000) + 1));
    const remainingDays = Math.max(1, totalDays - elapsedDays + 1);

    const averageDaily = effectiveSpent / elapsedDays;
    const dailyGuideline = remaining / remainingDays;
    const forecast = averageDaily * totalDays;
    const progress = budget > 0 ? Math.min(100, (effectiveSpent / budget) * 100) : 0;

    let nextPayday = new Date(end.getFullYear(), end.getMonth(), Number(state.settings.payday_day || 25));
    if (nextPayday <= now) nextPayday = new Date(nextPayday.getFullYear(), nextPayday.getMonth() + 1, Number(state.settings.payday_day || 25));
    const daysUntil = Math.max(0, Math.ceil((nextPayday - now) / 86400000));

    return {
        cycle, expenses, incomes, living,
        totalBalance, livingSpent, budget, specialTopUps, remaining,
        averageDaily, dailyGuideline, forecast, progress,
        start, end, daysUntil
    };
}

function renderAll() {
    renderHome();
    renderHistory();
    renderSpecialExpenses();
    renderAccountSettings();
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
    $("livingBudget").textContent = yen(d.budget);
    $("dailyGuideline").textContent = yen(Math.round(d.dailyGuideline));
    $("averageDaily").textContent = yen(Math.round(d.averageDaily));
    $("livingForecast").textContent = yen(Math.round(d.forecast));
    $("livingProgressBar").style.width = `${d.progress}%`;

    if (d.budget > 0) {
        $("budgetStatus").textContent = d.progress > 100 ? "予算オーバー" : "予算内";
        $("budgetNote").textContent = d.specialTopUps > 0
            ? `特別費の生活費補填 ¥${yen(d.specialTopUps)} を含めています。`
            : "生活費の進捗は給料日サイクルで計算しています。";
    } else {
        $("budgetStatus").textContent = "未設定";
        $("budgetNote").textContent = "生活費予算は設定画面から登録できます。";
    }

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
    // categories.type は「生活費」「交通費」「趣味」などの
    // 「カテゴリ名」であり、expense / income ではない。
    //
    // そのため、以前の
    //   c.type === currentType
    // という判定は誤り。
    //
    // 既存取引を使って、そのカテゴリが「支出」「収入」の
    // どちらで使われているかを判定する。
    const usedCategoryIds = new Set(
        state.transactions
            .filter(t => t.transaction_type === transactionType && t.category_id)
            .map(t => t.category_id)
    );

    // 既存データに紐づくカテゴリがある場合は、その種類だけ表示。
    if (usedCategoryIds.size > 0) {
        return state.categories.filter(c => usedCategoryIds.has(c.id));
    }

    // まだその取引タイプのカテゴリ使用実績がない場合は、
    // 登録済みカテゴリをすべて表示して新規登録できるようにする。
    return state.categories;
}

function populateTransactionForm() {
    const currentType = state.transactionType;
    const categories = getCategoriesForTransactionType(currentType);

    $("transactionCategory").innerHTML =
        categories.length
            ? `<option value="">選択してください</option>` +
              categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")
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
    $("transactionCategory").value = t.category_id || "";
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

function populateSettings() {
    $("paydaySetting").value = state.settings.payday_day ?? 25;
    $("livingBudgetSetting").value = state.settings.living_budget ?? 0;

    $("accountSettingsList").innerHTML = state.accounts.length
        ? state.accounts.map(a => `
            <div class="history-item">
                <div class="item-name">${escapeHtml(a.name)}</div>
                <div class="item-amount">¥${yen(a.balance)}</div>
            </div>`).join("")
        : `<p class="empty-message">口座がありません</p>`;
}

async function saveSettings() {
    const payday = Number($("paydaySetting").value);
    const budget = Number($("livingBudgetSetting").value);

    if (!Number.isInteger(payday) || payday < 1 || payday > 31 || budget < 0) {
        alert("給料日と生活費予算を正しく入力してください。");
        return;
    }

    try {
        const { error } = await mySupabase
            .from("settings")
            .upsert({
                user_id: state.user.id,
                payday_day: payday,
                living_budget: budget
            }, { onConflict: "user_id" });

        if (error) throw error;

        state.settings = { payday_day: payday, living_budget: budget };
        $("settingsMessage").textContent = "設定を保存しました。";
        renderAll();
    } catch (error) {
        console.error(error);
        alert("設定を保存できませんでした。\n" + error.message);
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

checkLogin();
