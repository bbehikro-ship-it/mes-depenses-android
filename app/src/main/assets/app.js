const STORAGE_KEY = 'mes-depenses-entries';
const BACKUP_KEY = 'mes-depenses-entries-backup';
const LAST_EXPORT_KEY = 'mes-depenses-last-export';

const formatter = new Intl.NumberFormat('fr-CI', {
  style: 'currency',
  currency: 'XOF',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const monthFormatter = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
});

let entries = loadEntries();

const form = document.getElementById('entryForm');
const dateInput = document.getElementById('date');
const monthPicker = document.getElementById('monthPicker');
const scopeField = document.getElementById('scopeField');
const filterType = document.getElementById('filterType');
const clearAllBtn = document.getElementById('clearAll');
const entriesList = document.getElementById('entriesList');
const emptyState = document.getElementById('emptyState');
const incomeFamilialEl = document.getElementById('incomeFamilial');
const expenseFamilialEl = document.getElementById('expenseFamilial');
const balanceFamilialEl = document.getElementById('balanceFamilial');
const incomePersonalEl = document.getElementById('incomePersonal');
const expensePersonalEl = document.getElementById('expensePersonal');
const balancePersonalEl = document.getElementById('balancePersonal');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importInput = document.getElementById('importInput');
const dataMessage = document.getElementById('dataMessage');
const storageBanner = document.getElementById('storageBanner');
const exportReminder = document.getElementById('exportReminder');

// === Initialisation des champs date ===
const today = new Date();
const todayISO = today.toISOString().split('T')[0];
const currentMonthISO = todayISO.slice(0, 7); // YYYY-MM

dateInput.value = todayISO;
monthPicker.value = currentMonthISO;

// === Onglets ===
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// === Changement de mois ===
monthPicker.addEventListener('change', render);

// === Soumission du formulaire ===
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const type = form.querySelector('input[name="type"]:checked').value;
  const scope = form.querySelector('input[name="scope"]:checked').value;
  const description = document.getElementById('description').value.trim();
  const category = document.getElementById('category').value;
  const amount = parseFloat(document.getElementById('amount').value);
  const date = dateInput.value;

  if (!description || isNaN(amount) || amount <= 0) return;

  entries.push({
    id: Date.now().toString(),
    type,
    scope,
    description,
    category,
    amount,
    date,
  });

  saveEntries();
  render();
  form.reset();
  dateInput.value = todayISO;
  document.querySelector('input[name="type"][value="income"]').checked = true;
  document.querySelector('input[name="scope"][value="familiale"]').checked = true;
});

filterType.addEventListener('change', renderList);

clearAllBtn.addEventListener('click', () => {
  if (entries.length === 0) return;
  if (confirm('Voulez-vous vraiment effacer TOUTES les entrées (tous mois confondus) ?')) {
    entries = [];
    saveEntries();
    render();
  }
});

entriesList.addEventListener('click', (e) => {
  const btn = e.target.closest('.delete-btn');
  if (!btn) return;
  const id = btn.dataset.id;
  entries = entries.filter((entry) => entry.id !== id);
  saveEntries();
  render();
});

// === EXPORT ===
exportBtn.addEventListener('click', () => {
  if (entries.length === 0) {
    showMessage('Aucune donnée à exporter.', 'error');
    return;
  }
  const payload = {
    app: 'Mes Dépenses',
    version: 2,
    exportedAt: new Date().toISOString(),
    entries,
  };
  const jsonStr = JSON.stringify(payload, null, 2);
  const filename = `mes-depenses-${todayISO}.json`;

  // Application native Android : sauvegarde via le pont natif
  if (window.AndroidApp && typeof window.AndroidApp.saveBackup === 'function') {
    try {
      const result = window.AndroidApp.saveBackup(filename, jsonStr);
      localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
      checkExportReminder();
      showMessage(result || `${entries.length} entrée(s) exportée(s).`, 'success');
    } catch (e) {
      showMessage('Erreur lors de la sauvegarde du fichier.', 'error');
    }
    return;
  }

  // Version web : téléchargement via le navigateur
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
  checkExportReminder();
  showMessage(`${entries.length} entrée(s) exportée(s).`, 'success');
});

// === IMPORT ===
importBtn.addEventListener('click', () => importInput.click());

importInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      const imported = Array.isArray(data) ? data : data.entries;
      if (!Array.isArray(imported)) throw new Error('Format invalide');

      const valid = imported.filter(
        (it) =>
          it &&
          typeof it.description === 'string' &&
          typeof it.amount === 'number' &&
          (it.type === 'income' || it.type === 'expense') &&
          typeof it.date === 'string'
      );
      if (valid.length === 0) throw new Error('Aucune entrée valide trouvée');

      const choice = confirm(
        `${valid.length} entrée(s) trouvée(s) dans le fichier.\n\n` +
        `OK = AJOUTER aux données existantes (${entries.length})\n` +
        `Annuler = REMPLACER toutes les données existantes`
      );

      const mapped = valid.map((it) => normalizeEntry(it));

      if (choice) {
        const existingIds = new Set(entries.map((e) => e.id));
        const newOnes = mapped.filter((it) => !existingIds.has(it.id));
        entries = entries.concat(newOnes);
        showMessage(`${newOnes.length} nouvelle(s) entrée(s) ajoutée(s).`, 'success');
      } else {
        entries = mapped;
        showMessage(`${entries.length} entrée(s) importée(s) (remplacement).`, 'success');
      }

      saveEntries();
      render();
    } catch (err) {
      showMessage('Fichier invalide : ' + err.message, 'error');
    } finally {
      importInput.value = '';
    }
  };
  reader.onerror = () => showMessage('Erreur de lecture du fichier.', 'error');
  reader.readAsText(file);
});

function normalizeEntry(it) {
  return {
    id: it.id || Date.now().toString() + Math.random(),
    type: it.type,
    // scope obligatoire pour TOUS les types maintenant (revenus + dépenses)
    scope:
      it.scope === 'familiale' || it.scope === 'personnelle'
        ? it.scope
        : 'personnelle', // valeur par défaut pour anciennes données
    description: it.description,
    category: it.category || 'Général',
    amount: it.amount,
    date: it.date,
  };
}

function showMessage(text, type) {
  dataMessage.textContent = text;
  dataMessage.className = 'data-message ' + (type || '');
  setTimeout(() => {
    dataMessage.textContent = '';
    dataMessage.className = 'data-message';
  }, 5000);
}

