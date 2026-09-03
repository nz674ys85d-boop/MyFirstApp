// 家計簿データを保存する場所
let expenses = JSON.parse(localStorage.getItem("myFirstAppExpenses")) || [];

// HTMLの要素を取得
const amountInput = document.getElementById("amount");
const categoryInput = document.getElementById("category");
const memoInput = document.getElementById("memo");
const addButton = document.getElementById("addButton");
const expenseList = document.getElementById("expenseList");
const totalAmount = document.getElementById("totalAmount");
const emptyMessage = document.getElementById("emptyMessage");


// 支出を保存する
function saveExpenses() {
    localStorage.setItem(
        "myFirstAppExpenses",
        JSON.stringify(expenses)
    );
}


// 合計金額を計算して表示する
function updateTotal() {
    const total = expenses.reduce(
        (sum, expense) => sum + expense.amount,
        0
    );

    totalAmount.textContent = total.toLocaleString();
}


// 支出一覧を表示する
function renderExpenses() {

    expenseList.innerHTML = "";

    if (expenses.length === 0) {
        expenseList.appendChild(emptyMessage);
        return;
    }

    expenses.forEach((expense) => {

        const item = document.createElement("div");
        item.className = "expense-item";

        const info = document.createElement("div");
        info.className = "expense-info";

        const category = document.createElement("div");
        category.className = "expense-category";
        category.textContent = expense.category;

        const memo = document.createElement("div");
        memo.className = "expense-memo";
        memo.textContent = expense.memo || "メモなし";

        const date = document.createElement("div");
        date.className = "expense-date";
        date.textContent = expense.date;

        info.appendChild(category);
        info.appendChild(memo);
        info.appendChild(date);


        const right = document.createElement("div");
        right.className = "expense-right";

        const amount = document.createElement("div");
        amount.className = "expense-amount";
        amount.textContent =
            "¥" + expense.amount.toLocaleString();


        const deleteButton = document.createElement("button");
        deleteButton.className = "delete-button";
        deleteButton.textContent = "削除";

        deleteButton.addEventListener("click", () => {
            deleteExpense(expense.id);
        });


        right.appendChild(amount);
        right.appendChild(deleteButton);


        item.appendChild(info);
        item.appendChild(right);

        expenseList.appendChild(item);
    });
}


// 支出を追加する
function addExpense() {

    const amount = Number(amountInput.value);
    const category = categoryInput.value;
    const memo = memoInput.value.trim();


    // 金額が入力されているか確認
    if (!amount || amount <= 0) {
        alert("金額を入力してください。");
        return;
    }


    const now = new Date();

    const date =
        now.getFullYear() +
        "/" +
        String(now.getMonth() + 1).padStart(2, "0") +
        "/" +
        String(now.getDate()).padStart(2, "0");


    const expense = {
        id: Date.now(),
        amount: amount,
        category: category,
        memo: memo,
        date: date
    };


    expenses.unshift(expense);

    saveExpenses();
    renderExpenses();
    updateTotal();


    // 入力欄を空にする
    amountInput.value = "";
    memoInput.value = "";
}


// 支出を削除する
function deleteExpense(id) {

    expenses = expenses.filter(
        (expense) => expense.id !== id
    );

    saveExpenses();
    renderExpenses();
    updateTotal();
}


// 「支出を追加」ボタン
addButton.addEventListener("click", addExpense);


// Enterキーでも追加できるようにする
memoInput.addEventListener("keydown", (event) => {

    if (event.key === "Enter") {
        addExpense();
    }

});


// ページを開いたときにデータを表示
renderExpenses();
updateTotal();
