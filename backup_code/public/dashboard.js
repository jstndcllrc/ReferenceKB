const { csrf: CSRF, isRoot: IS_ROOT } = window.KB_CONFIG;
const $ = selector => document.querySelector(selector);
const PAGE_SIZE = 20;
const pages = { users: 1, proposals: 1, knowledge: 1, feedback: 1 };
const totals = { users: 0, proposals: 0, knowledge: 0, feedback: 0 };
let data = {
  stats: {},
  users: [],
  proposals: [],
  entries: [],
  feedback: [],
  category_rules: [],
  reference_images: [],
  accuracy_tests: [],
  accuracy_metrics: {},
};

function esc(value = '') {
  const node = document.createElement('div');
  node.textContent = value ?? '';
  return node.innerHTML;
}

async function api(url, options = {}) {
  options.headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF, ...options.headers };
  const response = await fetch(url, options);
  const payload = await response.json();
  if (response.status === 401) location.href = '/login';
  if (!response.ok) throw new Error(payload.error || 'Request failed.');
  return payload;
}

function toast(message) {
  const status = $('#status');
  status.textContent = message;
  status.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => status.classList.remove('show'), 2500);
}

function matches(object, query) {
  return !query || Object.values(object).some(value => String(value ?? '').toLowerCase().includes(query));
}

function filtered(items) {
  const query = $('#admin-search').value.trim().toLowerCase();
  return items.filter(item => matches(item, query));
}

function pageItems(items, key) {
  const totalPages = Math.max(1, Math.ceil(totals[key] / PAGE_SIZE));
  pages[key] = Math.min(pages[key], totalPages);
  return { items, totalPages };
}

function renderPager(id, key, count, totalPages) {
  const host = $(id);
  if (!host) return;
  host.className = 'pager';
  host.innerHTML = count <= PAGE_SIZE
    ? ''
    : `<button class="secondary page-prev" ${pages[key] === 1 ? 'disabled' : ''}>Previous</button><span>Page ${pages[key]} of ${totalPages} - ${count} records</span><button class="secondary page-next" ${pages[key] === totalPages ? 'disabled' : ''}>Next</button>`;
  host.querySelector('.page-prev')?.addEventListener('click', async () => {
    pages[key]--;
    await loadResource(key);
    renderAll();
  });
  host.querySelector('.page-next')?.addEventListener('click', async () => {
    pages[key]++;
    await loadResource(key);
    renderAll();
  });
}

function privilege(account) {
  return account.is_root ? 'Root / Developer' : account.role === 'admin' ? 'Admin / Manager-Supervisor' : 'User';
}

function canEdit(account) {
  return !account.is_root || (IS_ROOT && account.is_root);
}

const KNOWLEDGE_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8];

function knowledgeField(text, label) {
  const match = String(text || '').match(new RegExp(`(?:${label})\\s*[:：]\\s*([^\\r\\n]+)`, 'iu'));
  return match ? match[1].trim().replace(/^[\\s*|.-]+|[\\s*|.;-]+$/g, '') : '';
}

function parseKnowledgeContent(content = '', sourceUrl = '') {
  const fields = {
    product_id: knowledgeField(content, 'Product\\s+ID'),
    goods_name: knowledgeField(content, 'Goods\\s+Name'),
    leaf_category: knowledgeField(content, 'Leaf\\s+Category'),
    source_url: knowledgeField(content, 'Source\\s+URL') || sourceUrl || '',
  };
  for (const level of KNOWLEDGE_LEVELS) {
    const label = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'][level - 1];
    fields[`category_${level}`] = knowledgeField(content, `${label}[\\s-]*level\\s+Category`);
  }
  return fields;
}

function setKnowledgeFormValue(prefix, fields = {}) {
  $(`#${prefix}-product-id`).value = fields.product_id || '';
  $(`#${prefix}-goods-name`).value = fields.goods_name || '';
  $(`#${prefix}-leaf-category`).value = fields.leaf_category || '';
  $(`#${prefix}-url`).value = fields.source_url || '';
  for (const level of KNOWLEDGE_LEVELS) $(`#${prefix}-category-${level}`).value = fields[`category_${level}`] || '';
  syncKnowledgeHierarchy(prefix);
}

