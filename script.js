// ==============================
// 要素を取得
// ==============================

const loginScreen =
    document.getElementById("loginScreen");

const appScreen =
    document.getElementById("appScreen");

const loginEmail =
    document.getElementById("loginEmail");

const loginPassword =
    document.getElementById("loginPassword");

const loginButton =
    document.getElementById("loginButton");

const loginError =
    document.getElementById("loginError");

const logoutButton =
    document.getElementById("logoutButton");

const addButton =
    document.getElementById("addButton");


// ==============================
// ログイン
// ==============================

async function login() {

    const email =
        loginEmail.value.trim();

    const password =
        loginPassword.value;

    loginError.textContent = "";


    if (!email || !password) {

        loginError.textContent =
            "IDとパスワードを入力してください。";

        return;
    }


    loginButton.disabled = true;

    loginButton.textContent =
        "ログイン中…";


    try {

        console.log(
            "ログイン処理開始"
        );


        const {
            data,
            error
        } = await mySupabase.auth.signInWithPassword({

            email: email,

            password: password

        });


        console.log(
            "Supabaseから返答:",
            data,
            error
        );


        if (error) {

            console.error(
                "Supabaseログインエラー:",
                error
            );

            loginError.textContent =
                "ログインエラー: " +
                error.message;

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


        await loadExpenses();


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

    loginScreen.classList.remove(
        "hidden"
    );

    appScreen.classList.add(
        "hidden"
    );
}


// ==============================
// 家計簿画面を表示
// ==============================

function showAppScreen() {

    loginScreen.classList.add(
        "hidden"
    );

    appScreen.classList.remove(
        "hidden"
    );
}


// ==============================
// ログアウト
// ==============================

async function logout() {

    try {

        await mySupabase.auth.signOut();

        showLoginScreen();

        loginEmail.value = "";

        loginPassword.value = "";

    } catch (error) {

        console.error(
            "ログアウトエラー:",
            error
        );

    }
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

            await loadExpenses();

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
// 支出追加ボタン
// ==============================

addButton.addEventListener(
    "click",
    function() {

        addExpense();

    }
);


// ==============================
// 家計簿
// ==============================

let expenses = [];


// ==============================
// Supabaseから支出を取得
// ==============================

async function loadExpenses() {

    try {

        console.log(
            "Supabaseから支出を取得します"
        );


        const {
            data,
            error
        } = await mySupabase
            .from("expenses")
            .select("*")
            .order(
                "created_at",
                {
                    ascending: false
                }
            );


        if (error) {

            console.error(
                "支出取得エラー:",
                error
            );

            alert(
                "支出データを取得できませんでした。\n" +
                error.message
            );

            return;
        }


        expenses =
            data || [];


        displayExpenses();


    } catch (error) {

        console.error(
            "支出取得エラー:",
            error
        );

        alert(
            "支出データの取得中にエラーが発生しました。\n" +
            error.message
        );
    }
}


// ==============================
// 支出を画面に表示
// ==============================

function displayExpenses() {

    const expenseList =
        document.getElementById(
            "expenseList"
        );

    const totalAmount =
        document.getElementById(
            "totalAmount"
        );


    expenseList.innerHTML = "";


    let total = 0;


    if (expenses.length === 0) {

        expenseList.innerHTML = `
            <p class="empty-message">
                まだ支出がありません
            </p>
        `;

    }


    expenses.forEach(
        function(expense) {

            total +=
                Number(expense.amount);


            const li =
                document.createElement(
                    "li"
                );


            li.innerHTML = `
                <div>
                    <strong>
                        ${Number(
                            expense.amount
                        ).toLocaleString()}円
                    </strong>

                    <span>
                        ${expense.category}
                    </span>

                    <small>
                        ${expense.memo || ""}
                    </small>
                </div>

                <button
                    onclick="deleteExpense('${expense.id}')"
                >
                    削除
                </button>
            `;


            expenseList.appendChild(
                li
            );

        }
    );


    totalAmount.textContent =
        total.toLocaleString();
}


// ==============================
// 支出追加
// ==============================

async function addExpense() {

    const amountInput =
        document.getElementById(
            "amount"
        );

    const categoryInput =
        document.getElementById(
            "category"
        );

    const memoInput =
        document.getElementById(
            "memo"
        );


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


    try {

        // 現在ログインしているユーザーを取得

        const {
            data: {
                user
            }
        } =
            await mySupabase.auth.getUser();


        if (!user) {

            alert(
                "ログインしてください。"
            );

            showLoginScreen();

            return;
        }


        console.log(
            "現在のユーザー:",
            user.id
        );


        // Supabaseに支出を保存

        const {
            data,
            error
        } =
            await mySupabase
                .from("expenses")
                .insert({

                    user_id:
                        user.id,

                    amount:
                        amount,

                    category:
                        category,

                    memo:
                        memo

                })
                .select()
                .single();


        if (error) {

            console.error(
                "支出保存エラー:",
                error
            );

            alert(
                "支出を保存できませんでした。\n" +
                error.message
            );

            return;
        }


        console.log(
            "支出保存成功:",
            data
        );


        // 入力欄を空にする

        amountInput.value = "";

        memoInput.value = "";


        // 最新データを再取得

        await loadExpenses();


    } catch (error) {

        console.error(
            "支出保存エラー:",
            error
        );

        alert(
            "エラーが発生しました。\n" +
            error.message
        );

    }
}


// ==============================
// 支出削除
// ==============================

async function deleteExpense(
    id
) {

    if (
        !confirm(
            "この支出を削除しますか？"
        )
    ) {

        return;
    }


    try {

        const {
            error
        } =
            await mySupabase
                .from("expenses")
                .delete()
                .eq(
                    "id",
                    id
                );


        if (error) {

            console.error(
                "支出削除エラー:",
                error
            );

            alert(
                "支出を削除できませんでした。\n" +
                error.message
            );

            return;
        }


        console.log(
            "支出削除成功"
        );


        await loadExpenses();


    } catch (error) {

        console.error(
            "支出削除エラー:",
            error
        );

        alert(
            "エラーが発生しました。\n" +
            error.message
        );

    }
}


// ==============================
// アプリ開始
// ==============================

checkLogin();
