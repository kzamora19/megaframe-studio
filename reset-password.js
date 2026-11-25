'use strict';
(() => {
  // Standalone account recovery, kept separate from PTG's protected editor
  // and from the browser's encrypted project vault.
  const cfg = window.megaFrameCloudConfig;
  const AUTH = 'https://vmyoxoiygfcecgkbavgg.supabase.co/auth/v1';
  const REDIRECT_TO = 'https://kzamora19.github.io/megaframe-studio/reset-password.html';
  const $ = id => document.getElementById(id);
  const isConfigured = cfg && cfg.url === 'https://vmyoxoiygfcecgkbavgg.supabase.co' &&
    /^sb_publishable_[A-Za-z0-9_-]+$/.test(cfg.key || '');
  let accessToken = null, busy = false;

  function display(section) {
    for (const name of ['request', 'update', 'done']) $(name + '-section').hidden = name !== section;
  }
  function status(text, mode = '') {
    const el = $('reset-status');
    el.textContent = text;
    el.hidden = !text;
    el.className = 'status' + (mode ? ' ' + mode : '');
  }
  function pending(button, value) {
    busy = value;
    $(button).disabled = value;
    $(button).textContent = value
      ? 'Processing…'
      : button === 'request-button' ? 'Send password reset email' : 'Save new password';
  }
  async function authRequest(path, {method = 'GET', body, token} = {}) {
    const headers = {'apikey': cfg.key};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.authorization = 'Bearer ' + token;
    const response = await fetch(AUTH + path, {
      method, headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) {
      const err = new Error('Account recovery request failed.');
      err.status = response.status;
      throw err;
    }
    return response.status === 204 ? {} : response.json();
  }
  function scrubRecoveryUrl() {
    // Fragments can contain bearer tokens; neither they nor OTP hashes may
    // remain in browser history, a copied address, or referer headers.
    history.replaceState(null, '', location.pathname);
  }
  function linkFailure() {
    accessToken = null;
    display('request');
    status('That password recovery link is invalid, expired or already used. Request a fresh email and open only the newest link.', 'error');
  }
  async function finishVerification(data) {
    const token = data?.access_token;
    if (typeof token !== 'string' || !token.length) return linkFailure();
    const currentUser = await authRequest('/user', {token});
    if (!currentUser || typeof currentUser.id !== 'string') return linkFailure();
    accessToken = token; // only in JS memory, never browser storage
    display('update');
    status('Recovery link verified. You can now set a new password.', 'good');
    $('new-password').focus();
  }
  async function begin() {
    // Capture then remove sensitive URL parameters synchronously, before
    // any network call or asynchronous operation.
    const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(location.search.replace(/^\?/, ''));
    const error = query.get('error') || query.get('error_code') ||
      fragment.get('error') || fragment.get('error_code');
    const access = fragment.get('access_token');
    const kind = fragment.get('type') || query.get('type');
    const hash = query.get('token_hash') || fragment.get('token_hash');
    const hasSensitiveInput = Boolean(access || hash || error || query.get('code') || fragment.get('refresh_token'));
    if (hasSensitiveInput) scrubRecoveryUrl();
    if (!isConfigured) {
      status('Account recovery is unavailable because MegaFrame cloud configuration is missing.', 'error');
      $('request-button').disabled = true;
      return;
    }
    if (error) return linkFailure();
    if (access || hash) {
      if (kind !== 'recovery') return linkFailure();
      status('Verifying your secure recovery link…');
      try {
        if (access) await finishVerification({access_token: access});
        else await finishVerification(await authRequest('/verify', {
          method: 'POST', body: {token_hash: hash, type: 'recovery'}
        }));
      } catch { linkFailure(); }
      return;
    }
    if (query.get('code')) return linkFailure();
  }

  $('request-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !isConfigured) return;
    const email = $('account-email').value.trim();
    if (!email || email.length > 254) return;
    pending('request-button', true);
    status('');
    try {
      // Redirect is constant; never allow an arbitrary user-supplied target.
      await authRequest('/recover?redirect_to=' + encodeURIComponent(REDIRECT_TO), {
        method: 'POST', body: {email}
      });
      status('If this email belongs to a MegaFrame account, recovery instructions have been sent. Check your inbox and spam folder; use the newest message.', 'good');
    } catch (err) {
      status(err?.status === 429
        ? 'Too many requests. Try again later.'
        : 'Could not send a reset email. Make sure this page is on the Supabase Auth redirect allowlist, then retry.', 'error');
    } finally {
      pending('request-button', false);
    }
  });

  $('update-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !accessToken) return linkFailure();
    const pass = $('new-password').value;
    const confirm = $('confirm-password').value;
    if (pass.length < 12 || pass.length > 128) {
      status('Use a password between 12 and 128 characters.', 'error');
      return;
    }
    if (pass !== confirm) {
      status('The passwords do not match.', 'error');
      return;
    }
    pending('update-button', true);
    status('');
    try {
      await authRequest('/user', {method: 'PUT', token: accessToken, body: {password: pass}});
      // Clear password fields and token. This page deliberately does not sign
      // users into any application or persist their newly recovered session.
      $('new-password').value = '';
      $('confirm-password').value = '';
      accessToken = null;
      display('done');
      status('Password successfully updated. Return to Branchline and sign in to Shared Templates.', 'good');
    } catch (err) {
      status(err?.status === 401 || err?.status === 403
        ? 'The recovery session expired. Request a fresh reset email.'
        : 'Password update failed. Try a different strong password or request a fresh recovery email.', 'error');
    } finally {
      pending('update-button', false);
    }
  });
  begin().catch(linkFailure);
})();