// Finance PWA — local storage & Firebase sync app
window.onerror = function(msg, url, line, col, error) {
  console.error('GLOBAL JS ERROR:', msg, 'at', line, ':', col, error);
  alert('Сбой скрипта: ' + msg + ' (строка ' + line + ')');
};

const firebaseConfig = {
  apiKey: "AIzaSyDqM-44fUmRYUmcigsw_9fgb9yV92479Tc",
  authDomain: "financeapp-348ec.firebaseapp.com",
  projectId: "financeapp-348ec",
  storageBucket: "financeapp-348ec.firebasestorage.app",
  messagingSenderId: "1082990265997",
  appId: "1:1082990265997:web:196c22b3f3c34efa5604c4"
};

const isFirebaseConfigured = () => {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY");
};

(() => {
  const STORAGE_KEY = 'finance-pwa-data-v1';
  const fmt = (n) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(n || 0);
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  // ---------- State ----------
  const defaultState = () => ({
    accounts: [
      { id: uid(), name: 'Наличные', balance: 0 },
      { id: uid(), name: 'Карта', balance: 0 }
    ],
    categories: [
      { id: uid(), name: 'Продукты', type: 'expense', budget: 0 },
      { id: uid(), name: 'Транспорт', type: 'expense', budget: 0 },
      { id: uid(), name: 'Кафе', type: 'expense', budget: 0 },
      { id: uid(), name: 'Жильё', type: 'expense', budget: 0 },
      { id: uid(), name: 'Развлечения', type: 'expense', budget: 0 },
      { id: uid(), name: 'Здоровье', type: 'expense', budget: 0 },
      { id: uid(), name: 'Прочее', type: 'expense', budget: 0 },
      { id: uid(), name: 'Зарплата', type: 'income', budget: 0 },
      { id: uid(), name: 'Подарок', type: 'income', budget: 0 },
      { id: uid(), name: 'Прочее', type: 'income', budget: 0 }
    ],
    transactions: [],
    goals: [],
    recurring: [],
    settings: {
      reportTime: '23:00',
      reminders: ['14:00', '21:00'],
      pushEnabled: false
    }
  });

  function stripEmojis(str) {
    if (!str) return '';
    return String(str).replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu, '').trim();
  }

  let state = load();

  function sanitizeState(data) {
    if (!data || typeof data !== 'object') return defaultState();
    if (!Array.isArray(data.accounts) || data.accounts.length === 0) {
      data.accounts = [
        { id: uid(), name: 'Наличные', balance: 0 },
        { id: uid(), name: 'Карта', balance: 0 }
      ];
    }
    if (!Array.isArray(data.categories) || data.categories.length === 0) {
      data.categories = [
        { id: uid(), name: 'Продукты', type: 'expense', budget: 0 },
        { id: uid(), name: 'Транспорт', type: 'expense', budget: 0 },
        { id: uid(), name: 'Кафе', type: 'expense', budget: 0 },
        { id: uid(), name: 'Жильё', type: 'expense', budget: 0 },
        { id: uid(), name: 'Развлечения', type: 'expense', budget: 0 },
        { id: uid(), name: 'Здоровье', type: 'expense', budget: 0 },
        { id: uid(), name: 'Прочее', type: 'expense', budget: 0 },
        { id: uid(), name: 'Зарплата', type: 'income', budget: 0 },
        { id: uid(), name: 'Подарок', type: 'income', budget: 0 },
        { id: uid(), name: 'Прочее', type: 'income', budget: 0 }
      ];
    }
    if (!Array.isArray(data.transactions)) data.transactions = [];
    if (!Array.isArray(data.goals)) data.goals = [];
    if (!Array.isArray(data.recurring)) data.recurring = [];
    if (!data.settings) data.settings = { reportTime: '23:00', reminders: ['14:00', '21:00'], pushEnabled: false };
    if (!Array.isArray(data.settings.reminders)) data.settings.reminders = ['14:00', '21:00'];

    data.categories.forEach(c => {
      if (c.budget === undefined) c.budget = 0;
      delete c.icon;
      if (c.name) c.name = stripEmojis(c.name);
    });
    data.accounts.forEach(a => {
      if (a.name) a.name = stripEmojis(a.name);
    });

    return data;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        return sanitizeState(data);
      }
    } catch (e) { console.warn(e); }
    return defaultState();
  }

  function save(syncToCloud = true) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (syncToCloud && currentUser && db && doc && setDoc) {
      updateSyncStatus('saving');
      const userRef = doc(db, 'users', currentUser.uid, 'data', 'mainState');
      setDoc(userRef, state)
        .then(() => updateSyncStatus('online'))
        .catch(err => {
          console.warn('Cloud save failed', err);
          updateSyncStatus('offline', 'Ошибка сохранения');
        });
    }
  }

  // ---------- Helpers ----------
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const yesterdayISO = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const accountName = (id) => state.accounts.find(a => a.id === id)?.name || '—';
  const categoryById = (id) => state.categories.find(c => c.id === id);

  const INCOME_PALETTE = [
    '#10b981', // Emerald
    '#22c55e', // Bright Green
    '#14b8a6', // Teal Green
    '#84cc16', // Lime Green
    '#059669', // Deep Emerald
    '#15803d'  // Forest Green
  ];

  const EXPENSE_PALETTE = [
    '#6366f1', // Indigo
    '#f59e0b', // Amber / Orange
    '#ec4899', // Pink
    '#8b5cf6', // Purple
    '#06b6d4', // Cyan
    '#ef4444', // Red
    '#3b82f6', // Blue
    '#f97316', // Orange
    '#a855f7', // Violet
    '#e11d48'  // Rose
  ];

  function getCategoryColor(catOrId) {
    if (!catOrId) return '#64748b';
    const cat = typeof catOrId === 'object' ? catOrId : categoryById(catOrId);
    if (!cat) return '#64748b';
    if (cat.color) return cat.color;

    const lowerName = (cat.name || '').toLowerCase();
    if (lowerName.includes('вод')) return '#3b82f6';
    if (lowerName.includes('кредит') || lowerName.includes('долг')) return '#ff2a2a';

    if (cat.type === 'income') {
      const incCats = state.categories.filter(c => c.type === 'income');
      const idx = incCats.findIndex(c => c.id === cat.id);
      return INCOME_PALETTE[(idx >= 0 ? idx : 0) % INCOME_PALETTE.length];
    } else {
      const expCats = state.categories.filter(c => c.type !== 'income');
      const idx = expCats.findIndex(c => c.id === cat.id);
      return EXPENSE_PALETTE[(idx >= 0 ? idx : 0) % EXPENSE_PALETTE.length];
    }
  }

  function accountBalance(id) {
    return accountBalanceAsOfDate(id, todayISO());
  }

  function accountBalanceAsOfDate(id, targetDateIso) {
    const acc = state.accounts.find(a => a.id === id);
    if (!acc) return 0;
    
    const target = targetDateIso || todayISO();

    const primaryDelta = state.transactions
      .filter(t => t.accountId === id && t.date <= target)
      .reduce((s, t) => {
        if (t.type === 'income') return s + t.amount;
        if (t.type === 'expense' || t.type === 'transfer') return s - t.amount;
        return s;
      }, 0);

    const secondaryDelta = state.transactions
      .filter(t => t.type === 'transfer' && t.toAccountId === id && t.date <= target)
      .reduce((s, t) => s + t.amount, 0);

    return (acc.balance || 0) + primaryDelta + secondaryDelta;
  }

  // ---------- Firebase Sync & Auth ----------
  let currentUser = null;
  let db = null;
  let auth = null;
  let GoogleAuthProvider = null;
  let signInWithPopup = null;
  let signInWithRedirect = null;
  let getRedirectResult = null;
  let signOut = null;
  let doc = null;
  let setDoc = null;
  let getDoc = null;
  let onSnapshot = null;
  let firestoreUnsubscribe = null;

  let firebasePromise = null;

  async function ensureFirebaseLoaded() {
    if (auth && (signInWithPopup || signInWithRedirect) && GoogleAuthProvider) return true;
    if (!isFirebaseConfigured()) {
      return false;
    }

    if (!firebasePromise) {
      firebasePromise = (async () => {
        try {
          updateSyncStatus('saving', '🟡 Подключение Firebase...');

          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Не удалось загрузить автономные компоненты Firebase (таймаут 3.5 сек).')), 3500)
          );

          const loadPromise = (async () => {
            const fbApp = await import('./lib/firebase-app.js');
            const fbAuth = await import('./lib/firebase-auth.js');
            const fbDb = await import('./lib/firebase-firestore.js');
            return { fbApp, fbAuth, fbDb };
          })();

          const { fbApp, fbAuth, fbDb } = await Promise.race([loadPromise, timeoutPromise]);

          const app = fbApp.initializeApp(firebaseConfig);
          auth = fbAuth.getAuth(app);
          if (fbDb.initializeFirestore) {
            try {
              db = fbDb.initializeFirestore(app, { experimentalForceLongPolling: true });
            } catch (e) {
              db = fbDb.getFirestore(app);
            }
          } else {
            db = fbDb.getFirestore(app);
          }

          GoogleAuthProvider = fbAuth.GoogleAuthProvider;
          signInWithPopup = fbAuth.signInWithPopup;
          signInWithRedirect = fbAuth.signInWithRedirect;
          getRedirectResult = fbAuth.getRedirectResult;
          signOut = fbAuth.signOut;
          doc = fbDb.doc;
          setDoc = fbDb.setDoc;
          getDoc = fbDb.getDoc;
          onSnapshot = fbDb.onSnapshot;

          if (getRedirectResult) {
            getRedirectResult(auth).catch(e => console.warn('Redirect sign-in check:', e));
          }

          fbAuth.onAuthStateChanged(auth, async (user) => {
            currentUser = user;
            if (user) {
              $('#btn-google-login').hidden = true;
              $('#user-profile').hidden = false;
              if ($('#user-avatar')) $('#user-avatar').src = user.photoURL || '';
              if ($('#user-avatar')) $('#user-avatar').title = user.email || user.displayName || '';

              updateSyncStatus('online');

              const userRef = doc(db, 'users', user.uid, 'data', 'mainState');

              try {
                const snap = await getDoc(userRef);
                if (!snap.exists()) {
                  await setDoc(userRef, state);
                }
              } catch (e) {
                console.warn('Doc check error:', e);
              }

              firestoreUnsubscribe = onSnapshot(userRef, (docSnap) => {
                if (docSnap.exists()) {
                  const cloudData = docSnap.data();
                  state = sanitizeState(cloudData);
                  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
                  render();
                  updateSyncStatus('online');
                }
              }, (err) => {
                console.warn('Firestore snapshot error', err);
                updateSyncStatus('offline', 'Офлайн (Доступ к БД)');
              });

            } else {
              $('#btn-google-login').hidden = false;
              $('#user-profile').hidden = true;
              if (firestoreUnsubscribe) firestoreUnsubscribe();
              updateSyncStatus('offline', '● Локальный режим');
            }
          });
          return true;
        } catch (e) {
          console.warn('Firebase init error', e);
          updateSyncStatus('offline', '● Локальный режим');
          alert('Ошибка загрузки Firebase: ' + (e.message || e));
          firebasePromise = null;
          return false;
        }
      })();
    }
    return await firebasePromise;
  }

  function updateSyncStatus(mode, text = null) {
    const el = $('#sync-status');
    if (!el) return;
    el.className = 'sync-status ' + mode;
    if (text) {
      el.textContent = text;
    } else if (mode === 'online') {
      el.textContent = '🟢 Облако синхронизировано';
    } else if (mode === 'saving') {
      el.textContent = '🟡 Сохранение в облако...';
    } else {
      el.textContent = '● Локальный режим';
    }
  }

  $('#btn-google-login').addEventListener('click', async () => {
    if (!isFirebaseConfigured()) {
      alert('Для синхронизации заполните ключи в файле firebase-config.js.');
      return;
    }
    const btn = $('#btn-google-login');
    const oldText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Подключение...';

    try {
      const ready = await ensureFirebaseLoaded();
      if (!ready || !auth || !GoogleAuthProvider) {
        btn.disabled = false;
        btn.textContent = oldText;
        return;
      }
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      // Пробуем Popup на всех устройствах для избежания блокировок 3rd-party cookies при Redirect на Netlify
      try {
        await signInWithPopup(auth, provider);
      } catch (popupErr) {
        console.warn('Popup login failed, trying redirect:', popupErr);
        if (signInWithRedirect && (popupErr.code === 'auth/popup-blocked' || popupErr.code === 'auth/cancelled-popup-request')) {
          await signInWithRedirect(auth, provider);
        } else {
          throw popupErr;
        }
      }
    } catch (err) {
      console.error('Firebase Auth error:', err);
      if (err.code === 'auth/unauthorized-domain') {
        alert('⚠️ Домен вашего сайта на Netlify не добавлен в разрешённые домены Firebase!\n\n1. Зайдите в Firebase Console (console.firebase.google.com)\n2. Перейдите в Authentication -> вкладка Settings -> Authorized domains\n3. Нажмите "Add domain" и вставьте адрес вашего сайта Netlify (например: xxx.netlify.app).');
      } else if (err.code === 'auth/popup-blocked') {
        alert('Браузер заблокировал всплывающее окно входа. Разрешите всплывающие окна для этого сайта в настройках смартфона.');
      } else if (err.code === 'auth/operation-not-allowed') {
        alert('В Firebase Console не включён способ входа "Google". Зайдите в Firebase Console -> Authentication -> Sign-in method и включите Google.');
      } else if (err.code === 'auth/invalid-api-key') {
        alert('Неверный API-ключ в файле firebase-config.js.');
      } else if (err.code === 'auth/network-request-failed') {
        alert('Ошибка сети при подключении к Google. Проверьте интернет или отключите VPN.');
      } else {
        alert('Ошибка входа: ' + (err.message || err.code || err));
      }
    } finally {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  });

  $('#btn-google-logout').addEventListener('click', async () => {
    if (confirm('Выйти из аккаунта Google? Приложение перейдет в локальный режим.')) {
      if (auth && signOut) await signOut(auth);
    }
  });

  // ---------- Tabs ----------
  $$('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tab').forEach(b => b.classList.remove('active'));
      $$('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const targetPanel = $('#tab-' + btn.dataset.tab);
      if (targetPanel) targetPanel.classList.add('active');
      render();
    });
  });

  // ---------- Modals ----------
  function openModal(id) { const el = $(id); if (el) el.hidden = false; }
  function closeModal(id) { const el = $(id); if (el) el.hidden = true; }
  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-close]')) {
      const modal = e.target.closest('.modal');
      if (modal) modal.hidden = true;
    }
    if (e.target.classList.contains('modal')) {
      e.target.hidden = true;
    }
  });

  function recalculateAllGoals() {
    if (!state.goals) return;
    state.goals.forEach(g => {
      let totalDeposits = 0;
      let totalWithdrawals = 0;

      (state.transactions || []).forEach(t => {
        if (t.note) {
          if (t.note.includes(`Пополнение цели: ${g.name}`)) {
            totalDeposits += t.amount;
          } else if (t.note.includes(`Снятие с цели: ${g.name}`)) {
            totalWithdrawals += t.amount;
          }
        }
      });

      g.currentAmount = Math.max(0, totalDeposits - totalWithdrawals);
      if (g.accountId) {
        const acc = state.accounts.find(a => a.id === g.accountId);
        if (acc) acc.balance = g.currentAmount;
      }
    });
  }

  // ---------- Transaction Modal ----------
  let editingTxId = null;
  let txType = 'expense';

  function openTxModal(txId = null) {
    editingTxId = txId;
    $('#modal-tx-title').textContent = txId ? 'Изменить операцию' : 'Новая операция';
    $('#tx-delete').hidden = !txId;

    if (state.accounts.length === 0) {
      alert('Сначала добавьте счёт');
      return;
    }

    const tx = txId ? state.transactions.find(t => t.id === txId) : null;
    txType = tx ? tx.type : 'expense';

    $$('#modal-tx .seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.type === txType);
    });

    updateTxModalFields();

    $('#tx-amount').value = tx ? tx.amount : '';
    $('#tx-date').value = tx ? tx.date : todayISO();
    $('#tx-note').value = tx ? (tx.note || '') : '';
    if ($('#tx-forgive-debt')) {
      $('#tx-forgive-debt').checked = tx ? !!tx.forgivenDebt : false;
    }

    fillAccountSelect($('#tx-account'), tx?.accountId);
    fillAccountSelect($('#tx-to-account'), tx?.toAccountId);
    fillCategorySelect($('#tx-category'), txType, tx?.categoryId);

    openModal('#modal-tx');
    setTimeout(() => $('#tx-amount').focus(), 50);
  }

  function updateTxModalFields() {
    const isTransfer = txType === 'transfer';
    const isExpense = txType === 'expense';
    const canForgive = isExpense || isTransfer;

    const fieldTo = $('#field-account-to');
    const fieldCat = $('#field-category');
    const fieldForgive = $('#field-forgive-debt');

    fieldTo.hidden = !isTransfer;
    fieldTo.style.display = isTransfer ? 'block' : 'none';

    fieldCat.hidden = isTransfer;
    fieldCat.style.display = isTransfer ? 'none' : 'block';

    if (fieldForgive) {
      fieldForgive.hidden = !canForgive;
      fieldForgive.style.display = canForgive ? 'flex' : 'none';
    }

    const labelFrom = $('#field-account-from');
    labelFrom.firstChild.textContent = isTransfer ? 'Счёт списания' : 'Счёт';
  }

  $$('#modal-tx .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      txType = btn.dataset.type;
      $$('#modal-tx .seg-btn').forEach(b => b.classList.toggle('active', b === btn));
      updateTxModalFields();
      if (txType !== 'transfer') {
        fillCategorySelect($('#tx-category'), txType);
      }
    });
  });

  $('#tx-save').addEventListener('click', () => {
    const rawAmount = $('#tx-amount').value.replace(',', '.');
    const amount = parseFloat(rawAmount);
    if (!amount || amount <= 0) { alert('Введите корректную сумму'); return; }
    const accountId = $('#tx-account').value;
    const toAccountId = $('#tx-to-account').value;
    const categoryId = txType === 'transfer' ? null : $('#tx-category').value;
    const date = $('#tx-date').value || todayISO();
    const note = $('#tx-note').value.trim();
    const forgivenDebt = $('#tx-forgive-debt') ? $('#tx-forgive-debt').checked : false;

    if (txType === 'transfer' && accountId === toAccountId) {
      alert('Счета списания и зачисления должны отличаться');
      return;
    }

    if (editingTxId) {
      const tx = state.transactions.find(t => t.id === editingTxId);
      Object.assign(tx, { amount, type: txType, accountId, toAccountId, categoryId, date, note, forgivenDebt });
    } else {
      state.transactions.push({
        id: uid(), amount, type: txType, accountId, toAccountId, categoryId, date, note, forgivenDebt
      });
    }

    closeModal('#modal-tx');
    recalculateAllGoals();
    save();
    render();
  });

  $('#tx-save-next')?.addEventListener('click', () => {
    const rawAmount = $('#tx-amount').value.replace(',', '.');
    const amount = parseFloat(rawAmount);
    if (!amount || amount <= 0) { alert('Введите корректную сумму'); return; }
    const accountId = $('#tx-account').value;
    const toAccountId = $('#tx-to-account').value;
    const categoryId = txType === 'transfer' ? null : $('#tx-category').value;
    const date = $('#tx-date').value || todayISO();
    const note = $('#tx-note').value.trim();
    const forgivenDebt = $('#tx-forgive-debt') ? $('#tx-forgive-debt').checked : false;

    if (txType === 'transfer' && accountId === toAccountId) {
      alert('Счета списания и зачисления должны отличаться');
      return;
    }

    state.transactions.push({
      id: uid(), amount, type: txType, accountId, toAccountId, categoryId, date, note, forgivenDebt
    });

    recalculateAllGoals();
    save();
    render();

    // Reset amount and note, keep date, account, category for next entry
    $('#tx-amount').value = '';
    $('#tx-note').value = '';
    setTimeout(() => $('#tx-amount').focus(), 50);
  });

  // ---------- Bulk Transaction Entry ----------
  function openBulkModal() {
    if (state.accounts.length === 0) {
      alert('Сначала добавьте счёт');
      return;
    }

    fillAccountSelect($('#bulk-account'), state.accounts[0]?.id);
    $('#bulk-date').value = todayISO();
    $('#bulk-rows').innerHTML = '';

    for (let i = 0; i < 3; i++) {
      addBulkRow();
    }

    openModal('#modal-bulk-tx');
  }

  function addBulkRow() {
    const container = $('#bulk-rows');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'bulk-row';
    row.style.cssText = 'display: flex; gap: 6px; align-items: center; background: rgba(255,255,255,0.03); padding: 6px; border-radius: var(--r-sm); border: 1px solid rgba(255,255,255,0.06); flex-wrap: wrap;';

    row.innerHTML = `
      <input class="bulk-amount" type="number" step="0.01" inputmode="decimal" placeholder="Сумма" style="width: 100px; margin: 0; padding: 6px 8px; font-size: 13px;" />
      <select class="bulk-type" style="width: 90px; margin: 0; padding: 6px 4px; font-size: 12px;">
        <option value="expense">Расход</option>
        <option value="income">Доход</option>
      </select>
      <select class="bulk-cat" style="flex: 1; min-width: 110px; margin: 0; padding: 6px 4px; font-size: 12px;"></select>
      <input class="bulk-note" type="text" placeholder="Заметка" style="flex: 1; min-width: 90px; margin: 0; padding: 6px 8px; font-size: 13px;" />
      <button class="bulk-del-row danger-sm" style="padding: 6px 8px; border-radius: var(--r-sm);" title="Удалить строку">✕</button>
    `;

    const selCat = row.querySelector('.bulk-cat');
    const selType = row.querySelector('.bulk-type');

    fillCategorySelect(selCat, selType.value);

    selType.addEventListener('change', () => {
      fillCategorySelect(selCat, selType.value);
    });

    row.querySelector('.bulk-del-row').addEventListener('click', () => {
      row.remove();
    });

    container.appendChild(row);
    setTimeout(() => row.querySelector('.bulk-amount').focus(), 50);
  }

  $('#btn-open-bulk')?.addEventListener('click', () => openBulkModal());
  $('#btn-add-bulk-row')?.addEventListener('click', () => addBulkRow());

  $('#btn-save-bulk')?.addEventListener('click', () => {
    const date = $('#bulk-date').value || todayISO();
    const defaultAccountId = $('#bulk-account').value;

    if (!defaultAccountId) {
      alert('Выберите счёт');
      return;
    }

    const rows = $$('#bulk-rows .bulk-row');
    let addedCount = 0;

    rows.forEach(row => {
      const amount = parseFloat(row.querySelector('.bulk-amount').value);
      if (amount && amount > 0) {
        const type = row.querySelector('.bulk-type').value;
        const categoryId = row.querySelector('.bulk-cat').value;
        const note = row.querySelector('.bulk-note').value.trim();

        state.transactions.push({
          id: uid(),
          amount,
          type,
          accountId: defaultAccountId,
          categoryId,
          date,
          note
        });
        addedCount++;
      }
    });

    if (addedCount === 0) {
      alert('Заполните хотя бы одну сумму');
      return;
    }

    save();
    closeModal('#modal-bulk-tx');
    render();
  });

  $('#tx-delete').addEventListener('click', () => {
    if (!editingTxId) return;
    if (!confirm('Удалить операцию?')) return;
    state.transactions = state.transactions.filter(t => t.id !== editingTxId);
    recalculateAllGoals();
    save(); closeModal('#modal-tx'); render();
  });

  $('#btn-add-tx').addEventListener('click', () => openTxModal());

  function fillAccountSelect(sel, selected) {
    sel.innerHTML = '';
    state.accounts.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id; opt.textContent = stripEmojis(a.name);
      if (selected && a.id === selected) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function fillCategorySelect(sel, type, selected) {
    if (!sel) return;
    sel.innerHTML = '';
    const cats = state.categories.filter(c => c.type === type);
    cats.forEach(c => {
      const color = getCategoryColor(c);
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `● ${stripEmojis(c.name)}`;
      opt.style.color = color;
      opt.style.background = '#0f172a';
      opt.style.fontWeight = '600';
      if (selected && c.id === selected) opt.selected = true;
      sel.appendChild(opt);
    });

    const updateSelectColor = () => {
      const selectedCat = categoryById(sel.value);
      if (selectedCat) {
        sel.style.color = getCategoryColor(selectedCat);
        sel.style.fontWeight = '600';
      } else {
        sel.style.color = 'var(--text)';
      }
    };
    sel.onchange = updateSelectColor;
    updateSelectColor();
  }

  function calculateAccountDebt(acc, reportDate = null) {
    if (!acc || acc.rememberedBalance === undefined || acc.rememberedBalance === null) return 0;
    const currentBal = reportDate ? accountBalanceAsOfDate(acc.id, reportDate) : accountBalance(acc.id);

    const forgivenSum = (state.transactions || [])
      .filter(t => t.accountId === acc.id && (t.type === 'expense' || t.type === 'transfer') && t.forgivenDebt)
      .filter(t => reportDate ? t.date <= reportDate : true)
      .reduce((s, t) => s + t.amount, 0);

    const rawDebt = acc.rememberedBalance - currentBal;
    const netDebt = Math.max(0, rawDebt - forgivenSum);
    return netDebt;
  }

  // ---------- Account Modal ----------
  let editingAccId = null;
  function openAccountModal(id = null) {
    editingAccId = id;
    const acc = id ? state.accounts.find(a => a.id === id) : null;
    $('#modal-account-title').textContent = id ? 'Изменить счёт' : 'Новый счёт';
    $('#acc-name').value = acc ? stripEmojis(acc.name) : '';
    $('#acc-balance').value = acc ? acc.balance : '';
    if ($('#acc-exclude')) $('#acc-exclude').checked = acc ? !!acc.excludeFromTotal : false;

    const btnRemember = $('#btn-remember-balance');
    const infoRemember = $('#acc-remembered-info');
    if (btnRemember && infoRemember) {
      if (acc && acc.rememberedBalance !== undefined && acc.rememberedBalance !== null) {
        const debt = calculateAccountDebt(acc);
        infoRemember.innerHTML = `Запомнен баланс: <strong>${fmt(acc.rememberedBalance)}</strong>. Долг: <strong style="color:var(--danger)">${fmt(debt)}</strong>`;
        btnRemember.textContent = '✕ Сбросить запоминание';
      } else {
        infoRemember.textContent = 'Запомнит текущую сумму. Списания создадут долг к возврату.';
        btnRemember.textContent = '📌 Запомнить баланс';
      }
    }

    const txSection = $('#acc-tx-section');
    const txList = $('#acc-tx-list');
    if (acc && acc.rememberedBalance !== undefined && acc.rememberedBalance !== null && txSection && txList) {
      txSection.hidden = false;
      txList.innerHTML = '';

      const accTxs = state.transactions.filter(t => t.accountId === acc.id && (t.type === 'expense' || t.type === 'transfer'));
      if (accTxs.length === 0) {
        txList.innerHTML = '<li class="empty" style="font-size:12px; padding:8px;">Списаний и переводов с этого счёта пока нет</li>';
      } else {
        accTxs.forEach(t => {
          const li = document.createElement('li');
          li.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:8px 4px; gap:8px; border-bottom:1px solid rgba(255,255,255,0.05); font-size:12px;';
          
          const cat = categoryById(t.categoryId);
          let name = '';
          if (t.type === 'transfer') {
            name = `Перевод ➔ ${accountName(t.toAccountId)}${t.note ? ' (' + t.note + ')' : ''}`;
          } else {
            name = t.note || cat?.name || 'Списание';
          }
          const isForgiven = !!t.forgivenDebt;

          li.innerHTML = `
            <div style="flex:1; overflow:hidden;">
              <div style="font-weight:600; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${escapeHtml(name)}</div>
              <div style="color:var(--muted); font-size:11px;">${formatDate(t.date)} · ${fmt(t.amount)}</div>
            </div>
            <button class="forgive-toggle-btn ${isForgiven ? 'ghost-sm' : 'secondary-sm'}" style="font-size:11px; padding:4px 8px; flex-shrink:0;">
              ${isForgiven ? '✓ Долг списан' : 'Списать долг'}
            </button>
          `;

          li.querySelector('.forgive-toggle-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            t.forgivenDebt = !t.forgivenDebt;
            save();
            openAccountModal(acc.id);
            render();
          });

          txList.appendChild(li);
        });
      }
    } else if (txSection) {
      txSection.hidden = true;
    }

    $('#acc-delete').hidden = !id;
    openModal('#modal-account');
    setTimeout(() => $('#acc-name').focus(), 50);
  }

  $('#btn-remember-balance')?.addEventListener('click', () => {
    if (!editingAccId) {
      alert('Сначала сохраните счёт');
      return;
    }
    const acc = state.accounts.find(a => a.id === editingAccId);
    if (!acc) return;

    if (acc.rememberedBalance !== undefined && acc.rememberedBalance !== null) {
      delete acc.rememberedBalance;
    } else {
      acc.rememberedBalance = accountBalance(acc.id);
    }
    save();
    openAccountModal(editingAccId);
    render();
  });

  $('#btn-add-account').addEventListener('click', () => openAccountModal());

  $('#acc-save').addEventListener('click', () => {
    const name = $('#acc-name').value.trim();
    const balance = parseFloat($('#acc-balance').value) || 0;
    const excludeFromTotal = $('#acc-exclude') ? $('#acc-exclude').checked : false;

    if (!name) { alert('Введите название'); return; }
    if (editingAccId) {
      const a = state.accounts.find(x => x.id === editingAccId);
      a.name = name; a.balance = balance; a.excludeFromTotal = excludeFromTotal;
    } else {
      state.accounts.push({ id: uid(), name, balance, excludeFromTotal });
    }
    save(); closeModal('#modal-account'); render();
  });

  $('#acc-delete').addEventListener('click', () => {
    if (!editingAccId) return;
    const hasTx = state.transactions.some(t => t.accountId === editingAccId || t.toAccountId === editingAccId);
    if (hasTx && !confirm('На этом счёте есть операции. Удалить вместе с ними?')) return;
    state.transactions = state.transactions.filter(t => t.accountId !== editingAccId && t.toAccountId !== editingAccId);
    state.accounts = state.accounts.filter(a => a.id !== editingAccId);
    save(); closeModal('#modal-account'); render();
  });

  // ---------- Category Modal ----------
  let editingCatId = null;
  function openCategoryModal(id = null) {
    editingCatId = id;
    const c = id ? state.categories.find(x => x.id === id) : null;
    $('#cat-name').value = c ? c.name : '';
    $('#cat-type').value = c ? c.type : 'expense';
    $('#cat-budget-limit').value = c ? (c.budget || '') : '';
    if ($('#cat-color-input')) {
      $('#cat-color-input').value = c ? getCategoryColor(c) : '#6366f1';
    }
    $('#cat-delete').hidden = !id;
    openModal('#modal-cat');
    setTimeout(() => $('#cat-name').focus(), 50);
  }

  $$('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      const color = swatch.dataset.color;
      if (color && $('#cat-color-input')) {
        $('#cat-color-input').value = color;
      }
    });
  });

  $('#btn-add-cat').addEventListener('click', () => openCategoryModal());

  $('#cat-save').addEventListener('click', () => {
    const name = $('#cat-name').value.trim();
    const type = $('#cat-type').value;
    const budget = parseFloat($('#cat-budget-limit').value) || 0;
    const color = $('#cat-color-input')?.value;

    if (!name) { alert('Введите название'); return; }
    if (editingCatId) {
      const c = state.categories.find(x => x.id === editingCatId);
      c.name = name; c.type = type; c.budget = budget; c.color = color;
    } else {
      state.categories.push({ id: uid(), name, type, budget, color });
    }
    save(); closeModal('#modal-cat'); render();
  });

  $('#cat-delete').addEventListener('click', () => {
    if (!editingCatId) return;
    const hasTx = state.transactions.some(t => t.categoryId === editingCatId);
    if (hasTx && !confirm('Есть операции с этой категорией. Удалить категорию?')) return;
    state.categories = state.categories.filter(c => c.id !== editingCatId);
    state.transactions.forEach(t => { if (t.categoryId === editingCatId) t.categoryId = null; });
    save(); closeModal('#modal-cat'); render();
  });

  function ensureGoalCategory() {
    let cat = state.categories.find(c => (c.name || '').toLowerCase().includes('цел') || (c.name || '').toLowerCase().includes('накоплен'));
    if (!cat) {
      cat = { id: uid(), name: 'Цели и накопления', type: 'expense', budget: 0, color: '#6366f1' };
      state.categories.push(cat);
      save();
    }
    return cat;
  }

  // ---------- Goal Modal ----------
  let editingGoalId = null;
  function openGoalModal(id = null) {
    editingGoalId = id;
    const g = id ? state.goals.find(x => x.id === id) : null;
    $('#modal-goal-title').textContent = id ? 'Изменить цель' : 'Новая цель накопления';
    $('#goal-name').value = g ? g.name : '';
    $('#goal-target').value = g ? g.targetAmount : '';
    $('#goal-current').value = g ? g.currentAmount : '';
    $('#goal-delete').hidden = !id;
    openModal('#modal-goal');
    setTimeout(() => $('#goal-name').focus(), 50);
  }

  $('#btn-add-goal').addEventListener('click', () => openGoalModal());

  $('#goal-save').addEventListener('click', () => {
    const name = $('#goal-name').value.trim();
    const targetAmount = parseFloat($('#goal-target').value) || 0;
    const currentAmount = parseFloat($('#goal-current').value) || 0;

    if (!name || targetAmount <= 0) { alert('Укажите название и корректную целевую сумму'); return; }

    if (editingGoalId) {
      const g = state.goals.find(x => x.id === editingGoalId);
      g.name = name; g.targetAmount = targetAmount; g.currentAmount = currentAmount;
      if (g.accountId) {
        const acc = state.accounts.find(a => a.id === g.accountId);
        if (acc) {
          acc.name = `Цель: ${name}`;
          acc.balance = currentAmount;
        }
      }
    } else {
      const goalAcc = {
        id: uid(),
        name: `Цель: ${name}`,
        balance: currentAmount,
        excludeFromTotal: true
      };
      state.accounts.push(goalAcc);

      state.goals.push({
        id: uid(),
        name,
        targetAmount,
        currentAmount,
        accountId: goalAcc.id
      });
    }
    save(); closeModal('#modal-goal'); render();
  });

  $('#goal-delete').addEventListener('click', () => {
    if (!editingGoalId) return;
    if (!confirm('Удалить эту цель и её связанный счёт?')) return;
    const g = state.goals.find(x => x.id === editingGoalId);
    if (g && g.accountId) {
      state.accounts = state.accounts.filter(a => a.id !== g.accountId);
    }
    state.goals = state.goals.filter(g => g.id !== editingGoalId);
    save(); closeModal('#modal-goal'); render();
  });

  // ---------- Goal Deposit / Withdraw Modal ----------
  let activeDepositGoalId = null;
  let depositAction = 'deposit';

  function openGoalDepositModal(goalId) {
    activeDepositGoalId = goalId;
    const g = state.goals.find(x => x.id === goalId);
    if (!g) return;

    $('#goal-deposit-title').textContent = `Копилка «${g.name}»`;
    $('#goal-deposit-amount').value = '';
    depositAction = 'deposit';

    $$('#modal-goal-deposit .seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.action === depositAction);
    });

    fillAccountSelect($('#goal-deposit-account'));
    openModal('#modal-goal-deposit');
    setTimeout(() => $('#goal-deposit-amount').focus(), 50);
  }

  $$('#modal-goal-deposit .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      depositAction = btn.dataset.action;
      $$('#modal-goal-deposit .seg-btn').forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  $('#goal-deposit-save').addEventListener('click', () => {
    const amount = parseFloat($('#goal-deposit-amount').value);
    if (!amount || amount <= 0) { alert('Введите сумму'); return; }

    const g = state.goals.find(x => x.id === activeDepositGoalId);
    if (!g) return;

    const accountId = $('#goal-deposit-account').value;
    const goalCat = ensureGoalCategory();

    if (depositAction === 'deposit') {
      g.currentAmount += amount;
      if (accountId) {
        state.transactions.push({
          id: uid(), amount, type: 'expense', accountId,
          categoryId: goalCat.id, date: todayISO(), note: `Пополнение цели: ${g.name}`
        });
      }
    } else {
      g.currentAmount = Math.max(0, g.currentAmount - amount);
      if (accountId) {
        state.transactions.push({
          id: uid(), amount, type: 'income', accountId,
          categoryId: goalCat.id, date: todayISO(), note: `Снятие с цели: ${g.name}`
        });
      }
    }

    if (g.accountId) {
      const acc = state.accounts.find(a => a.id === g.accountId);
      if (acc) acc.balance = g.currentAmount;
    }

    save(); closeModal('#modal-goal-deposit'); render();
  });

  // ---------- Recurring Modal ----------
  let editingRecId = null;
  let recType = 'expense';

  function openRecurringModal(id = null) {
    editingRecId = id;
    const r = id ? state.recurring.find(x => x.id === id) : null;
    $('#modal-recurring-title').textContent = id ? 'Изменить подписку' : 'Новый регулярный платеж';
    $('#rec-title').value = r ? r.title : '';
    $('#rec-amount').value = r ? r.amount : '';
    $('#rec-period').value = r ? r.period : 'month';
    $('#rec-delete').hidden = !id;
    recType = r ? r.type : 'expense';

    $$('#modal-recurring .seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.type === recType);
    });

    fillAccountSelect($('#rec-account'), r?.accountId);
    fillCategorySelect($('#rec-category'), recType, r?.categoryId);

    openModal('#modal-recurring');
    setTimeout(() => $('#rec-title').focus(), 50);
  }

  $$('#modal-recurring .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      recType = btn.dataset.type;
      $$('#modal-recurring .seg-btn').forEach(b => b.classList.toggle('active', b === btn));
      fillCategorySelect($('#rec-category'), recType);
    });
  });

  $('#btn-add-recurring').addEventListener('click', () => openRecurringModal());

  $('#rec-save').addEventListener('click', () => {
    const title = $('#rec-title').value.trim();
    const amount = parseFloat($('#rec-amount').value);
    const accountId = $('#rec-account').value;
    const categoryId = $('#rec-category').value;
    const period = $('#rec-period').value;

    if (!title || !amount || amount <= 0) { alert('Заполните название и сумму'); return; }

    if (editingRecId) {
      const r = state.recurring.find(x => x.id === editingRecId);
      Object.assign(r, { title, amount, type: recType, accountId, categoryId, period });
    } else {
      state.recurring.push({ id: uid(), title, amount, type: recType, accountId, categoryId, period });
    }
    save(); closeModal('#modal-recurring'); render();
  });

  $('#rec-delete').addEventListener('click', () => {
    if (!editingRecId) return;
    if (!confirm('Удалить эту подписку?')) return;
    state.recurring = state.recurring.filter(r => r.id !== editingRecId);
    save(); closeModal('#modal-recurring'); render();
  });

  // ---------- Export / Import ----------
  $('#btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
  $('#btn-import').addEventListener('click', () => $('#file-import').click());
  $('#file-import').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.accounts || !data.categories || !data.transactions) throw new Error('Неверный формат');
      if (!confirm('Заменить текущие данные импортируемыми?')) return;
      state = data; save(); render();
      alert('Импорт выполнен');
    } catch (err) {
      alert('Ошибка импорта: ' + err.message);
    }
    e.target.value = '';
  });

  // ---------- Search & Filters ----------
  const filters = { accountId: '', type: '', query: '', dateFrom: '', dateTo: '' };
  
  $('#filter-search').addEventListener('input', (e) => { filters.query = e.target.value.toLowerCase().trim(); renderTx(); });
  $('#filter-account').addEventListener('change', (e) => { filters.accountId = e.target.value; renderTx(); });
  $('#filter-type').addEventListener('change', (e) => { filters.type = e.target.value; renderTx(); });
  $('#filter-date-from').addEventListener('change', (e) => { filters.dateFrom = e.target.value; renderTx(); });
  $('#filter-date-to').addEventListener('change', (e) => { filters.dateTo = e.target.value; renderTx(); });

  $('#btn-reset-filters').addEventListener('click', () => {
    filters.query = ''; filters.accountId = ''; filters.type = ''; filters.dateFrom = ''; filters.dateTo = '';
    $('#filter-search').value = '';
    $('#filter-account').value = '';
    $('#filter-type').value = '';
    $('#filter-date-from').value = '';
    $('#filter-date-to').value = '';
    renderTx();
  });

  // ---------- Period (Stats) ----------
  let period = 'month';
  $$('.period').forEach(btn => {
    btn.addEventListener('click', () => {
      period = btn.dataset.period;
      $$('.period').forEach(b => b.classList.toggle('active', b === btn));
      renderStats();
    });
  });

  function inPeriod(dateStr) {
    if (!dateStr) return false;
    if (period === 'all') return true;

    const parts = dateStr.split('-').map(Number);
    if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
      return true;
    }
    const [year, month, day] = parts;
    const txDate = new Date(year, month - 1, day);
    const now = new Date();
    // Normalize time to end of today for upper bound
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (period === 'month') {
      const isCurrentCalendarMonth = (year === now.getFullYear() && (month - 1) === now.getMonth());
      const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
      return isCurrentCalendarMonth || (txDate >= thirtyDaysAgo && txDate <= todayEnd);
    }

    if (period === 'week') {
      const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      return txDate >= sevenDaysAgo && txDate <= todayEnd;
    }

    return true;
  }

  // ---------- Rendering ----------
  function render() {
    try {
      state = sanitizeState(state);
      renderBalance();
      renderTxFilters();
      renderTx();
      renderAccounts();
      renderCategories();
      renderCategoryBudgets();
      renderGoals();
      renderRecurring();
      renderStats();
    } catch (err) {
      console.error('Render error:', err);
    }
  }

  function renderBalance() {
    const total = state.accounts.filter(a => !a.excludeFromTotal).reduce((s, a) => s + accountBalance(a.id), 0);
    $('#total-balance').textContent = fmt(total);
    const inc = state.transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = state.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    $('#sum-income').textContent = fmt(inc);
    $('#sum-expense').textContent = fmt(exp);
    renderBalanceSparkline();
  }

  function renderBalanceSparkline() {
    const svg = $('#balance-sparkline');
    if (!svg) return;
    svg.innerHTML = '';

    const days = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }

    const points = [];
    days.forEach(dayIso => {
      const txsUpToDay = state.transactions.filter(t => t.date <= dayIso);
      let bal = state.accounts.filter(a => !a.excludeFromTotal).reduce((s, a) => s + (a.balance || 0), 0);
      txsUpToDay.forEach(t => {
        const accFrom = state.accounts.find(a => a.id === t.accountId);
        const accTo = t.toAccountId ? state.accounts.find(a => a.id === t.toAccountId) : null;

        if (t.type === 'income' && accFrom && !accFrom.excludeFromTotal) {
          bal += t.amount;
        } else if (t.type === 'expense' && accFrom && !accFrom.excludeFromTotal) {
          bal -= t.amount;
        } else if (t.type === 'transfer') {
          if (accFrom && !accFrom.excludeFromTotal) bal -= t.amount;
          if (accTo && !accTo.excludeFromTotal) bal += t.amount;
        }
      });
      points.push(bal);
    });

    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;

    const w = 120, h = 54;
    const pathPoints = points.map((val, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - 6 - ((val - min) / range) * (h - 12);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${pathPoints.join(' L ')}`);
    svg.appendChild(path);
  }

  function renderStats() {
    const txs = state.transactions.filter(t => inPeriod(t.date));
    const inc = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    $('#stat-income').textContent = fmt(inc);
    $('#stat-expense').textContent = fmt(exp);
    $('#stat-diff').textContent = fmt(inc - exp);
    $('#stat-diff').className = 'stat-val ' + (inc - exp >= 0 ? 'income' : 'expense');

    // Карточка долгов на вкладке Отчеты
    const debtCard = $('#stat-debt-card');
    const debtList = $('#stat-debt-list');
    if (debtCard && debtList) {
      const debtAccounts = (state.accounts || []).filter(a => calculateAccountDebt(a) > 0);
      if (debtAccounts.length > 0) {
        debtCard.hidden = false;
        debtList.innerHTML = '';
        debtAccounts.forEach(a => {
          const debt = calculateAccountDebt(a);
          const li = document.createElement('li');
          li.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:13px; flex-wrap:wrap; gap:6px;';
          li.innerHTML = `
            <span style="font-weight:600;">${escapeHtml(stripEmojis(a.name))}</span>
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="color:var(--danger); font-weight:700;">вернуть ${fmt(debt)} <span style="font-size:11px; color:var(--muted); font-weight:normal;">(было ${fmt(a.rememberedBalance)})</span></span>
              <button class="reset-debt-btn ghost-sm" style="font-size:11px; padding:2px 8px;" title="Убрать этот счёт из списка долгов">✕ Сбросить долг</button>
            </div>
          `;
          li.querySelector('.reset-debt-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            delete a.rememberedBalance;
            save();
            render();
          });
          debtList.appendChild(li);
        });
      } else {
        debtCard.hidden = true;
      }
    }

    const byCat = {};
    txs.filter(t => t.type === 'expense').forEach(t => {
      byCat[t.categoryId] = (byCat[t.categoryId] || 0) + t.amount;
    });
    const arr = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const max = arr[0]?.[1] || 1;
    
    // Spec 3.7: Native SVG Donut and Line Chart Visualizations
    renderDonutChart(exp, arr);
    renderLineChart(txs);

    const list = $('#stat-cats');
    list.innerHTML = '';

    if (arr.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.style.background = 'transparent'; li.style.border = 'none'; li.style.cursor = 'default';
      li.textContent = 'Нет расходов за период';
      list.appendChild(li);
      return;
    }

    arr.forEach(([catId, sum]) => {
      const c = categoryById(catId);
      const color = getCategoryColor(catId);
      const pct = Math.max(4, Math.round((sum / max) * 100));
      const li = document.createElement('li');
      li.style.cursor = 'pointer';
      li.title = 'Нажмите, чтобы просмотреть все транзакции этой категории';
      li.innerHTML = `
        <div class="bar-head">
          <span style="display:inline-flex; align-items:center; gap:6px;">
            <span style="width:10px; height:10px; border-radius:50%; background:${color}; display:inline-block; flex-shrink:0;"></span>
            <span style="color:${color}; font-weight:600;">${escapeHtml(c?.name || 'Без категории')}</span>
          </span>
          <span style="font-weight:600;">${fmt(sum)}</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%; background:${color};"></div></div>
      `;
      li.addEventListener('click', () => openCategoryDetailsModal(catId));
      list.appendChild(li);
    });
  }

  function renderDonutChart(expSum, arr) {
    const container = $('#donut-chart-container');
    if (!container) return;
    container.innerHTML = '';

    if (expSum === 0 || arr.length === 0) {
      container.innerHTML = '<div class="empty" style="padding:10px 0;">Нет расходов за период</div>';
      return;
    }

    const r = 12;
    const C = 2 * Math.PI * r;
    let strokeOffset = 0;
    let circlesHtml = '';
    let legendHtml = '';

    arr.forEach(([catId, sum]) => {
      const cat = categoryById(catId);
      const name = cat?.name || 'Без категории';
      const color = getCategoryColor(catId);
      const ratio = sum / expSum;

      const strokeLen = (ratio * C).toFixed(3);
      const gapLen = (C - ratio * C).toFixed(3);
      const dashOffset = (-(strokeOffset * C)).toFixed(3);

      circlesHtml += `<circle cx="16" cy="16" r="${r}" fill="none" stroke="${color}" stroke-width="4" stroke-dasharray="${strokeLen} ${gapLen}" stroke-dashoffset="${dashOffset}" />`;
      strokeOffset += ratio;

      legendHtml += `
        <div class="legend-item" data-cat-id="${catId}" style="cursor:pointer;" title="Просмотреть расходы категории">
          <div class="legend-left">
            <span class="legend-color-dot" style="background:${color}"></span>
            <span style="color:${color}; font-weight:600;">${escapeHtml(name)}</span>
          </div>
          <span class="legend-val">${fmt(sum)} (${(ratio * 100).toFixed(0)}%)</span>
        </div>
      `;
    });

    container.innerHTML = `
      <div class="donut-svg-container">
        <svg class="donut-svg" viewBox="0 0 32 32">
          ${circlesHtml}
        </svg>
        <div class="donut-center-text">
          <span class="donut-total-label">Всего</span>
          <span class="donut-total-val">${fmt(expSum)}</span>
        </div>
      </div>
      <div class="donut-legend">${legendHtml}</div>
    `;

    container.querySelectorAll('.legend-item').forEach(item => {
      item.addEventListener('click', () => openCategoryDetailsModal(item.dataset.catId));
    });
  }

  function openCategoryDetailsModal(catId) {
    const cat = (!catId || catId === 'null') ? null : categoryById(catId);
    const catName = cat ? cat.name : 'Без категории';

    const periodTxs = state.transactions.filter(t => inPeriod(t.date) && t.type === 'expense' && ((!catId || catId === 'null') ? !t.categoryId : t.categoryId === catId));
    periodTxs.sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));

    const totalSum = periodTxs.reduce((s, t) => s + t.amount, 0);

    $('#cat-details-title').textContent = `Расходы: ${catName}`;
    $('#cat-details-summary').textContent = `Всего за период: ${fmt(totalSum)} (${periodTxs.length} опер.)`;

    const list = $('#cat-details-list');
    list.innerHTML = '';

    if (periodTxs.length === 0) {
      list.innerHTML = '<li class="empty">Нет операций по этой категории за период</li>';
    } else {
      periodTxs.forEach(t => {
        const li = document.createElement('li');
        li.innerHTML = `
          <div class="tx-badge expense">${SVG_ICONS.expense}</div>
          <div class="tx-main">
            <div class="tx-title">${escapeHtml(t.note || catName)}</div>
            <div class="tx-sub">${accountName(t.accountId)} · ${formatDate(t.date)}</div>
          </div>
          <div class="tx-amount expense">− ${fmt(t.amount)}</div>
        `;
        li.addEventListener('click', () => {
          closeModal('#modal-cat-details');
          openTxModal(t.id);
        });
        list.appendChild(li);
      });
    }

    openModal('#modal-cat-details');
  }

  function renderLineChart(txs) {
    const container = $('#line-chart-container');
    if (!container) return;
    container.innerHTML = '';

    const expTxs = txs.filter(t => t.type === 'expense');
    if (expTxs.length === 0) {
      container.innerHTML = '<div class="empty" style="padding:10px 0;">Нет данных за период</div>';
      return;
    }

    const byDate = {};
    expTxs.forEach(t => {
      byDate[t.date] = (byDate[t.date] || 0) + t.amount;
    });

    const sortedDates = Object.keys(byDate).sort();
    if (sortedDates.length < 2) {
      container.innerHTML = '<div class="empty" style="padding:10px 0;">Недостаточно данных для графика динамики</div>';
      return;
    }

    const values = sortedDates.map(d => byDate[d]);
    const max = Math.max(...values) || 1;
    const w = 300, h = 90;

    const points = values.map((val, idx) => {
      const x = (idx / (values.length - 1)) * w;
      const y = h - 10 - (val / max) * (h - 20);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    container.innerHTML = `
      <svg class="line-chart-svg" viewBox="0 0 ${w} ${h}">
        <g class="line-chart-grid">
          <line x1="0" y1="10" x2="${w}" y2="10" />
          <line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" />
          <line x1="0" y1="${h - 10}" x2="${w}" y2="${h - 10}" />
        </g>
        <path class="line-chart-path" d="M ${points.join(' L ')}" />
      </svg>
    `;

    renderExpenseInsight(txs);
  }

  function renderExpenseInsight(txs) {
    const insightContainer = $('#line-chart-insight');
    if (!insightContainer) return;
    insightContainer.innerHTML = '';

    const expTxs = txs.filter(t => t.type === 'expense');
    const incTxs = txs.filter(t => t.type === 'income');

    if (expTxs.length === 0) {
      insightContainer.style.display = 'none';
      return;
    }
    insightContainer.style.display = 'block';

    const totalExp = expTxs.reduce((s, t) => s + t.amount, 0);
    const totalInc = incTxs.reduce((s, t) => s + t.amount, 0);

    const byDate = {};
    expTxs.forEach(t => {
      byDate[t.date] = (byDate[t.date] || 0) + t.amount;
    });
    const sortedDates = Object.keys(byDate).sort();
    const daysCount = sortedDates.length || 1;
    const dailyAvg = Math.round(totalExp / daysCount);

    const half = Math.floor(sortedDates.length / 2);
    let firstHalfSum = 0, secondHalfSum = 0;
    sortedDates.forEach((d, idx) => {
      if (idx < half) firstHalfSum += byDate[d];
      else secondHalfSum += byDate[d];
    });

    const firstHalfAvg = half > 0 ? (firstHalfSum / half) : 0;
    const secondHalfAvg = (sortedDates.length - half) > 0 ? (secondHalfSum / (sortedDates.length - half)) : 0;

    let pctDiff = 0;
    if (firstHalfAvg > 0) {
      pctDiff = Math.round(((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100);
    }

    const byCat = {};
    expTxs.forEach(t => {
      byCat[t.categoryId] = (byCat[t.categoryId] || 0) + t.amount;
    });
    const topCatPair = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    const topCatObj = topCatPair ? categoryById(topCatPair[0]) : null;
    const topCatName = topCatObj ? topCatObj.name : 'Прочее';
    const topCatColor = topCatObj ? getCategoryColor(topCatObj) : 'var(--text)';
    const topCatSum = topCatPair ? topCatPair[1] : 0;
    const topCatPct = totalExp > 0 ? Math.round((topCatSum / totalExp) * 100) : 0;

    let badgeClass = 'neutral';
    let badgeText = '⚖️ Умеренные траты';
    let commentText = `Ритм трат пока стабилен: в среднем <strong>${fmt(dailyAvg)}/день</strong>.`;

    if (totalInc > 0 && totalExp > totalInc) {
      badgeClass = 'danger';
      badgeText = '⚠️ Превышение доходов';
      commentText = `За выбранный период расходы превысили доходы на <strong>${fmt(totalExp - totalInc)}</strong>. Главный расход: <strong style="color:${topCatColor}">${escapeHtml(topCatName)}</strong> (${fmt(topCatSum)}).`;
    } else if (pctDiff >= 25) {
      badgeClass = 'warning';
      badgeText = '🔥 Траты растут';
      commentText = `К концу периода средние дневные расходы выросли на <strong>+${pctDiff}%</strong>. Больше всего уходит на категорию <strong style="color:${topCatColor}">${escapeHtml(topCatName)}</strong> (${topCatPct}% от всех трат).`;
    } else if (pctDiff <= -20 && totalExp > 0) {
      badgeClass = 'success';
      badgeText = '🌱 Отличная экономия!';
      commentText = `Во второй половине периода расходы снизились на <strong>${Math.abs(pctDiff)}%</strong>. Вы успешно контролируете бюджет!`;
    } else if (totalInc > 0 && (totalInc - totalExp) > totalInc * 0.3) {
      badgeClass = 'success';
      badgeText = '💪 Отличный баланс';
      commentText = `Вы удержали <strong>${Math.round(((totalInc - totalExp) / totalInc) * 100)}%</strong> полученного дохода! Средний расход: <strong>${fmt(dailyAvg)}/день</strong>.`;
    }

    insightContainer.innerHTML = `
      <div class="chart-insight-card">
        <div class="insight-badge ${badgeClass}">${badgeText}</div>
        <div class="insight-text">${commentText}</div>
        <div class="insight-meta">
          <span>Средний расход: <strong>${fmt(dailyAvg)}/день</strong></span>
          <span>Главный расход: <strong style="color:${topCatColor}">${escapeHtml(topCatName)}</strong> (${fmt(topCatSum)})</span>
        </div>
      </div>
    `;
  }

  function renderTxFilters() {
    const sel = $('#filter-account');
    const current = sel.value;
    sel.innerHTML = '<option value="">Все счета</option>';
    state.accounts.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id; opt.textContent = a.name;
      sel.appendChild(opt);
    });
    sel.value = current;
  }

  // ---------- SVG Icon Registry per Spec 3.1 ----------
  const SVG_ICONS = {
    expense: `<svg class="icon-svg sm" viewBox="0 0 24 24"><line x1="7" y1="7" x2="17" y2="17"/><polyline points="17 7 17 17 7 17"/></svg>`,
    income: `<svg class="icon-svg sm" viewBox="0 0 24 24"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>`,
    transfer: `<svg class="icon-svg sm" viewBox="0 0 24 24"><path d="M7 16V4M7 4L3 8M7 4L11 8M17 8V20M17 20L21 16M17 20L13 16"/></svg>`,
    account: `<svg class="icon-svg sm" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
    goal: `<svg class="icon-svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`
  };

  function renderTx() {
    const list = $('#tx-list');
    list.innerHTML = '';

    let txs = [...state.transactions];

    if (filters.accountId) {
      txs = txs.filter(t => t.accountId === filters.accountId || t.toAccountId === filters.accountId);
    }
    if (filters.type) {
      txs = txs.filter(t => t.type === filters.type);
    }
    if (filters.dateFrom) {
      txs = txs.filter(t => t.date >= filters.dateFrom);
    }
    if (filters.dateTo) {
      txs = txs.filter(t => t.date <= filters.dateTo);
    }
    if (filters.query) {
      const q = filters.query.toLowerCase();
      txs = txs.filter(t => {
        const cat = categoryById(t.categoryId);
        const catName = cat ? cat.name.toLowerCase() : '';
        const accFrom = accountName(t.accountId).toLowerCase();
        const accTo = accountName(t.toAccountId).toLowerCase();
        const note = (t.note || '').toLowerCase();
        const amountStr = String(t.amount);
        return catName.includes(q) || accFrom.includes(q) || accTo.includes(q) || note.includes(q) || amountStr.includes(q);
      });
    }

    $('#tx-empty').hidden = txs.length > 0;
    if (txs.length === 0) return;

    // Группировка транзакций по дням
    const groupsByDate = {};
    txs.forEach(t => {
      if (!groupsByDate[t.date]) {
        groupsByDate[t.date] = { date: t.date, txs: [], inc: 0, exp: 0 };
      }
      groupsByDate[t.date].txs.push(t);
      if (t.type === 'income') groupsByDate[t.date].inc += t.amount;
      if (t.type === 'expense') groupsByDate[t.date].exp += t.amount;
    });

    const sortedDates = Object.keys(groupsByDate).sort((a, b) => b.localeCompare(a));
    state.collapsedDates = state.collapsedDates || {};

    sortedDates.forEach((dateKey, index) => {
      const group = groupsByDate[dateKey];
      group.txs.sort((a, b) => (b.id || '').localeCompare(a.id || ''));

      let isCollapsed = false;
      if (state.collapsedDates[dateKey] !== undefined) {
        isCollapsed = !!state.collapsedDates[dateKey];
      } else {
        isCollapsed = index >= 5; // По умолчанию первые 5 дней открыты, остальные свернуты
      }

      const header = document.createElement('li');
      header.className = 'date-header-card';
      header.style.cssText = 'cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: var(--r-sm); margin: 12px 0 6px; user-select: none; transition: background 0.15s ease;';

      const incBadge = group.inc > 0 ? `<span style="color:var(--income); font-weight:600;">+${fmt(group.inc)}</span>` : '';
      const expBadge = group.exp > 0 ? `<span style="color:var(--expense); font-weight:600;">−${fmt(group.exp)}</span>` : '';
      const arrow = `<span style="font-size:10px; color:var(--muted); transition:transform 0.2s ease; display:inline-block; transform:${isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'};">▼</span>`;

      header.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-weight:700; font-size:13px; color:var(--text);">${formatDate(dateKey)}</span>
          <span style="font-size:11px; color:var(--muted);">(${group.txs.length})</span>
        </div>
        <div style="display:flex; align-items:center; gap:10px; font-size:12px;">
          ${incBadge}
          ${expBadge}
          ${arrow}
        </div>
      `;

      header.addEventListener('click', () => {
        state.collapsedDates[dateKey] = !isCollapsed;
        save(false);
        renderTx();
      });

      list.appendChild(header);

      if (!isCollapsed) {
        const ul = document.createElement('ul');
        ul.className = 'date-tx-group';
        ul.style.cssText = 'list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:6px;';

        group.txs.forEach(t => {
          const cat = categoryById(t.categoryId);
          const li = document.createElement('li');

          let catNameFormatted = cat?.name ? `<span style="color:${getCategoryColor(cat)}; font-weight:600;">${escapeHtml(cat.name)}</span>` : 'Без категории';
          let title = catNameFormatted;
          let sub = accountName(t.accountId);
          let sign = t.type === 'income' ? '+' : '−';

          if (t.type === 'transfer') {
            title = `Перевод: ${accountName(t.accountId)} ➔ ${accountName(t.toAccountId)}`;
            sub = 'Внутренний перевод';
            sign = '↔';
          } else if (t.note) {
            title += ` · ${escapeHtml(t.note)}`;
          }

          const badgeIcon = SVG_ICONS[t.type] || SVG_ICONS.expense;

          li.innerHTML = `
            <div class="tx-badge ${t.type}">${badgeIcon}</div>
            <div class="tx-main">
              <div class="tx-title">${title}</div>
              <div class="tx-sub">${sub}</div>
            </div>
            <div class="tx-amount ${t.type}">${sign} ${fmt(t.amount)}</div>
          `;
          li.addEventListener('click', () => openTxModal(t.id));
          ul.appendChild(li);
        });

        list.appendChild(ul);
      }
    });
  }

  function renderAccounts() {
    const list = $('#accounts-list');
    list.innerHTML = '';
    state.accounts.forEach(a => {
      const bal = accountBalance(a.id);
      const cleanName = stripEmojis(a.name);

      let debtBadge = '';
      if (a.rememberedBalance !== undefined && a.rememberedBalance !== null) {
        const debt = calculateAccountDebt(a);
        if (debt > 0) {
          debtBadge = `<div style="color:var(--danger); font-size:12px; font-weight:600; margin-top:3px;">⚠️ Долг к возврату: ${fmt(debt)} (было ${fmt(a.rememberedBalance)})</div>`;
        } else {
          debtBadge = `<div style="color:var(--success); font-size:11px; margin-top:2px;">✓ Долга нет (запомнено: ${fmt(a.rememberedBalance)})</div>`;
        }
      }

      const li = document.createElement('li');
      const excludeBadge = a.excludeFromTotal ? `<div class="tx-sub" style="color:var(--muted); font-size:11px; margin-top:2px;">(Не учитывается в балансе)</div>` : '';

      li.innerHTML = `
        <div class="tx-badge account">${SVG_ICONS.account}</div>
        <div class="tx-main">
          <div class="tx-title">${escapeHtml(cleanName)}</div>
          <div class="tx-sub">Начальный остаток: ${fmt(a.balance)}</div>
          ${debtBadge}
          ${excludeBadge}
        </div>
        <div class="tx-amount">${fmt(bal)}</div>
      `;
      li.addEventListener('click', () => openAccountModal(a.id));
      list.appendChild(li);
    });
  }

  function renderCategories() {
    const exp = $('#cats-expense'); const inc = $('#cats-income');
    exp.innerHTML = ''; inc.innerHTML = '';
    state.categories.forEach(c => {
      const color = getCategoryColor(c);
      const li = document.createElement('li');
      li.innerHTML = `
        <span style="display:inline-flex; align-items:center; gap:8px;">
          <span style="width:10px; height:10px; border-radius:50%; background:${color}; display:inline-block; flex-shrink:0;"></span>
          <span style="color:${color}; font-weight:600;">${escapeHtml(c.name)}</span>
        </span>
      `;
      li.addEventListener('click', () => openCategoryModal(c.id));
      (c.type === 'income' ? inc : exp).appendChild(li);
    });
  }

  function renderCategoryBudgets() {
    const list = $('#cats-budget-list');
    list.innerHTML = '';
    
    const now = new Date();
    const currentMonthTxs = state.transactions.filter(t => {
      if (t.type !== 'expense') return false;
      const d = new Date(t.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });

    const expCats = state.categories.filter(c => c.type === 'expense' && c.budget > 0);

    if (expCats.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.style.background = 'transparent'; li.style.border = 'none'; li.style.cursor = 'default';
      li.textContent = 'Лимиты не заданы. Нажмите на категорию, чтобы установить бюджет.';
      list.appendChild(li);
      return;
    }

    expCats.forEach(c => {
      const spent = currentMonthTxs.filter(t => t.categoryId === c.id).reduce((s, t) => s + t.amount, 0);
      const pct = Math.min(100, Math.round((spent / c.budget) * 100));
      const color = getCategoryColor(c);

      let fillStyle = `width:${pct}%; background:${color};`;
      if (pct >= 100) fillStyle = `width:${pct}%; background:var(--expense);`;

      const li = document.createElement('li');
      li.addEventListener('click', () => openCategoryModal(c.id));
      li.innerHTML = `
        <div class="bar-head">
          <span style="display:inline-flex; align-items:center; gap:6px;">
            <span style="width:8px; height:8px; border-radius:50%; background:${color}; display:inline-block; flex-shrink:0;"></span>
            <span style="color:${color}; font-weight:600;">${escapeHtml(c.name)}</span>
          </span>
          <span>${fmt(spent)} / ${fmt(c.budget)} (${pct}%)</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="${fillStyle}"></div></div>
      `;
      list.appendChild(li);
    });
  }

  function renderGoals() {
    const list = $('#goals-list');
    list.innerHTML = '';
    const goals = state.goals || [];
    $('#goals-empty').hidden = goals.length > 0;

    goals.forEach(g => {
      const pct = Math.min(100, Math.round(((g.currentAmount || 0) / (g.targetAmount || 1)) * 100));
      const li = document.createElement('li');
      li.className = 'goal-card';
      li.innerHTML = `
        <div class="goal-header">
          <div class="goal-icon">${SVG_ICONS.goal}</div>
          <div class="goal-info">
            <div class="goal-title">${escapeHtml(g.name)}</div>
            <div class="goal-sub">${fmt(g.currentAmount)} из ${fmt(g.targetAmount)} (${pct}%)</div>
          </div>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="goal-actions">
          <button class="goal-btn deposit-btn">Пополнить / Снять</button>
          <button class="goal-btn edit-btn">Изменить</button>
        </div>
      `;

      li.querySelector('.deposit-btn').addEventListener('click', (e) => {
        e.stopPropagation(); openGoalDepositModal(g.id);
      });
      li.querySelector('.edit-btn').addEventListener('click', (e) => {
        e.stopPropagation(); openGoalModal(g.id);
      });

      list.appendChild(li);
    });
  }

  function renderRecurring() {
    const list = $('#recurring-list');
    list.innerHTML = '';
    const items = state.recurring || [];
    $('#recurring-empty').hidden = items.length > 0;

    items.forEach(r => {
      const cat = categoryById(r.categoryId);
      const periodMap = { month: 'Ежемесячно', week: 'Еженедельно', year: 'Ежегодно' };
      const badgeIcon = SVG_ICONS[r.type] || SVG_ICONS.expense;

      const li = document.createElement('li');
      li.innerHTML = `
        <div class="tx-badge ${r.type}">${badgeIcon}</div>
        <div class="tx-main">
          <div class="tx-title">${escapeHtml(r.title)} (${periodMap[r.period] || r.period})</div>
          <div class="tx-sub">${accountName(r.accountId)} · ${cat?.name || 'Без категории'}</div>
        </div>
        <div class="tx-amount ${r.type}">${r.type === 'income' ? '+' : '−'} ${fmt(r.amount)}</div>
        <button class="primary pay-btn" style="padding:6px 12px; font-size:12px;">Оплатить</button>
      `;

      li.querySelector('.pay-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        state.transactions.push({
          id: uid(),
          amount: r.amount,
          type: r.type,
          accountId: r.accountId,
          categoryId: r.categoryId,
          date: todayISO(),
          note: `Регулярный платеж: ${r.title}`
        });
        save(); render();
        alert(`Проведён платеж «${r.title}» на сумму ${fmt(r.amount)}`);
      });

      li.addEventListener('click', (e) => {
        if (e.target.classList.contains('pay-btn')) return;
        openRecurringModal(r.id);
      });

      list.appendChild(li);
    });
  }

  function formatDate(iso) {
    const d = new Date(iso);
    const today = new Date();
    const yest = new Date(); yest.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Сегодня';
    if (d.toDateString() === yest.toDateString()) return 'Вчера';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function formatFullDate(iso) {
    if (!iso || typeof iso !== 'string' || !iso.includes('-')) {
      iso = todayISO();
    }
    const parts = iso.split('-').map(Number);
    if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
      iso = todayISO();
    }
    const [y, m, d] = iso.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    if (isNaN(dateObj.getTime())) {
      return new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    }
    return dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function generateDailyReportText(targetDateIso, periodType = 'day') {
    let reportDate = targetDateIso || yesterdayISO();
    if (typeof reportDate !== 'string' || !reportDate.includes('-')) {
      reportDate = yesterdayISO();
    }

    try {
      let filteredTxs = [];
      let periodHeader = '';

      const allTxs = Array.isArray(state.transactions) ? state.transactions : [];
      const allAccs = Array.isArray(state.accounts) ? state.accounts : [];

      if (periodType === 'week') {
        const parts = reportDate.split('-').map(Number);
        const endD = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
        const startD = new Date(endD);
        startD.setDate(endD.getDate() - 6);

        const startIso = startD.getFullYear() + '-' + String(startD.getMonth() + 1).padStart(2, '0') + '-' + String(startD.getDate()).padStart(2, '0');
        filteredTxs = allTxs.filter(t => t && t.date >= startIso && t.date <= reportDate);
        periodHeader = `неделю (${formatDate(startIso)} — ${formatDate(reportDate)})`;
      } else if (periodType === 'month') {
        const parts = reportDate.split('-').map(Number);
        const year = parts[0] || new Date().getFullYear();
        const month = parts[1] || (new Date().getMonth() + 1);
        const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
        filteredTxs = allTxs.filter(t => t && t.date && t.date.startsWith(monthPrefix));
        const monthName = new Date(year, month - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
        periodHeader = `месяц (${monthName})`;
      } else {
        filteredTxs = allTxs.filter(t => t && t.date === reportDate);
        periodHeader = `день (${formatFullDate(reportDate)})`;
      }

      const periodInc = filteredTxs.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
      const periodExp = filteredTxs.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);

      // Итого общий баланс ВСЕГДА на текущую дату (на сегодня)
      const totalBalanceToday = allAccs
        .filter(a => a && !a.excludeFromTotal)
        .reduce((s, a) => s + accountBalance(a.id), 0);

      // Все категории расходов за выбранный период (по убыванию суммы)
      const expByCat = {};
      filteredTxs.filter(t => t.type === 'expense').forEach(t => {
        const catKey = t.categoryId || 'no_cat';
        expByCat[catKey] = (expByCat[catKey] || 0) + (t.amount || 0);
      });

      const sortedPairs = Object.entries(expByCat).sort((a, b) => b[1] - a[1]);

      let catText = '';
      if (sortedPairs.length > 0) {
        catText = '\n🔥 Расходы по категориям:\n';
        sortedPairs.forEach(([catId, sum], idx) => {
          const cat = catId === 'no_cat' ? null : categoryById(catId);
          const catName = cat ? stripEmojis(cat.name) : 'Без категории';
          const pct = periodExp > 0 ? Math.round((sum / periodExp) * 100) : 0;
          catText += ` ${idx + 1}. ${catName}: ${fmt(sum)} (${pct}%)\n`;
        });
      }

      // Выбор счетов пользователем для отчета (остатки ВСЕГДА актуальные на сегодня)
      const selectedAccountIds = state.settings?.reportAccountIds;
      const accountsToInclude = allAccs.filter(a => {
        if (Array.isArray(selectedAccountIds) && selectedAccountIds.length > 0) {
          return selectedAccountIds.includes(a.id);
        }
        return !a.excludeFromTotal;
      });

      const accountsText = accountsToInclude.map(a => {
        const curBal = accountBalance(a.id);
        return ` • ${stripEmojis(a.name || 'Счёт')}: ${fmt(curBal)}`;
      }).join('\n');

      const debtAccounts = allAccs.filter(a => calculateAccountDebt(a) > 0);
      let debtText = '';
      if (debtAccounts.length > 0) {
        debtText = '\n⚠️ Долги по счетам (к возврату):\n' + debtAccounts.map(a => {
          const debt = calculateAccountDebt(a);
          return ` • ${stripEmojis(a.name || 'Счёт')}: вернуть ${fmt(debt)} (было ${fmt(a.rememberedBalance)})`;
        }).join('\n') + '\n';
      }

      return `📊 Финансовый отчёт за ${periodHeader}
--------------------------------
➕ Доходы: ${fmt(periodInc)}
➖ Расходы: ${fmt(periodExp)}
${catText}
💳 Остатки по счетам (на сегодня):
${accountsText || ' • Нет выбранных счетов'}
${debtText}💰 Итого общий баланс: ${fmt(totalBalanceToday)}
--------------------------------
Бережём семейный бюджет! 🚀`;
    } catch (e) {
      console.error('Error generating report text:', e);
      return `📊 Финансовый отчёт за день (${formatFullDate(reportDate)})\n--------------------------------\nИтого общий баланс: ${fmt(accountBalanceAsOfDate(null, reportDate))}\nБережём семейный бюджет! 🚀`;
    }
  }

  function sendPushNotification(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
          navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(title, {
              body: body,
              icon: 'icons/icon-192.png',
              badge: 'icons/icon-192.png',
              vibrate: [100, 50, 100],
              data: { url: './' }
            });
          }).catch(() => {
            new Notification(title, { body: body, icon: 'icons/icon-192.png' });
          });
        } else {
          new Notification(title, { body: body, icon: 'icons/icon-192.png' });
        }
      } catch (e) {
        console.warn('Push error:', e);
      }
    }
  }

  // Settings & Messenger Report Modal Controls
  $('#btn-open-messenger-report')?.addEventListener('click', () => openMessengerReportModal());
  $('#btn-open-settings')?.addEventListener('click', () => openModal('#modal-settings'));

  function openMessengerReportModal() {
    const dateInput = $('#report-custom-date');
    if (dateInput && !dateInput.value) dateInput.value = yesterdayISO();

    renderReportAccountSelector();
    updateReportPreview();
    openModal('#modal-messenger-report');
  }

  function renderReportAccountSelector() {
    const container = $('#report-accounts-selector');
    if (!container) return;
    container.innerHTML = '';

    const selectedAccountIds = state.settings?.reportAccountIds || state.accounts.filter(a => !a.excludeFromTotal).map(a => a.id);

    state.accounts.forEach(a => {
      const isChecked = selectedAccountIds.includes(a.id);
      const label = document.createElement('label');
      label.style.cssText = 'display:inline-flex; align-items:center; gap:5px; cursor:pointer; background:rgba(255,255,255,0.05); padding:4px 8px; border-radius:6px; color:var(--text);';
      label.innerHTML = `
        <input type="checkbox" data-acc-id="${a.id}" ${isChecked ? 'checked' : ''} style="margin:0;" />
        <span>${escapeHtml(stripEmojis(a.name))}</span>
      `;
      label.querySelector('input').addEventListener('change', (e) => {
        if (!state.settings) state.settings = {};
        if (!Array.isArray(state.settings.reportAccountIds)) {
          state.settings.reportAccountIds = [...selectedAccountIds];
        }
        if (e.target.checked) {
          if (!state.settings.reportAccountIds.includes(a.id)) {
            state.settings.reportAccountIds.push(a.id);
          }
        } else {
          state.settings.reportAccountIds = state.settings.reportAccountIds.filter(id => id !== a.id);
        }
        save();
        updateReportPreview();
      });
      container.appendChild(label);
    });
  }

  let currentReportPeriod = 'day';

  function updateReportPreview() {
    const preview = $('#report-preview-text');
    const selectedDate = $('#report-custom-date')?.value || yesterdayISO();
    if (preview) {
      preview.textContent = generateDailyReportText(selectedDate, currentReportPeriod);
    }
  }

  $$('.report-period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentReportPeriod = btn.dataset.reportPeriod || 'day';
      $$('.report-period-btn').forEach(b => b.classList.toggle('active', b === btn));
      updateReportPreview();
    });
  });

  $('#report-custom-date')?.addEventListener('change', () => {
    updateReportPreview();
  });

  $('#btn-share-report')?.addEventListener('click', async () => {
    const selectedDate = $('#report-custom-date')?.value || yesterdayISO();
    const text = generateDailyReportText(selectedDate, currentReportPeriod);
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Финансовый отчёт',
          text: text
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          copyReportToClipboard(text);
        }
      }
    } else {
      copyReportToClipboard(text);
    }
  });

  $('#btn-copy-report')?.addEventListener('click', () => {
    const selectedDate = $('#report-custom-date')?.value || yesterdayISO();
    copyReportToClipboard(generateDailyReportText(selectedDate, currentReportPeriod));
  });

  function copyReportToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        alert('📋 Отчёт скопирован в буфер обмена! Перейдите в любой чат и нажмите «Вставить».');
      }).catch(() => {
        fallbackCopyText(text);
      });
    } else {
      fallbackCopyText(text);
    }
  }

  function fallbackCopyText(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    alert('📋 Отчёт скопирован!');
  }

  // ---------- Init ----------
  render();
  ensureFirebaseLoaded();

  // Service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW register failed', err));
    });
  }
})();