function knowledgePayload(prefix) {
  return {
    product_id: $(`#${prefix}-product-id`).value,
    goods_name: $(`#${prefix}-goods-name`).value,
    leaf_category: $(`#${prefix}-leaf-category`).value,
    source_url: $(`#${prefix}-url`).value,
    ...Object.fromEntries(KNOWLEDGE_LEVELS.map(level => [`category_${level}`, $(`#${prefix}-category-${level}`).value])),
  };
}

function syncKnowledgeHierarchy(prefix) {
  let unlocked = true;
  for (let index = 0; index < KNOWLEDGE_LEVELS.length; index++) {
    const level = KNOWLEDGE_LEVELS[index];
    const input = $(`#${prefix}-category-${level}`);
    if (index === 0) {
      input.disabled = false;
      unlocked = Boolean(input.value.trim());
      continue;
    }
    input.disabled = !unlocked;
    if (!unlocked && input.value) input.value = '';
    unlocked = unlocked && Boolean(input.value.trim());
  }
}

function tabBadge(name, count) {
  const tab = document.querySelector(`.tab[data-tab="${name}"]`);
  if (!tab) return;
  if (!tab.dataset.label) tab.dataset.label = tab.textContent;
  tab.innerHTML = `${esc(tab.dataset.label)}${count ? ` <span class="count-dot">${count}</span>` : ''}`;
}

function profileCell(account) {
  const values = [account.full_name, account.fusion_id, account.outsourcing_id, account.email, account.phone_number];
  const missing = values.filter(value => !String(value || '').trim()).length;
  const row = (label, value, optional = false) => `<div><span>${esc(label)}</span><strong class="${value ? '' : optional ? 'optional' : 'blank'}">${esc(value || (optional ? 'Not provided - optional' : 'Not provided'))}</strong></div>`;
  const summary = missing ? `${missing} required field${missing === 1 ? '' : 's'} missing` : 'Profile complete';
  return `<td class="profile-cell"><details class="profile-summary"><summary class="${missing ? 'missing' : ''}">${esc(summary)}</summary><div class="profile-details">${row('Full name', account.full_name)}${row('Fusion ID', account.fusion_id)}${row('Outsource ID', account.outsourcing_id)}${row('Team Leader', account.team_leader, true)}${row('Email', account.email)}${row('Number', account.phone_number)}${row('Chat name', account.chat_name_mode === 'username' ? 'Username' : 'Display name')}</div></details></td>`;
}

function auditPill(value) {
  const label = value || 'Not set';
  const tone = value === 'Category Accuracy' ? 'good' : value === 'Inaccurate Category' ? 'warn' : 'neutral';
  return `<span class="audit-pill ${tone}">${esc(label)}</span>`;
}

function renderUsers() {
  const all = data.users;
  const paged = pageItems(all, 'users');
  $('#user-list').innerHTML = `<div class="table-shell"><table class="accounts"><thead><tr><th>Status</th><th>Name</th><th>Privilege</th><th>Last active</th><th>Profile information</th><th></th></tr></thead><tbody>${paged.items.map(account => `<tr><td><span class="presence"><span class="dot ${account.online ? 'on' : ''}"></span>${account.online ? 'Online' : 'Offline'}</span></td><td class="person"><strong>${esc(account.display_name || account.username)}</strong><span class="muted">@${esc(account.username)}</span></td><td><span class="badge ${account.is_root ? 'root' : account.role === 'admin' ? 'admin' : ''}">${esc(privilege(account))}</span></td><td class="muted">${account.last_seen ? new Date(Number(account.last_seen)).toLocaleString() : 'Never'}</td>${profileCell(account)}<td><button class="edit-account" data-id="${account.id}" ${canEdit(account) ? '' : 'disabled'}>${canEdit(account) ? 'Edit' : 'Protected'}</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No matching accounts.</td></tr>'}</tbody></table></div>`;
  document.querySelectorAll('.edit-account:not(:disabled)').forEach(button => button.addEventListener('click', () => openAccount(Number(button.dataset.id))));
  renderPager('#users-pages', 'users', totals.users, paged.totalPages);
}

