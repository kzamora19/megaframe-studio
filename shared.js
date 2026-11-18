'use strict';
(() => {
  const el = id => document.getElementById('mf-' + id);
  const cfg = window.megaFrameCloudConfig;
  const configured = /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(cfg?.url || '') &&
    /^sb_publishable_[A-Za-z0-9_-]+$/.test(cfg?.key || '');
  let session = null, role = '', generation = 0, refreshing, checking, entries = [], busy = false, offset = 0, loaded = false, adminFormOpen = false;
  let activeTab = 'shared', privateEntries = [], privateLoaded = false, memberEntries = [];
  const pageSize = 30;
  const metadata = 'id,name,revision,updated_at';
  // Store only publicly readable published template data; never cache tokens,
  // passwords, roles or authenticated API responses.
  const PUBLIC_CACHE_DB = 'megaframe_shared_public_v1';
  let publicDbPromise, lastFetchOnline = false;
  function publicDb() {
    if (publicDbPromise) return publicDbPromise;
    publicDbPromise = new Promise(resolve => {
      if (!('indexedDB' in window)) return resolve(null);
      try {
        const request = indexedDB.open(PUBLIC_CACHE_DB, 1);
        request.onupgradeneeded = () => {
          for (const name of ['pages', 'details']) {
            if (!request.result.objectStoreNames.contains(name))
              request.result.createObjectStore(name);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
    return publicDbPromise;
  }
  async function publicCacheRead(store, key) {
    const db = await publicDb();
    if (!db) return null;
    return new Promise(resolve => {
      try {
        const request = db.transaction(store, 'readonly').objectStore(store).get(key);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  }
  async function publicCacheWrite(store, key, value) {
    const db = await publicDb();
    if (!db) return;
    await new Promise(resolve => {
      try {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(value, key);
        tx.oncomplete = resolve;
        tx.onerror = resolve;
        tx.onabort = resolve;
      } catch { resolve(); }
    });
  }
  async function publicCacheDelete(store, key) {
    const db = await publicDb();
    if (!db) return;
    await new Promise(resolve => {
      try {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(key);
        tx.oncomplete = resolve;
        tx.onerror = resolve;
        tx.onabort = resolve;
      } catch { resolve(); }
    });
  }
  // Reconcile already opened shared frames whenever another device publishes
  // a newer revision. Keep public artwork only; never persist auth tokens.
  async function reconcileCachedDetails(rows) {
    const stale = [];
    for (const row of rows.slice(0, pageSize)) {
      const old = await publicCacheRead('details', row.id);
      if (old && (old.revision !== row.revision || old.updated_at !== row.updated_at))
        stale.push(row);
    }
    // Sequential bounded network work avoids overloading Supabase and
    // ensures caches never silently overwrite a newer published revision.
    for (const row of stale) {
      if (!navigator.onLine) break;
      try {
        const results = await api('templates', {
          id: 'eq.' + row.id, select: metadata + ',settings,artwork'
        });
        if (!results?.length) {
          await publicCacheDelete('details', row.id);
          continue;
        }
        const latest = results[0];
        checkArtwork(latest.artwork);
        cleanSettings(latest.settings);
        await publicCacheWrite('details', row.id, latest);
      } catch (error) {
        // Preserve a previously opened copy while the connection is unstable.
        // The next successful sync will retry this revision.
        if (error?.status) throw error;
        break;
      }
    }
  }
  function canUseOfflineCopy(err) {
    return !navigator.onLine || (err && !err.status);
  }
  const message = value => { el('message').textContent = value; };
  const isAdmin = () => role === 'admin' && navigator.onLine;
  const canPublish = () => ['admin','editor'].includes(role) && navigator.onLine;
  const signedOut = () => {
    generation++;
    session = null; role = ''; refreshing = null; checking = null;
    adminFormOpen = false; privateEntries = []; privateLoaded = false; memberEntries = []; activeTab = 'shared';
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
    if (!session && !isPublicRead) throw Error('Sign in to use private cloud templates or manage published templates.');
    const g = generation, token = isPublicRead ? undefined : (session ? await access() : undefined);
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
      lastFetchOnline = false;
      try {
        if (!navigator.onLine) throw Error('No network connection.');
        if (session) {
          const memberships = await api('members', { select: 'role', user_id: 'eq.' + session.uid });
          const current = memberships[0]?.role;
          if (!['admin', 'editor', 'viewer', 'staff'].includes(current)) {
            signedOut();
            message('This account cannot manage templates. Public templates remain available.');
          } else role = current;
        } else role = '';
        // Cloud is authoritative whenever online. Only published public metadata is cached.
        entries = await api('templates', { select: metadata, order: 'updated_at.desc,id.asc',
          limit: String(pageSize + 1), offset: String(page) });
        if (!entries.length && offset) offset = 0;
        if (page !== offset) {
          entries = await api('templates', { select: metadata, order: 'updated_at.desc,id.asc',
            limit: String(pageSize + 1), offset: String(offset) });
        }
        await publicCacheWrite('pages', offset, entries);
        await reconcileCachedDetails(entries);
        lastFetchOnline = true;
        loaded = true;
        paint();
        message('Online · shared templates synchronized at ' + new Date().toLocaleTimeString());
      } catch (err) {
        if (!canUseOfflineCopy(err)) throw err;
        const cached = await publicCacheRead('pages', offset);
        if (!cached) {
          entries = [];
          loaded = true;
          paint();
          message('Offline: no saved shared-library page yet. Connect once to browse templates.');
          return;
        }
        entries = cached;
        loaded = true;
        paint();
        message('Offline: showing the last synchronized shared-template list. Previously opened frames are available.');
      }
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
    el('title').textContent = activeTab==='private'?'My private cloud templates':activeTab==='members'?'User management':'Shared templates';
    el('tools').hidden = !configured || activeTab !== 'shared';
    el('private-section').hidden = !configured || activeTab !== 'private';
    el('members-section').hidden = !isAdmin() || activeTab !== 'members';
    el('show-members').hidden = !isAdmin();
    el('show-members').classList.toggle('primary',activeTab==='members');
    el('member-save').disabled = busy;
    el('members-refresh').disabled = busy;
    el('show-shared').classList.toggle('primary',activeTab==='shared');
    el('show-private').classList.toggle('primary',activeTab==='private');
    el('private-save').disabled = busy;
    el('private-refresh').disabled = busy;
    el('private-save').hidden = !session || !['admin','staff','editor'].includes(role);
    el('publish').hidden = !canPublish();
    el('signout').hidden = !session;
    el('signin').disabled = busy;
    el('publish').disabled = busy;
    el('refresh').disabled = busy;
    el('previous').disabled = busy || offset === 0;
    el('next').disabled = busy || entries.length <= pageSize;
    el('page').textContent = 'Page ' + (Math.floor(offset / pageSize) + 1);
    el('identity').textContent = role === 'admin' ? 'Administrator' :
      role === 'editor' ? 'Editor · may publish templates' :
      role === 'viewer' ? 'Viewer · read only' :
      role === 'staff' ? 'Staff · legacy access' :
      'Public library · no sign-in needed';
    el('list').replaceChildren();
    el('private-list').replaceChildren();
    el('members-list').replaceChildren();
    if (isAdmin() && activeTab==='members') {
      if(!memberEntries.length){
        const empty=document.createElement('p');
        empty.className='help';empty.textContent='No approved accounts loaded. Select Refresh accounts.';
        el('members-list').append(empty);
      }
      for(const person of memberEntries){
        const card=document.createElement('article');
        card.className='mfMemberCard';card.setAttribute('role','listitem');
        const description=document.createElement('div');
        const name=document.createElement('strong');
        name.textContent=person.email||'Account';
        const roleLabel=document.createElement('small');
        roleLabel.textContent=' · '+String(person.role||'viewer').toUpperCase();
        description.append(name,roleLabel);
        const actions=document.createElement('div');
        actions.className='mf-row';
        if(person.user_id!==session?.uid){
          actions.append(btn('Edit role',()=>{
            el('member-email').value=person.email||'';
            el('member-role').value=['admin','editor','viewer'].includes(person.role)?person.role:'viewer';
            el('member-email').focus();
          }));
          actions.append(btn('Remove access',()=>run(()=>removeMember(person)),true));
        }else{
          const note=document.createElement('small');note.textContent='Your administrator account · protected';
          actions.append(note);
        }
        card.append(description,actions);
        el('members-list').append(card);
      }
    }
    if (activeTab === 'private') {
      if (!session) {
        const tip = document.createElement('p');
        tip.textContent = 'Sign in with an approved MegaFrame account to access your private cloud templates.';
        el('private-list').append(tip);
      } else if (!privateEntries.length) {
        const tip = document.createElement('p');
        tip.textContent = privateLoaded ? 'No private templates saved yet.' : 'Select Refresh my templates to load your private cloud library.';
        el('private-list').append(tip);
      } else for (const row of privateEntries) {
        const card = document.createElement('article');
        card.className = 'frameLibCard';
        const heading = document.createElement('strong');
        heading.textContent = row.name;
        const timestamp = document.createElement('small');
        timestamp.textContent = 'Updated ' + new Date(row.updated_at).toLocaleString();
        const actions = document.createElement('div');
        actions.className = 'frameLibActions';
        actions.append(btn('Open private frame',()=>run(()=>openPrivate(row))));
        if(['admin','staff','editor'].includes(role))actions.append(
          btn('Rename',()=>run(()=>renamePrivate(row))),
          btn('Replace with current frame',()=>run(()=>savePrivate(row))),
          btn('Delete',()=>run(()=>removePrivate(row)),true)
        );
        card.append(heading,timestamp,actions);
        el('private-list').append(card);
      }
    }
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
      if (canPublish()) actions.append(
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
  function requirePublisher() {
    if (!canPublish()) throw Error('Only an administrator or editor may change published templates.');
  }
  async function openShared(row) {
    const g = generation;
    let t, usedCache = false;
    if (navigator.onLine) {
      try {
        const result = await api('templates', { id: 'eq.' + row.id, select: metadata + ',settings,artwork' });
        if (!result.length) {
          await publicCacheDelete('details', row.id);
          await sync();
          throw Error('This template is no longer available.');
        }
        t = result[0];
      } catch (err) {
        if (!canUseOfflineCopy(err)) throw err;
      }
    }
    if (!t) {
      t = await publicCacheRead('details', row.id);
      usedCache = true;
      if (!t) throw Error('This shared frame is not cached on this device. Open it online once first.');
    }
    const data = checkArtwork(t.artwork), settings = cleanSettings(t.settings);
    const frame = await decodedImage(data);
    if (g !== generation) return;
    if (!usedCache) await publicCacheWrite('details', row.id, t);
    applyTemplate({ id: 'new', sharedSource: true, name: t.name, data, ...settings }, data, frame);
    setMode('map');
    el('dialog').close();
    notify(usedCache ? 'Offline copy opened. Changes to shared templates sync when online.' :
      'Opened cloud frame. Save template makes a local copy; publish it to share your changes.');
  }
  async function mutate(row, method, body) {
    if (!navigator.onLine) throw Error('Connect to the internet to publish or change shared templates.');
    await sync();
    requirePublisher();
    const changes = await api('templates', row
      ? { id: 'eq.' + row.id, revision: 'eq.' + row.revision, select: metadata }
      : { select: metadata }, { method, body, returning: true });
    if (row) await publicCacheDelete('details', row.id);
    await sync();
    if (changes?.length !== 1) throw Error('This template changed on another device. Review the refreshed list and try again.');
  }
  async function saveShared(row) {
    requirePublisher();
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
    requirePublisher();
    const name = await popupAction({ title: 'Rename shared template', message: 'The new name will appear on all devices.', value: row.name, confirmLabel: 'Rename' });
    if (name === null || name === row.name) return;
    await mutate(row, 'PATCH', { name });
    message('Shared template renamed.');
  }
  async function remove(row) {
    requirePublisher();
    if (!await confirmAction('Delete shared template?', 'Permanently remove “' + row.name + '” from the shared library?', 'Delete shared template')) return;
    await mutate(row, 'DELETE');
    message('Shared template deleted.');
  }

  // v2.2: Private cloud frame library uses authenticated owner-only RLS.
  // Never add this data to the public service worker/IndexedDB cache.
  function requirePersonalCloud(write = false) {
    const allowed = write ? ['admin','staff','editor'] : ['admin','staff','editor','viewer'];
    if (!session || !allowed.includes(role) || !navigator.onLine)
      throw Error('Sign in with an approved account and connect to the internet to use private cloud templates.');
  }
  async function loadPrivate() {
    requirePersonalCloud();
    const rows = await api('private_templates', {
      select:metadata,order:'updated_at.desc,id.asc',limit:'100'
    });
    privateEntries=rows;
    privateLoaded=true;
    paint();
  }
  async function openPrivate(row) {
    requirePersonalCloud();
    const rows=await api('private_templates',{id:'eq.'+row.id,select:metadata+',settings,artwork'});
    if (rows.length!==1) throw Error('This private template has been removed or access has changed.');
    const t=rows[0];
    const data=checkArtwork(t.artwork),settings=cleanSettings(t.settings);
    const frame=await decodedImage(data);
    applyTemplate({id:'new',name:t.name,data,...settings,privateSource:true},data,frame);
    setMode('map');
    el('dialog').close();
    notify('Private cloud frame opened. Save a local template copy if you need offline access.');
  }
  async function mutatePrivate(row,method,body) {
    requirePersonalCloud(true);
    const rows=await api('private_templates',row
      ? {id:'eq.'+row.id,revision:'eq.'+row.revision,select:metadata}
      : {select:metadata}, {method,body,returning:true});
    await loadPrivate();
    if (rows?.length!==1) throw Error('This private template was changed on another device. Review your refreshed library and try again.');
  }
  async function savePrivate(row) {
    requirePersonalCloud(true);
    if (!app.template || !app.frame) throw Error('Select or import a frame first.');
    const name=await popupAction({
      title:row?'Replace private cloud template':'Save private cloud template',
      message:'Only approved frame artwork and layout settings will be uploaded to your private account. Imported customer photos stay on this device.',
      value:row?.name||app.template.name.slice(0,140),
      confirmLabel:row?'Replace private template':'Save privately'
    });
    if (name===null) return;
    const settings=cleanSettings(app),artwork=checkArtwork(app.template.data);
    await mutatePrivate(row,row?'PATCH':'POST',
      row?{name,settings,artwork}:{owner_id:session.uid,name,settings,artwork});
    message(row?'Private template replaced.':'Private template saved to your account.');
  }
  async function renamePrivate(row) {
    requirePersonalCloud(true);
    const name=await popupAction({
      title:'Rename private cloud template',message:'Rename this template in your personal cloud library.',
      value:row.name,confirmLabel:'Rename'
    });
    if(name===null||name===row.name)return;
    await mutatePrivate(row,'PATCH',{name});
    message('Private template renamed.');
  }
  async function removePrivate(row) {
    requirePersonalCloud(true);
    if (!await confirmAction('Delete private cloud template?',
      'Permanently delete “'+row.name+'” from your private account? Local copies will not be deleted.',
      'Delete private template')) return;
    await mutatePrivate(row,'DELETE');
    message('Private template deleted.');
  }


  // Administrator-only membership directory, read on demand and never cached on disk.
  async function memberRpc(functionName,body) {
    if(!isAdmin() || !session) throw Error('Administrator sign-in is required to manage accounts.');
    const g=generation,token=await access();
    if(g!==generation)throw Error('Your sign-in session changed.');
    return request('/rest/v1/rpc/'+functionName,{method:'POST',body,token});
  }
  async function loadMembers() {
    const users=await memberRpc('megaframe_list_members',{});
    memberEntries=Array.isArray(users)?users:[];
    paint();
    message('Approved users refreshed.');
  }
  async function assignMember(email,newRole) {
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254)
      throw Error('Enter a valid email address for an existing Supabase Auth account.');
    if(!['admin','editor','viewer'].includes(newRole))
      throw Error('Choose Administrator, Editor, or Viewer.');
    if(newRole==='admin' && !await confirmAction(
      'Grant administrator access?',
      'An administrator can manage all approved members and published templates. Give this access only to a trusted person.',
      'Grant administrator'))return;
    try {
      await memberRpc('megaframe_manage_member',{target_email:email,desired_role:newRole});
    }catch(err){
      if(err.status===400) throw Error('Could not assign role. Check that this user has already been created in Supabase Authentication.');
      if(err.status===401||err.status===403) throw Error('You are not authorized to manage these accounts.');
      throw err;
    }
    el('member-email').value='';
    await loadMembers();
    message('Account role updated. The user can sign in or refresh their library.');
  }
  async function removeMember(person) {
    if(person.user_id===session?.uid)throw Error('You cannot remove your own administrator access.');
    if(!await confirmAction('Remove MegaFrame access?',
      'Remove '+person.email+' from approved application accounts? Their Supabase Authentication login is not deleted.',
      'Remove access'))return;
    await memberRpc('megaframe_manage_member',{target_email:person.email,desired_role:'remove'});
    await loadMembers();
    message('User access removed. Their authentication account was not deleted.');
  }

  el('open').onclick = () => {
    el('dialog').showModal();
    adminFormOpen = false;
    message(configured ? '' : 'Shared templates are not configured. Local editing and templates are available.');
    paint();
    if (configured) run(sync);
  };
  el('close').onclick = () => el('dialog').close();
  el('show-shared').onclick = () => { activeTab='shared';paint();run(sync); };
  el('show-members').onclick = () => {
    if(!isAdmin())return;
    activeTab='members';paint();run(loadMembers);
  };
  el('members-refresh').onclick = () => run(loadMembers);
  el('member-form').onsubmit=event=>{
    event.preventDefault();
    const email=el('member-email').value.trim(),newRole=el('member-role').value;
    run(()=>assignMember(email,newRole));
  };
  el('show-private').onclick = () => {
    activeTab='private'; paint();
    if (session) run(loadPrivate);
    else message('Sign in with an approved account to view your private cloud templates.');
  };
  el('private-save').onclick = () => run(()=>savePrivate(null));
  el('private-refresh').onclick = () => run(loadPrivate);
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
      message(session ? 'Signed in. Shared and private cloud libraries are available.' : 'This account is not approved. Public templates remain available.');
      if (session && activeTab==='private') await loadPrivate();
    });
  };
  el('signout').onclick = async () => {
    const token = session?.access;
    signedOut();
    el('password').value = '';
    message('Signed out. Private cloud information has been cleared from this session. Public templates remain available.');
    if (token) await request('/auth/v1/logout?scope=local', { method: 'POST', token }).catch(() => {});
  };
  el('refresh').onclick = () => run(async () => { offset = 0; await sync(); message(lastFetchOnline ? 'Shared library synchronized.' : 'Showing cached shared templates (offline).'); });
  el('publish').onclick = () => run(() => saveShared(null));
  el('previous').onclick = () => run(async () => { offset = Math.max(0, offset - pageSize); await sync(); });
  el('next').onclick = () => run(async () => { offset += pageSize; await sync(); });
  // Keep shared templates synchronized while the application is open,
  // even when the Shared Templates dialog is closed. Avoid frequent
  // mobile-network requests; opening the dialog always refreshes immediately.
  let nextBackgroundRefresh = 0;
  const background = () => {
    if (!configured || !navigator.onLine || document.hidden || busy || checking) return;
    const now = Date.now();
    if (now < nextBackgroundRefresh) return;
    nextBackgroundRefresh = now + (el('dialog').open ? 30000 : 120000);
    sync().catch(err => {
      if (el('dialog').open) message(err.message);
    });
  };
  window.addEventListener('online', () => {
    nextBackgroundRefresh = 0;
    background();
  });
  document.addEventListener('visibilitychange', background);
  setInterval(background, 30000);
  paint();
  background();
})();
