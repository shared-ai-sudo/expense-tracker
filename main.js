// ==========================================
// グローバル変数と定数
// ==========================================

// TEST: カテゴリマスタの定義確認
const CATEGORIES = [
    { id: 'food', name: '食費', icon: '🍽️', color: '#FF6B6B', order: 1 },
    { id: 'transport', name: '交通費', icon: '🚗', color: '#4ECDC4', order: 2 },
    { id: 'entertainment', name: '娯楽', icon: '🎮', color: '#95E1D3', order: 3 },
    { id: 'utilities', name: '光熱費', icon: '💡', color: '#FFE66D', order: 4 },
    { id: 'other', name: 'その他', icon: '📦', color: '#A8DADC', order: 5 }
];

// localStorage キー
const STORAGE_KEY = 'expense.v1';

// 現在編集中のID（編集モード時に使用）
let editingId = null;

// デバウンス用のタイマー
let debounceTimer = null;

// ==========================================
// ユーティリティ関数
// ==========================================

// TEST: UUID v4生成の一意性確認
/**
 * UUID v4を生成
 * @returns {string} UUID
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// TEST: 日付フォーマットの表示確認
/**
 * 日付をYYYY-MM-DD形式にフォーマット
 * @param {Date} date - Date オブジェクト
 * @returns {string} YYYY-MM-DD形式の日付
 */
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// TEST: 日本語日付表示の確認
/**
 * 日付を日本語形式で表示
 * @param {string} dateStr - YYYY-MM-DD形式の日付文字列
 * @returns {string} 日本語形式の日付
 */
function formatDateJa(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Asia/Tokyo'
    }).format(date);
}

// TEST: 通貨フォーマットの表示確認
/**
 * 金額を日本円形式で表示
 * @param {number} amount - 金額
 * @returns {string} 日本円形式の金額
 */
function formatCurrency(amount) {
    return new Intl.NumberFormat('ja-JP', {
        style: 'currency',
        currency: 'JPY'
    }).format(amount);
}

// TEST: カテゴリ情報取得とフォールバック動作確認
/**
 * カテゴリIDから情報を取得
 * @param {string} categoryId - カテゴリID
 * @returns {Object} カテゴリ情報
 */
function getCategoryById(categoryId) {
    const category = CATEGORIES.find(cat => cat.id === categoryId);
    return category || CATEGORIES.find(cat => cat.id === 'other');
}

// TEST: 先週末（土曜日）計算の正確性確認
/**
 * 直近の土曜日を取得
 * @returns {Date} 直近の土曜日
 */
function getLastSaturday() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    
    let daysToSubtract;
    if (dayOfWeek === 0) {
        daysToSubtract = 1;
    } else if (dayOfWeek === 6) {
        daysToSubtract = 7;
    } else {
        daysToSubtract = dayOfWeek + 1;
    }
    
    const lastSaturday = new Date(today);
    lastSaturday.setDate(today.getDate() - daysToSubtract);
    return lastSaturday;
}

// ==========================================
// ストレージ操作
// ==========================================

// TEST: データ構造の整合性確認
/**
 * localStorage からデータを読み込み
 * @returns {Object} データオブジェクト
 */
function loadData() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) {
            return {
                expenses: [],
                settings: {
                    filters: {
                        category: 'all',
                        period: 'all',
                        searchQuery: ''
                    },
                    sort: {
                        key: 'date',
                        direction: 'desc'
                    }
                },
                schemaVersion: '1.0',
                backup: []
            };
        }
        return JSON.parse(data);
    } catch (error) {
        console.error('データ読み込みエラー:', error);
        showToast('データの読み込みに失敗しました', 'error');
        return {
            expenses: [],
            settings: {
                filters: { category: 'all', period: 'all', searchQuery: '' },
                sort: { key: 'date', direction: 'desc' }
            },
            schemaVersion: '1.0',
            backup: []
        };
    }
}

// TEST: バックアップとlocalStorage容量超過時の動作確認
/**
 * データを localStorage に保存
 * @param {Object} data - 保存するデータ
 */
function saveData(data) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
        if (error.name === 'QuotaExceededError') {
            showToast('ストレージ容量が不足しています。CSVエクスポートをご利用ください。', 'error');
        } else {
            console.error('データ保存エラー:', error);
            showToast('データの保存に失敗しました', 'error');
        }
    }
}

/**
 * バックアップを作成
 * @param {Array} expenses - 支出データ配列
 */
