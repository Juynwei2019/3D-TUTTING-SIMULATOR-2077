import { t, onLanguageChange } from "../i18n/index.js";
// CSS owns orientation and dimensions; this controller only owns drawer state.
export function initMobileLayout({ onLayoutChange, onInitialLayout }){
  const panel = document.getElementById('ui');
  const toggle = document.getElementById('mobilePanelToggle');
  const mobile = matchMedia('(max-width: 640px), (pointer: coarse) and (max-width: 960px) and (max-height: 500px)');
  let pending = false;
  function syncViewport(){
    const wasMobile = document.documentElement.classList.contains('mobilePanelVisible');
    const visible = mobile.matches && panel.style.display !== 'none';
    document.documentElement.classList.toggle('mobilePanelVisible', visible);
    document.documentElement.classList.toggle('mobilePanelOpen', visible && !panel.classList.contains('mobileCollapsed'));
    if (!visible && !wasMobile) return;
    if (!pending){
      pending = true;
      requestAnimationFrame(() => { pending = false; onLayoutChange(); });
    }
  }
  function setCollapsed(collapsed){
    panel.classList.toggle('mobileCollapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.textContent = t(collapsed ? '展開面板 ▴' : '收合面板 ▾');
    syncViewport();
  }
  toggle.addEventListener('click', () => setCollapsed(!panel.classList.contains('mobileCollapsed')));
  // Desktop visibility and floating preferences remain independent of the drawer.
  mobile.addEventListener('change', () => { if (!mobile.matches) setCollapsed(false); else syncViewport(); });
  document.getElementById('uiShowBtn').addEventListener('click', () => setCollapsed(false));
  new MutationObserver(syncViewport).observe(panel, { attributes:true, attributeFilter:['style'] });
  onLanguageChange(() => { toggle.textContent=t(panel.classList.contains('mobileCollapsed')?'展開面板 ▴':'收合面板 ▾'); });
  setCollapsed(false);
  onLayoutChange();
  if (mobile.matches) onInitialLayout();
}
