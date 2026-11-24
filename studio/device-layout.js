/* Presentation-only overlay for an already integrity-verified private editor.
   No network, auth, data, storage or cross-frame access. */
(function(root){
 "use strict";
 const css=`
 @media(min-width:821px){
body.frameChatLayout #pinNav,body.flyerChatLayout #sidebarFixed{background:#102b4d!important;background-image:none!important;border-color:#315675!important;color:#eff7ff!important;box-shadow:none!important;filter:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}body.frameChatLayout #pinNav .pinNavTitle,body.flyerChatLayout #sidebarFixed .editorMenuHeading,body.flyerChatLayout #sidebarFixed .editorMenuHeading h1{color:#e9f4ff!important;background:transparent!important}body.frameChatLayout #pinNav button[data-panel],body.flyerChatLayout #studioNav>[data-nav],body.flyerChatLayout #studioNav #sidebarActions button,body.frameChatLayout #mfRailToggle,body.flyerChatLayout #editorMenuToggle{color:#edf6ff!important;background:transparent!important;box-shadow:none!important;border-color:transparent!important;filter:none!important}body.frameChatLayout #pinNav button[data-panel]:hover,body.flyerChatLayout #studioNav>[data-nav]:hover,body.flyerChatLayout #studioNav #sidebarActions button:hover{background:#184d83!important}body.frameChatLayout #pinNav button[data-panel].active,body.flyerChatLayout #studioNav>[data-nav].active{background:#1557a0!important;color:#fff!important;box-shadow:inset 3px 0 #12d3e4!important}body.flyerChatLayout #studioNav #sidebarActions{border-color:#315675!important}body.frameChatLayout #mfChatNav,body.flyerChatLayout #studioChatHeader,body.flyerChatLayout #studioSubnav{background:#102b4d!important;color:#eaf5ff!important;border-color:#315675!important;box-shadow:none!important;backdrop-filter:none!important;filter:none!important}body.frameChatLayout #mfChatTitle,body.flyerChatLayout #studioChatTitle{color:#f3faff!important}body.frameChatLayout #mfChatItems button,body.flyerChatLayout #studioSubnav .navChildren button{color:#e6f2ff!important;background:transparent!important;border:0!important;box-shadow:none!important}body.frameChatLayout #mfChatItems button:hover,body.flyerChatLayout #studioSubnav .navChildren button:hover{background:#184d83!important}body.frameChatLayout #mfChatItems button.is-current,body.flyerChatLayout #studioSubnav .navChildren button.active{background:#1557a0!important;color:#fff!important;box-shadow:inset 3px 0 #11d2e4!important}body.flyerChatLayout #studioChatHeader button,body.frameChatLayout #mfMobileClose{background:#184d83!important;color:#fff!important}@media(min-width:721px){body.frameChatLayout .appbody,body.frameChatLayout.frameRailWide .appbody{grid-template-columns:clamp(355px,30vw,415px) minmax(0,1fr) clamp(195px,20vw,285px)!important}body.frameChatLayout .sidebar,body.frameChatLayout .sidebar.railWide{display:grid!important;grid-template-columns:64px minmax(0,1fr)!important;grid-template-rows:auto 1fr!important;height:calc(100dvh - 74px)!important;max-height:calc(100dvh - 74px)!important;overflow-y:auto!important;min-width:0!important;background:#fff!important}body.frameChatLayout #pinNav,body.frameChatLayout .sidebar.railWide #pinNav{display:flex!important;flex-direction:column!important;grid-column:1!important;grid-row:1 / span 3!important;position:sticky!important;top:0!important;width:64px!important;height:calc(100dvh - 74px)!important;min-height:0!important;max-height:calc(100dvh - 74px)!important;padding:10px 6px!important;overflow-y:auto!important;overflow-x:hidden!important;border-right:1px solid #315675!important;border-bottom:0!important}body.frameChatLayout #pinNav .pinNavGrid{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:4px!important}body.frameChatLayout #pinNav button[data-panel]{min-width:0!important;width:100%!important;min-height:44px!important;justify-content:center!important;gap:0!important;padding:8px!important;font-size:0!important}body.frameChatLayout #pinNav button[data-panel] .mfName,body.frameChatLayout .sidebar.railWide #pinNav button[data-panel] .mfName{display:none!important}body.frameChatLayout #pinNav button[data-panel] .mfIcon{width:24px!important;min-width:24px!important;font-size:20px!important}body.frameChatLayout #mfRailToggle{display:none!important}body.frameChatLayout #mfChatNav{grid-column:2!important;grid-row:1!important;display:block!important;padding:13px 12px!important;min-width:0!important;position:relative!important;top:0!important}body.frameChatLayout #mfChatItems button{min-height:38px!important;text-align:left!important;padding:9px 11px!important}body.frameChatLayout .sidebar>.section.activePanel{grid-column:2!important;grid-row:2!important;width:100%!important;min-width:0!important;background:#fff!important}body.flyerChatLayout main,body.flyerChatLayout.chatRailWide main{grid-template-columns:clamp(355px,30vw,415px) minmax(0,1fr)!important}body.flyerChatLayout main>aside{display:flex!important;flex-direction:row!important;min-width:0!important;overflow:hidden!important;background:#fff!important}body.flyerChatLayout #sidebarFixed,body.flyerChatLayout #sidebarFixed.menuCollapsed{flex:0 0 64px!important;width:64px!important;height:100%!important;min-height:0!important;padding:10px 6px!important;overflow-y:auto!important;overflow-x:hidden!important;border-right:1px solid #315675!important;border-bottom:0!important}body.flyerChatLayout #sidebarFixed .editorMenuHeading h1,body.flyerChatLayout #sidebarFixed #editorMenuHint{display:none!important}body.flyerChatLayout #studioNav,body.flyerChatLayout #sidebarFixed.menuCollapsed #studioNav{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:4px!important;width:100%!important}body.flyerChatLayout #studioNav>[data-nav],body.flyerChatLayout #sidebarFixed.menuCollapsed #studioNav>[data-nav],body.flyerChatLayout #studioNav #sidebarActions button{display:flex!important;justify-content:center!important;width:100%!important;min-height:44px!important;padding:8px!important;gap:0!important;font-size:0!important;white-space:nowrap!important;overflow:hidden!important}body.flyerChatLayout #studioNav>[data-nav]::before,body.flyerChatLayout #studioNav #sidebarActions button::before{font-size:21px!important;min-width:22px!important}body.flyerChatLayout #editorMenuToggle{display:none!important}body.flyerChatLayout #sidebarContent{flex:1 1 0!important;min-width:0!important;width:auto!important;overflow-y:auto!important;background:#fff!important;padding:0 10px 24px!important}body.flyerChatLayout #studioChatHeader,body.flyerChatLayout #studioSubnav{background:#102b4d!important}}html[data-bl-native-menu="closed"] body.flyerChatLayout main{grid-template-columns:minmax(0,1fr)!important}html[data-bl-native-menu="closed"] body.flyerChatLayout main>aside{display:none!important}html[data-bl-native-menu="closed"] body:has(.appbody > .sidebar) .appbody{grid-template-columns:minmax(0,1fr) clamp(210px,22vw,305px)!important}html[data-bl-native-menu="closed"] body:has(.appbody > .sidebar) .appbody>.sidebar{display:none!important}html[data-bl-native-menu="closed"] body:has(.appbody > .sidebar) .appbody>.workspace{grid-column:1!important}html[data-bl-native-menu="closed"] body:has(.appbody > .sidebar) .appbody>.photoQueueSidebar{grid-column:2!important}@media (max-width:720px){html[data-bl-native-menu="closed"] body:has(.appbody > .sidebar) .appbody>.sidebar,html[data-bl-native-menu="closed"] body.flyerChatLayout main>aside{display:none!important}}@media print{html[data-bl-native-menu="closed"] body:has(.appbody > .sidebar) .appbody>.sidebar,html[data-bl-native-menu="closed"] body.flyerChatLayout main>aside{display:initial!important}}body.flyerChatLayout #sidebarFixed{display:flex!important;flex-direction:column!important;box-sizing:border-box!important}body.flyerChatLayout #studioChatHeader{padding:14px 12px!important;margin:0 -10px!important;position:relative!important}body.flyerChatLayout #studioSubnav{margin:0 -10px 10px!important;padding:0 10px 10px!important}body.flyerChatLayout #studioNav>[data-nav]::before,body.flyerChatLayout #studioNav #sidebarActions button::before{content:"◫";font:20px/1 'Segoe UI Symbol',sans-serif}body.flyerChatLayout #studioNav [data-nav="campaign"]::before{content:"✎"}body.flyerChatLayout #studioNav [data-nav="cards"]::before{content:"▦"}body.flyerChatLayout #studioNav [data-nav="bulk"]::before{content:"⇧"}body.flyerChatLayout #studioNav [data-nav="review"]::before{content:"✓"}body.flyerChatLayout #studioNav [data-nav="backup"]::before{content:"▣"}body.flyerChatLayout #studioNav #sidebarActions button::before{content:"⚙"}body.flyerChatLayout #studioNav #sidebarActions{display:block!important;margin:0!important;padding:6px 0!important}body.flyerChatLayout #studioSubnav:not([hidden])>.navChildren:not([hidden]){display:flex!important;flex-direction:column!important}body.flyerChatLayout #studioSubnav .navChildren button{display:block;text-align:left;min-height:38px;width:100%}}

 #studioSettings{width:min(460px,calc(100% - 32px));padding:22px;border:1px solid #cbd9ea;border-radius:14px;color:#17324f}
 #studioSettings > .inline{display:flex;flex-wrap:wrap;gap:8px}
 #studioSettings [hidden]{display:none!important}
 #studioSettings::backdrop{background:#071c3990}
 #pinNav .protected-settings-button{background:transparent;color:inherit;font-size:18px}
 header.appbar.protected-context-header{justify-content:space-between}
 header.appbar{position:sticky!important;top:0!important;z-index:30;background:#102847!important;color:#fff}
 header.appbar:not(:has(#contextProjectStatus))>.brand{display:none!important}
 header.appbar>.inline{flex:1 1 auto;justify-content:flex-start!important;gap:6px}
 @media(max-width:820px){header.appbar{position:relative!important;top:auto!important;z-index:auto}.appbar button{color:#16385e}.appbar button[id*="exit" i]{color:#a92135}}

 @media(max-width:820px){
  header.appbar{box-sizing:border-box;height:auto!important;min-height:0!important;display:flex!important;flex-wrap:wrap!important;align-items:center;justify-content:flex-start;gap:8px!important;padding:10px 12px!important}
  header.appbar>.brand{min-width:0;max-width:100%;flex:0 1 auto}
  header.appbar>.inline{width:100%!important;min-width:0!important;max-width:none!important;flex:1 1 100%!important;display:flex!important;align-items:center;justify-content:flex-start!important;flex-wrap:wrap!important;gap:6px!important}
  header.appbar>.inline>button{box-sizing:border-box;flex:1 1 auto!important;width:auto!important;min-width:0!important;max-width:100%!important;min-height:40px;white-space:normal;line-height:1.2;margin:0!important}
  header.appbar>.inline>.chip{flex:0 0 auto;max-width:100%}
  header.appbar>.inline>#pwa-status:empty{display:none!important}
  header.appbar>.inline>[hidden]{display:none!important}
 }
 `;
 function wireWorkspaceMenu(){
  window.addEventListener("message",event=>{
   if(event.source!==window.parent||event.origin!=="https://kzamora19.github.io"||event.data?.kind!=="branchline-workspace-menu"||typeof event.data.open!=="boolean")return;
   document.documentElement.dataset.blNativeMenu=event.data.open?"open":"closed";
  }, true);
 }
 function applyProtectedSettings(html){
  if(html.includes('id="studioSettings"'))return html;
  const header=html.match(/<header\b[^>]*class=["'][^"']*\bappbar\b[^"']*["'][^>]*>[\s\S]*?<\/header>/i)?.[0];
  const toolbar=header?.match(/<div\b[^>]*class=["'][^"']*\binline\b[^"']*["'][^>]*>\s*<button\b[^>]*id=["']newProject["'][\s\S]*?<\/div>/i)?.[0];
  const nav=html.match(/<nav\b[^>]*id=["']pinNav["'][^>]*>[\s\S]*?<\/nav>/i)?.[0];
  const captions=nav?.match(/<button\b[^>]*data-panel=["']6["'][^>]*>[\s\S]*?<\/button>/i)?.[0];
  const exports=nav?.match(/<button\b[^>]*data-panel=["']5["'][^>]*>[\s\S]*?<\/button>/i)?.[0];
  if(!header||!toolbar||!nav||!captions||!exports)return html;
  const rename=(button,label)=>button.replace(/>[\s\S]*?<\/button>$/,">"+label+"</button>");
  const settingsButton='<button type="button" class="btn protected-settings-button" popovertarget="studioSettings" aria-label="Settings" title="Settings">⚙</button>';
  const updatedNav=nav.replace(exports,rename(captions,"6 · Caption and Overlays"))
   .replace(captions,rename(exports,"7 · Export Images")+settingsButton);
  const version=html.match(/<title>[^<]*?\b(v[\d.]+)[^<]*<\/title>/i)?.[1];
  const status='<span id="contextProjectStatus">Local processing</span>';
  const contextual=header.replace(toolbar,status)
   .replace(/(<[^>]+class=["']brandtag["'][^>]*>)[^<]*/, '$1Photo Framing, Borders &amp; Collage Studio');
  const controls=toolbar
   .replace(/<span\b[^>]*class=["'](?:pill|chip)["'][^>]*>[\s\S]*?<\/span>/gi,"")
   .replace(/(<(?:button|span)\b[^>]*id=["']pwa-(?:install|status)["'])/gi,"$1 hidden");
  const settings='<section id="studioSettings" popover aria-labelledby="protectedSettingsTitle"><h2 id="protectedSettingsTitle">Settings</h2>'
   +controls+'<p>Photos are processed locally. Projects use the storage available to this workspace.</p>'
   +'<p>About MegaFrame Studio'+(version?" · "+version:"")+'</p>'
   +'<button type="button" class="btn" popovertarget="studioSettings" popovertargetaction="hide">Close Settings</button></section>';
  return html.replace(header,()=>contextual+settings).replace(nav,()=>updatedNav);
 }
 function apply(html){
  if(typeof html!=="string"||!(html.includes("PRIVATE MEGAFRAME EDITOR BUNDLE")||(/class=["\'][^"\']*appbar/.test(html)&&html.includes("newProject"))))return html;
  if(html.includes('id="bl-frame-device-layout-r6"'))return html;
  const adjusted=applyProtectedSettings(html);
  if(adjusted===html&&html.includes('id="bl-frame-device-layout"'))return html;
  html=adjusted;
  const closing=html.match(/(?:<\/body\s*>\s*)?<\/html\s*>\s*$/i)
    ||html.match(/<\/body\s*>\s*$/i);
  const at=closing?.index??html.length;
  const styleId=html.includes('id="bl-frame-device-layout"')?"bl-frame-device-layout-r6":"bl-frame-device-layout";
  const overlay='<style id="'+styleId+'">'+css+'</style><script>('+wireWorkspaceMenu.toString()+')();<\/script>';
  return html.slice(0,at)+overlay+html.slice(at);
 }
 if(typeof module==="object"&&module.exports)module.exports={apply};else root.BranchlineFrameDeviceLayout=Object.freeze({apply});
})(typeof window!=="undefined"?window:globalThis);
