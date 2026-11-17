'use strict';
(() => {
  const el = id => document.getElementById('mf-' + id);
  const cfg = window.megaFrameCloudConfig;
  const configured = /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(cfg?.url || '') &&
    /^sb_publishable_[A-Za-z0-9_-]+$/.test(cfg?.key || '');
  let session = null, role = '', generation = 0, refreshing, checking, entries = [], busy = false, offset = 0, loaded = false, adminFormOpen = false;
  const pageSize = 30;
  const metadata = 'id,name,revision,updated_at';
  const message = value => { el('message').textContent = value; };
  const isAdmin = () => role === 'admin';
  const signedOut = () => {
    generation++;
    session = null; role = ''; refreshing = null; checking = null;
    adminFormOpen = false;
    // Shared artwork is public. Signing out of administrator mode must not
    // remove a frame a customer already opened or erase local photo edits.
    paint();
  };
  async function request(path, { method = 'GET', body, token, returning = false } = {}) {
    const headers = { apikey: cfg.key };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (returning) headers.Prefer = 'return=representation';
    const response = await fetch(cfg.url + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(40000)
    });
    if (!response.ok) {
      const failure = new Error('Shared library request failed (HTTP ' + response.status + ').');
      failure.status = response.status;
      throw failure;
    }
    return response.status === 204 ? null : response.json();
  }
  function setSession(data) {
    if (!data?.access_token || !data.refresh_token || !data.user?.id) throw Error('Sign-in did not return a valid session.');
    session = { access: data.access_token, refresh: data.refresh_token, uid: data.user.id,
      until: Date.now() + Number(data.expires_in || 3600) * 1000 };
  }
  async function access() {
    if (!session) throw Error('Sign in again to use shared templates.');
    if (session.until - Date.now() > 60000) return session.access;
    if (!refreshing) {
      const g = generation;
      refreshing = request('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', body: { refresh_token: session.refresh }
      }).then(data => {
        if (g !== generation) throw Error('The session changed. Try again.');
        setSession(data);
        return session.access;
      }).catch(err => {
        if (g === generation && [400, 401, 403].includes(err.status)) signedOut();
        throw err;
      }).finally(() => { if (g === generation) refreshing = null; });
    }
    return refreshing;
  }
  async function api(table, params, options = {}) {
    const isPublicRead = table === 'templates' && (options.method || 'GET') === 'GET';
    if (!session && !isPublicRead) throw Error('Administrator sign-in is required for this action.');
    const g = generation, token = session ? await access() : undefined;
    if (g !== generation) throw Error('The session changed. Try again.');
    try {
      const result = await request('/rest/v1/megaframe_' + table + '?' + new URLSearchParams(params), { ...options, token });
      if (g !== generation) throw Error('The session changed. Try again.');
      return result;
    } catch (err) {
      if (g === generation && err.status === 401) signedOut();
      throw err;
    }
  }
  async function sync() {
    if (checking) return checking;
    const g = generation, page = offset;
    checking = (async () => {
      if (session) {
        const memberships = await api('members', { select: 'role', user_id: 'eq.' + session.uid });
        const current = memberships[0]?.role;
        if (!['admin', 'staff'].includes(current)) {
          signedOut();
          message('This account cannot manage templates. Public templates remain available.');
        } else role = current;
      } else role = '';
      // Published templates are readable under the Supabase anon role.
      // No email/password or account registration is required for browsing.
      entries = await api('templates', { select: metadata, order: 'updated_at.desc,id.asc',
        limit: String(pageSize + 1), offset: String(page) });
      if (!entries.length && offset) offset = 0;
      if (page !== offset) {
        entries = await api('templates', { select: metadata, order: 'updated_at.desc,id.asc',
          limit: String(pageSize + 1), offset: String(offset) });
      }
      loaded = true;
      paint();
    })().finally(() => { if (g === generation) checking = null; });
    return checking;
  }
  function btn(label, handler, danger = false) {
    const node = document.createElement('button');
    node.type = 'button'; node.className = 'btn small' + (danger ? ' libraryDelete' : '');
    node.textContent = label; node.disabled = busy; node.onclick = handler;
    return node;
  }
  function paint() {
    el('form').hidden = !configured || !!session || !adminFormOpen;
    el('admin-toggle').hidden = !configured || !!session;
    el('tools').hidden = !configured;
    el('publish').hidden = !isAdmin();
    el('signout').hidden = !session;
    el('signin').disabled = busy;
    el('publish').disabled = busy;
    el('refresh').disabled = busy;
    el('previous').disabled = busy || offset === 0;
    el('next').disabled = busy || entries.length <= pageSize;
    el('page').textContent = 'Page ' + (Math.floor(offset / pageSize) + 1);
    el('identity').textContent = role === 'admin' ? 'Administrator' : role === 'staff' ? 'Staff · read only' : 'Public library · no sign-in needed';
    el('list').replaceChildren();
    if (!configured) return;
    if (!entries.length) {
      const empty = document.createElement('p');
      empty.textContent = loaded ? 'No shared templates yet.' : 'Loading published frames…';
      el('list').append(empty);
    }
    for (const row of entries.slice(0, pageSize)) {
      const card = document.createElement('article');
      card.className = 'frameLibCard';
      const name = document.createElement('strong');
      name.textContent = row.name;
      const updated = document.createElement('small');
      updated.textContent = 'Updated ' + new Date(row.updated_at).toLocaleString();
      const actions = document.createElement('div');
      actions.className = 'frameLibActions';
      actions.append(btn('Open frame', () => run(() => openShared(row))));
      if (isAdmin()) actions.append(
        btn('Rename', () => run(() => rename(row))),
        btn('Replace with current frame', () => run(() => saveShared(row))),
        btn('Delete', () => run(() => remove(row)), true)
      );
      card.append(name, updated, actions);
      el('list').append(card);
    }
  }
  async function run(task) {
    if (busy) return;
    busy = true; message(''); paint();
    try { await task(); } catch (err) { message(err.message || 'The shared library could not complete this action.'); }
    finally { busy = false; paint(); }
  }
  const bounded = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 100000;
  function cleanSettings(source) {
    function shape(value) {
      if (typeof value?.type !== 'string' || !/^[a-z-]{1,24}$/.test(value.type) ||
          !Array.isArray(value.points) || value.points.length > 128 ||
          (value.type === 'none' ? value.points.length !== 0 : value.points.length < 3) ||
          !value.points.every(p => bounded(p?.x) && bounded(p?.y))) throw Error('Invalid frame opening.');
      return { type: value.type, points: value.points.map(({ x, y }) => ({ x, y })) };
    }
    const { rect, appearance, collage } = source;
    if (!rect || ![rect.x, rect.y, rect.w, rect.h].every(bounded) || rect.w < 1 || rect.h < 1)
      throw Error('Invalid frame coordinates.');
    const color = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
    if (!color(appearance?.borderColor) || !color(appearance?.openingFill) ||
        !bounded(appearance.borderWidth) || appearance.borderWidth < 0 || appearance.borderWidth > 30 ||
        typeof appearance.replaceOpening !== 'boolean') throw Error('Invalid frame appearance.');
    if (!Number.isInteger(collage?.count) || collage.count < 1 || collage.count > 9 ||
        ![...$('collageLayout').options].some(o => o.value === collage.layout) ||
        !bounded(collage.gap) || collage.gap < 0 || collage.gap > 5) throw Error('Invalid collage layout.');
    return { rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h }, shape: shape(source.shape),
      frameOpening: shape(source.frameOpening), appearance: { borderColor: appearance.borderColor,
        openingFill: appearance.openingFill, borderWidth: appearance.borderWidth, replaceOpening: appearance.replaceOpening },
      collage: { count: collage.count, layout: collage.layout, gap: collage.gap } };
  }
  function checkArtwork(artwork) {
    if (typeof artwork !== 'string' || artwork.length > 12 * 1024 * 1024 ||
        !/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/]+={0,2}$/i.test(artwork))
      throw Error('Shared artwork must be a JPG, PNG or WebP under 9 MB.');
    return artwork;
  }
  function requireAdmin() {
    if (!isAdmin()) throw Error('Only an administrator can change shared templates.');
  }
  async function openShared(row) {
    const g = generation;
    const result = await api('templates', { id: 'eq.' + row.id, select: metadata + ',settings,artwork' });
    if (!result.length) { await sync(); throw Error('This template is no longer available.'); }
    const t = result[0], data = checkArtwork(t.artwork), settings = cleanSettings(t.settings);
    const frame = await decodedImage(data);
    if (g !== generation) return;
    applyTemplate({ id: 'new', sharedSource: true, name: t.name, data, ...settings }, data, frame);
    setMode('map');
    el('dialog').close();
    notify('Opened shared frame. Save template makes a local copy.');
  }
  async function mutate(row, method, body) {
    await sync();
    requireAdmin();
    const changes = await api('templates', row
      ? { id: 'eq.' + row.id, revision: 'eq.' + row.revision, select: metadata }
      : { select: metadata }, { method, body, returning: true });
    await sync();
    if (changes?.length !== 1) throw Error('This template changed on another device. Review the refreshed list and try again.');
  }
  async function saveShared(row) {
    requireAdmin();
    if (!app.template || !app.frame) throw Error('Open or import a frame first.');
    // This payload is built only from the template artwork and frame settings.
    const artwork = checkArtwork(app.template.data), settings = cleanSettings(app);
    const name = await popupAction({ title: row ? 'Replace shared template' : 'Publish shared template',
      message: (row ? 'Replace “' + row.name + '” across devices? ' : '') +
        'Use only approved frame artwork. Everyone with library access can open it. The photo queue stays on this device.',
      value: row?.name || app.template.name.slice(0, 140), confirmLabel: row ? 'Replace shared template' : 'Publish template' });
    if (name === null) return;
    await mutate(row, row ? 'PATCH' : 'POST', { name, artwork, settings });
    message(row ? 'Shared template replaced.' : 'Template published to the shared library.');
  }
  async function rename(row) {
    requireAdmin();
    const name = await popupAction({ title: 'Rename shared template', message: 'The new name will appear on all devices.', value: row.name, confirmLabel: 'Rename' });
    if (name === null || name === row.name) return;
    await mutate(row, 'PATCH', { name });
    message('Shared template renamed.');
  }
  async function remove(row) {
    requireAdmin();
    if (!await confirmAction('Delete shared template?', 'Permanently remove “' + row.name + '” from the shared library?', 'Delete shared template')) return;
    await mutate(row, 'DELETE');
    message('Shared template deleted.');
  }
  el('open').onclick = () => {
    el('dialog').showModal();
    adminFormOpen = false;
    message(configured ? '' : 'Shared templates are not configured. Local editing and templates are available.');
    paint();
    if (configured) run(sync);
  };
  el('close').onclick = () => el('dialog').close();
  el('admin-toggle').onclick = () => { adminFormOpen = !adminFormOpen; paint(); };
  el('form').onsubmit = event => {
    event.preventDefault();
    const email = el('email').value.trim(), password = el('password').value;
    el('password').value = '';
    run(async () => {
      try {
        setSession(await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }));
      } catch (err) {
        if (err.status === 400 || err.status === 401) throw Error('Sign-in failed. Check your email and password.');
        throw err;
      }
      adminFormOpen = false;
      await sync();
      message(session ? 'Administrator signed in. Shared library synchronized.' : 'Account not authorized for administration. Public templates remain available.');
    });
  };
  el('signout').onclick = async () => {
    const token = session?.access;
    signedOut();
    el('password').value = '';
    message('Administrator signed out. Public templates are still available.');
    if (token) await request('/auth/v1/logout?scope=local', { method: 'POST', token }).catch(() => {});
  };
  el('refresh').onclick = () => run(async () => { offset = 0; await sync(); message('Shared library synchronized.'); });
  el('publish').onclick = () => run(() => saveShared(null));
  el('previous').onclick = () => run(async () => { offset = Math.max(0, offset - pageSize); await sync(); });
  el('next').onclick = () => run(async () => { offset += pageSize; await sync(); });
  const background = () => {
    if (configured && el('dialog').open && !busy && !document.hidden) sync().catch(err => message(err.message));
  };
  window.addEventListener('online', background);
  document.addEventListener('visibilitychange', background);
  setInterval(background, 20000);
  paint();
})();