function createBackup(expenses) {
    const data = loadData();
    data.backup = expenses.slice();
    saveData(data);
}

/**
 * バックアップから復元
 * @returns {boolean} 復元成功
 */
function restoreFromBackup() {
    const data = loadData();
    if (data.backup && data.backup.length > 0) {
        data.expenses = data.backup.slice();
        saveData(data);
        return true;
    }
    return false;
}

// ==========================================
// データ操作
// ==========================================

// TEST: 支出追加時のバリデーションとUUID生成確認
/**
 * 支出を追加
 * @param {Object} expense - 支出データ
 */
function addExpense(expense) {
    const data = loadData();
    createBackup(data.expenses);
    
    const newExpense = {
        id: generateUUID(),
        amount: expense.amount,
        category: expense.category,
        date: expense.date,
        memo: expense.memo || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    data.expenses.push(newExpense);
    saveData(data);
    
    renderExpenseList();
    updateTotalAmount();
    showToast('支出を追加しました', 'success');
}

// TEST: 支出更新時のupdatedAt更新確認
/**
 * 支出を更新
 * @param {string} id - 支出ID
 * @param {Object} updatedExpense - 更新データ
 */
function updateExpense(id, updatedExpense) {
    const data = loadData();
    createBackup(data.expenses);
    
    const index = data.expenses.findIndex(exp => exp.id === id);
    if (index !== -1) {
        data.expenses[index] = {
            ...data.expenses[index],
            amount: updatedExpense.amount,
            category: updatedExpense.category,
            date: updatedExpense.date,
            memo: updatedExpense.memo || '',
            updatedAt: new Date().toISOString()
        };
        saveData(data);
        
        renderExpenseList();
        updateTotalAmount();
        showToast('支出を更新しました', 'info');
    }
}

// TEST: 削除とUndo機能の動作確認
/**
 * 支出を削除
 * @param {string} id - 支出ID
 */
function deleteExpense(id) {
    const data = loadData();
    createBackup(data.expenses);
    
    data.expenses = data.expenses.filter(exp => exp.id !== id);
    saveData(data);
    
    renderExpenseList();
    updateTotalAmount();
    showToast('支出を削除しました', 'warning', true);
}

/**
 * 削除をUndoで取り消し
 */
function undoDelete() {
    if (restoreFromBackup()) {
        renderExpenseList();
        updateTotalAmount();
        showToast('削除を取り消しました', 'info');
    }
}

// TEST: 全削除の確認ダイアログ表示確認
/**
 * すべての支出を削除
 */
function clearAllExpenses() {
    if (confirm('すべてのデータを削除してもよろしいですか？\nこの操作は取り消せません。')) {
        const data = loadData();
        createBackup(data.expenses);
        data.expenses = [];
        saveData(data);
        
        renderExpenseList();
        updateTotalAmount();
        showToast('すべてのデータを削除しました', 'warning');
    }
}

// ==========================================
// フィルター・ソート
// ==========================================

// TEST: フィルター評価順序（期間→カテゴリ→検索→ソート）の確認
/**
 * 支出データをフィルター・ソート
 * @returns {Array} フィルター・ソート済みの支出配列
 */
function getFilteredAndSortedExpenses() {
    const data = loadData();
    let expenses = data.expenses.slice();
    const settings = data.settings;
    
    // 1. 期間フィルター
    if (settings.filters.period !== 'all') {
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();
        
        if (settings.filters.period === 'thisMonth') {
            expenses = expenses.filter(exp => {
                const expDate = new Date(exp.date + 'T00:00:00');
                return expDate.getFullYear() === currentYear && 
                       expDate.getMonth() === currentMonth;
            });
        } else if (settings.filters.period === 'lastMonth') {
            const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
            const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
            
            expenses = expenses.filter(exp => {
                const expDate = new Date(exp.date + 'T00:00:00');
                return expDate.getFullYear() === lastMonthYear && 
                       expDate.getMonth() === lastMonth;
            });
        }
    }
    
    // 2. カテゴリフィルター
    if (settings.filters.category !== 'all') {
        expenses = expenses.filter(exp => exp.category === settings.filters.category);
    }
    
    // 3. 検索クエリ
    if (settings.filters.searchQuery) {
        const query = settings.filters.searchQuery.toLowerCase();
        expenses = expenses.filter(exp => {
            const category = getCategoryById(exp.category);
            const categoryName = category.name.toLowerCase();
            const memo = (exp.memo || '').toLowerCase();
            return categoryName.includes(query) || memo.includes(query);
        });
    }
    
    // 4. ソート
    const sortKey = settings.sort.key;
    const sortDir = settings.sort.direction;
    
    expenses.sort((a, b) => {
        let comparison = 0;
        
        if (sortKey === 'date') {
            comparison = a.date.localeCompare(b.date);
        } else if (sortKey === 'amount') {
            comparison = a.amount - b.amount;
        } else if (sortKey === 'category') {
            const catA = getCategoryById(a.category);
            const catB = getCategoryById(b.category);
            comparison = catA.order - catB.order;
        }
        
        // 安定ソート: 同一キーの場合は createdAt 降順
        if (comparison === 0) {
            comparison = b.createdAt.localeCompare(a.createdAt);
        }
        
        return sortDir === 'asc' ? comparison : -comparison;
    });
    
    return expenses;
}

// TEST: フィルター設定の永続化確認
/**
 * フィルター設定を保存
 */
function saveFilterSettings() {
    const data = loadData();
    
    data.settings.filters.category = document.getElementById('filter-category').value;
    data.settings.filters.period = document.getElementById('filter-period').value;
    data.settings.filters.searchQuery = document.getElementById('search-query').value;
    
    saveData(data);
}

// TEST: ソート設定の永続化確認
/**
 * ソート設定を保存
 */
function saveSortSettings() {
    const data = loadData();
    const sortValue = document.getElementById('sort-key').value;
    const [key, direction] = sortValue.split('-');
    
    data.settings.sort.key = key;
    data.settings.sort.direction = direction;
    
    saveData(data);
}

/**
 * フィルター・ソート設定を復元
 */
function restoreFilterSortSettings() {
    const data = loadData();
    const settings = data.settings;
    
    document.getElementById('filter-category').value = settings.filters.category;
    document.getElementById('filter-period').value = settings.filters.period;
    document.getElementById('search-query').value = settings.filters.searchQuery;
    
    const sortValue = `${settings.sort.key}-${settings.sort.direction}`;
    document.getElementById('sort-key').value = sortValue;
}

// ==========================================
// バリデーション
// ==========================================

// TEST: 金額バリデーション（範囲、整数）の確認
/**
 * 金額を正規化
 * @param {string|number} input - 入力値
 * @returns {number} 正規化された金額
 */
function normalizeAmount(input) {
    if (typeof input === 'string') {
        const normalized = input
            .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
            .replace(/,/g, '')
            .replace(/\s/g, '');
        return parseInt(normalized, 10);
    }
    return parseInt(input, 10);
}

// TEST: 未来日バリデーションの確認
/**
 * フォームをバリデーション
 * @returns {Object|null} エラーがあればエラーオブジェクト、なければnull
 */
function validateForm() {
    const errors = {};
    
    // 金額
    const amountInput = document.getElementById('amount');
    const amount = normalizeAmount(amountInput.value);
    
    if (!amountInput.value || isNaN(amount)) {
        errors.amount = '金額を入力してください';
    } else if (amount < 1 || amount > 9999999) {
        errors.amount = '金額は1円以上9,999,999円以下の整数で入力してください';
    } else if (!Number.isInteger(amount)) {
        errors.amount = '金額は整数で入力してください';
    }
    
    // カテゴリ
    const category = document.getElementById('category').value;
    if (!category) {
        errors.category = 'カテゴリを選択してください';
    }
    
    // 日付
    const dateInput = document.getElementById('date');
    const date = dateInput.value;
    
    if (!date) {
        errors.date = '日付を入力してください';
    } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const inputDate = new Date(date + 'T00:00:00');
        
        if (inputDate > today) {
            errors.date = '未来日は登録できません';
        }
    }
    
    // メモ（100文字チェック）
    const memo = document.getElementById('memo').value;
    if (memo && Array.from(memo).length > 100) {
        errors.memo = `メモは100文字以内で入力してください（現在：${Array.from(memo).length}文字）`;
    }
    
    return Object.keys(errors).length > 0 ? errors : null;
}