function renderProposals() {
  const all = data.proposals;
  const paged = pageItems(all, 'proposals');
  $('#proposal-list').innerHTML = `<div class="table-shell"><table class="proposal-table"><thead><tr><th>Status</th><th>Suggestion</th><th>Submitted</th><th>Decision and reviewer note</th><th></th></tr></thead><tbody>${paged.items.map(item => `<tr><td><span class="proposal-status ${item.status}">${esc(item.status)}</span></td><td class="proposal-title"><strong>${esc(item.title)}</strong><span class="muted">by @${esc(item.username)}${item.image_count ? ` - ${item.image_count} image${item.image_count === 1 ? '' : 's'}` : ''}</span></td><td class="muted">${esc(item.created_at)}</td><td class="decision-note">${item.status === 'pending' ? '<span class="muted">Awaiting review</span>' : `<strong>${item.status === 'denied' ? 'Denied' : 'Approved'} by ${esc(item.reviewed_by || 'Unknown reviewer')}</strong>${item.reviewed_at ? `<span class="muted">${esc(item.reviewed_at)}</span>` : ''}<p>${esc(item.review_note || 'No reviewer note provided.')}</p>`}</td><td><button class="review-proposal" data-id="${item.id}">${item.status === 'pending' ? 'Review' : 'View'}</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No matching suggestions.</td></tr>'}</tbody></table></div>`;
  document.querySelectorAll('.review-proposal').forEach(button => button.addEventListener('click', () => openProposal(Number(button.dataset.id))));
  renderPager('#proposals-pages', 'proposals', totals.proposals, paged.totalPages);
}

function renderKnowledge() {
  const all = data.entries;
  const paged = pageItems(all, 'knowledge');
  $('#entry-list').innerHTML = `<div class="table-shell"><table class="accounts knowledge-table"><thead><tr><th>Entry</th><th>QA audit</th><th>Last updated</th><th>Source</th><th>Pictures</th><th></th></tr></thead><tbody>${paged.items.map(entry => `<tr><td class="entry-title-cell"><strong>${esc(entry.title)}</strong><span class="muted">by @${esc(entry.created_by || 'unknown')}</span></td><td>${auditPill(entry.qa_audit_result)}</td><td class="muted">${esc(entry.updated_at || entry.created_at || '')}</td><td>${entry.source_url ? `<a href="${esc(entry.source_url)}" target="_blank" rel="noopener">Open source</a>` : '<span class="muted">No URL</span>'}</td><td>${entry.images?.length || 0}</td><td><button class="edit-entry" data-id="${entry.id}">Edit</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No matching entries.</td></tr>'}</tbody></table></div>`;
  document.querySelectorAll('.edit-entry').forEach(button => button.addEventListener('click', () => openEntry(Number(button.dataset.id))));
  renderPager('#knowledge-pages', 'knowledge', totals.knowledge, paged.totalPages);

  const references = filtered(data.reference_images || []);
  $('#reference-editor-list').innerHTML = `<div class="table-shell"><table class="accounts reference-table"><thead><tr><th>Preview</th><th>Reference</th><th>QA audit</th><th>Approved</th><th></th></tr></thead><tbody>${references.map(image => `<tr><td><img src="${image.url}" alt="${esc(image.caption || image.category_name)}" class="reference-thumb-inline"></td><td class="entry-title-cell"><strong>${esc(image.category_name)}</strong><span class="muted">${image.category_id ? `ID ${esc(image.category_id)}` : 'No category ID'}${image.caption ? ` - ${esc(image.caption)}` : ''}</span></td><td>${auditPill(image.qa_audit_result)}</td><td class="muted">${esc(image.created_at || '')}${image.approved_by ? `<br>by @${esc(image.approved_by)}` : ''}</td><td><button class="edit-reference" data-id="${image.id}">Edit</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No matching references.</td></tr>'}</tbody></table></div>`;
  document.querySelectorAll('.edit-reference').forEach(button => button.addEventListener('click', () => openReference(Number(button.dataset.id))));
}

