/* Branchline official application navigation: parent launcher only, no editor iframe access. */
(() => {
  "use strict";
  const BRAND_SRC = "./official/branchline.png";
  const expected = document.body?.getAttribute("data-bl-studio");
  if (!["megaframe","flyer"].includes(expected)) return;
  const env = location.hostname === "branchline-staging.github.io" ?
    location.origin : "https://kzamora19.github.io";
  const apps = [
    { id:"ptg", name:"Price Tag Generator", short:"PTG", path:"/first-megasaver-ptg/products/" },
    { id:"sales", name:"Sales Tracker", short:"Sales", path:"/branchline/" },
    { id:"megaframe", name:"MegaFrame Studio", short:"Frame", path:"/first-megasaver-ptg/studios/?studio=megaframe" },
    { id:"flyer", name:"MegaFlyer Studio", short:"Flyer", path:"/first-megasaver-ptg/studios/?studio=flyer" }
  ];
  const header=document.querySelector("body > header");
  if(!header) return;
  const rail=document.createElement("nav");
  rail.className="bl-protected-app-rail";
  rail.setAttribute("aria-label","Branchline applications");
  const overlay=document.createElement("div");
  overlay.className="bl-protected-app-overlay";
  overlay.id="bl-protected-app-drawer";
  overlay.hidden=true;
  const aside=document.createElement("aside");
  aside.className="bl-protected-app-drawer";
  aside.setAttribute("aria-label","Branchline application list");
  const heading=document.createElement("h2");
  heading.textContent="Branchline applications";
  const links=document.createElement("nav");
  links.setAttribute("aria-label","Choose an application");
  function link(app,drawer){
    const a=document.createElement("a");
    a.className=drawer?"bl-protected-app-list-link":"bl-protected-app-link";
    if(app.id===expected)a.classList.add("is-active");
    a.href=env+app.path;
    a.rel="noopener noreferrer";
    a.referrerPolicy="no-referrer";
    if(!window.matchMedia("(display-mode: standalone)").matches)a.target="_blank";
    a.title=app.name;
    a.setAttribute("aria-label","Open "+app.name);
    if(app.id===expected)a.setAttribute("aria-current","page");
    const icon=document.createElement("span");
    icon.className="bl-protected-icon "+app.id;
    icon.setAttribute("aria-hidden","true");
    const name=document.createElement("span");
    name.textContent=drawer?app.name:app.short;
    a.append(icon,name);
    a.addEventListener("click",()=>close(false));
    return a;
  }
  const brand=(mobile)=>{
    const b=document.createElement("button");
    b.type="button";
    b.className=mobile?"bl-protected-mobile-brand":"bl-protected-brand";
    b.setAttribute("aria-label","Open application list");
    b.setAttribute("aria-controls",overlay.id);
    b.setAttribute("aria-expanded","false");
    b.title="Branchline applications";
    const img=document.createElement("img");
    img.src=BRAND_SRC;
    img.alt="";
    img.setAttribute("aria-hidden","true");
    b.append(img);
    return b;
  };
  const desktopLogo=brand(false),mobileLogo=brand(true);
  rail.append(desktopLogo);
  for(const app of apps)rail.append(link(app,false));
  for(const app of apps)links.append(link(app,true));
  aside.append(heading,links);
  overlay.append(aside);
  header.prepend(mobileLogo);
  document.body.prepend(rail);
  document.body.append(overlay);
  document.body.classList.add("bl-protected-shell");
  function sync(open){
    for(const button of [desktopLogo,mobileLogo]){
      button.setAttribute("aria-expanded",String(open));
      button.setAttribute("aria-label",open?"Close application list":"Open application list");
    }
    document.body.classList.toggle("bl-protected-app-open",open);
  }
  function close(restore){
    overlay.hidden=true;
    sync(false);
    if(restore)(window.matchMedia("(max-width:720px)").matches?mobileLogo:desktopLogo).focus();
  }
  function toggle(){
    if(!overlay.hidden){close(true);return;}
    overlay.hidden=false;
    sync(true);
    // The secure editor remains opaque. Do not inspect or pass auth to iframe.
    // The application overlay obscures its workspace menu until dismissed.
  }
  desktopLogo.addEventListener("click",toggle);
  mobileLogo.addEventListener("click",toggle);
  overlay.addEventListener("click",event=>{if(event.target===overlay)close(true)});
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"&&!overlay.hidden){event.preventDefault();close(true);}
  });
})();
