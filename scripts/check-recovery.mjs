import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function checkRecovery(root) {
  const nodes = Object.fromEntries(['request-form','password-form','message','heading'].map(id => [id, {
    hidden: id === 'password-form', textContent: '', elements: {}, button: { disabled: false },
    querySelector() { return this.button; }, reset() { this.elements = {}; }
  }]));
  nodes['request-form'].elements.email = { value: 'admin@example.com' };
  let listener, redirect, updates = 0, signouts = 0;
  const client = { auth: {
    onAuthStateChange(callback) { listener = callback; },
    async resetPasswordForEmail(email, options) { redirect = options.redirectTo; return {}; },
    async updateUser() { updates++; return {}; },
    async signOut() { signouts++; return {}; }
  } };
  const context = {
    document: { querySelector: selector => nodes[selector.slice(1)] },
    location: { hash: '#error=access_denied&error_code=otp_expired', pathname: '/Helshoogte-Premier-League/reset.html', href: 'https://example.com/Helshoogte-Premier-League/reset.html#error=access_denied' },
    history: { replaceState() {} }, URL, URLSearchParams,
    window: { HPL_CONFIG: { url: 'test', key: 'test' }, supabase: { createClient: () => client } }
  };
  vm.runInNewContext(await fs.readFile(`${root}/site/reset.js`, 'utf8'), context);
  assert.match(nodes.message.textContent, /invalid, expired/);
  await nodes['request-form'].onsubmit({ preventDefault() {} });
  assert.equal(redirect, 'https://example.com/Helshoogte-Premier-League/reset.html');
  listener('INITIAL_SESSION', { user: {} });
  assert.equal(nodes['password-form'].hidden, true, 'An ordinary session does not activate password recovery');
  listener('PASSWORD_RECOVERY', { user: {} });
  assert.equal(nodes['password-form'].hidden, false);
  nodes['password-form'].elements = { password: { value: 'dummy-test-value' }, confirm: { value: 'different' } };
  await nodes['password-form'].onsubmit({ preventDefault() {} });
  assert.equal(updates, 0, 'Mismatched passwords must not be submitted');
  nodes['password-form'].elements.confirm.value = 'dummy-test-value';
  await nodes['password-form'].onsubmit({ preventDefault() {} });
  assert.equal(updates, 1);
  assert.equal(signouts, 1);
  assert.equal(nodes.heading.textContent, 'Password saved');
  console.log('PASS: expired links, exact recovery redirect, recovery session gate, matching passwords, sign-out after reset.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await checkRecovery(fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, ''));
}
