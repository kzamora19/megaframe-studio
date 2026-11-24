/* Presentation-only overlay for an already integrity-verified private editor.
   No network, auth, data, storage or cross-frame access. */
(function(root){
 "use strict";
 const css=`
 header.appbar{position:sticky!important;top:0!important;z-index:30;background:#102847!important;color:#fff}
 header.appbar>.brand{display:none!important}
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
 function apply(html){
  if(typeof html!=="string"||!(html.includes("PRIVATE MEGAFRAME EDITOR BUNDLE")||(/class=["\'][^"\']*appbar/.test(html)&&html.includes("newProject"))))return html;
  const at=html.toLowerCase().lastIndexOf("</body>");
  if(at<0||html.includes('id="bl-frame-device-layout"'))return html;
  return html.slice(0,at)+'<style id="bl-frame-device-layout">'+css+'</style>'+html.slice(at);
 }
 if(typeof module==="object"&&module.exports)module.exports={apply};else root.BranchlineFrameDeviceLayout=Object.freeze({apply});
})(typeof window!=="undefined"?window:globalThis);