function renderFeedback() {
  const all = data.feedback;
  const paged = pageItems(all, 'feedback');
  $('#feedback-list').innerHTML = paged.items.map(item => `<article class="card"><div class="feedback-meta">#${item.id} - ${esc(item.type)} - ${esc(item.rating || 'unrated')} - ${esc(item.username || 'unknown')} - ${esc(item.created_at)}</div><h3>${esc(item.message)}</h3>${item.expected ? `<p><strong>Expected:</strong> ${esc(item.expected)}</p>` : ''}<details><summary>Captured context</summary><p><strong>Search:</strong> ${esc(item.search_query || '')}</p><pre class="context">${esc(item.ocr_text || '')}</pre></details><div class="actions">${item.promoted_entry_id ? '<span class="profile-complete">Promoted</span>' : `<button class="promote-feedback" data-id="${item.id}">Promote to knowledge</button>`}<button class="danger delete-feedback" data-id="${item.id}">Delete</button></div></article>`).join('') || '<div class="card empty">No matching feedback.</div>';
  document.querySelectorAll('.promote-feedback').forEach(button => button.addEventListener('click', () => openPromotion(Number(button.dataset.id))));
  document.querySelectorAll('.delete-feedback').forEach(button => button.addEventListener('click', () => confirm('Delete this feedback?') && change('/api/admin/feedback', { action: 'delete', id: button.dataset.id }, 'Feedback deleted.')));
  renderPager('#feedback-pages', 'feedback', totals.feedback, paged.totalPages);
}

function renderAccuracy() {
  const metrics = data.accuracy_metrics || {};
  $('#accuracy-score').textContent = metrics.accuracy == null ? '-' : `${metrics.accuracy}%`;
  $('#accuracy-runs').textContent = metrics.runs || 0;
  $('#rule-list').innerHTML = (data.category_rules || []).map(rule => `<form class="card saved-rule" data-id="${rule.id}"><div class="row"><div><label>Category</label><input name="category_name" value="${esc(rule.category_name)}"></div><div><label>ID</label><input name="category_id" value="${esc(rule.category_id)}"></div></div><label>Inclusion</label><textarea name="inclusion_rules">${esc(rule.inclusion_rules)}</textarea><label>Exclusion</label><textarea name="exclusion_rules">${esc(rule.exclusion_rules)}</textarea><div class="actions"><button>Save</button><button type="button" class="danger delete-rule">Delete</button></div></form>`).join('') || '<div class="card empty">No structured rules.</div>';
  document.querySelectorAll('.saved-rule').forEach(form => {
    form.addEventListener('submit', event => {
      event.preventDefault();
      change('/api/admin/category-rules', { action: 'save', id: form.dataset.id, category_name: form.category_name.value, category_id: form.category_id.value, inclusion_rules: form.inclusion_rules.value, exclusion_rules: form.exclusion_rules.value }, 'Rule updated.');
    });
    form.querySelector('.delete-rule').addEventListener('click', () => change('/api/admin/category-rules', { action: 'delete', id: form.dataset.id }, 'Rule deleted.'));
  });
  $('#test-list').innerHTML = (data.accuracy_tests || []).map(item => `<article class="card"><div class="feedback-meta">Expected: ${esc(item.expected_verdict)} - Latest: ${esc(item.latest_actual || 'not run')}</div><h3>${esc(item.name)} ${item.latest_passed == null ? '' : item.latest_passed ? 'OK' : 'Failed'}</h3><pre class="context">${esc(item.input_text)}</pre><div class="actions"><button class="run-test" data-id="${item.id}">Run</button><button class="danger delete-test" data-id="${item.id}">Delete</button></div></article>`).join('') || '<div class="card empty">No gold tests.</div>';
  document.querySelectorAll('.run-test').forEach(button => button.addEventListener('click', () => change('/api/admin/accuracy-tests', { action: 'run', id: button.dataset.id }, 'Test completed.')));
  document.querySelectorAll('.delete-test').forEach(button => button.addEventListener('click', () => change('/api/admin/accuracy-tests', { action: 'delete', id: button.dataset.id }, 'Test deleted.')));
}

