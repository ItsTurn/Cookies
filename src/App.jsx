import { useEffect, useMemo, useState } from 'react';
import { SITE_CONFIG } from './siteConfig.js';

const ADMIN_WORKER_URL = 'https://admin-panel.alexshirakawa.workers.dev';
const ADMIN_CREDENTIALS_KEY = 'bakery-admin-credentials';
const ADMIN_PANEL_STORAGE_KEY = 'bakery-admin-panel';
const DEFAULT_ADMIN_TABS = [
  {
    id: 'admin-orders',
    label: 'Orders',
    content: '',
    placeholder: 'Customer orders, pickup times, paid status, and special requests.',
  },
  {
    id: 'admin-recipes',
    label: 'Potential Recipes',
    content: '',
    placeholder: 'Ideas to test, ingredient notes, costing, and seasonal specials.',
  },
  {
    id: 'admin-notes',
    label: 'Note Board',
    content: '',
    placeholder: "Reminders for the team, supplier notes, prep lists, and tomorrow's priorities.",
  },
];
const LEGACY_ADMIN_PANEL_FIELDS = {
  'admin-orders': 'orders',
  'admin-recipes': 'recipes',
  'admin-notes': 'notes',
};
const EMPTY_MENU = {
  businessName: '',
  orderPhone: '',
  adminTabs: DEFAULT_ADMIN_TABS,
  categories: [],
};

function getSessionValue(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function setSessionValue(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // The login still works for the current render; saving may ask again if storage is blocked.
  }
}

function removeSessionValue(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Nothing to clear when browser storage is unavailable.
  }
}

function getStoredAdminPanel() {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_PANEL_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function isAdminPath() {
  return window.location.pathname.replace(/\/+$/, '').endsWith('/admin');
}

function getAppHomePath() {
  const pathname = window.location.pathname.replace(/\/+$/, '');

  if (pathname.endsWith('/admin')) {
    return `${pathname.slice(0, -'/admin'.length) || '/'}/`;
  }

  return './';
}

function createId(value) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return `${slug || 'item'}-${Date.now().toString(36)}`;
}

function normalizeAdminTabs(tabs) {
  const legacyPanel = getStoredAdminPanel();
  const sourceTabs = Array.isArray(tabs) && tabs.length ? tabs : DEFAULT_ADMIN_TABS;

  return sourceTabs.map((tab) => ({
    id: tab.id || createId(tab.label || 'admin-tab'),
    label: tab.label || 'Admin Tab',
    content: tab.content ?? legacyPanel[LEGACY_ADMIN_PANEL_FIELDS[tab.id]] ?? '',
    placeholder: tab.placeholder || 'Add private admin notes here.',
  }));
}

function normalizeMenu(menu = {}) {
  return {
    ...EMPTY_MENU,
    ...menu,
    businessName: SITE_CONFIG.bakeryName || menu.businessName,
    adminTabs: normalizeAdminTabs(menu.adminTabs),
    categories: (menu.categories ?? []).map((category) => ({
      published: true,
      type: category.type || 'menu',
      ...category,
      items: category.items ?? [],
    })),
  };
}

