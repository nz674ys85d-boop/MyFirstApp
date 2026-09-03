// ==============================
// 要素を取得
// ==============================

const loginScreen = document.getElementById("loginScreen");
const appScreen = document.getElementById("appScreen");

const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginButton = document.getElementById("loginButton");
const loginError = document.getElementById("loginError");

const logoutButton = document.getElementById("logoutButton");


// ==============================
// ログイン
// ==============================

async function login() {

    const email = loginEmail.value.trim();
    const password = loginPassword.value;

    loginError.textContent = "";

    if (!email || !password) {
        loginError.textContent =
            "IDとパスワードを入力してください。";
        return;
    }

    loginButton.disabled = true;
    loginButton.textContent = "ログイン中…";

    try {

        console.log("ログイン処理開始");

        const {
            data,
            error
        } = await mySupabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        console.log("Supabaseから返答:", data, error);

        if (error) {

            console.error(
                "Supabaseログインエラー:",
                error
            );

            loginError.textContent =
                "ログインエラー: " + error.message;

            return;
        }

        if (!data.session) {

            loginError.textContent =
                "ログインセッションを取得できませんでした。";

            return;
        }

        console.log(
            "ログイン成功:",
            data.user.email
        );

        loginPassword.value = "";

        showAppScreen();

        loadExpenses();

    } catch (error) {

        console.error(
            "予期しないエラー:",
            error
        );

        loginError.textContent =
            "エラーが発生しました: " +
            error.message;

    } finally {

        loginButton.disabled = false;

        loginButton.textContent =
            "ログイン";
    }
}


// ==============================
// ログイン画面を表示
// ==============================

function showLoginScreen() {

    loginScreen.style.display = "block";
    appScreen.style.display = "none";
}


// ==============================
// 家計簿画面を表示
// ==============================

function showAppScreen() {

    loginScreen.style.display = "none";
    appScreen.style.display = "block";
}


// ==============================
// ログアウト
// ==============================

async function logout() {

    await mySupabase.auth.signOut();

    showLoginScreen();

    loginEmail.value = "";
    loginPassword.value = "";
}


// ==============================
// 起動時にログイン状態を確認
// ==============================

async function checkLogin() {

    try {

        const {
            data,
            error
        } = await mySupabase.auth.getSession();

        if (error) {

            console.error(
                "セッション確認エラー:",
                error
            );

            showLoginScreen();
            return;
        }

        if (data.session) {

            console.log(
                "すでにログインしています"
            );

            showAppScreen();
            loadExpenses();

        } else {

            showLoginScreen();
        }

    } catch (error) {

        console.error(
            "起動時エラー:",
            error
        );

        showLoginScreen();
    }
}


// ==============================
// ログインボタン
// ==============================

loginButton.addEventListener(
    "click",
    function() {

        login();

    }
);


// ==============================
// ログアウトボタン
// ==============================

logoutButton.addEventListener(
    "click",
    function() {

        logout();
    }
);


// ==============================
// 家計簿
// ==============================

let expenses =
    JSON.parse(
        localStorage.getItem("expenses")
    ) || [];


// ==============================
// 家計簿表示
// ==============================

function loadExpenses() {

    const expenseList =
        document.getElementById("expenseList");

    const totalAmount =
        document.getElementById("totalAmount");

    expenseList.innerHTML = "";

    let total = 0;

    expenses.forEach(function(expense, index) {

        total += Number(expense.amount);

        const li =
            document.createElement("li");

        li.innerHTML = `
            <div>
                <strong>${expense.amount.toLocaleString()}円</strong>
                <span>${expense.category}</span>
                <small>${expense.memo || ""}</small>
            </div>

            <button onclick="deleteExpense(${index})">
                削除
            </button>
        `;

        expenseList.appendChild(li);
    });

    totalAmount.textContent =
        total.toLocaleString() + "円";
}


// ==============================
// 支出追加
// ==============================

function addExpense() {

    const amountInput =
        document.getElementById("amount");

    const categoryInput =
        document.getElementById("category");

    const memoInput =
        document.getElementById("memo");

    const amount =
        Number(amountInput.value);

    const category =
        categoryInput.value;

    const memo =
        memoInput.value.trim();

    if (!amount || amount <= 0) {

        alert("金額を入力してください。");
        return;
    }

    expenses.push({

        amount: amount,
        category: category,
        memo: memo

    });

    localStorage.setItem(
        "expenses",
        JSON.stringify(expenses)
    );

    amountInput.value = "";
    memoInput.value = "";

    loadExpenses();
}


// ==============================
// 支出削除
// ==============================

function deleteExpense(index) {

    expenses.splice(index, 1);

    localStorage.setItem(
        "expenses",
        JSON.stringify(expenses)
    );

    loadExpenses();
}


// ==============================
// アプリ開始
// ==============================

checkLogin();