// TEST: エラー表示とaria-invalid属性の動作確認
/**
 * エラーメッセージを表示
 * @param {Object} errors - エラーオブジェクト
 */
function showErrors(errors) {
    // すべてのエラーをクリア
    clearErrors();
    
    // エラーを表示
    Object.keys(errors).forEach(field => {
        const errorElement = document.getElementById(`${field}-error`);
        const inputElement = document.getElementById(field);
        
        if (errorElement) {
            errorElement.textContent = errors[field];
        }
        
        if (inputElement) {
            inputElement.setAttribute('aria-invalid', 'true');
        }
    });
}

/**
 * エラーメッセージをクリア
 */
function clearErrors() {
    const errorElements = document.querySelectorAll('.error-message');
    errorElements.forEach(el => {
        el.textContent = '';
    });
    
    const inputs = document.querySelectorAll('[aria-invalid]');
    inputs.forEach(input => {
        input.removeAttribute('aria-invalid');
    });
}

// ==========================================
// UI更新
// ==========================================

// TEST: 合計金額の計算精度確認
/**
 * 総支出額を更新
 */
function updateTotalAmount() {
    const data = loadData();
    const total = data.expenses.reduce((sum, exp) => sum + exp.amount, 0);
    document.getElementById('totalAmount').textContent = formatCurrency(total);
}