function App() {
  const [menu, setMenu] = useState(() => normalizeMenu());
  const [isLoadingMenu, setIsLoadingMenu] = useState(true);
  const [activeTabId, setActiveTabId] = useState(() => (isAdminPath() ? 'admin' : 'order-now'));
  const [isAdminRoute, setIsAdminRoute] = useState(isAdminPath);
  const [adminSession, setAdminSession] = useState(
    () => Boolean(getSessionValue(ADMIN_CREDENTIALS_KEY)),
  );
  const [adminForm, setAdminForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSavingMenu, setIsSavingMenu] = useState(false);
  const [menuStatus, setMenuStatus] = useState('');
  const [selectedAdminTabId, setSelectedAdminTabId] = useState(DEFAULT_ADMIN_TABS[0].id);
  const [dragTarget, setDragTarget] = useState(null);

  const siteName = menu.businessName || SITE_CONFIG.bakeryName;
  const orderTab = useMemo(
    () => ({
      id: 'order-now',
      label: SITE_CONFIG.orderTabLabel,
    }),
    [],
  );

  useEffect(() => {
    document.title = SITE_CONFIG.pageTitle || `${siteName} Menu`;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', SITE_CONFIG.metaDescription);
  }, [siteName]);

  useEffect(() => {
    async function loadMenu() {
      setIsLoadingMenu(true);

      try {
        const response = await fetch(`${ADMIN_WORKER_URL}/menu`);
        const result = await response.json();

        if (!response.ok || !result.ok || !result.menu) {
          throw new Error(result.error || 'Unable to load the menu');
        }

        setMenu(normalizeMenu(result.menu));
        setMenuStatus('');
      } catch (error) {
        setMenuStatus(error.message || 'Unable to load the menu from Cloudflare.');
      } finally {
        setIsLoadingMenu(false);
      }
    }

    loadMenu();
  }, []);

  useEffect(() => {
    function syncRoute() {
      setIsAdminRoute(isAdminPath());
    }

    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  useEffect(() => {
    const validAdminIds = [
      'site-settings',
      ...menu.adminTabs.map((tab) => tab.id),
      ...menu.categories.map((category) => category.id),
    ];

    if (!validAdminIds.includes(selectedAdminTabId)) {
      setSelectedAdminTabId(menu.adminTabs[0]?.id ?? menu.categories[0]?.id ?? '');
    }
  }, [menu.adminTabs, menu.categories, selectedAdminTabId]);

  useEffect(() => {
    if (isAdminRoute) {
      setActiveTabId('admin');
    } else if (activeTabId === 'admin') {
      setActiveTabId(
        menu.categories.find((category) => category.published !== false)?.id ?? orderTab.id,
      );
    }
  }, [activeTabId, isAdminRoute, menu.categories, orderTab.id]);

  useEffect(() => {
    if (isAdminRoute) {
      return;
    }

    const validTabIds = [
      ...menu.categories
        .filter((category) => category.published !== false)
        .map((category) => category.id),
      orderTab.id,
      'admin',
    ];

    if (!validTabIds.includes(activeTabId)) {
      setActiveTabId(
        menu.categories.find((category) => category.published !== false)?.id ?? orderTab.id,
      );
    }
  }, [activeTabId, isAdminRoute, menu.categories, orderTab.id]);

  const customerTabs = [
    ...menu.categories.filter((category) => category.published !== false),
    orderTab,
  ];
  const activeCategory = menu.categories.find((category) => category.id === activeTabId);
  const isOrderTab = activeTabId === orderTab.id;
  const isAdminTab = activeTabId === 'admin';
  const selectedAdminNoteTab = menu.adminTabs.find((tab) => tab.id === selectedAdminTabId);
  const selectedAdminCategory = menu.categories.find((category) => category.id === selectedAdminTabId);

  function openAdminMenu() {
    window.history.pushState({}, '', `${getAppHomePath().replace(/\/?$/, '/')}admin`);
    setIsAdminRoute(true);
    setActiveTabId('admin');
    document.getElementById('menu')?.scrollIntoView();
  }

  function showCustomerTab(tabId) {
    if (isAdminPath()) {
      window.history.pushState({}, '', getAppHomePath());
      setIsAdminRoute(false);
    }

    setActiveTabId(tabId);
  }

  async function handleAdminLogin(event) {
    event.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');

    try {
      const response = await fetch(`${ADMIN_WORKER_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(adminForm),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Invalid username or password');
      }

      setSessionValue(
        ADMIN_CREDENTIALS_KEY,
        btoa(`${adminForm.username}:${adminForm.password}`),
      );
      setAdminSession(true);
      setAdminForm({ username: '', password: '' });
      setMenuStatus('Signed in. Menu changes can now be saved.');
    } catch (error) {
      setLoginError(
        error instanceof TypeError
          ? 'Unable to reach the admin login. Check that the Worker allows requests from this website.'
          : error.message,
      );
    } finally {
      setIsLoggingIn(false);
    }
  }

  function handleAdminLogout() {
    removeSessionValue(ADMIN_CREDENTIALS_KEY);
    setAdminSession(false);
    setMenuStatus('');
  }

  function updateMenuDraft(updater) {
    setMenu((currentMenu) => updater(currentMenu));
    setMenuStatus('Unsaved changes.');
  }

  async function saveMenu(nextMenu = menu) {
    const credentials = getSessionValue(ADMIN_CREDENTIALS_KEY);

    if (!credentials) {
      setMenuStatus('Sign in before saving menu changes.');
      return;
    }

    setIsSavingMenu(true);
    setMenuStatus('Saving menu...');

    try {
      const response = await fetch(`${ADMIN_WORKER_URL}/admin/menu`, {
        method: 'PUT',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ menu: nextMenu }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Unable to save the menu');
      }

      setMenu(normalizeMenu(result.menu));
      setMenuStatus('Menu saved to Cloudflare.');
    } catch (error) {
      setMenuStatus(error.message);
    } finally {
      setIsSavingMenu(false);
    }
  }

  function updateSiteField(field, value) {
    updateMenuDraft((currentMenu) => ({
      ...currentMenu,
      [field]: value,
    }));
  }

  function updateCategory(categoryId, field, value) {
    updateMenuDraft((currentMenu) => ({
      ...currentMenu,
      categories: currentMenu.categories.map((category) =>
        category.id === categoryId ? { ...category, [field]: value } : category,
      ),
    }));
  }

  function addCategory(type = 'menu') {
    const category = {
      id: createId(type === 'promotion' ? 'new-promo-tab' : 'new-menu-tab'),
      label: type === 'promotion' ? 'New Promotion' : 'New Tab',
      published: false,
      type,
      items: [],
    };

    updateMenuDraft((currentMenu) => ({
      ...currentMenu,
      categories: [...currentMenu.categories, category],
    }));
    setSelectedAdminTabId(category.id);
  }

  function removeCategory(categoryId) {
    updateMenuDraft((currentMenu) => {
      const categories = currentMenu.categories.filter((category) => category.id !== categoryId);
      const nextActiveTabId = categories[0]?.id ?? orderTab.id;

      if (activeTabId === categoryId) {
        setActiveTabId(nextActiveTabId);
      }

      return {
        ...currentMenu,
        categories,
      };
    });
  }

  function addAdminTab() {
    const tab = {
      id: createId('admin-tab'),
      label: 'New Admin Tab',
      content: '',
      placeholder: 'Add private admin notes here.',
    };

    updateMenuDraft((currentMenu) => ({
      ...currentMenu,
      adminTabs: [...currentMenu.adminTabs, tab],
    }));
    setSelectedAdminTabId(tab.id);
  }

  function updateAdminTab(tabId, field, value) {
    updateMenuDraft((currentMenu) => ({
      ...currentMenu,
      adminTabs: currentMenu.adminTabs.map((tab) =>
        tab.id === tabId ? { ...tab, [field]: value } : tab,
      ),
    }));
  }

  function removeAdminTab(tabId) {
    updateMenuDraft((currentMenu) => ({
      ...currentMenu,
      adminTabs: currentMenu.adminTabs.filter((tab) => tab.id !== tabId),
    }));
  }

  function addItem(categoryId) {
    const category = menu.categories.find((currentCategory) => currentCategory.id === categoryId);
    const isPromotion = category?.type === 'promotion';
    const item = isPromotion
      ? {
          id: createId('new-promotion'),
          title: 'New Promotion',
          description: 'Add promotion text here.',
          photo: '',
        }
      : {
          id: createId('new-bake'),
          title: 'New Bake',
          description: 'Add a short description for this menu item.',
          price: '$0.00',
          photo:
            'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80',
          photoAlt: 'Fresh baked goods on a bakery table',
        };

    updateMenuDraft((currentMenu) => ({
      ...currentMenu,
      categories: currentMenu.categories.map((currentCategory) =>
        currentCategory.id === categoryId
          ? {
              ...currentCategory,
              items: [...currentCategory.items, item],
            }
          : currentCategory,
      ),
    }));
  }

  function updateItem(categoryId, itemId, field, value) {
    updateMenuDraft((currentMenu) => ({
      ...currentMenu,
      categories: currentMenu.categories.map((category) =>
        category.id === categoryId
          ? {
              ...category,
              items: category.items.map((item) =>
                item.id === itemId ? { ...item, [field]: value } : item,
              ),
            }
          : category,
      ),
    }));
  }

  function removeItem(categoryId, itemId) {
    updateMenuDraft((currentMenu) => ({
      ...currentMenu,
      categories: currentMenu.categories.map((category) =>
        category.id === categoryId
          ? {
              ...category,
              items: category.items.filter((item) => item.id !== itemId),
            }
          : category,
      ),
    }));
  }

  function moveItem(categoryId, fromIndex, toIndex) {
    if (fromIndex === toIndex) {
      return;
    }

    updateMenuDraft((currentMenu) => ({
      ...currentMenu,
      categories: currentMenu.categories.map((category) => {
        if (category.id !== categoryId) {
          return category;
        }

        const items = [...category.items];
        const [movedItem] = items.splice(fromIndex, 1);
        items.splice(toIndex, 0, movedItem);
        return { ...category, items };
      }),
    }));
  }

  function moveCategory(fromIndex, toIndex) {
    if (fromIndex === toIndex) {
      return;
    }

    updateMenuDraft((currentMenu) => {
      const categories = [...currentMenu.categories];
      const [movedCategory] = categories.splice(fromIndex, 1);
      categories.splice(toIndex, 0, movedCategory);
      return { ...currentMenu, categories };
    });
  }

  function moveAdminTab(fromIndex, toIndex) {
    if (fromIndex === toIndex) {
      return;
    }

    updateMenuDraft((currentMenu) => {
      const adminTabs = [...currentMenu.adminTabs];
      const [movedTab] = adminTabs.splice(fromIndex, 1);
      adminTabs.splice(toIndex, 0, movedTab);
      return { ...currentMenu, adminTabs };
    });
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label={`${siteName} home`}>
          {siteName}
        </a>
        <nav aria-label="Menu categories">
          {customerTabs.map((tab) => (
            <a
              className={`nav-link ${tab.type === 'promotion' ? 'is-promotion' : ''} ${
                activeTabId === tab.id ? 'is-active' : ''
              }`}
              href="#menu"
              key={tab.id}
              onClick={(event) => {
                event.preventDefault();
                showCustomerTab(tab.id);
                document.getElementById('menu')?.scrollIntoView();
              }}
            >
              {tab.label}
            </a>
          ))}
        </nav>
      </header>

      <button
        aria-label="Open admin menu"
        className="secret-admin-button"
        type="button"
        onClick={openAdminMenu}
      />

      <section className="hero" id="top" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">{SITE_CONFIG.heroEyebrow}</p>
          <h1 id="hero-title">{SITE_CONFIG.heroTitle}</h1>
          <p>{SITE_CONFIG.heroCopy}</p>
          <a className="hero-action" href="#menu">
            {SITE_CONFIG.heroAction}
          </a>
        </div>
      </section>

      <section className="menu-section" id="menu" aria-labelledby="menu-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{SITE_CONFIG.menuEyebrow}</p>
            <h2 id="menu-title">
              {isAdminTab ? 'Admin Menu' : isOrderTab ? orderTab.label : activeCategory?.label}
            </h2>
          </div>
          <p>
            {isAdminTab
              ? 'Sign in to manage site settings, admin tabs, menu tabs, and bakery items.'
              : isOrderTab
                ? 'Fresh bakes are made in small batches. A quick text is the easiest way to reserve yours.'
                : activeCategory?.type === 'promotion'
                  ? 'Seasonal notes, limited specials, and bakery announcements.'
                  : 'Choose a single warm bake, build a box, or save a few for the walk home.'}
          </p>
        </div>

        <div className="tabs" role="tablist" aria-label="Bakery menu">
          {customerTabs.map((tab) => (
            <button
              className={`tab ${tab.type === 'promotion' ? 'is-promotion' : ''} ${
                activeTabId === tab.id ? 'is-active' : ''
              }`}
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTabId === tab.id}
              onClick={() => showCustomerTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="tab-content" key={activeTabId}>
          {isLoadingMenu && !isAdminTab ? (
            <div className="order-panel">
              <p className="eyebrow">Loading</p>
              <h3>Getting today's menu</h3>
              <p>Fresh bakes are coming from Cloudflare.</p>
            </div>
          ) : isAdminTab ? (
            <AdminPanel
              adminForm={adminForm}
              adminSession={adminSession}
              dragTarget={dragTarget}
              isLoggingIn={isLoggingIn}
              isSavingMenu={isSavingMenu}
              loginError={loginError}
              menu={menu}
              menuStatus={menuStatus}
              selectedAdminCategory={selectedAdminCategory}
              selectedAdminNoteTab={selectedAdminNoteTab}
              selectedAdminTabId={selectedAdminTabId}
              onAddAdminTab={addAdminTab}
              onAddCategory={addCategory}
              onAddItem={addItem}
              onAdminFormChange={setAdminForm}
              onDragTargetChange={setDragTarget}
              onLogin={handleAdminLogin}
              onLogout={handleAdminLogout}
              onMoveAdminTab={moveAdminTab}
              onMoveCategory={moveCategory}
              onMoveItem={moveItem}
              onRemoveAdminTab={removeAdminTab}
              onRemoveCategory={removeCategory}
              onRemoveItem={removeItem}
              onSaveMenu={saveMenu}
              onSelectTab={setSelectedAdminTabId}
              onUpdateAdminTab={updateAdminTab}
              onUpdateCategory={updateCategory}
              onUpdateItem={updateItem}
              onUpdateSiteField={updateSiteField}
            />
          ) : isOrderTab ? (
            <div className="order-panel">
              <p className="eyebrow">Text to order</p>
              <h3>
                {menu.orderPhone
                  ? `Send your order to ${menu.orderPhone}`
                  : 'Ordering details are coming soon'}
              </h3>
              <p>{SITE_CONFIG.orderInstructions}</p>
              {menu.orderPhone ? (
                <a
                  className="hero-action"
                  href={`sms:${menu.orderPhone.replaceAll(/[^+\d]/g, '')}`}
                >
                  Text {menu.orderPhone}
                </a>
              ) : null}
            </div>
          ) : activeCategory?.type === 'promotion' ? (
            <div className="menu-grid promotion-grid">
              {activeCategory.items.map((item) => (
                <article className="menu-card promotion-card" key={item.id}>
                  {item.photo ? (
                    <img src={item.photo} alt={item.title ? `${item.title} promotion` : ''} />
                  ) : null}
                  <div className="menu-card-content">
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="menu-grid">
              {activeCategory?.items.map((item) => (
                <article className="menu-card" key={item.id}>
                  <img src={item.photo} alt={item.photoAlt} />
                  <div className="menu-card-content">
                    <div className="item-title-row">
                      <h3>{item.title}</h3>
                      <span>{item.price}</span>
                    </div>
                    <p>{item.description}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <footer>
        <span>{siteName}</span>
        <span>{SITE_CONFIG.defaultOpenHours}</span>
      </footer>
    </main>
  );
}

function AdminPanel({
  adminForm,
  adminSession,
  dragTarget,
  isLoggingIn,
  isSavingMenu,
  loginError,
  menu,
  menuStatus,
  selectedAdminCategory,
  selectedAdminNoteTab,
  selectedAdminTabId,
  onAddAdminTab,
  onAddCategory,
  onAddItem,
  onAdminFormChange,
  onDragTargetChange,
  onLogin,
  onLogout,
  onMoveAdminTab,
  onMoveCategory,
  onMoveItem,
  onRemoveAdminTab,
  onRemoveCategory,
  onRemoveItem,
  onSaveMenu,
  onSelectTab,
  onUpdateAdminTab,
  onUpdateCategory,
  onUpdateItem,
  onUpdateSiteField,
}) {
  if (!adminSession) {
    return (
      <form className="admin-login" onSubmit={onLogin}>
        <p className="eyebrow">Owner login</p>
        <h3>Manage the bakery menu</h3>
        <label>
          Username
          <input
            autoComplete="username"
            value={adminForm.username}
            onChange={(event) =>
              onAdminFormChange({ ...adminForm, username: event.target.value })
            }
          />
        </label>
        <label>
          Password
          <input
            autoComplete="current-password"
            type="password"
            value={adminForm.password}
            onChange={(event) =>
              onAdminFormChange({ ...adminForm, password: event.target.value })
            }
          />
        </label>
        {loginError ? <p className="form-error">{loginError}</p> : null}
        <button className="hero-action" disabled={isLoggingIn} type="submit">
          {isLoggingIn ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    );
  }

  return (
    <div className="admin-panel">
      <div className="admin-toolbar">
        <div>
          <p className="eyebrow">Signed in</p>
          <h3>Menu editor</h3>
        </div>
        <div className="admin-actions">
          <button
            className="hero-action"
            disabled={isSavingMenu}
            type="button"
            onClick={() => onSaveMenu()}
          >
            {isSavingMenu ? 'Saving...' : 'Save menu'}
          </button>
          <button className="secondary-action" type="button" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </div>
      {menuStatus ? <p className="admin-status">{menuStatus}</p> : null}

      <div className="admin-layout">
        <aside className="admin-sidebar" aria-label="Admin menu tabs">
          <div className="admin-sidebar-section">
            <p className="admin-sidebar-title">Settings</p>
            <button
              className={`admin-tab ${selectedAdminTabId === 'site-settings' ? 'is-active' : ''}`}
              type="button"
              onClick={() => onSelectTab('site-settings')}
            >
              Site Settings
            </button>
          </div>

          <div className="admin-sidebar-section">
            <p className="admin-sidebar-title">Admin Tabs</p>
            {menu.adminTabs.map((tab, index) => (
              <div
                className={`admin-tab ${selectedAdminTabId === tab.id ? 'is-active' : ''}`}
                draggable
                key={tab.id}
                onDragStart={() => onDragTargetChange({ type: 'admin-tab', index })}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (dragTarget?.type === 'admin-tab') {
                    onMoveAdminTab(dragTarget.index, index);
                  }
                  onDragTargetChange(null);
                }}
              >
                <button className="admin-tab-main" type="button" onClick={() => onSelectTab(tab.id)}>
                  <span className="drag-handle" aria-hidden="true">
                    ::
                  </span>
                  <span>{tab.label}</span>
                </button>
                <ReorderButtons
                  index={index}
                  total={menu.adminTabs.length}
                  onMove={(toIndex) => onMoveAdminTab(index, toIndex)}
                />
              </div>
            ))}
            <button className="secondary-action" type="button" onClick={onAddAdminTab}>
              Add admin tab
            </button>
          </div>

          <div className="admin-sidebar-section">
            <p className="admin-sidebar-title">Website Tabs</p>
            <div className="admin-actions compact-actions">
              <button className="secondary-action" type="button" onClick={() => onAddCategory('menu')}>
                Add menu tab
              </button>
              <button
                className="secondary-action"
                type="button"
                onClick={() => onAddCategory('promotion')}
              >
                Add promo tab
              </button>
            </div>
            {menu.categories.map((category, index) => (
              <div
                className={`admin-tab ${selectedAdminTabId === category.id ? 'is-active' : ''}`}
                draggable
                key={category.id}
                onDragStart={() => onDragTargetChange({ type: 'category', index })}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (dragTarget?.type === 'category') {
                    onMoveCategory(dragTarget.index, index);
                  }
                  onDragTargetChange(null);
                }}
              >
                <button className="admin-tab-main" type="button" onClick={() => onSelectTab(category.id)}>
                  <span className="drag-handle" aria-hidden="true">
                    ::
                  </span>
                  <span>{category.label}</span>
                  {category.published === false ? <span className="admin-tab-status">Draft</span> : null}
                </button>
                <ReorderButtons
                  index={index}
                  total={menu.categories.length}
                  onMove={(toIndex) => onMoveCategory(index, toIndex)}
                />
              </div>
            ))}
          </div>
        </aside>

        <div className="admin-editor">
          {selectedAdminTabId === 'site-settings' ? (
            <SiteSettings menu={menu} onUpdateSiteField={onUpdateSiteField} />
          ) : selectedAdminNoteTab ? (
            <AdminNoteEditor
              tab={selectedAdminNoteTab}
              onRemoveAdminTab={onRemoveAdminTab}
              onUpdateAdminTab={onUpdateAdminTab}
            />
          ) : selectedAdminCategory ? (
            <CategoryEditor
              category={selectedAdminCategory}
              dragTarget={dragTarget}
              onAddItem={onAddItem}
              onDragTargetChange={onDragTargetChange}
              onMoveItem={onMoveItem}
              onRemoveCategory={onRemoveCategory}
              onRemoveItem={onRemoveItem}
              onUpdateCategory={onUpdateCategory}
              onUpdateItem={onUpdateItem}
            />
          ) : (
            <div className="order-panel">
              <p>Add a tab to start building the menu.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SiteSettings({ menu, onUpdateSiteField }) {
  return (
    <div className="settings-panel">
      <div className="admin-field-row">
        <label>
          Bakery name from config
          <input
            readOnly
            value={SITE_CONFIG.bakeryName}
          />
        </label>
        <label>
          Order phone
          <input
            value={menu.orderPhone}
            onChange={(event) => onUpdateSiteField('orderPhone', event.target.value)}
          />
        </label>
      </div>
      <p className="admin-help">
        The bakery name and deeper site wording defaults live in src/siteConfig.js, including the
        hero text, order tab label, page title, and footer hours.
      </p>
    </div>
  );
}

function ReorderButtons({ index, total, onMove }) {
  return (
    <span className="reorder-buttons" aria-label="Reorder controls">
      <button
        aria-label="Move up"
        disabled={index === 0}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onMove(index - 1);
        }}
      >
        ↑
      </button>
      <button
        aria-label="Move down"
        disabled={index >= total - 1}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onMove(index + 1);
        }}
      >
        ↓
      </button>
    </span>
  );
}

function AdminNoteEditor({ tab, onRemoveAdminTab, onUpdateAdminTab }) {
  return (
    <>
      <div className="admin-field-row category-settings">
        <label>
          Admin tab name
          <input
            value={tab.label}
            onChange={(event) => onUpdateAdminTab(tab.id, 'label', event.target.value)}
          />
        </label>
        <label>
          Placeholder
          <input
            value={tab.placeholder}
            onChange={(event) => onUpdateAdminTab(tab.id, 'placeholder', event.target.value)}
          />
        </label>
        <button className="danger-action" type="button" onClick={() => onRemoveAdminTab(tab.id)}>
          Remove tab
        </button>
      </div>
      <label className="admin-note-tab">
        {tab.label}
        <textarea
          placeholder={tab.placeholder}
          value={tab.content}
          onChange={(event) => onUpdateAdminTab(tab.id, 'content', event.target.value)}
        />
      </label>
    </>
  );
}

function CategoryEditor({
  category,
  dragTarget,
  onAddItem,
  onDragTargetChange,
  onMoveItem,
  onRemoveCategory,
  onRemoveItem,
  onUpdateCategory,
  onUpdateItem,
}) {
  const isPromotion = category.type === 'promotion';

  return (
    <>
      <div className="admin-field-row category-settings">
        <label>
          Tab name
          <input
            value={category.label}
            onChange={(event) => onUpdateCategory(category.id, 'label', event.target.value)}
          />
        </label>
        <label className="checkbox-field">
          <input
            checked={category.published !== false}
            type="checkbox"
            onChange={(event) =>
              onUpdateCategory(category.id, 'published', event.target.checked)
            }
          />
          Published on website
        </label>
        <button className="danger-action" type="button" onClick={() => onRemoveCategory(category.id)}>
          Remove tab
        </button>
      </div>

      <div className="admin-toolbar inline-toolbar">
        <h3>{isPromotion ? 'Promotions' : 'Items'}</h3>
        <button className="secondary-action" type="button" onClick={() => onAddItem(category.id)}>
          {isPromotion ? 'Add promotion' : 'Add item'}
        </button>
      </div>

      <div className="admin-items">
        {category.items.map((item, index) => (
          <article
            className="admin-item"
            draggable
            key={item.id}
            onDragStart={() => onDragTargetChange({ type: 'item', categoryId: category.id, index })}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragTarget?.type === 'item' && dragTarget.categoryId === category.id) {
                onMoveItem(category.id, dragTarget.index, index);
              }
              onDragTargetChange(null);
            }}
          >
            <div className="admin-item-heading">
              <div>
                <span className="drag-handle" aria-hidden="true">
                  ::
                </span>
                <strong>Drag to reorder</strong>
              </div>
              <ReorderButtons
                index={index}
                total={category.items.length}
                onMove={(toIndex) => onMoveItem(category.id, index, toIndex)}
              />
            </div>
            <div className="admin-field-row">
              <label>
                {isPromotion ? 'Promotion title' : 'Item name'}
                <input
                  value={item.title}
                  onChange={(event) =>
                    onUpdateItem(category.id, item.id, 'title', event.target.value)
                  }
                />
              </label>
              {isPromotion ? null : (
                <label>
                  Price
                  <input
                    value={item.price}
                    onChange={(event) =>
                      onUpdateItem(category.id, item.id, 'price', event.target.value)
                    }
                  />
                </label>
              )}
            </div>
            <label>
              {isPromotion ? 'Text' : 'Description'}
              <textarea
                value={item.description}
                onChange={(event) =>
                  onUpdateItem(category.id, item.id, 'description', event.target.value)
                }
              />
            </label>
            <label>
              Photo URL
              <input
                value={item.photo}
                onChange={(event) =>
                  onUpdateItem(category.id, item.id, 'photo', event.target.value)
                }
              />
            </label>
            {isPromotion ? null : (
              <label>
                Photo alt text
                <input
                  value={item.photoAlt}
                  onChange={(event) =>
                    onUpdateItem(category.id, item.id, 'photoAlt', event.target.value)
                  }
                />
              </label>
            )}
            <button
              className="danger-action"
              type="button"
              onClick={() => onRemoveItem(category.id, item.id)}
            >
              {isPromotion ? 'Remove promotion' : 'Remove item'}
            </button>
          </article>
        ))}
      </div>
    </>
  );
}

export default App;