function renderAll() {
  $('#registered-count').textContent = data.stats.registered || 0;
  $('#online-count').textContent = data.stats.online || 0;
  tabBadge('users', data.stats.online || 0);
  tabBadge('proposals', data.stats.pending_proposals || 0);
  tabBadge('knowledge', data.stats.knowledge_entries || 0);
  tabBadge('feedback', data.stats.feedback || 0);
  tabBadge('accuracy', (data.accuracy_tests || []).filter(item => item.latest_passed === 0).length);
  renderUsers();
  renderProposals();
  renderKnowledge();
  renderFeedback();
  renderAccuracy();
}

async function load() {
  const summary = await api('/api/admin/data');
  data = { ...data, ...summary };
  await Promise.all(Object.keys(pages).map(loadResource));
  renderAll();
}

async function loadResource(key) {
  const query = $('#admin-search').value.trim();
  const result = await api(`/api/admin/resource?type=${encodeURIComponent(key)}&page=${pages[key]}&limit=${PAGE_SIZE}&q=${encodeURIComponent(query)}`);
  const field = key === 'knowledge' ? 'entries' : key;
  data[field] = result.items;
  totals[key] = result.total;
}

async function change(url, payload, message) {
  try {
    await api(url, { method: 'POST', body: JSON.stringify(payload) });
    toast(message);
    await load();
    return true;
  } catch (error) {
    toast(error.message);
    return false;
  }
}

function openAccount(id) {
  const account = data.users.find(item => item.id === id);
  if (!account || !canEdit(account)) return;
  const values = {
    '#edit-id': account.id,
    '#edit-full-name': account.full_name || account.display_name || '',
    '#edit-display-name': account.display_name || '',
    '#edit-username': account.username,
    '#edit-role': account.role,
    '#edit-fusion-id': account.fusion_id || '',
    '#edit-outsourcing-id': account.outsourcing_id || '',
    '#edit-team-leader': account.team_leader || '',
    '#edit-email': account.email || '',
    '#edit-phone': account.phone_number || '',
    '#edit-chat-name': account.chat_name_mode || 'display',
    '#edit-password': '',
  };
  for (const [selector, value] of Object.entries(values)) $(selector).value = value;
  $('#edit-active').checked = account.active;
  $('#edit-can-chat').checked = account.can_chat;
  $('#edit-can-knowledge').checked = account.can_submit_knowledge;
  $('#edit-can-notepad').checked = account.can_use_notepad;
  const protectedAdmin = !IS_ROOT && account.role === 'admin';
  $('#edit-role').disabled = account.is_root || protectedAdmin;
  for (const selector of ['#edit-active', '#edit-can-chat', '#edit-can-knowledge', '#edit-can-notepad']) $(selector).disabled = account.is_root || protectedAdmin;
  $('#delete-user').hidden = account.is_root || protectedAdmin;
  $('#edit-note').textContent = privilege(account);
  $('#edit-dialog').showModal();
}

function openProposal(id) {
  const item = data.proposals.find(proposal => proposal.id === id);
  if (!item) return;
  const pending = item.status === 'pending';
  $('#proposal-id').value = item.id;
  $('#proposal-title').value = item.title || '';
  $('#proposal-content').value = item.content || '';
  $('#proposal-url').value = item.source_url || '';
  $('#proposal-qa-audit').value = item.qa_audit_result || '';
  $('#proposal-note').value = item.review_note || '';
  $('#proposal-images').innerHTML = item.images?.length ? item.images.map(image => `<a href="${image.url}" target="_blank"><img src="${image.url}" alt="${esc(image.filename)}"></a>`).join('') : '<span class="muted">No images attached.</span>';
  $('#proposal-meta').textContent = `Submitted by ${item.username} on ${item.created_at}${pending ? '' : ` - ${item.status} by ${item.reviewed_by || 'unknown'}`}`;
  for (const selector of ['#proposal-title', '#proposal-content', '#proposal-url', '#proposal-note']) $(selector).disabled = !pending;
  $('#proposal-approve').hidden = !pending;
  $('#proposal-deny').hidden = !pending;
  $('#proposal-dialog').showModal();
}

