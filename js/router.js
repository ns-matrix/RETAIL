// router.js — Hash-based routing

const routes = {};
let isRouting = false;

function registerRoute(hash, renderFn) {
  routes[hash] = renderFn;
}

function navigate(hash) {
  if (window.location.hash !== '#' + hash) {
    window.location.hash = hash;
  }
}

function initRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

function handleRoute() {
  if (isRouting) return;
  isRouting = true;

  const hash = window.location.hash.slice(1) || '/';
  const [basePath, ...paramParts] = hash.split('/').filter(Boolean);
  const routeKey = '/' + (basePath || '');

  app.set('currentPage', routeKey);

  if (routes[routeKey]) {
    routes[routeKey](paramParts.join('/'));
  } else if (routes['*']) {
    routes['*']();
  }

  isRouting = false;
}