// TEST: フィルター後の件数・合計表示確認
/**
 * フィルター後の件数・合計を更新
 */
function updateFilterSummary() {
    const expenses = getFilteredAndSortedExpenses();
    const count = expenses.length;
    const total = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    
    document.getElementById('filteredCount').textContent = count;
    document.getElementById('filteredTotal').textContent = formatCurrency(total);
}

// TEST: 支出リストの表示・空状態の切り替え確認
/**
 * 支出リストを描画
 */
function renderExpenseList() {
    const expenses = getFilteredAndSortedExpenses();
    const listContainer = document.getElementById('expenseList');
    const emptyState = document.getElementById('emptyState');
    
    if (expenses.length === 0) {
        emptyState.style.display = 'block';
        // 既存のアイテムを削除
        const items = listContainer.querySelectorAll('.expense-item');
        items.forEach(item => item.remove());
    } else {
        emptyState.style.display = 'none';
        
        // すべてのアイテムを削除
        const items = listContainer.querySelectorAll('.expense-item');
        items.forEach(item => item.remove());
        
        // 新しいアイテムを追加
        expenses.forEach(expense => {
            const item = createExpenseItem(expense);
            listContainer.appendChild(item);
        });
    }
    
    updateFilterSummary();
}

// TEST: カテゴリアイコン・色の正確な表示確認
/**
 * 支出アイテムのHTML要素を作成
 * @param {Object} expense - 支出データ
 * @returns {HTMLElement} 支出アイテム要素
 */
function createExpenseItem(expense) {
    const category = getCategoryById(expense.category);
    
    const item = document.createElement('div');
    item.className = 'expense-item';
    item.setAttribute('role', 'listitem');
    
    // カテゴリアイコン
    const icon = document.createElement('div');
    icon.className = `expense-category-icon ${expense.category}`;
    icon.textContent = category.icon;
    icon.setAttribute('aria-label', category.name);
    
    // 詳細
    const details = document.createElement('div');
    details.className = 'expense-details';
    
    const header = document.createElement('div');
    header.className = 'expense-header';
    
    const categoryName = document.createElement('span');
    categoryName.className = 'expense-category';
    categoryName.textContent = category.name;
    
    const date = document.createElement('span');
    date.className = 'expense-date';
    date.textContent = formatDateJa(expense.date);
    
    header.appendChild(categoryName);
    header.appendChild(date);
    
    details.appendChild(header);
    
    // メモ（30文字で省略）
    if (expense.memo) {
        const memo = document.createElement('div');
        memo.className = 'expense-memo';
        
        const memoText = Array.from(expense.memo).slice(0, 30).join('');
        memo.textContent = memoText;
        
        if (Array.from(expense.memo).length > 30) {
            memo.textContent += '...';
            
            const fullBtn = document.createElement('span');
            fullBtn.className = 'expense-memo-full';
            fullBtn.textContent = '全文';
            fullBtn.setAttribute('role', 'button');
            fullBtn.setAttribute('tabindex', '0');
            fullBtn.setAttribute('aria-label', 'メモ全文を表示');
            fullBtn.addEventListener('click', () => showMemoModal(expense.memo));
            fullBtn.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') showMemoModal(expense.memo);
            });
            
            memo.appendChild(fullBtn);
        }
        
        details.appendChild(memo);
    }
    
    // 金額
    const amount = document.createElement('div');
    amount.className = 'expense-amount';
    amount.textContent = formatCurrency(expense.amount);
    
    // アクション
    const actions = document.createElement('div');
    actions.className = 'expense-actions';
    
    const editBtn = document.createElement('button');
    editBtn.className = 'btn-icon btn-edit';
    editBtn.textContent = '✏️';
    editBtn.setAttribute('aria-label', 'この支出を編集');
    editBtn.addEventListener('click', () => startEdit(expense.id));
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-icon btn-delete';
    deleteBtn.textContent = '🗑️';
    deleteBtn.setAttribute('aria-label', 'この支出を削除');
    deleteBtn.addEventListener('click', () => deleteExpense(expense.id));
    
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    
    item.appendChild(icon);
    item.appendChild(details);
    item.appendChild(amount);
    item.appendChild(actions);
    
    return item;
}

