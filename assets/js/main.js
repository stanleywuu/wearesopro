(() => {
  'use strict';

  // --- HTML partial includes ---
  async function includePartials() {
    const spots = document.querySelectorAll('[data-include]');
    await Promise.all(Array.from(spots).map(async el => {
      const url = el.getAttribute('data-include');
      try {
        const res = await fetch(url, { credentials: 'same-origin' });
        if (res.ok) el.outerHTML = await res.text(); // replace node to allow head injection
      } catch {}
    }));
  }

  function setYear(){ const y=document.getElementById('year'); if(y) y.textContent=new Date().getFullYear(); }

  function initFeedback(){
    const f=document.getElementById('feedback-form'); if(!f) return;
    const clean=s=>(s||'').replace(/[<>]/g,'').trim().slice(0,200);
    f.addEventListener('submit',()=>{const i=f.querySelector('input[name="message"]'); if(i) i.value=clean(i.value);});
  }

  // Desktop dropdown behavior for coarse pointers is JS; fine pointers rely on CSS hover/focus-within plus small delay
  function initDropdowns(){
    const coarse = window.matchMedia('(hover: none), (pointer: coarse)').matches;
    if (!coarse) {
      // add small delay close to prevent flicker
      const dd = document.querySelectorAll('.dropdown');
      const timers = new WeakMap();
      dd.forEach(d => {
        d.addEventListener('mouseenter', () => { clearTimeout(timers.get(d)); d.classList.add('open'); });
        d.addEventListener('mouseleave', () => {
          const t = setTimeout(() => d.classList.remove('open'), 120);
          timers.set(d, t);
        });
      });
      return;
    }
    // Coarse pointers: tap to open
    document.querySelectorAll('.drop-btn').forEach(btn=>{
      const menu=document.getElementById(btn.getAttribute('aria-controls')); if(!menu) return;
      btn.addEventListener('click',e=>{
        e.preventDefault();
        const open=menu.style.display==='block';
        document.querySelectorAll('.dropdown-menu').forEach(m=>m.style.display='none');
        document.querySelectorAll('.drop-btn').forEach(b=>b.setAttribute('aria-expanded','false'));
        menu.style.display=open?'none':'block';
        btn.setAttribute('aria-expanded', String(!open));
      });
    });
    document.addEventListener('click',e=>{
      if(!e.target.closest('.dropdown')){
        document.querySelectorAll('.dropdown-menu').forEach(m=>m.style.display='none');
        document.querySelectorAll('.drop-btn').forEach(b=>b.setAttribute('aria-expanded','false'));
      }
    });
  }

  function initDrawer(){
    const toggle=document.querySelector('.mobile-menu-toggle');
    const drawer=document.getElementById('mobile-drawer');
    if(!toggle||!drawer) return;
    const open=()=>{drawer.hidden=false; toggle.setAttribute('aria-expanded','true'); document.body.style.overflow='hidden';};
    const close=()=>{drawer.hidden=true; toggle.setAttribute('aria-expanded','false'); document.body.style.overflow='';};
    toggle.addEventListener('click',open);
    drawer.addEventListener('click',e=>{ if(e.target.hasAttribute('data-close')) close(); });
    document.addEventListener('keydown',e=>{ if(e.key==='Escape' && !drawer.hidden) close(); });
  }

    // --- Collapsible Sidebar (mobile-first) ---
  function initCollapsibleSidebar(){
    const aside = document.querySelector('.sidebar');
    if(!aside) return;

    // Convert H2 + following UL into <details><summary>H2</summary>UL</details>
    const kids = Array.from(aside.children);
    for(let i=0;i<kids.length;i++){
      const h = kids[i];
      if(h.tagName === 'H2'){
        const next = kids[i+1];
        if(next && next.tagName === 'UL'){
          const details = document.createElement('details');
          details.className = 'sidebar-section';
          const summary = document.createElement('summary');
          summary.id = h.id
          summary.textContent = h.textContent;
          details.appendChild(summary);
          details.appendChild(next);
          aside.replaceChild(details, h);
        }
      }
    }

    // Default state: collapsed on mobile, expanded on desktop
    const mq = window.matchMedia('(max-width: 960px)');
    const syncState = () => {
      document.querySelectorAll('.sidebar-section').forEach(d => {
        if(mq.matches){ d.removeAttribute('open'); } else { d.setAttribute('open',''); }
      });
    };
    syncState();
    mq.addEventListener('change', syncState);
  }


  // --- Sidebar Announcements (under "Extras") ---
function initAnnouncements(endpoint){
  const aside = document.querySelector('.sidebar');
  if(!aside) return;

  // Find the "Extras" block. Works with/without the mobile <details> enhancer.
  // Preferred: the <details> we created on mobile:
  let extrasContainer = Array.from(aside.querySelectorAll('.sidebar-section'))
    .find(d => (d.querySelector('summary')?.id || '').trim().toLowerCase() === 'extras');

  // Fallback: plain H2 (desktop/static)
  if(!extrasContainer){
    const h2s = Array.from(aside.querySelectorAll('h2'));
    const extrasH2 = h2s.find(h => h.id.trim().toLowerCase() === 'extras');
    if(extrasH2){
      // insert after the Extras <ul>
      extrasContainer = extrasH2.nextElementSibling; // should be the UL
      // Wrap in a div to have a consistent insertion point
      const wrap = document.createElement('div');
      extrasContainer.insertAdjacentElement('afterend', wrap);
      extrasContainer = wrap;
    }
  }

  if(!extrasContainer) return;

  // Create widget shell
  const widget = document.createElement('div');
  widget.className = 'announcements-widget';
  widget.setAttribute('aria-live','polite');
  widget.innerHTML = `
    <div class="ann-head">Stanley's Thoughts and Rants</div>
    <ul class="ann-list" role="list"></ul>
  `;

  // If we're inside <details>, append after the UL. Otherwise, append to the wrap we just added.
  if(extrasContainer.matches('.sidebar-section')){
    const ul = extrasContainer.querySelector('ul');
    (ul ? ul : extrasContainer).insertAdjacentElement('afterend', widget);
  } else {
    extrasContainer.appendChild(widget);
  }

  // Fetch and render
  fetch(endpoint, { 
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // simple request
    method: 'GET' })
    .then(r => r.json())
    .then(({announcements=[]}) => {
      const list = widget.querySelector('.ann-list');
      if(!announcements.length){
        list.innerHTML = `<li class="ann-empty">My mind is empty</li>`;
        return;
      }
      list.innerHTML = announcements.map(a => {
        // Format timestamp nicely
        const dt = a.timestamp ? new Date(a.timestamp) : null;
        const dateStr = dt && !isNaN(dt) ? dt.toLocaleString() : '';
        const msg = (a.message || '').toString();
        return `
          <div class="ann-message">${msg}</div>
          `
      }).join('');
    })
    .catch(() => {
      widget.classList.add('ann-error');
      widget.querySelector('.ann-list').innerHTML = `
        <li class="ann-empty">Couldn’t load announcements.</li>`;
    });
}



  window.addEventListener('DOMContentLoaded', async ()=>{
    await includePartials(); // pulls in title, nav, footer
    setYear();
    initFeedback();
    initDropdowns();
    initDrawer();
    initCollapsibleSidebar();
    initAnnouncements("https://script.google.com/macros/s/AKfycbx5GueBGP-BLIEqBXOHVFXJ7Ut8ng3tacH6QEloyypcPvCtKVEISIeiavLKMhi8_eqUTQ/exec")

  });
})();