function readArrayFromKey(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function loadEntries() {
  let data = readArrayFromKey(STORAGE_KEY);
  const backup = readArrayFromKey(BACKUP_KEY);
  // Filet de sécurité : si la clé principale est illisible ou vide
  // mais que la sauvegarde interne contient des données, on restaure.
  if ((!data || data.length === 0) && backup && backup.length > 0) {
    data = backup;
  }
  if (!data) data = [];
  // Compatibilité : garantir un scope valide sur chaque entrée
  return data.map((e) => ({
    ...e,
    scope:
      e.scope === 'familiale' || e.scope === 'personnelle'
        ? e.scope
        : 'personnelle',
  }));
}

function saveEntries() {
  try {
    const json = JSON.stringify(entries);
    // Double écriture : clé principale + clé de sauvegarde interne
    localStorage.setItem(STORAGE_KEY, json);
    localStorage.setItem(BACKUP_KEY, json);
  } catch (err) {
    showMessage("Erreur d'enregistrement : la mémoire du téléphone est peut-être pleine.", 'error');
  }
}

function getSelectedMonthEntries() {
  const month = monthPicker.value; // YYYY-MM
  return entries.filter((e) => e.date.startsWith(month));
}

function render() {
  renderTotals();
  renderList();
  checkExportReminder();
}

function renderTotals() {
  const monthEntries = getSelectedMonthEntries();

  const sum = (filter) =>
    monthEntries.filter(filter).reduce((s, e) => s + e.amount, 0);

  const incomeFamilial = sum((e) => e.type === 'income' && e.scope === 'familiale');
  const expenseFamilial = sum((e) => e.type === 'expense' && e.scope === 'familiale');
  const balanceFamilial = incomeFamilial - expenseFamilial;

  const incomePersonal = sum((e) => e.type === 'income' && e.scope === 'personnelle');
  const expensePersonal = sum((e) => e.type === 'expense' && e.scope === 'personnelle');
  const balancePersonal = incomePersonal - expensePersonal;

  incomeFamilialEl.textContent = formatter.format(incomeFamilial);
  expenseFamilialEl.textContent = formatter.format(expenseFamilial);
  balanceFamilialEl.textContent = formatter.format(balanceFamilial);
  balanceFamilialEl.style.color = balanceFamilial >= 0 ? '#4ade80' : '#fca5a5';

  incomePersonalEl.textContent = formatter.format(incomePersonal);
  expensePersonalEl.textContent = formatter.format(expensePersonal);
  balancePersonalEl.textContent = formatter.format(balancePersonal);
  balancePersonalEl.style.color = balancePersonal >= 0 ? '#4ade80' : '#fca5a5';
}

function renderList() {
  const filter = filterType.value;
  const monthEntries = getSelectedMonthEntries();

  const filtered = monthEntries
    .filter((e) => {
      if (filter === 'all') return true;
      if (filter === 'familiale') return e.scope === 'familiale';
      if (filter === 'personnelle') return e.scope === 'personnelle';
      if (filter === 'income-familiale') return e.type === 'income' && e.scope === 'familiale';
      if (filter === 'income-personnelle') return e.type === 'income' && e.scope === 'personnelle';
      if (filter === 'expense-familiale') return e.type === 'expense' && e.scope === 'familiale';
      if (filter === 'expense-personnelle') return e.type === 'expense' && e.scope === 'personnelle';
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  entriesList.innerHTML = '';
  emptyState.classList.toggle('hidden', filtered.length > 0);

  const monthLabel = monthFormatter.format(new Date(monthPicker.value + '-01'));
  emptyState.textContent = `Aucune entrée pour ${monthLabel}.`;

  filtered.forEach((entry) => {
    const li = document.createElement('li');
    li.className = 'entry ' + entry.type + ' ' + entry.scope;
    const sign = entry.type === 'income' ? '+' : '-';
    const formattedDate = dateFormatter.format(new Date(entry.date));
    const badge =
      entry.scope === 'familiale'
        ? '<span class="badge badge-familial">👪 Familial</span>'
        : '<span class="badge badge-personal">👤 Personnel</span>';
    li.innerHTML = `
      <div class="entry-info">
        <div class="entry-desc"></div>
        <div class="entry-meta"></div>
        ${badge}
      </div>
      <div class="entry-amount">${sign} ${formatter.format(entry.amount)}</div>
      <button class="delete-btn" data-id="${entry.id}" aria-label="Supprimer">×</button>
    `;
    li.querySelector('.entry-desc').textContent = entry.description;
    li.querySelector('.entry-meta').textContent = `${entry.category} · ${formattedDate}`;
    entriesList.appendChild(li);
  });
}

render();

// === Bannière d'état du stockage ===
function showBanner(el, kind, text) {
  el.textContent = text;
  el.className = 'storage-banner ' + kind;
}

async function checkStorageStatus() {
  // Application native Android : stockage déjà protégé et indépendant de Chrome
  if (window.AndroidApp) {
    showBanner(
      storageBanner,
      'ok',
      "✅ Application native : vos données sont enregistrées en sécurité, indépendamment de Chrome."
    );
    return;
  }
  if (!navigator.storage || !navigator.storage.persist) {
    showBanner(
      storageBanner,
      'warn',
      "⚠️ Ce navigateur ne garantit pas la conservation des données. Exportez régulièrement vos données."
    );
    return;
  }
  try {
    let persisted = await navigator.storage.persisted();
    if (!persisted) persisted = await navigator.storage.persist();
    if (persisted) {
      showBanner(
        storageBanner,
        'ok',
        "✅ Stockage protégé : vos données ne seront pas effacées automatiquement."
      );
    } else {
      showBanner(
        storageBanner,
        'warn',
        "⚠️ Stockage NON protégé. Installez l'application sur l'écran d'accueil (menu Chrome → « Installer l'application ») puis exportez vos données régulièrement."
      );
    }
  } catch {
    showBanner(
      storageBanner,
      'warn',
      "⚠️ Impossible de vérifier la protection du stockage. Exportez régulièrement vos données."
    );
  }
}

// === Rappel de sauvegarde ===
function checkExportReminder() {
  if (entries.length === 0) {
    exportReminder.className = 'storage-banner hidden';
    return;
  }
  const last = localStorage.getItem(LAST_EXPORT_KEY);
  if (!last) {
    showBanner(
      exportReminder,
      'warn',
      "💾 Vous n'avez jamais sauvegardé en fichier. Onglet Historique → « Exporter » pour protéger vos données."
    );
    return;
  }
  const days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
  if (days >= 7) {
    showBanner(
      exportReminder,
      'warn',
      `💾 Dernière sauvegarde il y a ${days} jour(s). Pensez à exporter vos données (onglet Historique).`
    );
  } else {
    exportReminder.className = 'storage-banner hidden';
  }
}

checkStorageStatus();
checkExportReminder();

// Enregistrer le service worker pour le mode hors ligne
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