function openEntry(id = 0) {
  const entry = id ? data.entries.find(item => item.id === id) : null;
  if (id && !entry) return;
  $('#entry-id').value = entry?.id || '';
  $('#entry-dialog-title').textContent = entry ? 'Edit knowledge entry' : 'Add knowledge entry';
  $('#entry-meta').textContent = entry ? `Created by ${entry.created_by || 'unknown'} - Updated ${entry.updated_at || entry.created_at || ''}` : 'Published entries appear immediately in the searchable knowledge base.';
  setKnowledgeFormValue('entry', entry ? parseKnowledgeContent(entry.content, entry.source_url) : {});
  $('#entry-qa-audit').value = entry?.qa_audit_result || '';
  $('#entry-images').innerHTML = entry?.images?.length ? entry.images.map(image => `<a href="${image.url}" target="_blank"><img src="${image.url}" alt="${esc(image.filename)}"></a>`).join('') : '<span class="muted">No pictures uploaded yet.</span>';
  $('#entry-upload-row').hidden = !entry;
  $('#entry-upload-status').textContent = '';
  $('#entry-images-upload').value = '';
  $('#entry-delete').hidden = !entry;
  $('#entry-save').textContent = entry ? 'Save entry' : 'Add entry';
  $('#entry-dialog').showModal();
}

function openReference(id = 0) {
  const reference = id ? (data.reference_images || []).find(item => item.id === id) : null;
  if (id && !reference) return;
  $('#reference-editor-id').value = reference?.id || '';
  $('#reference-dialog-title').textContent = reference ? 'Edit approved reference' : 'Add approved reference';
  $('#reference-meta').textContent = reference ? `Approved by ${reference.approved_by || 'unknown'} - ${reference.created_at || ''}` : 'Approved references support the reviewer accuracy tools and category checks.';
  $('#reference-name').value = reference?.category_name || '';
  $('#reference-id').value = reference?.category_id || '';
  $('#reference-caption').value = reference?.caption || '';
  $('#reference-qa-audit').value = reference?.qa_audit_result || '';
  $('#reference-preview').innerHTML = reference ? `<a href="${reference.url}" target="_blank"><img src="${reference.url}" alt="${esc(reference.caption || reference.category_name)}"></a>` : '<span class="muted">No image uploaded yet.</span>';
  $('#reference-file').value = '';
  $('#reference-file').required = !reference;
  $('#reference-file-note').textContent = reference ? 'Upload a new image only if you want to replace the current one.' : 'Upload one PNG, JPEG, or WebP image.';
  $('#reference-delete').hidden = !reference;
  $('#reference-save').textContent = reference ? 'Save reference' : 'Add reference';
  $('#reference-dialog').showModal();
}

function openPromotion(id) {
  const item = data.feedback.find(feedback => feedback.id === id);
  if (!item) return;
  $('#promote-id').value = id;
  $('#promote-title').value = `Feedback #${id}`;
  $('#promote-content').value = item.expected || item.message;
  $('#promote-dialog').showModal();
}

function fileData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, data: reader.result });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadEntryImages() {
  const entryId = Number($('#entry-id').value || 0);
  const files = [...$('#entry-images-upload').files];
  if (!entryId || !files.length) return;
  if (files.length > 10) {
    toast('Choose up to 10 images at a time.');
    return;
  }
  if (files.some(file => file.size > 5 * 1024 * 1024)) {
    toast('Each image must be 5 MB or smaller.');
    return;
  }
  $('#entry-upload-status').textContent = `${files.length} image${files.length === 1 ? '' : 's'} selected`;
  if (await change('/api/admin/entries', { action: 'add_images', id: entryId, images: await Promise.all(files.map(fileData)) }, 'Images uploaded.')) {
    openEntry(entryId);
  }
}

