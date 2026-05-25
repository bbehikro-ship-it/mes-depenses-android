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
const exportPdfFamilialBtn = document.getElementById('exportPdfFamilialBtn');
const exportPdfPersonalBtn = document.getElementById('exportPdfPersonalBtn');
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

// === EXPORT PDF (par budget) ===
exportPdfFamilialBtn.addEventListener('click', () => exportPdf('familiale'));
exportPdfPersonalBtn.addEventListener('click', () => exportPdf('personnelle'));

function exportPdf(scope) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    showMessage('Bibliothèque PDF non chargée.', 'error');
    return;
  }
  const monthEntries = getSelectedMonthEntries().filter((e) => e.scope === scope);
  const scopeLabel = scope === 'familiale' ? 'Budget familial' : 'Budget personnel';
  const scopeShort = scope === 'familiale' ? 'familial' : 'personnel';
  if (monthEntries.length === 0) {
    showMessage('Aucune donnée ' + scopeShort + 'e pour ce mois.', 'error');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const monthLabel = monthFormatter.format(new Date(monthPicker.value + '-01'));

  // === En-tête coloré ===
  doc.setFillColor(15, 118, 110);
  doc.rect(0, 0, pageWidth, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('Mes Dépenses', pageWidth / 2, 14, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(scopeLabel + ' — ' + capitalize(monthLabel), pageWidth / 2, 23, { align: 'center' });

  // === Calculs (scope unique) ===
  const income = monthEntries.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0);
  const expense = monthEntries.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
  const balance = income - expense;

  // === Bloc récapitulatif (pleine largeur) ===
  let y = 40;
  drawBudgetBox(doc, 12, y, pageWidth - 24, 44, scopeLabel, income, expense, balance);
  y += 52;

  // === Titre du tableau ===
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Détail des opérations', 12, y);
  y += 4;

  // === Tableau (5 colonnes, plus aéré) ===
  const sorted = monthEntries.slice().sort(
      (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const rows = sorted.map((e) => [
    dateFormatter.format(new Date(e.date)),
    e.description,
    e.category,
    e.type === 'income' ? 'Revenu' : 'Dépense',
    (e.type === 'income' ? '+ ' : '- ') + formatAmountForPdf(e.amount),
  ]);

  doc.autoTable({
    startY: y,
    head: [['Date', 'Description', 'Catégorie', 'Type', 'Montant']],
    body: rows,
    margin: { left: 12, right: 12 },
    styles: {
      fontSize: 9,
      cellPadding: 2.5,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: { fillColor: [15, 118, 110], textColor: 255, halign: 'left' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 28 },
      2: { cellWidth: 32 },
      3: { cellWidth: 22 },
      4: { halign: 'right', fontStyle: 'bold', cellWidth: 38 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        const isIncome = data.row.raw[3] === 'Revenu';
        data.cell.styles.textColor = isIncome ? [22, 163, 74] : [220, 38, 38];
      }
    },
  });

  // === Pied de page ===
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    const now = new Date().toLocaleString('fr-FR');
    doc.text('Généré le ' + now, 12, pageHeight - 8);
    doc.text('Page ' + i + ' / ' + pageCount, pageWidth - 12, pageHeight - 8, { align: 'right' });
  }

  // === Enregistrement ===
  const filename = `mes-depenses-${scopeShort}-${monthPicker.value}.pdf`;
  if (window.AndroidApp && typeof window.AndroidApp.savePdf === 'function') {
    const blob = doc.output('blob');
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result).split(',')[1];
      try {
        const result = window.AndroidApp.savePdf(filename, base64);
        showMessage(result || 'PDF enregistré dans Téléchargements.', 'success');
      } catch (err) {
        showMessage('Erreur lors de la sauvegarde du PDF.', 'error');
      }
    };
    reader.onerror = () => showMessage('Erreur de conversion du PDF.', 'error');
    reader.readAsDataURL(blob);
  } else {
    doc.save(filename);
    showMessage('PDF téléchargé.', 'success');
  }
}

function drawBudgetBox(doc, x, y, w, h, title, income, expense, balance) {
  // Cadre
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(x, y, w, h, 3, 3, 'FD');
  // Titre
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(title, x + 5, y + 8);
  // Lignes
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text('Revenus', x + 5, y + 18);
  doc.text('Dépenses', x + 5, y + 26);
  doc.text('Solde', x + 5, y + 38);
  // Montants
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(22, 163, 74);
  doc.text(formatAmountForPdf(income), x + w - 5, y + 18, { align: 'right' });
  doc.setTextColor(220, 38, 38);
  doc.text(formatAmountForPdf(expense), x + w - 5, y + 26, { align: 'right' });
  // Séparateur
  doc.setDrawColor(226, 232, 240);
  doc.line(x + 5, y + 30, x + w - 5, y + 30);
  // Solde mis en évidence
  doc.setFontSize(13);
  if (balance >= 0) {
    doc.setTextColor(22, 163, 74);
  } else {
    doc.setTextColor(220, 38, 38);
  }
  doc.text(formatAmountForPdf(balance), x + w - 5, y + 38, { align: 'right' });
}

function formatAmountForPdf(amount) {
  // Formatage manuel pour éviter les caractères qu'Helvetica de jsPDF
  // ne rend pas correctement (espace insécable étroit U+202F produit par
  // Intl.NumberFormat pour XOF).
  const rounded = Math.round(Math.abs(amount)).toString();
  const withSep = rounded.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return withSep + ' CFA';
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

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
