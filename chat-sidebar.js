/* MegaFrame: icon rail + contextual chatroom-style section navigation.
   Builds a presentation layer around the existing editor panels without moving
   or replacing any editing inputs, overlay layers, photo queue, or commands. */
(()=>{
 'use strict';
 const MENUS=[
  {name:'Frame template',icon:'▣',links:[['Choose a campaign','#templateSelect'],['Frame library','#openFrameLibrary'],['Saved projects','#openProjects'],['Template backup','#backupTemplate']]},
  {name:'Photo area',icon:'◇',links:[['Photo opening shape','#shapePreset'],['Size & outline','#shapeScale'],['Opening border','#borderWidth'],['Manual point editing','#drawPolygon']]},
  {name:'Import photos',icon:'⇧',links:[['Upload customer photos','#dropzone'],['Manage photo batch','#clearPhotos']]},
  {name:'Collage layout',icon:'▦',links:[['Photos per frame','#collageCount'],['Collage arrangement','#collageLayout'],['Photo spacing','#collageGap']]},
  {name:'Photo adjustments',icon:'◐',links:[['Photo fitting','#fitMode'],['Zoom & rotation','#zoom'],['Filters','#filterPreset'],['Photo enhancement','#enhanceSharpness'],['Privacy covers','#emojiPickerOpen']]},
  {name:'Export Images',icon:'⇩',links:[['Filename & format','#prefix'],['Resolution','#exportSize'],['Download selected image','#downloadOne'],['Save all photos','#prepareAll']]},
  {name:'Caption and Overlays',icon:'T',links:[['Add captions','#addTextOverlay'],['Add image overlay','#addImageOverlay'],['Overlay layers','#overlayLayerList'],['Font styles','#overlayFontButton'],['Position, size & rotation','#overlayX']]},
  {name:'Settings',icon:'⚙',links:[['Project and studio controls','#newProject'],['Shared templates','#mf-open'],['Google Drive backup','#drive-open'],['About MegaFrame Studio','#studioVersion']]}
 ];
 const init=()=>{
  const sidebar=document.querySelector('main.appbody > aside.sidebar');
  const nav=document.getElementById('pinNav');
  const grid=nav?.querySelector('.pinNavGrid');
  const sections=sidebar?[...sidebar.querySelectorAll(':scope > .section')]:[];
  if(!sidebar||!grid||sections.length!==MENUS.length||document.body.classList.contains('frameChatLayout'))return;
  // CSS is loaded explicitly in index.html, avoiding dynamic asset races.
  const navTitle=nav.querySelector('.pinNavTitle');
  const toggle=document.createElement('button');
  toggle.type='button';toggle.id='mfRailToggle';toggle.textContent='☰';
  toggle.setAttribute('aria-controls','pinNav');
  toggle.title='Show menu labels';
  navTitle.prepend(toggle);
  grid.querySelectorAll('button[data-panel]').forEach(button=>{
    const index=Number(button.dataset.panel),menu=MENUS[index];
    if(!menu)return;
    button.replaceChildren();
    const icon=document.createElement('span');icon.className='mfIcon';icon.setAttribute('aria-hidden','true');icon.textContent=menu.icon;
    const name=document.createElement('span');name.className='mfName';name.textContent=menu.name;
    button.append(icon,name);
    button.setAttribute('aria-label',menu.name);
    button.title=menu.name;
  });
  const context=document.createElement('nav');context.id='mfChatNav';context.setAttribute('aria-label','Selected section contents');
  const heading=document.createElement('div');heading.id='mfChatHead';
  const title=document.createElement('h2');title.id='mfChatTitle';
  const mobileClose=document.createElement('button');mobileClose.id='mfMobileClose';mobileClose.type='button';
  mobileClose.textContent='⌃';mobileClose.title='Hide editing controls';
  mobileClose.setAttribute('aria-label','Collapse editing controls');
  heading.append(title,mobileClose);
  const list=document.createElement('div');list.id='mfChatItems';
  context.append(heading,list);
  sidebar.insertBefore(context,sections[0]);
  const key='megaframe-chat-rail-wide-v1';
  let wide=false;try{wide=localStorage.getItem(key)==='1';}catch{}
  sidebar.classList.toggle('railWide',wide);
  document.body.classList.add('frameChatLayout');
  const media=()=>matchMedia('(max-width:720px)').matches;
  function syncRail(){
    document.body.classList.toggle('frameRailWide',sidebar.classList.contains('railWide'));
    const wideNow=sidebar.classList.contains('railWide');
    toggle.setAttribute('aria-expanded',String(media()?!sidebar.classList.contains('mobileDrawerClosed'):wideNow));
    toggle.setAttribute('aria-label',media()?'Collapse editing controls':wideNow?'Show icons only':'Show menu names');
    toggle.title=media()?'Collapse editing controls':wideNow?'Collapse menu labels':'Expand menu labels';
  }
  toggle.onclick=()=>{
    if(media())document.getElementById('mobileEditToggle')?.click();
    else{
      sidebar.classList.toggle('railWide');
      try{localStorage.setItem(key,sidebar.classList.contains('railWide')?'1':'0');}catch{}
    }
    syncRail();
  };
  mobileClose.onclick=()=>{if(media()&&!sidebar.classList.contains('mobileDrawerClosed'))document.getElementById('mobileEditToggle')?.click();syncRail();document.getElementById('mobileEditToggle')?.focus();};
  let selected=-1;
  function render(index){
    if(index<0||index>=MENUS.length)return;
    const menu=MENUS[index];title.textContent=menu.name;
    list.replaceChildren();
    menu.links.forEach(([name,selector],n)=>{
      const entry=document.createElement('button');
      entry.type='button';entry.textContent=name;
      entry.setAttribute('aria-current',n===0?'true':'false');
      if(n===0)entry.classList.add('is-current');
      entry.onclick=()=>{
        for(const b of list.querySelectorAll('button')){b.classList.toggle('is-current',b===entry);b.setAttribute('aria-current',String(b===entry));}
        const target=sections[index].querySelector(selector);
        if(!target)return;
        target.scrollIntoView({behavior:'smooth',block:'nearest'});
        if(typeof target.focus==='function')target.focus({preventScroll:true});
      };
      list.append(entry);
    });
    selected=index;
  }
  function syncPanel(){
    const index=sections.findIndex(section=>section.classList.contains('activePanel'));
    if(index!==selected)render(index);
    syncRail();
  }
  grid.addEventListener('click',event=>{
    if(!event.target.closest('button[data-panel]'))return;
    // The existing mobile Edit/Slides disclosures determine visibility.
    requestAnimationFrame(syncPanel);
  });
  const observer=new MutationObserver(syncPanel);
  for(const section of sections)observer.observe(section,{attributes:true,attributeFilter:['class']});
  window.addEventListener('resize',syncRail,{passive:true});
  syncPanel();
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
})();
