/**
 * LocalJam - Hash-Based Client Router
 * 100% immune to GitHub Pages 404 subpath errors.
 */

import { escapeHtml } from '../utils/sanitize.js';

export class Router {
  constructor(routes = {}) {
    this.routes = routes;
    this.currentRoute = '';
    this.contentContainer = null;
    this.handleRouteChange = this.handleRouteChange.bind(this);
  }

  init(containerElement) {
    this.contentContainer = containerElement;
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', this.handleRouteChange);
      window.addEventListener('load', this.handleRouteChange);
      this.handleRouteChange();
    }
  }

  registerRoute(hash, renderFunction) {
    const cleanHash = hash.replace(/^[#/]+/, '');
    this.routes[cleanHash] = renderFunction;
  }

  navigate(hash) {
    if (typeof window !== 'undefined') {
      window.location.hash = hash.startsWith('#') ? hash : `#/${hash.replace(/^[#/]+/, '')}`;
    }
  }

  async handleRouteChange() {
    if (typeof window === 'undefined') return;

    let hash = window.location.hash.replace(/^[#/]+/, '').trim();
    if (!hash || hash === '') hash = 'home';

    const [routePath, queryString] = hash.split('?');
    const params = new URLSearchParams(queryString || '');

    this.currentRoute = routePath;

    // Update active nav links in sidebar and mobile nav
    document.querySelectorAll('.nav-link').forEach((link) => {
      const linkHash = link.getAttribute('href')?.replace(/^#\/?/, '').trim();
      if (linkHash === routePath) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      } else {
        link.classList.remove('active');
        link.removeAttribute('aria-current');
      }
    });

    const renderView = this.routes[routePath] || this.routes['home'] || this.routes['*'];

    if (this.contentContainer && typeof renderView === 'function') {
      try {
        this.contentContainer.innerHTML = '';
        const viewElement = await renderView(params);
        if (viewElement instanceof HTMLElement) {
          this.contentContainer.appendChild(viewElement);
        } else if (typeof viewElement === 'string') {
          this.contentContainer.innerHTML = viewElement;
        }

        // Announce route change to assistive technology
        const liveRegion = document.getElementById('aria-live-region');
        if (liveRegion) {
          liveRegion.textContent = `Navigated to ${routePath.charAt(0).toUpperCase() + routePath.slice(1)}`;
        }
      } catch (err) {
        console.error(`[Router] Error rendering route ${routePath}: ${err?.message}`);
        this.contentContainer.innerHTML = `
          <div style="padding: 40px; text-align: center;">
            <h2>Unable to load page</h2>
            <p style="color: var(--text-secondary); margin-top: 8px;">${escapeHtml(err?.message || 'An unexpected error occurred')}</p>
          </div>
        `;
      }
    }
  }

  destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('hashchange', this.handleRouteChange);
      window.removeEventListener('load', this.handleRouteChange);
    }
  }
}

export const router = new Router();