document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab,.panel').forEach(node => node.classList.remove('active'));
  tab.classList.add('active');
  $(`#${tab.dataset.tab}`).classList.add('active');
  history.replaceState(null, '', `#${tab.dataset.tab}`);
}));

document.querySelectorAll('.dialog-close').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  if (event.target === dialog) dialog.close();
}));
document.querySelectorAll('.password-toggle').forEach(button => button.addEventListener('click', () => {
  const input = document.getElementById(button.dataset.target);
  const shown = input.type === 'text';
  input.type = shown ? 'password' : 'text';
  button.textContent = shown ? 'View' : 'Hide';
}));
for (const level of KNOWLEDGE_LEVELS) {
  $(`#entry-category-${level}`)?.addEventListener('input', () => syncKnowledgeHierarchy('entry'));
}

let searchTimer;
$('#admin-search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    for (const key of Object.keys(pages)) pages[key] = 1;
    await Promise.all(Object.keys(pages).map(loadResource));
    renderAll();
  }, 180);
});

$('#open-add-user').addEventListener('click', () => $('#add-dialog').showModal());
$('#open-add-entry').addEventListener('click', () => openEntry());
$('#open-add-reference').addEventListener('click', () => openReference());
$('#root-reset-open').hidden = IS_ROOT;
$('#root-reset-open').addEventListener('click', () => $('#root-reset-dialog').showModal());

$('#add-user').addEventListener('submit', async event => {
  event.preventDefault();
  if ($('#new-password').value !== $('#new-password-repeat').value) {
    toast('Temporary passwords do not match.');
    $('#new-password-repeat').focus();
    return;
  }
  const payload = {
    action: 'add',
    full_name: $('#new-full-name').value,
    display_name: $('#new-display-name').value,
    username: $('#new-username').value,
    password: $('#new-password').value,
    password_repeat: $('#new-password-repeat').value,
    role: $('#new-role').value,
    fusion_id: $('#new-fusion-id').value,
    outsourcing_id: $('#new-outsourcing-id').value,
    team_leader: $('#new-team-leader').value,
    email: $('#new-email').value,
    phone_number: $('#new-phone').value,
    chat_name_mode: $('#new-chat-name').value,
  };
  if (await change('/api/admin/users', payload, 'Account added.')) {
    event.target.reset();
    $('#add-dialog').close();
  }
});

$('#edit-user').addEventListener('submit', async event => {
  event.preventDefault();
  const payload = {
    action: 'update',
    id: $('#edit-id').value,
    full_name: $('#edit-full-name').value,
    display_name: $('#edit-display-name').value,
    username: $('#edit-username').value,
    password: $('#edit-password').value,
    role: $('#edit-role').value,
    fusion_id: $('#edit-fusion-id').value,
    outsourcing_id: $('#edit-outsourcing-id').value,
    team_leader: $('#edit-team-leader').value,
    email: $('#edit-email').value,
    phone_number: $('#edit-phone').value,
    chat_name_mode: $('#edit-chat-name').value,
    active: $('#edit-active').checked,
    can_chat: $('#edit-can-chat').checked,
    can_submit_knowledge: $('#edit-can-knowledge').checked,
    can_use_notepad: $('#edit-can-notepad').checked,
  };
  if (await change('/api/admin/users', payload, 'Account updated.')) $('#edit-dialog').close();
});

$('#delete-user').addEventListener('click', async () => {
  if (confirm('Delete this account permanently?') && await change('/api/admin/users', { action: 'delete', id: $('#edit-id').value }, 'Account deleted.')) $('#edit-dialog').close();
});

$('#proposal-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (await change('/api/admin/proposals', {
    action: 'approve',
    id: $('#proposal-id').value,
    title: $('#proposal-title').value,
    content: $('#proposal-content').value,
    source_url: $('#proposal-url').value,
    qa_audit_result: $('#proposal-qa-audit').value,
    review_note: $('#proposal-note').value,
  }, 'Knowledge approved; submitter notified.')) $('#proposal-dialog').close();
});

