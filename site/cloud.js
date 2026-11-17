(function () {
  'use strict';
  const app = window.HPL;
  const status = document.createElement('div');
  status.id = 'connection-status';
  status.setAttribute('role', 'status');
  document.querySelector('main').prepend(status);
  const report = (text, error = false) => {
    status.textContent = text;
    status.classList.toggle('error', error);
  };
  app.cloudReady = false;
  app.isAdmin = false;
  app.saving = false;
  let revision = null;
  let confirmed = structuredClone(app.data);
  function valid(data) {
    return data && typeof data.leagueName === 'string' && typeof data.season === 'string' &&
      ['teams', 'players', 'fixtures', 'news'].every(key => Array.isArray(data[key]));
  }
  app.validateBackup = valid;
  if (!window.supabase) {
    report('Could not load the connection library. Check your internet connection and refresh. Editing is disabled.', true);
    app.save = async () => false;
    app.cloud = null;
    return;
  }
  const client = window.supabase.createClient(window.HPL_CONFIG.url, window.HPL_CONFIG.key);
  app.cloud = client;
  app.uploadImage = async function (blob) {
    if (!blob || !app.isAdmin || !app.cloudReady) throw new Error('Sign in before uploading a photo.');
    const name = `${crypto.randomUUID()}.jpg`;
    const { error } = await client.storage.from('hpl-media').upload(name, blob, {
      contentType: 'image/jpeg', upsert: false
    });
    if (error) throw new Error('Photo upload failed: ' + error.message);
    return client.storage.from('hpl-media').getPublicUrl(name).data.publicUrl;
  };
  app.loadCloud = async function () {
    if (app.saving) return false;
    report('Loading official league records…');
    try {
      const { data, error } = await client.rpc('get_league');
      if (error) throw error;
      if (!valid(data?.data)) throw new Error('Database setup is incomplete.');
      revision = data.revision;
      // An empty fresh database uses the existing team names and local logo assets.
      app.data = data.data;
      for (const team of app.data.teams) { if (!team.logo) { const originalTeam=window.HPL_SEED.teams.find(t=>t.name===team.name); if(originalTeam) team.logo=originalTeam.logo; } }
      confirmed = structuredClone(app.data);
      app.cloudReady = true;
      app.render();
      report('Official league records loaded. Refresh to see new results.');
      return true;
    } catch (error) {
      app.cloudReady = false;
      report('Official records unavailable. Showing the initial team setup only; editing is disabled. Please retry by refreshing.', true);
      console.warn('League load failed:', error.message);
      return false;
    }
  };
  app.save = async function () {
    if (!app.cloudReady || !app.isAdmin || app.saving) {
      app.toast('Cannot save. Sign in as admin and load the official records first.');
      return false;
    }
    app.saving = true;
    const panel = document.querySelector('#admin-panel');
    panel.inert = true;
    report('Saving changes… Please keep this page open.');
    try {
      const { data, error } = await client.rpc('save_league', {
        league: app.data,
        expected_revision: revision
      });
      if (error) throw error;
      revision = data;
      confirmed = structuredClone(app.data);
      app.render();
      report('Changes saved to the league database.');
      return true;
    } catch (error) {
      app.data = structuredClone(confirmed);
      app.render();
      // A response can be lost after the server commits. Never retry blindly.
      app.cloudReady = false;
      report('Save was not confirmed. Refresh to load the official records before editing again. Your form is still visible.', true);
      app.toast(error.message?.includes('changed') ? 'Records changed in another session. Refresh before editing again.' : 'Save not confirmed. Refresh before trying again.');
      return false;
    } finally {
      app.saving = false;
      panel.inert = false;
    }
  };
  app.ready = app.loadCloud();
  window.addEventListener('beforeunload', event => {
    if (app.saving) { event.preventDefault(); event.returnValue = ''; }
  });
})();
