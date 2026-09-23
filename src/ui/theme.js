let systemMediaListener = null;
let cachedMediaQueryList = null;

function applyTheme(normalizedTheme) {
  if (normalizedTheme === 'auto') {
    const isDark = globalThis.matchMedia && globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', normalizedTheme);
  }
}

export async function initTheme(db) {
  let savedTheme = 'auto';
  if (db && typeof db.getSetting === 'function') {
    try {
      savedTheme = await db.getSetting('theme') || 'auto';
    } catch (e) {
      console.warn('[Theme] Failed to load theme setting from db', e);
    }
  }

  applyTheme(savedTheme);

  if (globalThis.matchMedia) {
    if (systemMediaListener && cachedMediaQueryList) {
      cachedMediaQueryList.removeEventListener('change', systemMediaListener);
    }
    if (!cachedMediaQueryList) {
      cachedMediaQueryList = globalThis.matchMedia('(prefers-color-scheme: dark)');
    }
    systemMediaListener = (e) => {
      // Re-fetch current setting in case it's auto
      if (db && typeof db.getSetting === 'function') {
         db.getSetting('theme').then((theme) => {
           if ((theme || 'auto') === 'auto') {
             applyTheme('auto');
           }
         });
      } else {
         applyTheme('auto');
      }
    };
    cachedMediaQueryList.addEventListener('change', systemMediaListener);
  }
  return savedTheme;
}

export async function setTheme(themeName, db) {
  const normalized = ['light', 'dark', 'auto'].includes(themeName) ? themeName : 'auto';
  if (db && typeof db.setSetting === 'function') {
    try {
      await db.setSetting('theme', normalized);
    } catch(e) {
      console.warn('[Theme] Failed to save theme setting', e);
    }
  }
  applyTheme(normalized);
  return normalized;
}
