(function () {
  'use strict';
  const requestForm = document.querySelector('#request-form');
  const passwordForm = document.querySelector('#password-form');
  const message = document.querySelector('#message');
  const heading = document.querySelector('#heading');
  const params = new URLSearchParams(location.hash.slice(1));
  let recovery = false;
  if (!window.supabase) {
    message.textContent = 'Connection unavailable. Check your internet connection and refresh.';
    requestForm.hidden = true;
    return;
  }
  const client = window.supabase.createClient(window.HPL_CONFIG.url, window.HPL_CONFIG.key);
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' && session) {
      recovery = true;
      history.replaceState(null, '', location.pathname);
      heading.textContent = 'Choose your league password';
      message.textContent = 'Your recovery link is verified. Enter your new password below.';
      requestForm.hidden = true;
      passwordForm.hidden = false;
    }
  });
  if (params.has('error')) {
    history.replaceState(null, '', location.pathname);
    message.textContent = 'This email link is invalid, expired, or already used. Request a fresh link below and open only the newest email.';
  }
  requestForm.onsubmit = async event => {
    event.preventDefault();
    const button = requestForm.querySelector('button');
    button.disabled = true;
    try {
      const { error } = await client.auth.resetPasswordForEmail(requestForm.elements.email.value.trim(), {
        redirectTo: new URL('reset.html', location.href).href.split('#')[0].split('?')[0]
      });
      if (error) throw error;
      message.textContent = 'If this email belongs to an account, a setup link has been sent. Check your inbox and spam folder. Open the newest email once, in your regular browser.';
    } catch (error) {
      message.textContent = error.message || 'Could not request the email. Please try again.';
    } finally { button.disabled = false; }
  };
  passwordForm.onsubmit = async event => {
    event.preventDefault();
    if (!recovery) { message.textContent = 'Request a new recovery link first.'; return; }
    const password = passwordForm.elements.password.value;
    if (password !== passwordForm.elements.confirm.value) {
      message.textContent = 'The two passwords do not match.';
      return;
    }
    const button = passwordForm.querySelector('button');
    button.disabled = true;
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      passwordForm.reset();
      passwordForm.hidden = true;
      recovery = false;
      await client.auth.signOut();
      heading.textContent = 'Password saved';
      message.textContent = 'Return to the league website, click Admin Mode, and sign in with your email and new password.';
    } catch (error) {
      message.textContent = error.message || 'Could not save your password. Request a fresh recovery link if needed.';
      button.disabled = false;
    }
  };
})();
