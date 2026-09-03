// ========================================
// HTML要素
// ========================================

const loginScreen = document.getElementById("loginScreen");
const appScreen = document.getElementById("appScreen");

const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginButton = document.getElementById("loginButton");
const loginError = document.getElementById("loginError");

const logoutButton = document.getElementById("logoutButton");


// 家計簿関連

const amountInput = document.getElementById("amount");
const categoryInput = document.getElementById("category");
const memoInput = document.getElementById("memo");

const addButton = document.getElementById("addButton");

const expenseList = document.getElementById("expenseList");
const totalAmount = document.getElementById("totalAmount");

const emptyMessage = document.getElementById("emptyMessage");


// ========================================
// ログイン画面を表示
// ========================================

function showLoginScreen() {

    loginScreen.classList.remove("hidden");

    appScreen.classList.add("hidden");

}


// ========================================
// 家計簿画面を表示
// ========================================

function showAppScreen() {

    loginScreen.classList.add("hidden");

    appScreen.classList.remove("hidden");

}


// ========================================
// ログイン
// ========================================

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
        } = await supabaseClient.auth.signInWithPassword({

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


// ========================================
// ログアウト
// ========================================

async function logout() {

    await supabaseClient.auth.signOut();

    showLoginScreen();

}


// ========================================
// 家計簿データ
// ========================================

let expenses =
    JSON.parse(
        localStorage.getItem(
            "myFirstAppExpenses"
        )
    ) || [];


// ========================================
// 家計簿データを保存
// ========================================

function saveExpenses() {

    localStorage.setItem(

        "myFirstAppExpenses",

        JSON.stringify(expenses)

    );

}


// ========================================
// 合計金額
// ========================================

function updateTotal() {

    const total =
        expenses.reduce(

            (sum, expense) =>
                sum + expense.amount,

            0

        );


    totalAmount.textContent =
        total.toLocaleString();

}


// ========================================
// 支出一覧表示
// ========================================

function renderExpenses() {

    expenseList.innerHTML = "";


    if (expenses.length === 0) {

        expenseList.appendChild(
            emptyMessage
        );

        return;

    }


    expenses.forEach(
        (expense) => {

            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "expense-item";


            const info =
                document.createElement(
                    "div"
                );

            info.className =
                "expense-info";


            const category =
                document.createElement(
                    "div"
                );

            category.className =
                "expense-category";

            category.textContent =
                expense.category;


            const memo =
                document.createElement(
                    "div"
                );

            memo.className =
                "expense-memo";

            memo.textContent =
                expense.memo ||
                "メモなし";


            const date =
                document.createElement(
                    "div"
                );

            date.className =
                "expense-date";

            date.textContent =
                expense.date;


            info.appendChild(category);

            info.appendChild(memo);

            info.appendChild(date);


            const right =
                document.createElement(
                    "div"
                );

            right.className =
                "expense-right";


            const amount =
                document.createElement(
                    "div"
                );

            amount.className =
                "expense-amount";

            amount.textContent =
                "¥" +
                expense.amount.toLocaleString();


            const deleteButton =
                document.createElement(
                    "button"
                );

            deleteButton.className =
                "delete-button";

            deleteButton.textContent =
                "削除";


            deleteButton.addEventListener(
                "click",
                () => {

                    deleteExpense(
                        expense.id
                    );

                }
            );


            right.appendChild(amount);

            right.appendChild(
                deleteButton
            );


            item.appendChild(info);

            item.appendChild(right);


            expenseList.appendChild(item);

        }
    );

}


// ========================================
// 支出追加
// ========================================

function addExpense() {

    const amount =
        Number(
            amountInput.value
        );

    const category =
        categoryInput.value;

    const memo =
        memoInput.value.trim();


    if (!amount || amount <= 0) {

        alert(
            "金額を入力してください。"
        );

        return;

    }


    const now =
        new Date();


    const date =
        now.getFullYear() +
        "/" +
        String(
            now.getMonth() + 1
        ).padStart(2, "0") +
        "/" +
        String(
            now.getDate()
        ).padStart(2, "0");


    const expense = {

        id: Date.now(),

        amount: amount,

        category: category,

        memo: memo,

        date: date

    };


    expenses.unshift(
        expense
    );


    saveExpenses();

    renderExpenses();

    updateTotal();


    amountInput.value = "";

    memoInput.value = "";

}


// ========================================
// 支出削除
// ========================================

function deleteExpense(id) {

    expenses =
        expenses.filter(

            (expense) =>
                expense.id !== id

        );


    saveExpenses();

    renderExpenses();

    updateTotal();

}


// ========================================
// ログイン状態の確認
// ========================================

async function checkLoginState() {

    const {
        data
    } =
        await supabaseClient.auth.getSession();


    if (data.session) {

        showAppScreen();

        loadExpenses();

    } else {

        showLoginScreen();

    }

}


// ========================================
// 家計簿データ読み込み
// ========================================

function loadExpenses() {

    expenses =
        JSON.parse(

            localStorage.getItem(
                "myFirstAppExpenses"
            )

        ) || [];


    renderExpenses();

    updateTotal();

}


// ========================================
// ボタン設定
// ========================================

loginButton.addEventListener(
    "click",
    login
);


logoutButton.addEventListener(
    "click",
    logout
);


addButton.addEventListener(
    "click",
    addExpense
);


// Enterキーでもログイン

loginPassword.addEventListener(
    "keydown",
    (event) => {

        if (event.key === "Enter") {

            login();

        }

    }
);


// Enterキーでも支出追加

memoInput.addEventListener(
    "keydown",
    (event) => {

        if (event.key === "Enter") {

            addExpense();

        }

    }
);


// ========================================
// 初期処理
// ========================================

checkLoginState();