// ==========================================
// フォーム操作
// ==========================================

/**
 * 編集モードを開始
 * @param {string} id - 支出ID
 */
function startEdit(id) {
    const data = loadData();
    const expense = data.expenses.find(exp => exp.id === id);
    
    if (expense) {
        editingId = id;
        
        document.getElementById('amount').value = expense.amount;
        document.getElementById('category').value = expense.category;
        document.getElementById('date').value = expense.date;
        document.getElementById('memo').value = expense.memo;
        
        document.getElementById('submitBtnText').textContent = '更新';
        document.getElementById('cancelBtn').style.display = 'inline-block';
        
        // フォームまでスクロール
        document.getElementById('expenseForm').scrollIntoView({ behavior: 'smooth' });
        
        updateMemoCounter();
    }
}

/**
 * 編集モードをキャンセル
 */
function cancelEdit() {
    editingId = null;
    
    document.getElementById('expenseForm').reset();
    document.getElementById('submitBtnText').textContent = '追加';
    document.getElementById('cancelBtn').style.display = 'none';
    
    clearErrors();
    updateMemoCounter();
    
    // 今日の日付を設定
    document.getElementById('date').value = formatDate(new Date());
}

// TEST: メモ文字数カウンタのリアルタイム更新確認
/**
 * メモ文字数カウンタを更新
 */
function updateMemoCounter() {
    const memo = document.getElementById('memo').value;
    const counter = document.getElementById('memo-counter');
    const length = Array.from(memo).length;
    
    counter.textContent = `${length}/100文字`;
    
    counter.classList.remove('warning', 'error');
    if (length > 100) {
        counter.classList.add('error');
    } else if (length > 80) {
        counter.classList.add('warning');
    }
}

// ==========================================
// トースト通知
// ==========================================

// TEST: トースト通知のaria-live動作とUndo機能確認
/**
 * トースト通知を表示
 * @param {string} message - メッセージ
 * @param {string} type - タイプ（success/error/info/warning）
 * @param {boolean} showUndo - Undoボタンを表示するか
 */