$('#proposal-deny').addEventListener('click', async () => {
  const note = $('#proposal-note').value.trim();
  if (!note) {
    toast('A denial reason is required.');
    $('#proposal-note').focus();
    return;
  }
  if (await change('/api/admin/proposals', { action: 'deny', id: $('#proposal-id').value, review_note: note }, 'Knowledge denied; submitter notified.')) $('#proposal-dialog').close();
});

$('#entry-form').addEventListener('submit', async event => {
  event.preventDefault();
  const entryId = $('#entry-id').value;
  const payload = {
    action: 'save',
    id: entryId || undefined,
    ...knowledgePayload('entry'),
    qa_audit_result: $('#entry-qa-audit').value,
  };
  const message = entryId ? 'Knowledge updated.' : 'Knowledge added.';
  if (await change('/api/admin/entries', payload, message)) $('#entry-dialog').close();
});

$('#entry-delete').addEventListener('click', async () => {
  const entryId = $('#entry-id').value;
  if (!entryId) return;
  if (confirm('Delete this knowledge entry?') && await change('/api/admin/entries', { action: 'delete', id: entryId }, 'Knowledge deleted.')) $('#entry-dialog').close();
});

$('#entry-upload-trigger').addEventListener('click', () => $('#entry-images-upload').click());
$('#entry-images-upload').addEventListener('change', () => uploadEntryImages().catch(error => toast(error.message)));

$('#promote-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (await change('/api/admin/feedback', { action: 'promote', id: $('#promote-id').value, title: $('#promote-title').value, content: $('#promote-content').value }, 'Feedback promoted.')) $('#promote-dialog').close();
});

$('#root-reset-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (await change('/api/admin/users', { action: 'reset_root', secret: $('#root-secret').value, password: $('#root-password').value }, 'Root password reset.')) {
    event.target.reset();
    $('#root-reset-dialog').close();
  }
});

$('#rule-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (await change('/api/admin/category-rules', { action: 'save', category_name: $('#rule-name').value, category_id: $('#rule-id').value, inclusion_rules: $('#rule-include').value, exclusion_rules: $('#rule-exclude').value }, 'Rule added.')) event.target.reset();
});

$('#reference-editor-form').addEventListener('submit', async event => {
  event.preventDefault();
  const referenceId = $('#reference-editor-id').value;
  const file = $('#reference-file').files[0];
  if (!referenceId && !file) {
    toast('Choose an image to upload.');
    $('#reference-file').focus();
    return;
  }
  const payload = {
    action: referenceId ? 'save' : 'add',
    id: referenceId || undefined,
    category_name: $('#reference-name').value,
    category_id: $('#reference-id').value,
    caption: $('#reference-caption').value,
    qa_audit_result: $('#reference-qa-audit').value,
  };
  if (file) payload.image = await fileData(file);
  const message = referenceId ? 'Reference updated.' : 'Reference added.';
  if (await change('/api/admin/reference-images', payload, message)) $('#reference-dialog').close();
});

$('#reference-delete').addEventListener('click', async () => {
  const referenceId = $('#reference-editor-id').value;
  if (!referenceId) return;
  if (confirm('Delete this approved reference?') && await change('/api/admin/reference-images', { action: 'delete', id: referenceId }, 'Reference deleted.')) $('#reference-dialog').close();
});

$('#test-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (await change('/api/admin/accuracy-tests', { action: 'save', name: $('#test-name').value, input_text: $('#test-input').value, expected_verdict: $('#test-expected').value }, 'Gold test saved.')) event.target.reset();
});

$('#run-tests').addEventListener('click', () => change('/api/admin/accuracy-tests', { action: 'run' }, 'All gold tests completed.'));

const requestedTab = location.hash.slice(1);
if (requestedTab) document.querySelector(`.tab[data-tab="${requestedTab}"]`)?.click();
load().catch(error => toast(error.message));