function showToast(message, type = 'info', showUndo = false) {
    const container = document.getElementById('toastContainer');
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    
    const messageEl = document.createElement('span');
    messageEl.className = 'toast-message';
    messageEl.textContent = message;
    
    toast.appendChild(messageEl);
    
    if (showUndo) {
        const undoBtn = document.createElement('button');
        undoBtn.className = 'toast-action';
        undoBtn.textContent = '取り消し';
        undoBtn.setAttribute('aria-label', '削除を取り消す');
        undoBtn.addEventListener('click', () => {
            undoDelete();
            toast.remove();
        });
        toast.appendChild(undoBtn);
    }
    
    container.appendChild(toast);
    
    // 自動的に削除
    const duration = showUndo ? 5000 : 3000;
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ==========================================
// モーダル
// ==========================================

// TEST: モーダルのESCキー動作確認
/**
 * メモ全文モーダルを表示
 * @param {string} memo - メモ内容
 */
function showMemoModal(memo) {
    const modal = document.getElementById('modal');
    const body = document.getElementById('modal-body');
    
    body.textContent = memo;
    modal.style.display = 'flex';
    
    // フォーカスを閉じるボタンに移動
    document.getElementById('modal-close').focus();
}

/**
 * モーダルを閉じる
 */
function closeModal() {
    document.getElementById('modal').style.display = 'none';
}

// ==========================================
// CSVエクスポート
// ==========================================

// TEST: CSV形式の正確性（BOM、エスケープ）確認
/**
 * CSVエクスポート
 */
function exportToCSV() {
    const data = loadData();
    const expenses = data.expenses;
    
    if (expenses.length === 0) {
        showToast('エクスポートするデータがありません', 'warning');
        return;
    }
    
    // ヘッダー行
    const headers = ['日付', 'カテゴリ', '金額', 'メモ'];
    const rows = [headers];
    
    // データ行
    expenses.forEach(expense => {
        const category = getCategoryById(expense.category);
        const row = [
            expense.date,
            category.name,
            expense.amount,
            escapeCSVField(expense.memo || '')
        ];
        rows.push(row);
    });
    
    // CSV文字列に変換
    const csvContent = rows.map(row => row.join(',')).join('\n');
    
    // UTF-8 with BOM
    const bom = '\uFEFF';
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // ダウンロード
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const filename = `expenses_${formatDate(new Date()).replace(/-/g, '')}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast('CSVファイルをダウンロードしました', 'success');
}

/**
 * CSVフィールドをエスケープ
 * @param {string} field - フィールド値
 * @returns {string} エスケープされた値
 */
function escapeCSVField(field) {
    if (field.includes(',') || field.includes('\n') || field.includes('"')) {
        return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
}

// ==========================================
// サンプルデータ
// ==========================================

// TEST: サンプルデータ追加の動作確認
/**
 * サンプルデータを追加
 */
function addDummyData() {
    const data = loadData();
    const today = new Date();
    
    const dummyExpenses = [
        {
            id: generateUUID(),
            amount: 1200,
            category: 'food',
            date: formatDate(today),
            memo: 'ランチ',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        },
        {
            id: generateUUID(),
            amount: 3500,
            category: 'transport',
            date: formatDate(new Date(today.getTime() - 86400000)),
            memo: '電車定期券',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        },
        {
            id: generateUUID(),
            amount: 8000,
            category: 'entertainment',
            date: formatDate(new Date(today.getTime() - 172800000)),
            memo: '映画とディナー',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }
    ];
    
    data.expenses.push(...dummyExpenses);
    saveData(data);
    
    renderExpenseList();
    updateTotalAmount();
    showToast('サンプルデータを追加しました', 'success');
}

// ==========================================
// イベントリスナー
// ==========================================

// TEST: Enterキーでの送信、Escキーでのモーダル閉じる動作確認
document.addEventListener('DOMContentLoaded', () => {
    // 初期化
    const today = new Date();
    document.getElementById('date').value = formatDate(today);
    
    restoreFilterSortSettings();
    renderExpenseList();
    updateTotalAmount();
    
    // フォーム送信
    document.getElementById('expenseForm').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const errors = validateForm();
        if (errors) {
            showErrors(errors);
            return;
        }
        
        clearErrors();
        
        const expenseData = {
            amount: normalizeAmount(document.getElementById('amount').value),
            category: document.getElementById('category').value,
            date: document.getElementById('date').value,
            memo: document.getElementById('memo').value
        };
        
        if (editingId) {
            updateExpense(editingId, expenseData);
            cancelEdit();
        } else {
            addExpense(expenseData);
            document.getElementById('expenseForm').reset();
            document.getElementById('date').value = formatDate(new Date());
            updateMemoCounter();
        }
    });
    
    // キャンセルボタン
    document.getElementById('cancelBtn').addEventListener('click', cancelEdit);
    
    // 日付ショートカット
    document.getElementById('btn-today').addEventListener('click', () => {
        document.getElementById('date').value = formatDate(new Date());
    });
    
    document.getElementById('btn-yesterday').addEventListener('click', () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        document.getElementById('date').value = formatDate(yesterday);
    });
    
    document.getElementById('btn-last-weekend').addEventListener('click', () => {
        document.getElementById('date').value = formatDate(getLastSaturday());
    });
    
    // メモ文字数カウンタ
    document.getElementById('memo').addEventListener('input', updateMemoCounter);
    
    // フィルター（300msデバウンス）
    const filterInputs = ['filter-category', 'filter-period', 'search-query'];
    filterInputs.forEach(id => {
        document.getElementById(id).addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                saveFilterSettings();
                renderExpenseList();
            }, 300);
        });
    });
    
    // ソート
    document.getElementById('sort-key').addEventListener('change', () => {
        saveSortSettings();
        renderExpenseList();
    });
    
    // 全削除
    document.getElementById('clearAllBtn').addEventListener('click', clearAllExpenses);
    
    // CSVエクスポート
    document.getElementById('exportBtn').addEventListener('click', exportToCSV);
    
    // サンプルデータ追加
    document.getElementById('addDummyBtn').addEventListener('click', addDummyData);
    
    // モーダル
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal').addEventListener('click', (e) => {
        if (e.target.id === 'modal') {
            closeModal();
        }
    });
    
    // ESCキーでモーダルを閉じる
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('modal');
            if (modal.style.display === 'flex') {
                closeModal();
            }
        }
    });
});