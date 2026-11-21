
"use strict";
const SAMPLE_IMAGE=window.megaFrame_SAMPLE_IMAGE.join('');delete window.megaFrame_SAMPLE_IMAGE;
const GOLD_IMAGE=window.megaFrame_GOLD_IMAGE.join('');delete window.megaFrame_GOLD_IMAGE;
const $ = (id)=>document.getElementById(id);
const defaultRect={x:82,y:299,w:1844,h:1278};
const goldPoints=[{x:100,y:295},{x:1152,y:295},{x:1199,y:344},{x:1199,y:1079},{x:1152,y:1127},{x:100,y:1127},{x:54,y:1079},{x:54,y:344}];
const defaultGoldShape={type:'bevel',points:goldPoints};
const app={templates:[],template:null,frame:null,photos:[],selected:-1,mode:'map',rect:{...defaultRect},shape:{type:'rect',points:rectPoints(defaultRect)},frameOpening:{type:'rect',points:rectPoints(defaultRect)},appearance:{borderColor:'#d7b34a',borderWidth:8,openingFill:'#eef1f7'},pointer:null,exporting:false,drawingPolygon:false,draftPoints:[],cursor:null,selectedPoint:-1,collage:{count:1,layout:'grid',gap:1},undoStack:[],redoStack:[],activeCoverIndex:-1,sliderStart:null,editingSlider:null,editingBorderColor:false};
function cloneShape(sh){return{type:sh?.type||'none',points:Array.isArray(sh?.points)?sh.points.map(p=>({x:p.x,y:p.y})):[]}}
function rectPoints(r){return[{x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x+r.w,y:r.y+r.h},{x:r.x,y:r.y+r.h}]}
function shapeBounds(pts){let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const p of pts){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y)}return {x:minX,y:minY,w:Math.max(1,maxX-minX),h:Math.max(1,maxY-minY)}}
function bevelPoints(r,percent=6){const cut=Math.min(r.w,r.h)*(percent/100);return[{x:r.x+cut,y:r.y},{x:r.x+r.w-cut,y:r.y},{x:r.x+r.w,y:r.y+cut},{x:r.x+r.w,y:r.y+r.h-cut},{x:r.x+r.w-cut,y:r.y+r.h},{x:r.x+cut,y:r.y+r.h},{x:r.x,y:r.y+r.h-cut},{x:r.x,y:r.y+cut}]}
function rgbToHex(r,g,b){return'#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('')}
function sampleOpeningFill(frame,pts){try{const box=shapeBounds(pts),c=document.createElement('canvas');c.width=frame.width;c.height=frame.height;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(frame,0,0);let R=0,G=0,B=0,N=0;for(let gy=1;gy<=7;gy++)for(let gx=1;gx<=7;gx++){const p={x:box.x+box.w*gx/8,y:box.y+box.h*gy/8};if(!insidePolygon(p,pts))continue;const d=x.getImageData(Math.max(0,Math.min(frame.width-1,Math.round(p.x))),Math.max(0,Math.min(frame.height-1,Math.round(p.y))),1,1).data;R+=d[0];G+=d[1];B+=d[2];N++}return N?rgbToHex(R/N,G/N,B/N):'#eef1f7'}catch{return'#eef1f7'}}
function templateAppearance(template,frameOpening,frame){const provided=template.appearance||{};const color=provided.borderColor||(template.id==='sample'?'#1f55d7':'#d7b34a');const width=Number.isFinite(+provided.borderWidth)?Math.max(0,Math.min(30,+provided.borderWidth)):8;const fill=provided.openingFill||sampleOpeningFill(frame,frameOpening.points);const replaceOpening=typeof provided.replaceOpening==='boolean'?provided.replaceOpening:(template.id==='sample'||template.id==='gold');return{borderColor:color,borderWidth:width,openingFill:fill,replaceOpening}}
function syncAppearanceUI(){if(!$('borderColor'))return;$('borderColor').value=app.appearance.borderColor||'#d7b34a';$('borderWidth').value=String(app.appearance.borderWidth??8);$('borderWidthValue').textContent=(app.appearance.borderWidth??8)+' px';$('replaceOpening').checked=!!app.appearance.replaceOpening}
function strokeOpeningBorder(ctx,pts){const w=+(app.appearance?.borderWidth||0);if(w<=0||!pts?.length)return;ctx.save();polygonPath(ctx,pts);ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle=app.appearance.borderColor||'#d7b34a';ctx.lineWidth=w;ctx.stroke();ctx.restore()}
function coverOriginalOpening(ctx,pts){if(!pts?.length)return;ctx.save();polygonPath(ctx,pts);ctx.fillStyle=app.appearance?.openingFill||'#eef1f7';ctx.fill();ctx.restore()}
function hasPhotoShape(){return Array.isArray(app.shape?.points)&&app.shape.points.length>=3}
function blankShape(){return{type:'none',points:[]}}
function shapeOf(t){if(t.shape?.type==='none'&&Array.isArray(t.shape.points)&&t.shape.points.length===0)return blankShape();if(t.shape&&Array.isArray(t.shape.points)&&t.shape.points.length>=3&&t.shape.points.length<=128&&t.shape.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))return cloneShape(t.shape);return {type:'rect',points:rectPoints(t.rect||defaultRect)}}
function setShape(sh,record=true){if(record)saveHistory();app.shape=cloneShape(sh);if(hasPhotoShape())app.rect=shapeBounds(app.shape.points);app.selectedPoint=-1;resetScaleUI();updateShapeUI();render();updateLabels()}
function insidePolygon(p,pts){let inside=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const a=pts[i],b=pts[j];if((a.y>p.y)!=(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside}return inside}
function addPolygonPath(ctx,pts){if(!pts.length)return;ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.closePath()}
function polygonPath(ctx,pts){ctx.beginPath();addPolygonPath(ctx,pts)}
function nearestSegment(p,pts){let best=Infinity,index=0,point=null;for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length],vx=b.x-a.x,vy=b.y-a.y,d=vx*vx+vy*vy,t=d?clamp(((p.x-a.x)*vx+(p.y-a.y)*vy)/d,0,1):0,q={x:a.x+t*vx,y:a.y+t*vy},dist=(p.x-q.x)**2+(p.y-q.y)**2;if(dist<best){best=dist;index=i;point=q}}return {index,point,dist:Math.sqrt(best)}}
function insertPoint(p){if(app.drawingPolygon)return;const pts=app.shape.points;const closest=nearestSegment(p||{x:app.rect.x+app.rect.w/2,y:app.rect.y+app.rect.h/2},pts);if(pts.length>=128)return notify('Maximum 128 polygon points');saveHistory();pts.splice(closest.index+1,0,closest.point);app.shape.type='polygon';app.selectedPoint=closest.index+1;app.rect=shapeBounds(pts);updateShapeUI();render()}
function updateShapeUI(){if(!$('shapePreset'))return;const mode=app.shape.type,valid=hasPhotoShape();$('shapePreset').value=[...$('shapePreset').options].some(o=>o.value===mode)?mode:'none';const labels={none:'No shape',rect:'Rectangle',bevel:'Cut corners',polygon:'Custom polygon',circle:'Circle',ellipse:'Oval',roundrect:'Rounded rectangle',heart:'Heart','triangle-up':'Triangle up','triangle-down':'Triangle down','triangle-left':'Triangle left','triangle-right':'Triangle right',diamond:'Diamond',pentagon:'Pentagon',hexagon:'Hexagon',octagon:'Octagon',star:'Star'};$('shapeType').textContent=labels[mode]||'Custom polygon';$('pointCount').textContent=valid?app.shape.points.length+' points':'No opening yet';$('noShapeHint').classList.toggle('hidden',valid);$('shapeScale').disabled=!valid;$('cornerCut').disabled=!valid;$('drawPolygon').classList.toggle('active',app.drawingPolygon);$('drawPolygon').textContent=app.drawingPolygon?'× Cancel drawing':'＋ Draw new shape';$('finishPolygon').disabled=!app.drawingPolygon||app.draftPoints.length<3;$('addPoint').disabled=!valid||app.drawingPolygon||app.shape.points.length>=128;$('deletePoint').disabled=!valid||app.drawingPolygon||app.shape.points.length<=3||app.selectedPoint<0;updateHistoryButtons()}
let drawing=false;let renderPending=false;let toastTimer=0;
function notify(message){const e=$('toast');e.textContent=message;e.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('show'),3600)}
function status(s){$('status').textContent=s}
function safeName(s){return (s||'Framed').replace(/[^a-z0-9_-]+/gi,'_').replace(/^_+|_+$/g,'').slice(0,48)||'Framed'}
const FILTER_DEFAULTS={brightness:100,contrast:100,saturation:100,grayscale:0,sepia:0};
const FILTER_PRESETS={none:{...FILTER_DEFAULTS},vivid:{brightness:108,contrast:118,saturation:145,grayscale:0,sepia:0},warm:{brightness:105,contrast:104,saturation:115,grayscale:0,sepia:20},cool:{brightness:105,contrast:110,saturation:88,grayscale:0,sepia:0},bw:{brightness:104,contrast:115,saturation:0,grayscale:100,sepia:0},vintage:{brightness:110,contrast:85,saturation:80,grayscale:0,sepia:45},dramatic:{brightness:94,contrast:145,saturation:120,grayscale:0,sepia:0},soft:{brightness:113,contrast:86,saturation:90,grayscale:0,sepia:0}};
function filtersOf(photo){return {...FILTER_DEFAULTS,...(photo?.filters||{})}}
function updateFilteredThumbnail(){const img=$('gallery')?.querySelectorAll('.thumb img')[app.selected];if(img&&getPhoto())img.style.filter=photoFilterCSS(getPhoto())}
function photoFilterCSS(photo){const f=filtersOf(photo);return `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturation}%) grayscale(${f.grayscale}%) sepia(${f.sepia}%)`}
// Local-only, per-photo enhancement. Cache processed rasters so dragging and export share results.
const enhancementCache=new WeakMap();
function enhanceSettings(photo){return {sharpness:Math.max(0,Math.min(100,+(photo?.enhancement?.sharpness||0))),denoise:Math.max(0,Math.min(100,+(photo?.enhancement?.denoise||0)))}}
function enhancedPhotoImage(photo){
 const original=photo?.image;if(!original)return null;
 const {sharpness,denoise}=enhanceSettings(photo);
 if(sharpness===0&&denoise===0)return original;
 const cached=enhancementCache.get(photo);
 if(cached&&cached.original===original&&cached.sharpness===sharpness&&cached.denoise===denoise)return cached.canvas;
 // Limit processing area for responsiveness while leaving the actual uploaded image intact.
 const ratio=Math.min(1,2600/Math.max(original.width,original.height));
 const w=Math.max(1,Math.round(original.width*ratio)),h=Math.max(1,Math.round(original.height*ratio));
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 ctx.filter=denoise?`blur(${(denoise/100*1.15).toFixed(2)}px)`:'none';
 ctx.drawImage(original,0,0,w,h);ctx.filter='none';
 if(sharpness>0){
  const blurred=document.createElement('canvas');blurred.width=w;blurred.height=h;
  const blurCtx=blurred.getContext('2d',{willReadFrequently:true});
  blurCtx.filter='blur(1.2px)';blurCtx.drawImage(canvas,0,0);blurCtx.filter='none';
  const base=ctx.getImageData(0,0,w,h),soft=blurCtx.getImageData(0,0,w,h);
  const a=base.data,b=soft.data,amount=sharpness/100*1.5;
  for(let i=0;i<a.length;i+=4)for(let k=0;k<3;k++)a[i+k]=Math.max(0,Math.min(255,a[i+k]+amount*(a[i+k]-b[i+k])));
  ctx.putImageData(base,0,0);
 }
 enhancementCache.set(photo,{original,sharpness,denoise,canvas});
 return canvas;
}

function autoCorrectLighting(photo){
 const image=photo?.image;if(!image)return false;
 const sample=document.createElement('canvas');sample.width=sample.height=96;
 const ctx=sample.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,96,96);
 const pixels=ctx.getImageData(0,0,96,96).data,hist=new Uint32Array(256);
 let sum=0,count=0;
 for(let i=0;i<pixels.length;i+=4){
  if(pixels[i+3]<64)continue;
  const lum=Math.round(.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2]);
  hist[lum]++;sum+=lum;count++;
 }
 if(!count)return false;
 const pct=(part)=>{let tally=0;for(let i=0;i<256;i++){tally+=hist[i];if(tally>=count*part)return i}return 255};
 const brightness=clamp(Math.round(100*128/Math.max(55,sum/count)),75,145);
 const contrast=clamp(Math.round(100*160/Math.max(80,pct(.93)-pct(.07))),90,135);
 photo.filters={...filtersOf(photo),brightness,contrast};photo.filterPreset='custom';
 return true;
}
function popupAction({title,message,confirmLabel='Confirm',danger=false,value=null}){return new Promise(resolve=>{const dialog=$('actionModal'),input=$('actionModalInput'),error=$('actionModalError'),yes=$('actionModalConfirm'),no=$('actionModalCancel');if(dialog.open)dialog.close();$('actionModalTitle').textContent=title;$('actionModalMessage').textContent=message||'';input.hidden=value===null;input.value=value===null?'':String(value);error.hidden=true;yes.textContent=confirmLabel;yes.classList.toggle('dangerConfirm',danger);let resolved=false;const finish=(v)=>{if(resolved)return;resolved=true;dialog.close();resolve(v)};yes.onclick=()=>{if(value!==null&&!input.value.trim()){error.hidden=false;input.focus();return}finish(value!==null?input.value.trim():true)};no.onclick=()=>finish(null);input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();yes.click()}};dialog.oncancel=e=>{e.preventDefault();finish(null)};dialog.showModal();if(value!==null){input.focus();input.select()}else no.focus()})}
// App-owned guidance and notifications use this shared accessible dialog,
// never window.alert. Browser-owned security/install dialogs remain native.
function showStudioInfoModal(title,message){
 const dialog=$('studioInfoDialog');
 if(!dialog)return;
 if(dialog.open)dialog.close();
 $('studioInfoTitle').textContent=String(title||'MegaFrame Studio');
 $('studioInfoMessage').textContent=String(message||'');
 dialog.showModal();
 $('studioInfoClose').focus();
}
window.megaFrameShowInfoModal=showStudioInfoModal;
// The installed PWA's close button is owned by the browser. Offer a deliberate
// in-app exit flow, retaining native refresh/window-close protection.
let explicitStudioExit=false, exitStudioBusy=false;
function openExitStudioDialog(){
 const unsaved=hasUnsavedChanges();
 $('exitStudioWarning').textContent=unsaved
  ?'You have changes that have not been saved as a named project. Save before leaving to keep your photos, layout and overlays.'
  :'There are no unsaved changes in the current project. You can safely leave the editor.';
 $('exitStudioSave').hidden=!unsaved;
 $('exitStudioLeave').textContent=unsaved?'Leave without saving':'Exit Studio';
 if(!$('exitStudioDialog').open)$('exitStudioDialog').showModal();
 $('exitStudioCancel').focus();
}
function closeStudioWindow(){
 explicitStudioExit=true;
 // Script-initiated close is restricted in ordinary tabs; never promise to force-close.
 window.close();
 setTimeout(()=>{
  explicitStudioExit=false;
  if(document.visibilityState==='visible')notify('Your browser blocked automatic closing. Use the window X button; a native unsaved-changes warning may appear.');
 },650);
}
async function saveAndExitStudio(){
 if(exitStudioBusy)return;
 exitStudioBusy=true;
 $('exitStudioSave').disabled=true;
 $('exitStudioDialog').close();
 try{if(await saveNamedProject())closeStudioWindow();}
 finally{exitStudioBusy=false;$('exitStudioSave').disabled=false;}
}

let reloadStudioBusy=false, reloadStudioMode='reload';
function openReloadStudioDialog(mode='reload'){
 if($('startupChoiceDialog').open)return; // Startup decision is a modal too.
 if(document.querySelector('dialog[open]'))return;
 reloadStudioMode=mode==='update'?'update':'reload';
 const update=reloadStudioMode==='update',unsaved=hasUnsavedChanges();
 $('reloadStudioTitle').textContent=update?'Update MegaFrame Studio?':'Reload MegaFrame Studio?';
 $('reloadStudioWarning').textContent=unsaved
  ?(update
   ?'An application update is ready. You have unsaved photo, layout or overlay changes. Save a named project before updating to keep your work.'
   :'You have unsaved photo, layout or overlay changes. Save a named project before reloading to keep your work.')
  :(update
   ?'A new application version is ready. The current project has no unsaved edits.'
   :'Your current project has no unsaved changes. Reloading will reopen MegaFrame Studio.');
 $('reloadStudioSave').hidden=!unsaved;
 $('reloadStudioSave').textContent=update?'Save & Update':'Save & Reload';
 $('reloadStudioDiscard').textContent=unsaved
  ?(update?'Update without saving':'Reload without saving')
  :(update?'Update Studio':'Reload Studio');
 $('reloadStudioDialog').showModal();
 $('reloadStudioCancel').focus();
}
window.megaFrameOpenReloadModal=openReloadStudioDialog;
function performApprovedStudioReload(){
 // This action only runs after a user selects an explicit reload/update choice.
 explicitStudioExit=true;
 window.location.reload();
}
window.megaFrameReloadApproved=performApprovedStudioReload;
function reloadStudioNow(){
 if(reloadStudioMode==='update'&&typeof window.megaFrameApplyUpdate==='function'){
  window.megaFrameApplyUpdate();
  return;
 }
 performApprovedStudioReload();
}
async function saveAndReloadStudio(){
 if(reloadStudioBusy)return;
 reloadStudioBusy=true;
 $('reloadStudioSave').disabled=true;
 $('reloadStudioDialog').close();
 try{if(await saveNamedProject())reloadStudioNow();}
 finally{reloadStudioBusy=false;$('reloadStudioSave').disabled=false;}
}
function handleReloadShortcut(event){
 if(event.defaultPrevented||event.altKey||document.querySelector('dialog[open]'))return;
 const reloadKey=event.key==='F5'||((event.ctrlKey||event.metaKey)&&String(event.key).toLowerCase()==='r');
 if(!reloadKey)return;
 event.preventDefault();
 openReloadStudioDialog();
}
function confirmAction(title,message,label='Delete'){return popupAction({title,message,confirmLabel:label,danger:/delete|remove|clear/i.test(label)}).then(Boolean)}
function resetPhotoFilterState(photo){photo.filters={...FILTER_DEFAULTS};photo.filterPreset='none'}
async function deletePhotoAt(index){if(!Number.isInteger(index)||index<0||index>=app.photos.length)return;const target=app.photos[index];if(!await confirmAction('Delete imported photo?',`Remove “${target.name}” from this batch?\nOther photos will stay in the queue. You can use Undo to restore it.`,'Delete photo'))return;const currentId=getPhoto()?.id;saveHistory();app.photos.splice(index,1);const next=app.photos.findIndex(p=>p.id===currentId);selectPhoto(next>=0?next:Math.min(index,app.photos.length-1));updateGallery();notify('Photo deleted. Undo can restore it.')}
async function replaceCurrentPhoto(file){if(!file||!getPhoto())return;if(!isPhotoFile(file))return notify('Choose a JPG, PNG, or WebP photo.');const target=getPhoto();const id=target.id;try{const data=await dataUrlOf(file),image=await decodedImage(data);const current=app.photos.find(p=>p.id===id);if(!current)return;saveHistory();Object.assign(current,{name:file.name,data,image,zoom:1,rot:0,dx:0,dy:0,fit:'cover'});resetPhotoFilterState(current);current.enhancement={sharpness:0,denoise:0};current.covers=[];app.activeCoverIndex=-1;updateGallery();updateControls();render();notify('Photo replaced in the same collage slot.')}catch(err){notify('Could not replace photo: '+err.message)}}
function getPhoto(){return app.photos[app.selected]||null}
// Emoji covers are local photo edits. They never belong to a shared frame template.
const EMOJI_CATEGORIES=[{"id":"faces","label":"Smileys","icon":"☺","items":[["😎","cool sunglasses"],["😊","smile blush"],["😀","grinning"],["😁","beaming"],["😄","laugh"],["😃","happy"],["😆","happy laugh"],["😅","sweat smile"],["🤣","rofl"],["😂","tears of joy"],["🙂","slight smile"],["🙃","upside down"],["😉","wink"],["🥰","love"],["😍","heart eyes"],["😘","kiss"],["😗","kiss"],["😙","kissing"],["😚","blush kiss"],["😋","yummy"],["😛","tongue"],["😜","wink tongue"],["🤪","silly"],["😝","squint tongue"],["🤗","embrace"],["🤭","hand mouth"],["🫢","surprise"],["🫣","peek"],["🤫","quiet"],["🤔","thinking"],["🫡","salute"],["🤐","zip mouth"],["🤨","eyebrow"],["😐","neutral"],["😑","expressionless"],["😶","mouthless"],["😏","smirk"],["😒","unamused"],["🙄","eyes roll"],["😬","grimace"],["😌","relieved"],["😔","downcast"],["😪","sleepy"],["🤤","drooling"],["😴","sleeping"],["😷","mask"],["🤒","fever"],["🤕","bandage"],["🤢","nausea"],["🤮","vomit"],["🥵","hot"],["🥶","cold"],["🥴","woozy"],["😵","dizzy"],["🤯","mind blown"],["🥳","party"],["🤩","starry eyes"],["🥸","disguise"],["😕","confused"],["🫤","uncertain"],["😟","worried"],["🙁","sad"],["☹️","frown"],["😮","open mouth"],["😯","hushed"],["😲","shocked"],["😳","embarrassed"],["🥺","pleading"],["🥹","holding tears"],["😦","frown"],["😧","anguish"],["😨","afraid"],["😰","anxious"],["😥","relieved"],["😢","cry"],["😭","sobbing"],["😱","scared"],["😖","confounded"],["😣","persevering"],["😞","disappointed"],["😓","sweat"],["😩","weary"],["😫","tired"],["🥱","yawn"],["😤","annoyed"],["😡","angry"],["😠","mad"],["🤬","cursing"],["😈","devil smile"],["👿","devil"],["💀","skull"],["☠️","crossbones"],["👻","ghost"],["👽","alien"],["🤖","robot"],["🎃","pumpkin"],["😺","cat smile"],["😸","cat laugh"],["😻","cat love"],["😼","cat smirk"],["🙈","monkey hide see no evil"],["🙉","hear monkey"],["🙊","speak monkey"]]},{"id":"people","label":"People","icon":"☝","items":[["👶","baby"],["🧒","child"],["👧","girl"],["👦","boy"],["👩","woman"],["👨","man"],["🧑","person"],["👵","grandmother"],["👴","grandfather"],["👮","police"],["👷","construction"],["🕵️","detective"],["🧑‍🎓","student"],["🧑‍🚀","astronaut"],["🧑‍🍳","chef"],["👑","crown"],["🧢","cap"],["🎩","hat"],["🤠","cowboy"],["👋","wave"],["👍","thumbs up"],["👎","thumbs down"],["👌","okay"],["✌️","peace"],["🤞","cross fingers"],["🤙","call me"],["👏","clap"],["🙌","raise hands"],["🫶","heart hands"],["🙏","prayer"],["💪","strong"]]},{"id":"animals","label":"Animals","icon":"🐾","items":[["🐶","dog"],["🐱","cat"],["🐭","mouse"],["🐹","hamster"],["🐰","rabbit"],["🦊","fox"],["🐻","bear"],["🐼","panda"],["🐨","koala"],["🐯","tiger"],["🦁","lion"],["🐮","cow"],["🐷","pig"],["🐸","frog"],["🐵","monkey"],["🐔","chicken"],["🐧","penguin"],["🐦","bird"],["🦄","unicorn"],["🦋","butterfly"],["🐝","bee"],["🐙","octopus"],["🐬","dolphin"],["🦖","dinosaur"],["🐢","turtle"],["🐾","paw"]]},{"id":"food","label":"Food","icon":"🍎","items":[["🍎","apple"],["🍓","strawberry"],["🍌","banana"],["🍒","cherries"],["🍍","pineapple"],["🥑","avocado"],["🥕","carrot"],["🌽","corn"],["🍉","watermelon"],["🍇","grapes"],["🍋","lemon"],["🥥","coconut"],["🍔","burger"],["🍟","fries"],["🍕","pizza"],["🌭","hotdog"],["🥪","sandwich"],["🍩","donut"],["🍪","cookie"],["🎂","birthday cake"],["🍰","cake"],["🍦","ice cream"],["🍭","candy"],["🍫","chocolate"],["☕","coffee"],["🧋","milk tea"],["🥤","drink"],["🍹","juice"]]},{"id":"activities","label":"Activities","icon":"⚽","items":[["⚽","soccer"],["🏀","basketball"],["🏐","volleyball"],["🎾","tennis"],["🏸","badminton"],["🎱","billiards"],["🏆","trophy"],["🥇","medal"],["🎮","game"],["🎲","dice"],["🎯","target"],["🎨","art"],["🎤","microphone"],["🎧","headphones"],["🎵","music"],["🎸","guitar"],["🎺","trumpet"],["🎉","party popper"],["🎊","confetti"],["🎈","balloon"],["🎁","gift"],["🎀","ribbon"],["🪩","disco"]]},{"id":"travel","label":"Travel","icon":"🚗","items":[["🚗","car"],["🚙","suv"],["🚕","taxi"],["🚌","bus"],["🚓","police car"],["🚲","bicycle"],["🏍️","motorcycle"],["✈️","plane"],["🚀","rocket"],["🚁","helicopter"],["🚢","ship"],["⛵","boat"],["🌏","earth asia"],["🌍","world"],["🗺️","map"],["🏠","house"],["🏡","home"],["🏢","building"],["🏖️","beach"],["🌄","sunrise"],["🌈","rainbow"],["☀️","sun"],["🌙","moon"],["🌟","bright star"],["❄️","ice"],["⛄","snowman"],["🔥","fire"],["🌻","sunflower"]]},{"id":"objects","label":"Objects","icon":"💡","items":[["💡","lightbulb idea"],["📱","phone"],["💻","laptop"],["⌚","watch"],["📷","camera"],["📸","photo"],["📺","television"],["🔑","key"],["🔒","lock"],["📦","box"],["🧸","teddy"],["🛒","shopping cart"],["💰","money bag"],["💵","cash"],["💎","diamond"],["🔔","bell"],["📣","megaphone"],["🧲","magnet"],["🪄","magic wand"],["🪞","mirror"],["🕶️","sunglasses"],["👓","glasses"],["🧠","brain"],["🦷","tooth"],["🧼","soap"]]},{"id":"symbols","label":"Symbols","icon":"♥","items":[["❤️","red heart"],["🩷","pink heart"],["🧡","orange heart"],["💛","yellow heart"],["💚","green heart"],["💙","blue heart"],["💜","purple heart"],["🖤","black heart"],["🤍","white heart"],["🤎","brown heart"],["💖","sparkle heart"],["💗","growing heart"],["💝","gift heart"],["💘","arrow heart"],["💞","revolving hearts"],["💕","two hearts"],["💯","hundred"],["✅","check"],["✔️","tick"],["❌","cross"],["⚠️","warning"],["❗","exclamation"],["❓","question"],["🔴","red circle"],["🟡","yellow circle"],["🟢","green circle"],["🔵","blue circle"],["⭐","star"],["💫","stars"],["✨","sparkles"]]}];
const EMOJI_LIBRARY=EMOJI_CATEGORIES.flatMap(cat=>cat.items.map(([symbol,keywords])=>({symbol,keywords,category:cat.id})));
const FACE_EMOJIS=new Set(EMOJI_LIBRARY.map(x=>x.symbol));
let emojiCategory='faces',emojiQuery='',emojiPickerMode='add';
function safeCovers(input) {
 return (Array.isArray(input)?input:[]).slice(0,16).filter(c=>c&&FACE_EMOJIS.has(c.symbol)).map(c=>({
  symbol:c.symbol,x:clamp(Number.isFinite(Number(c.x))?Number(c.x):.5,.06,.94),
  y:clamp(Number.isFinite(Number(c.y))?Number(c.y):.43,.06,.94),
  size:clamp(Number.isFinite(Number(c.size))?Number(c.size):.28,.12,.7)
 }));
}
function activeCover(){const p=getPhoto();return p?.covers?.[app.activeCoverIndex]||null;}
function updateEmojiControls(){
 const p=getPhoto(),cover=activeCover();
 $('addEmojiCover').disabled=!p;
 $('emojiPickerOpen').disabled=!p;
 $('emojiPickerOpen').textContent=cover?'Change '+cover.symbol:'Choose emoji';
 $('emojiCoverSize').disabled=!cover;
 $('emojiCoverSize').value=String(Math.round((cover?.size||.28)*100));
 $('emojiCoverSizeValue').textContent=$('emojiCoverSize').value+'%';
 $('removeEmojiCover').disabled=!cover;
 $('emojiCoverHelp').textContent=!p?'Import a photo before adding an emoji.':
  cover?'Drag the emoji over the face, then adjust the size. Tap another emoji to select it.':
  'Tap “😎 Cover face” below the preview, then drag the emoji to the face.';
}
function addEmojiCover(symbol='😎'){
 const p=getPhoto();if(!p)return notify('Import and select a customer photo first.');
 if(!hasPhotoShape())return notify('Choose a photo opening before placing an emoji.');
 if((p.covers||[]).length>=16)return notify('Maximum 16 emoji covers per photo.');
 saveHistory();p.covers=safeCovers(p.covers);
 p.covers.push({symbol:FACE_EMOJIS.has(symbol)?symbol:'😎',x:.5,y:.43,size:.28});
 app.activeCoverIndex=p.covers.length-1;
 setLiveExportPreview(false);setMode('adjust');showPanel(4);updateEmojiControls();render();
 notify('Emoji added. Drag it over the face; use Size to adjust. Add another for another face.');
}
function renderEmojiPicker(){
 const tabs=$('emojiPickerTabs'),grid=$('emojiPickerGrid');
 tabs.replaceChildren();grid.replaceChildren();
 for(const category of EMOJI_CATEGORIES){
  const b=document.createElement('button');b.type='button';b.className='emojiPickerTab'+(category.id===emojiCategory?' active':'');
  b.textContent=category.icon;b.title=category.label;b.setAttribute('aria-label',category.label);
  b.setAttribute('aria-pressed',String(category.id===emojiCategory));
  b.onclick=()=>{emojiCategory=category.id;renderEmojiPicker()};
  tabs.append(b);
 }
 const query=emojiQuery.trim().toLocaleLowerCase();
 const entries=EMOJI_LIBRARY.filter(e=>query
  ? e.symbol.includes(query)||e.keywords.includes(query)||e.category.includes(query)
  : e.category===emojiCategory);
 $('emojiPickerCaption').textContent=query?'Results · '+entries.length:
   (EMOJI_CATEGORIES.find(c=>c.id===emojiCategory)?.label||'Emojis')+' · '+entries.length;
 const group=document.createDocumentFragment();
 for(const entry of entries){
  const b=document.createElement('button');b.type='button';b.className='emojiPickerItem';
  b.textContent=entry.symbol;b.title=entry.keywords;b.setAttribute('aria-label',entry.keywords);
  b.onclick=()=>chooseEmoji(entry.symbol);
  group.append(b);
 }
 if(!entries.length){const p=document.createElement('p');p.className='emojiPickerEmpty';p.textContent='No matching emojis. Try another keyword.';group.append(p)}
 grid.append(group);
}
function openEmojiPicker(mode='add'){
 if(!getPhoto())return notify('Import and select a customer photo first.');
 if(!hasPhotoShape())return notify('Choose a photo opening before placing an emoji.');
 emojiPickerMode=mode==='replace'&&activeCover()?'replace':'add';
 emojiQuery='';emojiCategory='faces';$('emojiPickerSearch').value='';
 $('emojiPickerTitle').textContent=emojiPickerMode==='replace'?'Change the selected emoji':'Choose a face-cover emoji';
 renderEmojiPicker();$('emojiPickerDialog').showModal();$('emojiPickerSearch').focus();
}
function closeEmojiPicker(){if($('emojiPickerDialog').open)$('emojiPickerDialog').close()}
function chooseEmoji(symbol){
 if(!FACE_EMOJIS.has(symbol))return;
 closeEmojiPicker();
 if(emojiPickerMode==='replace'&&activeCover()){
  saveHistory();activeCover().symbol=symbol;updateEmojiControls();render();notify('Emoji changed.');
 }else addEmojiCover(symbol);
}

function coverGeometry(cover,cell){
 const diameter=Math.min(cell.w,cell.h)*clamp(cover.size,.12,.7);
 return {x:cell.x+cell.w*cover.x,y:cell.y+cell.h*cover.y,radius:diameter*.62,diameter};
}
function drawFaceCovers(ctx,photo,cell,points){
 if(!photo?.covers?.length)return;
 ctx.save();polygonPath(ctx,points);ctx.clip();
 ctx.beginPath();ctx.rect(cell.x,cell.y,cell.w,cell.h);ctx.clip();
 ctx.textAlign='center';ctx.textBaseline='middle';
 for(const cover of photo.covers.slice(0,16)){
  if(!FACE_EMOJIS.has(cover.symbol))continue;
  const g=coverGeometry(cover,cell);
  // Draw just the native emoji glyph; no artificial yellow backdrop.
  ctx.font=Math.round(g.diameter)+'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  ctx.fillText(cover.symbol,g.x,g.y,g.diameter*1.16);
 }
 ctx.restore();
}
function decodedImage(src){return new Promise((resolve,reject)=>{const im=new Image(); im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Image could not be decoded'));im.src=src})}
function dataUrlOf(file){return new Promise((resolve,reject)=>{const f=new FileReader();f.onload=()=>resolve(f.result);f.onerror=()=>reject(Error('Cannot read file'));f.readAsDataURL(file)})}
function setMode(mode){app.mode=mode;$('mapBtn').classList.toggle('active',mode==='map');$('adjustBtn').classList.toggle('active',mode==='adjust');$('canvasShell').classList.toggle('adjust',mode==='adjust');$('modeTag').textContent=app.overlayEditing?'Overlay editing':mode==='map'?'Shape editing':'Photo / collage adjusting';$('modeHint').textContent=mode==='map'?'Drag square corner handles to resize the whole shape without distortion. Round handles edit individual points; drag the middle to move. Shift-click an edge to add a point.':'Click any collage cell to edit its photo. Drag to reposition, then use Zoom/Rotation for that photo.';if(mode==='adjust'&&app.drawingPolygon){app.drawingPolygon=false;app.draftPoints=[];updateShapeUI()}render()}
function applyTemplate(template,source,frame){app.template=template;app.frame=frame;app.drawingPolygon=false;app.draftPoints=[];app.undoStack=[];app.redoStack=[];const c=template.collage||{count:1,layout:'grid',gap:1};app.collage={count:clamp(+c.count||1,1,9),layout:[...$('collageLayout').options].some(o=>o.value===c.layout)?c.layout:'grid',gap:clamp(+c.gap||0,0,5)};$('collageCount').value=String(app.collage.count);$('collageLayout').value=app.collage.layout;$('collageGap').value=String(app.collage.gap);$('collageGapValue').textContent=app.collage.gap+'%';app.rect={...(template.rect||{x:Math.round(frame.width*.1),y:Math.round(frame.height*.2),w:Math.round(frame.width*.8),h:Math.round(frame.height*.6)})};app.frameOpening=cloneShape(template.frameOpening||shapeOf(template));app.appearance=templateAppearance(template,app.frameOpening,frame);syncAppearanceUI();setShape(shapeOf(template),false);$('previewTitle').textContent=template.name;$('previewInfo').textContent=frame.width+' × '+frame.height+' px';populateTemplates();$('templateSelect').value=template.id;updateShapeUI();render();updateLabels()}
function sampleTemplate(id='sample'){if(id==='gold')return {id:'gold',name:'7-Day Big Savings Sale · Gold corners',data:GOLD_IMAGE,rect:shapeBounds(goldPoints),shape:cloneShape(defaultGoldShape),frameOpening:cloneShape(defaultGoldShape),appearance:{borderColor:'#d7b34a',borderWidth:8,replaceOpening:true}};return {id:'sample',name:'7-Day Big Savings Sale · Blue border',data:SAMPLE_IMAGE,rect:{...defaultRect},shape:{type:'rect',points:rectPoints(defaultRect)},frameOpening:{type:'rect',points:rectPoints(defaultRect)},appearance:{borderColor:'#1f55d7',borderWidth:8,replaceOpening:true}}}
async function switchTemplate(id){const template=(id==='sample'||id==='gold')?sampleTemplate(id):app.templates.find(t=>t.id===id);if(!template)return;try{const frame=await decodedImage(template.data);applyTemplate(template,template.data,frame)}catch(err){notify('Unable to load this frame: '+err.message)}}
function populateTemplates(){const sel=$('templateSelect');const selected=app.template?.id||'new';sel.innerHTML='';const opts=allFrameTemplates();if(app.template?.id==='new')opts.push(app.template);for(const t of opts){const o=document.createElement('option');o.value=t.id;o.textContent=t.id==='new'?'✳ Unsaved: '+t.name:t.name;sel.append(o)}sel.value=selected}
const DB_NAME='megaframe_studio_local', DB_STORE='templates';let dbPromise;
function dbOpen(){if(dbPromise)return dbPromise;dbPromise=new Promise((resolve)=>{if(!window.indexedDB)return resolve(null);try{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(DB_STORE))r.result.createObjectStore(DB_STORE,{keyPath:'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve(null)}catch{resolve(null)}});return dbPromise}
async function dbAll(){const db=await dbOpen();if(!db)return[];return new Promise(resolve=>{try{const r=db.transaction(DB_STORE,'readonly').objectStore(DB_STORE).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>resolve([])}catch{resolve([])}})}
async function dbPut(t){const db=await dbOpen();if(!db)return false;return new Promise(resolve=>{try{const x=db.transaction(DB_STORE,'readwrite');x.objectStore(DB_STORE).put(t);x.oncomplete=()=>resolve(true);x.onerror=()=>resolve(false)}catch{resolve(false)}})}
async function dbDelete(id){const db=await dbOpen();if(!db)return false;return new Promise(resolve=>{try{const x=db.transaction(DB_STORE,'readwrite');x.objectStore(DB_STORE).delete(id);x.oncomplete=()=>resolve(true);x.onerror=()=>resolve(false)}catch{resolve(false)}})}
async function uploadTemplate(file){if(!isPhotoFile(file))return notify('Please select JPG, PNG or WebP image.');try{let data=await dataUrlOf(file);const frame=await decodedImage(data);if(frame.width<200||frame.height<200)return notify('Please use a frame at least 200 × 200 pixels.');const rect={x:Math.round(frame.width*.10),y:Math.round(frame.height*.20),w:Math.round(frame.width*.80),h:Math.round(frame.height*.60)};const name=file.name.replace(/\.[^.]+$/,'');const opening=blankShape();const t={id:'new',name,data,rect,shape:cloneShape(opening),frameOpening:cloneShape(opening),appearance:{borderColor:'#d7b34a',borderWidth:8,replaceOpening:false}};applyTemplate(t,data,frame);setMode('map');notify('Frame imported without a shape. Choose an opening from the dropdown, draw one, or reuse a saved shape.')}catch(err){notify('Could not import the frame: '+err.message)}}
function boundRect(r){const W=app.frame?.width||2018,H=app.frame?.height||2048;let x=Math.max(0,Math.min(W-8,r.x)),y=Math.max(0,Math.min(H-8,r.y));let w=Math.max(8,Math.min(W-x,r.w)),h=Math.max(8,Math.min(H-y,r.h));return{x,y,w,h}}
function render(){if(hasUnsavedChanges())scheduleDraftSave();updateUnsavedIndicator();updatePhotoQuality();if(renderPending)return;renderPending=true;requestAnimationFrame(()=>{renderPending=false;drawPreview();drawLiveExportPreview()})}
function canvasSize(){const canvas=$('previewCanvas');const frame=app.frame;if(!frame)return null;if(canvas.width!==frame.width||canvas.height!==frame.height){canvas.width=frame.width;canvas.height=frame.height}return canvas}
function drawPhoto(ctx,photo,points){const rect=shapeBounds(points);ctx.save();polygonPath(ctx,points);ctx.clip();ctx.fillStyle='#fff';ctx.fillRect(rect.x,rect.y,rect.w,rect.h);const im=enhancedPhotoImage(photo);if(!im){ctx.restore();return}const rot=(photo.rot||0)*Math.PI/180;const absC=Math.abs(Math.cos(rot)),absS=Math.abs(Math.sin(rot));const bw=im.width*absC+im.height*absS,bh=im.width*absS+im.height*absC;const base=(photo.fit==='contain'?Math.min(rect.w/bw,rect.h/bh):Math.max(rect.w/bw,rect.h/bh));const sc=base*(photo.zoom||1);const dw=im.width*sc,dh=im.height*sc;const cx=rect.x+rect.w/2+(photo.dx||0)*rect.w,cy=rect.y+rect.h/2+(photo.dy||0)*rect.h;ctx.translate(cx,cy);ctx.rotate(rot);ctx.filter=photoFilterCSS(photo);ctx.drawImage(im,-dw/2,-dh/2,dw,dh);ctx.filter='none';ctx.restore()}
function renderComposite(ctx,scale,photosOrPage,previewOnly=false,raw=false){const frame=app.frame;if(!frame)return;const W=frame.width,H=frame.height;ctx.clearRect(0,0,W*scale,H*scale);ctx.save();ctx.scale(scale,scale);ctx.drawImage(frame,0,0);const needsCleanup=!!app.appearance?.replaceOpening&&app.frameOpening?.points?.length>=3;if(needsCleanup)coverOriginalOpening(ctx,app.frameOpening.points);let items=[];if(typeof photosOrPage==='number')items=getPagePhotos(photosOrPage);else if(Array.isArray(photosOrPage))items=photosOrPage;else if(photosOrPage)items=[photosOrPage];const missing=!hasPhotoShape();if(items.length&&(!missing||previewOnly)){const bounds=missing?app.rect:app.rect;const points=missing?rectPoints(bounds):app.shape.points;const cells=layoutCells(Math.min(app.collage.count,items.length),app.collage.layout,bounds,app.collage.gap);if(missing){ctx.save();ctx.globalAlpha=.94}for(let i=0;i<Math.min(items.length,cells.length);i++)drawCollagePhoto(ctx,items[i],points,cells[i],raw);if(missing)ctx.restore()}if(needsCleanup){ctx.save();ctx.beginPath();ctx.rect(0,0,W,H);addPolygonPath(ctx,app.frameOpening.points);ctx.clip('evenodd');ctx.drawImage(frame,0,0);ctx.restore()}if(hasPhotoShape())strokeOpeningBorder(ctx,app.shape.points);if(!raw&&items.length&&(!missing||previewOnly)){const points=missing?rectPoints(app.rect):app.shape.points;const cells=layoutCells(Math.min(app.collage.count,items.length),app.collage.layout,app.rect,app.collage.gap);for(let i=0;i<Math.min(items.length,cells.length);i++)drawFaceCovers(ctx,items[i],cells[i],points)}if(!raw){const overlayCells=items.length?layoutCells(Math.min(app.collage.count,items.length),app.collage.layout,app.rect,app.collage.gap):[];overlayDrawLayers(ctx,items,overlayCells)}if(missing&&previewOnly&&items.length){const r=app.rect;ctx.save();ctx.lineWidth=Math.max(4,W/340);ctx.strokeStyle='#f5c94d';ctx.setLineDash([Math.max(8,W/90),Math.max(6,W/150)]);ctx.strokeRect(r.x,r.y,r.w,r.h);ctx.setLineDash([]);const size=Math.max(18,Math.round(W/53));const label='PREVIEW ONLY · SELECT A PHOTO SHAPE';ctx.font=`bold ${size}px system-ui,sans-serif`;const mw=ctx.measureText(label).width;ctx.fillStyle='#101e4dde';ctx.fillRect(r.x,r.y,Math.min(r.w,mw+32),size+22);ctx.fillStyle='#fff';ctx.fillText(label,r.x+14,r.y+size+9);ctx.restore()}ctx.restore()}
function drawPreview(){if(!app.frame)return;const canvas=canvasSize();const ctx=canvas.getContext('2d');renderComposite(ctx,1,app.selected>=0?currentPage():[],true);if(!app.overlayEditing&&app.mode==='adjust'&&hasPhotoShape()&&app.photos.length&&app.collage.count>1){const cells=layoutCells(getPagePhotos(currentPage()).length,app.collage.layout,app.rect,app.collage.gap),active=app.selected%app.collage.count;ctx.save();ctx.lineWidth=Math.max(3,canvas.width/300);ctx.setLineDash([12,8]);ctx.strokeStyle='#11d1ff';ctx.beginPath();ctx.rect(cells[active].x,cells[active].y,cells[active].w,cells[active].h);ctx.stroke();ctx.setLineDash([]);ctx.restore()}if(!app.overlayEditing&&app.mode==='adjust'&&activeCover()&&app.photos.length&&hasPhotoShape()){const cells=layoutCells(getPagePhotos(currentPage()).length,app.collage.layout,app.rect,app.collage.gap),slot=app.selected%app.collage.count,cell=cells[slot];if(cell){const g=coverGeometry(activeCover(),cell);ctx.save();ctx.strokeStyle='#0bcfff';ctx.lineWidth=Math.max(3,canvas.width/420);ctx.setLineDash([10,8]);ctx.beginPath();ctx.arc(g.x,g.y,g.radius+5,0,2*Math.PI);ctx.stroke();ctx.restore()}}if(!app.overlayEditing&&app.mode==='map'&&(hasPhotoShape()||app.drawingPolygon)){const pts=app.shape.points;ctx.save();const radius=Math.max(5,canvas.width/170);if(pts.length>=3){ctx.beginPath();ctx.rect(0,0,canvas.width,canvas.height);addPolygonPath(ctx,pts);ctx.fillStyle='rgba(12,31,71,.20)';ctx.fill('evenodd');polygonPath(ctx,pts);ctx.lineWidth=Math.max(3,canvas.width/420);ctx.strokeStyle='#00dcff';ctx.setLineDash([18,10]);ctx.stroke();ctx.setLineDash([]);pts.forEach((p,i)=>{ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fillStyle=i===app.selectedPoint?'#ffd65b':'#fff';ctx.fill();ctx.lineWidth=Math.max(2,canvas.width/650);ctx.strokeStyle='#3157dc';ctx.stroke()});ctx.fillStyle='#fff';ctx.strokeStyle='#1267e7';ctx.lineWidth=Math.max(3,canvas.width/420);for(const h of scaleHandles()){const hs=Math.max(10,canvas.width/110);ctx.fillRect(h.x-hs/2,h.y-hs/2,hs,hs);ctx.strokeRect(h.x-hs/2,h.y-hs/2,hs,hs)}}if(app.drawingPolygon&&app.draftPoints.length){ctx.beginPath();const ps=app.draftPoints;ctx.moveTo(ps[0].x,ps[0].y);for(let i=1;i<ps.length;i++)ctx.lineTo(ps[i].x,ps[i].y);if(app.cursor)ctx.lineTo(app.cursor.x,app.cursor.y);ctx.setLineDash([13,10]);ctx.lineWidth=Math.max(4,canvas.width/340);ctx.strokeStyle='#ffd23e';ctx.stroke();ctx.setLineDash([]);for(const p of ps){ctx.beginPath();ctx.arc(p.x,p.y,radius*1.2,0,Math.PI*2);ctx.fillStyle='#ffdc40';ctx.fill()}}ctx.restore()}overlayDrawSelection(ctx)}
function getPoint(e){const b=$('previewCanvas').getBoundingClientRect();return{x:(e.clientX-b.left)*app.frame.width/b.width,y:(e.clientY-b.top)*app.frame.height/b.height}}
function pointerHit(p){const scaleHit=Math.max(12,app.frame.width/95);for(const h of scaleHandles())if(Math.abs(p.x-h.x)<scaleHit&&Math.abs(p.y-h.y)<scaleHit)return{type:'scale',corner:h.corner};const hit=Math.max(12,app.frame.width/110);let nearest=-1,best=hit*hit;for(let i=0;i<app.shape.points.length;i++){const a=app.shape.points[i];const d=(p.x-a.x)**2+(p.y-a.y)**2;if(d<best){best=d;nearest=i}}if(nearest>=0)return {type:'vertex',index:nearest};if(insidePolygon(p,app.shape.points))return {type:'move'};return {type:'drawRect'}}
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function finishPolygon(){if(!app.drawingPolygon||app.draftPoints.length<3)return;setShape({type:'polygon',points:app.draftPoints});app.draftPoints=[];app.drawingPolygon=false;updateShapeUI();notify('New custom photo opening created. Drag the points to fine-tune the edges.')}
function pointerDown(e){if(!app.frame)return;if(e.button!==0&&e.pointerType==='mouse')return;const p=getPoint(e);if(app.overlayEditing){overlayPointerDown(p);try{$('previewCanvas').setPointerCapture(e.pointerId)}catch{}e.preventDefault();return}if(!hasPhotoShape()&&!app.drawingPolygon)return;if(app.mode==='adjust'){if(!app.photos.length||!insidePolygon(p,app.shape.points))return;const cells=layoutCells(getPagePhotos(currentPage()).length,app.collage.layout,app.rect,app.collage.gap);let hitSlot=cells.findIndex(c=>p.x>=c.x&&p.x<=c.x+c.w&&p.y>=c.y&&p.y<=c.y+c.h);if(hitSlot<0||hitSlot>=getPagePhotos(currentPage()).length)return;const idx=currentPage()*app.collage.count+hitSlot;if(idx!==app.selected)selectPhoto(idx);const photo=getPhoto(),covers=photo.covers||[];let hitCover=-1;for(let i=covers.length-1;i>=0;i--){const g=coverGeometry(covers[i],cells[hitSlot]);if(Math.hypot(p.x-g.x,p.y-g.y)<=g.radius+Math.max(8,app.frame.width/300)){hitCover=i;break}}saveHistory();if(hitCover>=0){app.activeCoverIndex=hitCover;app.pointer={type:'face-cover',start:p,photoId:photo.id,index:hitCover,x:covers[hitCover].x,y:covers[hitCover].y,cell:cells[hitSlot]};updateEmojiControls();render()}else{app.pointer={type:'adjust',start:p,dx:photo.dx||0,dy:photo.dy||0,cell:cells[hitSlot]}}$('canvasShell').classList.add('grabbing')}else if(app.drawingPolygon){const first=app.draftPoints[0],hit=Math.max(17,app.frame.width/90);if(first&&app.draftPoints.length>=3&&Math.hypot(p.x-first.x,p.y-first.y)<hit){finishPolygon()}else if(app.draftPoints.length<128){app.draftPoints.push({x:clamp(p.x,0,app.frame.width),y:clamp(p.y,0,app.frame.height)});updateShapeUI();render()}e.preventDefault();return}else{if(e.shiftKey){const segment=nearestSegment(p,app.shape.points);if(segment.dist<Math.max(17,app.frame.width/70)){insertPoint(p);e.preventDefault();return}}const hit=pointerHit(p);saveHistory();app.selectedPoint=hit.type==='vertex'?hit.index:-1;app.pointer={...hit,start:p,points:app.shape.points.map(q=>({...q})),rect:{...app.rect}};updateShapeUI()}try{$('previewCanvas').setPointerCapture(e.pointerId)}catch{}e.preventDefault()}
function pointerMove(e){if(!app.frame)return;const p=getPoint(e);if(app.overlayPointer){overlayPointerMove(p);e.preventDefault();return}app.cursor=p;if(!app.pointer){if(app.drawingPolygon)render();return}const start=app.pointer.start,W=app.frame.width,H=app.frame.height,dx=p.x-start.x,dy=p.y-start.y;if(app.pointer.type==='face-cover'){const photo=app.photos.find(q=>q.id===app.pointer.photoId),cover=photo?.covers?.[app.pointer.index];if(!cover)return;cover.x=clamp(app.pointer.x+dx/app.pointer.cell.w,.06,.94);cover.y=clamp(app.pointer.y+dy/app.pointer.cell.h,.06,.94);render();return}if(app.pointer.type==='adjust'){const photo=getPhoto();if(!photo)return;photo.dx=clamp(app.pointer.dx+dx/app.pointer.cell.w,-2,2);photo.dy=clamp(app.pointer.dy+dy/app.pointer.cell.h,-2,2);render();return}if(app.pointer.type==='drawRect'){if(Math.abs(dx)<4&&Math.abs(dy)<4)return;const r=boundRect({x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),w:Math.abs(dx),h:Math.abs(dy)});app.shape={type:'rect',points:rectPoints(r)}}else if(app.pointer.type==='vertex'){const pts=app.pointer.points.map(q=>({...q}));pts[app.pointer.index]={x:clamp(pts[app.pointer.index].x+dx,0,W),y:clamp(pts[app.pointer.index].y+dy,0,H)};app.shape={type:'polygon',points:pts}}else if(app.pointer.type==='scale'){const r=app.pointer.rect;const corner=app.pointer.corner;const anchor={x:corner.includes('l')?r.x+r.w:r.x,y:corner.includes('t')?r.y+r.h:r.y};const sx=corner.includes('l')?r.x:r.x+r.w,sy=corner.includes('t')?r.y:r.y+r.h;const vx=sx-anchor.x,vy=sy-anchor.y;let factor=((p.x-anchor.x)*vx+(p.y-anchor.y)*vy)/(vx*vx+vy*vy);app.shape={...app.shape,points:scalePointsFrom(app.pointer.points,anchor,factor)}}else if(app.pointer.type==='move'){const r=app.pointer.rect,mx=clamp(dx,-r.x,W-r.x-r.w),my=clamp(dy,-r.y,H-r.y-r.h);app.shape={...app.shape,points:app.pointer.points.map(q=>({x:q.x+mx,y:q.y+my}))}}app.rect=shapeBounds(app.shape.points);updateShapeUI();render()}
function pointerUp(){if(overlayPointerUp()){render();return}app.pointer=null;$('canvasShell').classList.remove('grabbing');resetScaleUI()}
function isPhotoFile(f){return f&&(/image\/(png|jpeg|webp)/.test(f.type)||/\.(png|jpe?g|webp)$/i.test(f.name))}
async function importPhotos(list){const files=Array.from(list).filter(isPhotoFile);if(!files.length)return notify('Select JPG, PNG or WebP photos.');saveHistory();let count=0;for(const file of files){try{const data=await dataUrlOf(file),image=await decodedImage(data);const photo={id:'p'+Date.now()+Math.random(),name:file.name,data,image,zoom:1,rot:0,dx:0,dy:0,fit:'cover',filters:{...FILTER_DEFAULTS},filterPreset:'none'};app.photos.push(photo);count++}catch(err){console.warn('Skipped unreadable image',file.name,err)}}if(count){selectPhoto(app.photos.length-count);setMode('adjust');updateGallery();notify(count+' photo'+(count!==1?'s':'')+' imported and ready for framing or collage.')}else notify('No valid photos could be imported.')}
function selectPhoto(i){if(!app.photos.length){app.selected=-1;app.activeCoverIndex=-1;updateControls();render();updateLabels();overlayRefreshAfterPhoto();return}app.selected=(i+app.photos.length)%app.photos.length;app.activeCoverIndex=(getPhoto()?.covers?.length||0)-1;updateControls();updateGallery();render();updateLabels();overlayRefreshAfterPhoto()}
function updateLabels(){const p=getPhoto(),count=app.collage.count,pages=Math.ceil(app.photos.length/count),page=currentPage(),hasShape=hasPhotoShape();$('previewLabel').textContent=!hasShape?(p?'Preview only · Choose a photo opening in section 2 before exporting':'No photo opening selected · Choose a shape or reuse one from Frame Library'):p?count===1?`${app.selected+1} of ${app.photos.length} · ${p.name}`:`Collage ${page+1} of ${pages} · Slot ${app.selected%count+1} · ${p.name}`:'Frame ready · upload photos to get started';$('photoCount').textContent=`${app.photos.length} photo${app.photos.length===1?'':'s'} uploaded`;$('queueSummary').textContent=app.photos.length?`${pages} frame${pages===1?'':'s'} · ${count} photo${count===1?'':'s'} per frame${hasShape?'':' · preview only'}`:'No photos yet';$('previous').disabled=pages<2;$('next').disabled=pages<2;$('downloadOne').disabled=!p||app.exporting||!hasShape;$('downloadZip').disabled=!app.photos.length||app.exporting||!hasShape;$('prepareAll').disabled=!app.photos.length||app.exporting||!hasShape;for(const id of ['quickReplacePhoto','quickDeletePhoto','replaceSelectedPhoto','deleteSelectedPhoto'])if($(id))$(id).disabled=!p;updateCollageInfo()}
// v2.3: source-resolution check for the chosen output size and collage cell.
// This is a warning, not AI upscaling; it never alters customer photos.
function updatePhotoQuality() {
 const box=$('photoQuality');
 if(!box)return;
 const p=getPhoto();
 if(!p?.image||!app.frame||!hasPhotoShape()){
  box.dataset.grade='none';
  box.innerHTML='<strong>Photo quality check</strong>Upload a photo and select its opening to estimate printed/exported sharpness.';
  return;
 }
 const bounds=shapeBounds(app.shape.points),count=app.collage.count;
 const cells=layoutCells(count,app.collage.layout,bounds,app.collage.gap);
 const cell=cells[(Math.max(0,app.selected))%count]||bounds;
 const rot=(p.rot||0)*Math.PI/180,ca=Math.abs(Math.cos(rot)),sa=Math.abs(Math.sin(rot));
 // Use the source resolution (not an enhanced preview that might already be resized).
 const iw=p.image.naturalWidth||p.image.width,ih=p.image.naturalHeight||p.image.height;
 const rotatedWidth=iw*ca+ih*sa,rotatedHeight=iw*sa+ih*ca;
 const scaleBase=(p.fit==='contain'
   ?Math.min(cell.w/rotatedWidth,cell.h/rotatedHeight)
   :Math.max(cell.w/rotatedWidth,cell.h/rotatedHeight));
 const finalScale=scaleBase*(p.zoom||1)*(getDims().w/app.frame.width);
 if(!Number.isFinite(finalScale)||finalScale<=0)return;
 const ratio=Math.max(0,finalScale),rounded=ratio.toFixed(1);
 const grade=ratio>1.6?'low':ratio>1.15?'medium':'good';
 const title=grade==='low'?'Likely to appear pixelated':grade==='medium'?'May look slightly soft':'Resolution looks adequate';
 const note=grade==='low'
   ? 'The photo is enlarged considerably. Use a higher-resolution original, reduce zoom, or choose a smaller export size.'
   :grade==='medium'
   ? 'A higher-resolution original could improve clarity for printing and larger downloads.'
   : 'The source image should be sufficient for this size; lighting, focus and compression can still affect sharpness.';
 box.dataset.grade=grade;
 // All visible text is escaped by using textContent; file metadata never becomes HTML.
 box.replaceChildren();
 const heading=document.createElement('strong');heading.textContent='Photo quality · '+title;
 const detail=document.createElement('span');
 detail.textContent=iw+' × '+ih+' px original · '+rounded+'× export scale. '+note;
 box.append(heading,detail);
}

function updateControls(){const p=getPhoto();$('zoom').value=Math.round((p?.zoom||1)*100);$('zoomValue').textContent=$('zoom').value+'%';$('rotate').value=p?.rot||0;$('rotateValue').textContent=$('rotate').value+'°';$('fitMode').value=p?.fit||'cover';for(const id of ['zoom','rotate','fitMode','resetPhoto','applyAll','replaceSelectedPhoto','deleteSelectedPhoto','quickReplacePhoto','quickDeletePhoto','fitFullPhoto','fillPhotoFrame','centerPhoto','resetPhotoPosition'])$(id).disabled=!p;const f=filtersOf(p);$('filterPreset').value=p?.filterPreset||'none';for(const [key,suffix] of [['Brightness','brightness'],['Contrast','contrast'],['Saturation','saturation'],['Grayscale','grayscale'],['Sepia','sepia']]){$('filter'+key).value=f[suffix];$('filter'+key+'Value').textContent=f[suffix]+'%';$('filter'+key).disabled=!p}for(const id of ['filterPreset','resetPhotoFilters','autoLighting'])$(id).disabled=!p;const enh=enhanceSettings(p);for(const [id,key] of [['enhanceSharpness','sharpness'],['enhanceDenoise','denoise']]){$(id).value=enh[key];$(id+'Value').textContent=enh[key]+'%';$(id).disabled=!p}$('resetEnhancement').disabled=!p;updateEmojiControls()}
function updateGallery(){const g=$('gallery');g.innerHTML='';if(!app.photos.length){g.innerHTML='<div class="emptyGallery" style="grid-column:1/-1">Your imported photos will appear here. Drag thumbnails to rearrange collage slots.</div>';updateLabels();return}const frag=document.createDocumentFragment();app.photos.forEach((p,i)=>{const b=document.createElement('div');b.className='thumb'+(i===app.selected?' active':'');b.title=p.name+' — drag to swap positions';b.tabIndex=0;b.draggable=true;b.setAttribute('role','button');b.setAttribute('aria-label',`Select photo ${i+1}: ${p.name}`);const img=document.createElement('img');img.src=p.data;img.alt='';img.style.filter=photoFilterCSS(p);const n=document.createElement('div');n.className='name';n.textContent=p.name;const num=document.createElement('span');num.className='num';num.textContent=String(i+1).padStart(2,'0');const head=document.createElement('div');head.className='thumbTopActions';
const replaceBtn=document.createElement('button');replaceBtn.type='button';replaceBtn.className='thumbReplace';replaceBtn.textContent='↻ Replace';replaceBtn.title='Replace this photo in the same collage slot';replaceBtn.setAttribute('aria-label','Replace '+p.name);
replaceBtn.draggable=false;replaceBtn.onclick=e=>{e.preventDefault();e.stopPropagation();selectPhoto(i);$('replacePhotoInput').click()};
const rem=document.createElement('button');rem.type='button';rem.className='thumbDelete';rem.textContent='×';rem.title='Delete this photo';rem.setAttribute('aria-label','Delete '+p.name);rem.draggable=false;rem.onclick=e=>{e.preventDefault();e.stopPropagation();deletePhotoAt(i)};
head.append(replaceBtn,rem);const order=document.createElement('div');order.className='orderButtons';for(const [label,delta] of [['←',-1],['→',1]]){const btn=document.createElement('button');btn.type='button';btn.textContent=label;btn.title='Move photo '+(delta>0?'right':'left');btn.disabled=i+delta<0||i+delta>=app.photos.length;btn.onclick=e=>{e.stopPropagation();movePhoto(i,i+delta)};order.append(btn)}const slot=document.createElement('span');slot.className='slotBadge';slot.textContent=`P${Math.floor(i/app.collage.count)+1} · ${i%app.collage.count+1}`;const drag=document.createElement('span');drag.className='dragBadge';drag.textContent='↕ Drag';b.onclick=()=>selectPhoto(i);b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectPhoto(i)}};b.ondragstart=e=>{e.dataTransfer.setData('text/plain',String(i));e.dataTransfer.effectAllowed='move'};b.ondragenter=e=>{e.preventDefault();if(+e.dataTransfer.getData('text/plain')!==i)b.classList.add('dragOver')};b.ondragover=e=>{e.preventDefault();e.dataTransfer.dropEffect='move'};b.ondragleave=()=>b.classList.remove('dragOver');b.ondrop=e=>{e.preventDefault();e.stopPropagation();b.classList.remove('dragOver');const from=+e.dataTransfer.getData('text/plain');if(Number.isInteger(from)&&from>=0&&from<app.photos.length)swapPhoto(from,i)};b.ondragend=()=>b.classList.remove('dragOver');b.append(head,img,n,num,order,slot,drag);frag.append(b)});g.append(frag);updateLabels()}
function dateStamp(){return new Date().toISOString().slice(0,10).replaceAll('-','')}
function fileName(index){const ext=$('exportType').value==='image/png'?'png':'jpg';const total=Math.ceil(app.photos.length/app.collage.count);return`${safeName($('prefix').value)}_${app.collage.count===1?'Photo':'Collage'}_${String(index+1).padStart(Math.max(3,String(total).length),'0')}.${ext}`}
function downloadBlob(blob,name){const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000)}
let exportPreviewActive=false;
function hasExportPreview(){return exportPreviewActive && !!app.frame && hasPhotoShape() && app.photos.length>0}
function setLiveExportPreview(active){
 exportPreviewActive=!!active;
 if(!app.frame){return}
 drawLiveExportPreview();
}
function drawLiveExportPreview(){
 const shell=$('canvasShell'),canvas=$('exportPreviewCanvas'),active=hasExportPreview();
 shell.classList.toggle('liveExport',active);
 canvas.hidden=!active;
 $('exportInspect').hidden=!active;
 $('returnEditor').hidden=!active;
 $('modeTag').textContent=active?'Live export preview':app.overlayEditing?'Overlay editing':app.mode==='map'?'Shape editing':'Photo / collage adjusting';
 $('previewInfo').textContent=app.frame?(active?getDims().w+' × '+getDims().h+' px':app.frame.width+' × '+app.frame.height+' px'):'';
 if(!app.frame)return;
 const {w,h}=getDims(),mime=$('exportType').value==='image/png'?'PNG':'JPG';
 $('liveExportSize').textContent=hasPhotoShape()&&app.photos.length?mime+' · '+w+' × '+h+' px'+(active?' · Live preview on right':' · Select Export images to view'): 'Select a photo opening and import photos to see the final export.';
 if(!active)return;
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
 // draw from the same model, geometry and resolution used by makeOutput()—
 // no mapping handles, overlays or selection outlines are exported.
 renderComposite(canvas.getContext('2d'),w/app.frame.width,currentPage());
 if($('exportInspectDialog').open)drawInspectExport();
}
function drawInspectExport(){
 if(!hasExportPreview())return;
 const {w,h}=getDims(),canvas=$('exportInspectCanvas');
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
 renderComposite(canvas.getContext('2d'),w/app.frame.width,currentPage());
 $('exportInspectDimensions').textContent=w+' × '+h+' pixels · '+($('exportType').value==='image/png'?'PNG':'JPG')+' · actual size';
}
function openExportInspect(){if(!hasExportPreview())return;drawInspectExport();$('exportInspectDialog').showModal()}
function getDims(){const choice=$('exportSize').value;const w=choice==='original'?app.frame.width:choice==='2x'?app.frame.width*2:parseInt(choice,10);const h=Math.round(w*app.frame.height/app.frame.width);return{w,h}}
async function makeOutput(page,raw=false,maxWidth=0){let {w,h}=getDims();if(maxWidth&&w>maxWidth){w=maxWidth;h=Math.max(1,Math.round(w*app.frame.height/app.frame.width))}const cvs=document.createElement('canvas');cvs.width=w;cvs.height=h;renderComposite(cvs.getContext('2d'),w/app.frame.width,page,false,raw);const mime=$('exportType').value;return new Promise((resolve,reject)=>cvs.toBlob(b=>b?resolve(b):reject(Error('Image export failed')),mime,.93))}
const crcTable=(()=>{const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0}return table})();
function crc32(bytes){let crc=0xffffffff;for(let i=0;i<bytes.length;i++)crc=crcTable[(crc^bytes[i])&255]^(crc>>>8);return (crc^0xffffffff)>>>0}
function packHeader(sig,len){const a=new Uint8Array(len),v=new DataView(a.buffer);v.setUint32(0,sig,true);return{a,v}}
async function zipFiles(items,progress){const encoder=new TextEncoder(),parts=[],central=[];let pos=0;for(let i=0;i<items.length;i++){const{name,blob}=items[i],bytes=new Uint8Array(await blob.arrayBuffer()),crc=crc32(bytes),nb=encoder.encode(name);if(nb.length>65535)throw Error('Filename too long');const h=packHeader(0x04034b50,30+nb.length);h.v.setUint16(4,20,true);h.v.setUint16(6,0x0800,true);h.v.setUint16(8,0,true);h.v.setUint32(14,crc,true);h.v.setUint32(18,bytes.length,true);h.v.setUint32(22,bytes.length,true);h.v.setUint16(26,nb.length,true);h.a.set(nb,30);parts.push(h.a,blob);const c=packHeader(0x02014b50,46+nb.length);c.v.setUint16(4,20,true);c.v.setUint16(6,20,true);c.v.setUint16(8,0x0800,true);c.v.setUint32(16,crc,true);c.v.setUint32(20,bytes.length,true);c.v.setUint32(24,bytes.length,true);c.v.setUint16(28,nb.length,true);c.v.setUint32(42,pos,true);c.a.set(nb,46);central.push(c.a);pos+=h.a.length+blob.size;progress?.(i+1,items.length);await new Promise(r=>setTimeout(r,0))}const centralSize=central.reduce((s,a)=>s+a.length,0);const end=packHeader(0x06054b50,22);end.v.setUint16(8,items.length,true);end.v.setUint16(10,items.length,true);end.v.setUint32(12,centralSize,true);end.v.setUint32(16,pos,true);return new Blob([...parts,...central,end.a],{type:'application/zip'})}
async function exportSelected(){if(!hasPhotoShape())return notify('Select or reuse a photo opening before exporting.');if(!getPhoto()||app.exporting)return;app.exporting=true;updateLabels();try{status('Preparing selected framed image…');const page=currentPage(),b=await makeOutput(page);downloadBlob(b,fileName(page));status('Downloaded '+fileName(page))}catch(err){notify(err.message);status('Export failed')}finally{app.exporting=false;updateLabels()}}
async function exportZip(){if(!hasPhotoShape())return notify('Select or reuse a photo opening before exporting.');if(!app.photos.length||app.exporting)return;app.exporting=true;updateLabels();$('exportProgress').style.display='block';$('exportBar').style.width='0%';const generated=[];const total=Math.ceil(app.photos.length/app.collage.count);try{if(total>65535)throw Error('Too many images for one ZIP.');for(let i=0;i<total;i++){status(`Rendering frame ${i+1} of ${total}…`);generated.push({name:fileName(i),blob:await makeOutput(i)});$('exportBar').style.width=(50*(i+1)/total)+'%';await new Promise(r=>setTimeout(r,0))}status('Packing ZIP…');const zip=await zipFiles(generated,(i,n)=>{$('exportBar').style.width=(50+50*i/n)+'%';status(`Packing image ${i} of ${n}…`)});const name=safeName($('prefix').value)+'_Batch_'+dateStamp()+'.zip';downloadBlob(zip,name);status(`Finished! ${total} framed image${total===1?'':'s'} in ${name}`);notify('Downloaded '+total+' framed image'+(total===1?'':'s')+' as ZIP.')}catch(err){status('Export failed: '+err.message);notify('Export failed: '+err.message)}finally{app.exporting=false;updateLabels();setTimeout(()=>$('exportProgress').style.display='none',2500)}}


// Cache rendered pages only while the save dialog is open. Customer photos are
// never uploaded or persisted; revoking blob URLs releases large mobile batches.
let preparedImages=[];
function clearPreparedImages(){for(const entry of preparedImages){URL.revokeObjectURL(entry.url);if(entry.beforeUrl)URL.revokeObjectURL(entry.beforeUrl)}preparedImages=[];$('exportGalleryItems').replaceChildren()}
function supportsBatchShare(){
 if(!navigator.share||!navigator.canShare||!preparedImages.length)return false;
 try{return navigator.canShare({files:preparedImages.map(({blob,name})=>new File([blob],name,{type:blob.type}))})}catch{return false}
}
async function prepareAllPhotos(){
 if(!hasPhotoShape())return notify('Select or reuse a photo opening before exporting.');
 if(!app.photos.length||app.exporting)return;
 app.exporting=true;updateLabels();
 $('exportProgress').style.display='block';$('exportBar').style.width='0%';
 clearPreparedImages();const total=Math.ceil(app.photos.length/app.collage.count);
 try{
   for(let i=0;i<total;i++){
     status('Preparing framed image '+(i+1)+' of '+total+'…');
     const blob=await makeOutput(i),name=fileName(i);
     const before=await makeOutput(i,true,520);
     preparedImages.push({blob,name,url:URL.createObjectURL(blob),beforeUrl:URL.createObjectURL(before)});
     $('exportBar').style.width=(100*(i+1)/total)+'%';
     await new Promise(resolve=>setTimeout(resolve,0));
   }
   const list=$('exportGalleryItems');const fragment=document.createDocumentFragment();
   for(const entry of preparedImages){
     const card=document.createElement('div');card.className='exportFileCard';
     const comparison=document.createElement('div');comparison.className='comparePair';
     for(const [src,label] of [[entry.beforeUrl,'Before filters'],[entry.url,'Finished frame']]){
      const figure=document.createElement('figure'),image=document.createElement('img'),caption=document.createElement('figcaption');
      image.src=src;image.alt=label+' '+entry.name;image.loading='lazy';caption.textContent=label;
      figure.append(image,caption);comparison.append(figure);
     }
     const title=document.createElement('strong');title.textContent=entry.name;
     const save=document.createElement('button');save.type='button';save.className='btn';save.textContent='↓ Save image';
     save.setAttribute('aria-label','Save '+entry.name);
     save.onclick=()=>{downloadBlob(entry.blob,entry.name);$('exportGalleryMessage').textContent='Save requested: '+entry.name+'. If your phone opens the image, use its Save Image or Download option.'};
     card.append(comparison,title,save);fragment.append(card);
   }
   list.append(fragment);
   $('exportGalleryCount').textContent=total+' image'+(total===1?'':'s')+' ready · '+$('exportType').selectedOptions[0].textContent;
   $('shareBatch').hidden=!supportsBatchShare();
   $('exportGalleryMessage').textContent=$('shareBatch').hidden?'Use the Save image buttons for reliable one-by-one saving on this device.':'Use Share all photos to open your phone’s native sharing/saving options.';
   $('exportGallery').showModal();
   status('Ready! '+total+' separate framed image'+(total===1?'':'s')+'. No ZIP needed.');
 }catch(err){clearPreparedImages();status('Export failed: '+err.message);notify('Export failed: '+err.message)}
 finally{app.exporting=false;updateLabels();setTimeout(()=>$('exportProgress').style.display='none',2500)}
}
function sharePreparedImages(){
 if(!supportsBatchShare()){ $('exportGalleryMessage').textContent='Sharing multiple photos is not supported here. Use Save image for each photo.';return }
 // Important: navigator.share must be called directly inside the user's click,
 // not after awaiting photo rendering, otherwise mobile loses user activation.
 const files=preparedImages.map(({blob,name})=>new File([blob],name,{type:blob.type}));
 try{
   const result=navigator.share({title:'MegaFrame Studio framed photos',files});
   Promise.resolve(result).then(()=>{ $('exportGalleryMessage').textContent='Photo share completed or handed to the selected app.' }).catch(err=>{
     if(err?.name!=='AbortError')$('exportGalleryMessage').textContent='Could not share photos: '+(err?.message||'Unknown error')+'. Use Save image instead.';
   });
 }catch(err){$('exportGalleryMessage').textContent='Could not share photos: '+err.message+'. Use Save image instead.'}
}
function downloadPreparedImages(){
 if(!preparedImages.length)return;
 // Multiple downloads are browser-controlled and may require user permission.
 // Invoke every download in the same click, without asynchronous delays.
 for(const entry of preparedImages)downloadBlob(entry.blob,entry.name);
 $('exportGalleryMessage').textContent='Requested '+preparedImages.length+' separate downloads. If your browser blocked some files, allow multiple downloads or use Save image on each card.';
}

// Shape presets preserve relative geometry during proportional scaling.
function createPreset(type,r){const cx=r.x+r.w/2,cy=r.y+r.h/2,x=r.x,y=r.y,w=r.w,h=r.h;let pts=[];const poly=(n,angle=-Math.PI/2)=>Array.from({length:n},(_,i)=>({x:cx+w*.5*Math.cos(angle+i*2*Math.PI/n),y:cy+h*.5*Math.sin(angle+i*2*Math.PI/n)}));if(type==='rect')pts=rectPoints(r);else if(type==='bevel')pts=bevelPoints(r,+$('cornerCut').value);else if(type==='roundrect'){const rad=Math.min(w,h)*.14;for(const [ax,ay,st] of [[x+w-rad,y+rad,-Math.PI/2],[x+w-rad,y+h-rad,0],[x+rad,y+h-rad,Math.PI/2],[x+rad,y+rad,Math.PI]])for(let i=0;i<=10;i++){const a=st+(Math.PI/2)*i/10;pts.push({x:ax+rad*Math.cos(a),y:ay+rad*Math.sin(a)})}}else if(type==='ellipse'||type==='circle'){const rx=type==='circle'?Math.min(w,h)*.5:w*.5,ry=type==='circle'?rx:h*.5;pts=Array.from({length:96},(_,i)=>({x:cx+rx*Math.cos(2*Math.PI*i/96),y:cy+ry*Math.sin(2*Math.PI*i/96)}))}else if(type.startsWith('triangle')){const v={ 'triangle-up':[[.5,0],[1,1],[0,1]],'triangle-down':[[0,0],[1,0],[.5,1]],'triangle-left':[[0,.5],[1,0],[1,1]],'triangle-right':[[0,0],[1,.5],[0,1]]}[type];pts=v.map(([a,b])=>({x:x+a*w,y:y+b*h}))}else if(type==='diamond'){pts=[[.5,0],[1,.5],[.5,1],[0,.5]].map(([a,b])=>({x:x+a*w,y:y+b*h}))}else if(['pentagon','hexagon','octagon'].includes(type)){pts=poly(({pentagon:5,hexagon:6,octagon:8})[type],-Math.PI/2)}else if(type==='star'){pts=Array.from({length:10},(_,i)=>{const a=-Math.PI/2+i*Math.PI/5,sz=i%2?.42:1;return{x:cx+Math.cos(a)*w*.5*sz,y:cy+Math.sin(a)*h*.5*sz}})}else if(type==='heart'){const raw=Array.from({length:100},(_,i)=>{const t=2*Math.PI*i/100;return{x:16*Math.sin(t)**3,y:-(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))}}),bb=shapeBounds(raw);pts=raw.map(p=>({x:x+(p.x-bb.x)/bb.w*w,y:y+(p.y-bb.y)/bb.h*h}))}else return cloneShape(app.shape);return{type,points:pts}}
function scalePointsFrom(points,anchor,factor){let upper=8;for(const p of points){const dx=p.x-anchor.x,dy=p.y-anchor.y;if(dx>0)upper=Math.min(upper,(app.frame.width-anchor.x)/dx);if(dx<0)upper=Math.min(upper,-anchor.x/dx);if(dy>0)upper=Math.min(upper,(app.frame.height-anchor.y)/dy);if(dy<0)upper=Math.min(upper,-anchor.y/dy)}const f=clamp(Number.isFinite(factor)?factor:1,.08,Math.max(.08,upper));return points.map(p=>({x:anchor.x+(p.x-anchor.x)*f,y:anchor.y+(p.y-anchor.y)*f}))}
function scaleHandles(){if(!hasPhotoShape())return[];const b=app.rect,d=Math.max(16,app.frame.width/70),w=app.frame.width,h=app.frame.height;const c=[[b.x-d,b.y-d,'tl'],[b.x+b.w+d,b.y-d,'tr'],[b.x+b.w+d,b.y+b.h+d,'br'],[b.x-d,b.y+b.h+d,'bl']];return c.map(([x,y,corner])=>({x:clamp(x,9,w-9),y:clamp(y,9,h-9),corner}))}
function resetScaleUI(){app.sliderStart=null;app.editingSlider=null;if($('shapeScale')){$('shapeScale').value=100;$('shapeScaleValue').textContent='100%'}}
// v2.1: unfinished sessions are LOCAL ONLY. Customer photo data is never sent to the cloud.
const DRAFT_DB_NAME = 'megaframe_studio_recovery_v1';
let draftDatabasePromise, draftEnabled = false, draftTimer = null, draftWriting = false, draftQueued = false, draftWritePromise = null;
function draftStatus(message) { const node = $('draftStatus'); if (node) node.textContent = message; }
function openDraftDatabase() {
 if (draftDatabasePromise) return draftDatabasePromise;
 draftDatabasePromise = new Promise(resolve => {
  if (!window.indexedDB) return resolve(null);
  try {
   const req = indexedDB.open(DRAFT_DB_NAME, 1);
   req.onupgradeneeded = () => {
    if (!req.result.objectStoreNames.contains('session'))
     req.result.createObjectStore('session');
   };
   req.onsuccess = () => resolve(req.result);
   req.onerror = () => resolve(null);
  } catch { resolve(null); }
 });
 return draftDatabasePromise;
}
async function draftRead() {
 const db = await openDraftDatabase();
 if (!db) return null;
 return new Promise(resolve => {
  try {
   const req = db.transaction('session', 'readonly').objectStore('session').get('current');
   req.onsuccess = () => resolve(req.result ?? null);
   req.onerror = () => resolve(null);
  } catch { resolve(null); }
 });
}
async function draftWrite(record) {
 const db = await openDraftDatabase();
 if (!db) throw Error('Local storage unavailable');
 return new Promise((resolve,reject) => {
  try {
   const tx = db.transaction('session','readwrite');
   tx.objectStore('session').put(record,'current');
   tx.oncomplete = () => resolve();
   tx.onerror = () => reject(tx.error || Error('Storage quota exceeded'));
   tx.onabort = () => reject(tx.error || Error('Draft save aborted'));
  } catch(err) { reject(err); }
 });
}
async function draftDelete() {
 const db = await openDraftDatabase();
 if (!db) return false;
 return new Promise(resolve => {
  try {
   const tx=db.transaction('session','readwrite');
   tx.objectStore('session').delete('current');
   tx.oncomplete=()=>resolve(true);
   tx.onerror=()=>resolve(false);
  }catch { resolve(false); }
 });
}
function serializeDraft() {
 if (!app.frame || !app.template?.data) return null;
 return {
  format:'MegaFrameDraftV1',savedAt:Date.now(),
  template:{
   id: app.template.id,name:app.template.name,data:app.template.data,
   rect:{...app.rect},shape:cloneShape(app.shape),frameOpening:cloneShape(app.frameOpening),
   appearance:{...app.appearance},collage:{...app.collage}
  },
  photos:app.photos.map(p=>({
   id:p.id,name:p.name,data:p.data,zoom:p.zoom,rot:p.rot,
   dx:p.dx,dy:p.dy,fit:p.fit,filters:{...filtersOf(p)},
   filterPreset:p.filterPreset||'none',enhancement:{...enhanceSettings(p)},covers:safeCovers(p.covers)
  })),
  selected:app.selected,mode:app.mode,overlays:overlayCloneForStorage(),
  prefix:$('prefix')?.value||'',exportType:$('exportType')?.value||'image/jpeg',
  exportSize:$('exportSize')?.value||'original'
 };
}
async function saveCurrentDraft() {
 if (!draftEnabled || !app.frame || !hasUnsavedChanges()) return;
 if (draftWriting) { draftQueued = true; return; }
 draftWriting = true;
 try {
  const draft = serializeDraft();
  if (!draft) return;
  // Avoid silently exhausting browser storage on very large batches.
  const estimatedBytes = draft.template.data.length + draft.photos.reduce((n,p)=>n+(p.data?.length||0),0) + draft.overlays.reduce((n,o)=>n+(o.data?.length||0),0);
  if (estimatedBytes > 80*1024*1024) {
   draftStatus('Recovery copy not saved: this batch is over 80 MB. Export your photos before closing.');
   return;
  }
  draftWritePromise=draftWrite(draft);
  await draftWritePromise;
  draftStatus('Draft saved on this device · '+new Date(draft.savedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}));
 }catch(err) {
  console.warn('Local draft recovery unavailable',err);
  draftStatus('Draft not saved (storage unavailable or full). Export your work before closing.');
 }finally {
  draftWriting = false;draftWritePromise=null;
  if (draftQueued) { draftQueued = false; scheduleDraftSave(); }
 }
}
function scheduleDraftSave() {
 if (!draftEnabled || !hasUnsavedChanges()) return;
 clearTimeout(draftTimer);
 draftTimer = setTimeout(saveCurrentDraft, 1500);
}
async function restoreLocalDraft(record) {
 if (record?.format!=='MegaFrameDraftV1'||!record.template) throw Error('Unrecognized recovery format');
 const t=record.template;
 if (typeof t.data!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(t.data)) throw Error('Saved frame data is invalid');
 const frame = await decodedImage(t.data);
 const safeTemplate={
  id:'new',name:String(t.name||'Recovered frame').slice(0,140),data:t.data,
  rect:t.rect,shape:cloneShape(t.shape),frameOpening:cloneShape(t.frameOpening),
  appearance:t.appearance||{},collage:t.collage||{count:1,layout:'grid',gap:1}
 };
 applyTemplate(safeTemplate,t.data,frame);
 const photos=[];
 for (const item of (Array.isArray(record.photos)?record.photos:[]).slice(0,100)) {
  if (typeof item.data!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(item.data)) continue;
  try {
   const image=await decodedImage(item.data);
   photos.push({
    id:String(item.id||'p'+photos.length),name:String(item.name||'Recovered photo').slice(0,160),
    data:item.data,image,zoom:clamp(Number(item.zoom)||1,.1,3),
    rot:clamp(Number(item.rot)||0,-180,180),
    dx:clamp(Number(item.dx)||0,-5,5),dy:clamp(Number(item.dy)||0,-5,5),
    fit:item.fit==='contain'?'contain':'cover',
    filters:{...FILTER_DEFAULTS,...(item.filters||{})},
    filterPreset:item.filterPreset||'none',enhancement:{...enhanceSettings(item)},covers:safeCovers(item.covers)
   });
  }catch(err){console.warn('Skipping a damaged recovered photo',err)}
 }
 app.photos=photos;
 app.selected=photos.length?clamp(Number(record.selected)||0,0,photos.length-1):-1;app.activeCoverIndex=(getPhoto()?.covers?.length||0)-1;
 if (['image/jpeg','image/png'].includes(record.exportType)) $('exportType').value=record.exportType;
 if (['original','2x','1080','1350'].includes(record.exportSize)) $('exportSize').value=record.exportSize;
 if (typeof record.prefix==='string') $('prefix').value=record.prefix.slice(0,50);
 overlayRestore(record.overlays);
 updateShapeUI();syncAppearanceUI();updateControls();updateGallery();
 setMode(record.mode==='adjust'?'adjust':'map');render();updateLabels();
}

// Named projects are separate from the rolling auto-recovery draft. Every project
// contains original customer photos and stays in this browser's IndexedDB.
const PROJECT_DB_NAME='megaframe_named_projects_v1';
let projectDbPromise;
function projectDatabase(){
 if(projectDbPromise)return projectDbPromise;
 projectDbPromise=new Promise((resolve,reject)=>{
  if(!window.indexedDB)return reject(Error('Local project storage is unavailable on this browser.'));
  const req=indexedDB.open(PROJECT_DB_NAME,1);
  req.onupgradeneeded=()=>{
   if(!req.result.objectStoreNames.contains('projects'))req.result.createObjectStore('projects',{keyPath:'id'});
   if(!req.result.objectStoreNames.contains('projectIndex'))req.result.createObjectStore('projectIndex',{keyPath:'id'});
  };
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error||Error('Could not open saved projects'));
 });
 return projectDbPromise;
}
async function projectList(){
 const db=await projectDatabase();
 return new Promise((resolve,reject)=>{
  const req=db.transaction('projectIndex','readonly').objectStore('projectIndex').getAll();
  req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>b.savedAt-a.savedAt));
  req.onerror=()=>reject(req.error||Error('Saved projects could not be listed'));
 });
}
async function projectRead(id){
 const db=await projectDatabase();
 return new Promise((resolve,reject)=>{
  const req=db.transaction('projects','readonly').objectStore('projects').get(id);
  req.onsuccess=()=>resolve(req.result||null);
  req.onerror=()=>reject(req.error||Error('Could not open project'));
 });
}
async function projectWrite(record){
 const db=await projectDatabase();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(['projects','projectIndex'],'readwrite');
  tx.objectStore('projects').put(record);
  tx.objectStore('projectIndex').put({id:record.id,name:record.name,savedAt:record.savedAt,photoCount:record.photoCount});
  tx.oncomplete=()=>resolve(true);
  tx.onerror=()=>reject(tx.error||Error('Could not save project; browser storage may be full'));
  tx.onabort=()=>reject(tx.error||Error('Project save aborted'));
 });
}
async function projectRemove(id){
 const db=await projectDatabase();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(['projects','projectIndex'],'readwrite');
  tx.objectStore('projects').delete(id);tx.objectStore('projectIndex').delete(id);
  tx.oncomplete=()=>resolve(true);
  tx.onerror=()=>reject(tx.error||Error('Could not delete project'));
  tx.onabort=()=>reject(tx.error||Error('Project delete aborted'));
 });
}
// A recovered session has two local representations. An archive named
// recovery_<savedAt> is recreated at launch if the corresponding draft remains.
function recoveryArchiveId(draft){
 return draft?.format==='MegaFrameDraftV1'&&draft.template
  ?'recovery_'+String(draft.savedAt||'unknown'):null;
}
async function deleteLinkedRecovery(id){
 const current=await draftRead();
 const matchesCurrent=!!id&&recoveryArchiveId(current)===id;
 if(matchesCurrent){
  clearTimeout(draftTimer);
  const wasEnabled=draftEnabled;draftEnabled=false;
  try{
   // Do not allow an unfinished auto-save to rewrite a discarded draft.
   if(draftWriting&&draftWritePromise)await draftWritePromise;
   const latest=await draftRead();
   if(recoveryArchiveId(latest)===id&&!await draftDelete())
    throw Error('Could not remove the matching automatic recovery copy');
  }finally{draftEnabled=wasEnabled}
 }
 await projectRemove(id);
 return matchesCurrent;
}
function projectSize(record){
 return (record?.template?.data?.length||0)+(record?.photos||[]).reduce((n,p)=>n+(p?.data?.length||0),0)+(record?.overlays||[]).reduce((n,o)=>n+(o?.data?.length||0),0);
}
// A named project is the only safe hand-off point before clearing the editor.
// Return true only once the project is confirmed persisted in IndexedDB.
let activeNamedProjectId=null, activeNamedProjectName=null, newProjectBusy=false;
async function saveNamedProject({forNewProject=false}={}){
 const payload=serializeDraft();
 if(!payload){notify('Open a frame before saving a project.');return false;}
 if(projectSize(payload)>80*1024*1024){
  notify('Project exceeds 80 MB. Reduce the photos before starting another project.');
  return false;
 }
 const defaultName=activeNamedProjectName||(app.template?.name?.startsWith('Blank workspace')?'My project':app.template?.name)||'My project';
 const name=await popupAction({
  title:forNewProject?'Save current project before starting new':'Save unfinished project',
  message:forNewProject
   ?'Your current frame, photos, filters and layouts must be saved before opening a new blank workspace. Cancel will keep the current project open.'
   :'Choose a name. Your photos, frame and edits will be saved only on this device.',
  value:defaultName,
  confirmLabel:forNewProject?'Save & create new':'Save project'
 });
 if(name===null)return false;
 const trimmed=name.trim().slice(0,90);
 if(!trimmed){notify('Enter a project name before saving.');return false;}
 const id='project_'+Date.now()+'_'+Math.random().toString(36).slice(2,9);
 const record={format:'MegaFrameProjectV1',id,name:trimmed,savedAt:Date.now(),photoCount:payload.photos.length,payload};
 try{
  // Keep the editor unchanged until storage positively confirms the write.
  await projectWrite(record);
  activeNamedProjectId=id;
  activeNamedProjectName=record.name;
  cleanProjectFingerprint=projectFingerprint();
  clearTimeout(draftTimer);
  // An in-flight automatic save must not recreate a stale recovery after clear.
  if(draftWritePromise)await draftWritePromise.catch(()=>{});
  if(draftEnabled)await draftDelete();
  notify('Project saved: '+record.name);
  $('projectSaveStatus').textContent='Saved '+record.name+' on this device.';
  return true;
 }catch(err){
  notify('Project not saved: '+err.message);
  $('projectSaveStatus').textContent='Save failed. Current project kept open. Check browser storage capacity.';
  return false;
 }
}
async function beginNewProject(){
 if(newProjectBusy||$('startupChoiceDialog').open)return;
 newProjectBusy=true;
 const buttons=[$('newProject'),$('newProjectPanel')];
 buttons.forEach(button=>button.disabled=true);
 try{
  // If the workspace has edits, a named save is mandatory, not optional.
  // An untouched blank workspace or unchanged named project can switch safely.
  if(hasUnsavedChanges()&&!await saveNamedProject({forNewProject:true}))return;
  const wasDraftEnabled=draftEnabled;
  draftEnabled=false;
  clearTimeout(draftTimer);
  if(draftWritePromise)await draftWritePromise.catch(()=>{});
  // Reset must never mark a blank starter as an edited project or auto-save it.
  cleanProjectFingerprint=null;
  try{
   await openBlankWorkspace();
   activeNamedProjectId=null;activeNamedProjectName=null;
   cleanProjectFingerprint=projectFingerprint();
   updateUnsavedIndicator();
   $('projectSaveStatus').textContent='New blank project. Save Project when you have work to keep.';
   showPanel(0);
   notify('New project ready. Previously saved work is available in Open Projects.');
  }finally{draftEnabled=wasDraftEnabled;}
 }catch(err){
  notify('Unable to start a new project: '+err.message);
 }finally{
  newProjectBusy=false;
  buttons.forEach(button=>button.disabled=false);
 }
}
async function renderSavedProjects(){
 const list=$('projectList');list.replaceChildren();
 const recovery=await draftRead();
 const validRecovery=recovery?.format==='MegaFrameDraftV1'&&!!recovery.template;
 $('automaticRecoveryCard').hidden=!validRecovery;
 if(validRecovery)$('recoveryProjectMeta').textContent='Saved '+(recovery.savedAt?new Date(recovery.savedAt).toLocaleString():'during a previous session')+' · '+(recovery.photos?.length||0)+' photo(s)';
 try{
  const projects=await projectList();$('projectListStatus').textContent=projects.length?projects.length+' saved project(s) on this device.':'No saved projects yet.';
  for(const row of projects){
   const card=document.createElement('article');card.className='savedProjectCard';
   const info=document.createElement('div');const title=document.createElement('strong');title.textContent=row.name;
   const date=document.createElement('small');date.textContent=new Date(row.savedAt).toLocaleString()+' · '+row.photoCount+' photo(s)';
   info.append(title,date);
   const actions=document.createElement('div');actions.className='savedProjectActions';
   const open=document.createElement('button');open.type='button';open.className='btn small primary';open.textContent='Open';
   open.onclick=()=>openNamedProject(row.id);
   const backup=document.createElement('button');backup.type='button';backup.className='btn small';backup.textContent='Backup';
   backup.title='Save an editable project file with original customer photos';
   backup.onclick=async()=>{
    try{const record=await projectRead(row.id);if(!record)return notify('Project not found');
     downloadBlob(new Blob([JSON.stringify(record)],{type:'application/json'}),safeName(record.name)+'_MegaFrame_Project.json');
     notify('Project backup downloaded. It contains original customer photos; keep it private.');
    }catch(e){notify('Backup failed: '+e.message)}
   };
   const remove=document.createElement('button');remove.type='button';remove.className='btn small danger';remove.textContent='Delete';
   remove.onclick=async()=>{
    const current=await draftRead(),linked=recoveryArchiveId(current)===row.id;
    const message=linked
     ?'Permanently delete "'+row.name+'" AND its matching automatic recovery copy? Both must be removed to prevent the project from reappearing. Other saved projects remain untouched.'
     :'Permanently delete "'+row.name+'" from this browser? This does not remove downloaded backups or newer recovery copies.';
    if(!await confirmAction('Delete saved project?',message,'Delete project'))return;
    try{
     await deleteLinkedRecovery(row.id);
     await renderSavedProjects();
     notify(linked?'Recovered session and matching automatic copy deleted.':'Saved project deleted.');
    }catch(e){notify('Delete failed: '+e.message)}
   };
   actions.append(open,backup,remove);card.append(info,actions);list.append(card);
  }
 }catch(err){$('projectListStatus').textContent='Project library unavailable: '+err.message;}
}
async function openSavedProjects(onStartup=false){
 $('startBlankProject').hidden=!onStartup;
 await renderSavedProjects();if(!$('savedProjectsDialog').open)$('savedProjectsDialog').showModal();
}
async function openNamedProject(id){
 const saved=await projectRead(id);if(!saved?.payload)return notify('Project could not be found.');
 if(!await confirmAction('Open saved project?','This replaces your currently open frame and photos. Save your current work first if you need it later.','Open saved project'))return;
 try{await restoreLocalDraft(saved.payload);cleanProjectFingerprint=projectFingerprint();activeNamedProjectId=saved.id;activeNamedProjectName=saved.name;$('savedProjectsDialog').close();showPanel(4);
  notify('Project restored: '+saved.name);
 }catch(err){notify('Project could not be restored: '+err.message)}
}
async function importProjectBackup(file){
 if(!file)return;
 if(file.size>85*1024*1024)return notify('Project file is too large (85 MB maximum).');
 try{
  const record=JSON.parse(await file.text());
  if(record?.format!=='MegaFrameProjectV1'||typeof record?.name!=='string'||record?.payload?.format!=='MegaFrameDraftV1')
   throw Error('Not a MegaFrame project backup');
  if(projectSize(record.payload)>80*1024*1024)throw Error('Project exceeds the local 80 MB limit');
  const newRecord={format:'MegaFrameProjectV1',id:'project_'+Date.now()+'_'+Math.random().toString(36).slice(2,9),
   name:record.name.slice(0,90),savedAt:Date.now(),photoCount:Math.min(100,record.payload.photos?.length||0),payload:record.payload};
  await projectWrite(newRecord);await renderSavedProjects();notify('Project backup imported: '+newRecord.name);
 }catch(err){notify('Project import failed: '+err.message)}
}

async function initializeDraftRecovery() {
 const saved=await draftRead();
 const hasRecovery=!!recoveryArchiveId(saved);
 let canAutosave=true;
 // A fresh blank session must not erase yesterday's unfinished editing.
 // Archive the rolling recovery as a named local project before new editing.
 if(hasRecovery){
  try{
   const id=recoveryArchiveId(saved);
   if(!await projectRead(id)){
    await projectWrite({format:'MegaFrameProjectV1',id,
     name:'Recovered session · '+(saved.savedAt?new Date(saved.savedAt).toLocaleString():'previous session'),
     savedAt:saved.savedAt||Date.now(),photoCount:saved.photos?.length||0,payload:saved});
   }
   draftStatus('Previous session protected in Open Projects. New edits are saved locally.');
  }catch(err){
   canAutosave=false;
   draftStatus('Previous recovery preserved, but cannot archive it. Automatic saving is paused so it is not overwritten. Choose Save Project for new edits.');
   console.error('Could not archive previous recovery',err);
  }
 }else draftStatus('Auto-save ready. Edits and imported photos stay on this device.');
 draftEnabled=canAutosave;
 $('restoreRecoveryDraft').onclick=async()=>{
  const record=await draftRead();
  if(!record?.template)return notify('No automatic recovery copy found.');
  if(hasUnsavedChanges()&&!await confirmAction('Restore recovery copy?','You have changes that have not been saved as a named project. Save Project first if you want to keep them, or confirm replacement.','Restore recovery'))return;
  try{await restoreLocalDraft(record);activeNamedProjectId=await projectRead(recoveryArchiveId(record))?recoveryArchiveId(record):null;activeNamedProjectName=activeNamedProjectId?'Recovered session':null;$('savedProjectsDialog').close();showPanel(4);notify('Unfinished editing session restored.');}
  catch(err){draftStatus('Saved draft could not be restored: '+err.message);notify('Could not restore recovery copy.');}
 };
 $('discardRecoveryDraft').onclick=async()=>{
  const existing=await draftRead();
  const id=recoveryArchiveId(existing);
  if(!id){await renderSavedProjects();return notify('No automatic recovery copy found.');}
  if(!await confirmAction('Discard unfinished recovery?',
   'Permanently discard the automatic recovery copy and its matching recovered-session archive? Other named projects will stay saved.',
   'Discard recovery'))return;
  try{
   await deleteLinkedRecovery(id);
   await renderSavedProjects();
   draftStatus('Previous recovery discarded. New edits will be saved locally.');
   notify('Recovery copy and matching recovered session discarded.');
  }catch(err){notify('Could not discard recovery: '+err.message);}
 };
 $('startBlankProject').onclick=()=>$('savedProjectsDialog').close();
 // Ask on EVERY launch even when there are no projects to retrieve.
 // Recovery is already archived, but stays unopened unless requested.
 $('startupChoiceDialog').showModal();
 $('saveDraftNow').onclick=()=>{clearTimeout(draftTimer);saveCurrentDraft();};
 $('prefix').addEventListener('input',scheduleDraftSave);
 $('clearSavedDraft').onclick=async()=>{
  if(!await confirmAction('Clear local recovery copy?',
   'Delete the automatic recovery copy on this device? Previously saved named projects are not removed.','Clear recovery copy'))return;
  clearTimeout(draftTimer);
  const previous=draftEnabled;draftEnabled=false;
  const removed=await draftDelete();draftEnabled=previous;
  draftStatus(removed?'Recovery copy cleared. New edits will auto-save again.':'Could not clear local recovery storage.');
 };
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&draftEnabled&&hasUnsavedChanges()){clearTimeout(draftTimer);saveCurrentDraft();}
 });
 window.addEventListener('pagehide',()=>{
  if(draftEnabled&&hasUnsavedChanges()){clearTimeout(draftTimer);saveCurrentDraft();}
 });
}

function snapshot(){return{shape:cloneShape(app.shape),rect:{...app.rect},photos:app.photos.map(p=>({...p,covers:(p.covers||[]).map(x=>({...x}))})),selected:app.selected,collage:{...app.collage},appearance:{...app.appearance},overlays:overlayCloneForStorage(),activeOverlayId:app.activeOverlayId}}
function restoreSnapshot(v){app.shape=cloneShape(v.shape);app.rect=hasPhotoShape()?shapeBounds(app.shape.points):{...(v.rect||app.rect)};app.photos=v.photos.map(p=>({...p,covers:(p.covers||[]).map(x=>({...x}))}));app.selected=app.photos.length?clamp(v.selected,0,app.photos.length-1):-1;app.activeCoverIndex=(getPhoto()?.covers?.length||0)-1;app.collage={...v.collage};app.appearance={...app.appearance,...(v.appearance||{})};$('collageCount').value=String(app.collage.count);$('collageLayout').value=app.collage.layout;$('collageGap').value=String(app.collage.gap);$('collageGapValue').textContent=app.collage.gap+'%';syncAppearanceUI();resetScaleUI();updateShapeUI();updateControls();updateGallery();overlayRestore(v.overlays);app.activeOverlayId=v.activeOverlayId;overlayRefreshList();overlayRefreshEditor();render()}
function saveHistory(){if(!app.frame)return;app.undoStack.push(snapshot());if(app.undoStack.length>65)app.undoStack.shift();app.redoStack=[];updateHistoryButtons()}
function undo(){if(!app.undoStack.length)return;app.redoStack.push(snapshot());restoreSnapshot(app.undoStack.pop());updateHistoryButtons();notify('Undid the last change.')}
function redo(){if(!app.redoStack.length)return;app.undoStack.push(snapshot());restoreSnapshot(app.redoStack.pop());updateHistoryButtons();notify('Restored the last undone change.')}
function updateHistoryButtons(){if($('undo'))$('undo').disabled=!app.undoStack.length;if($('redo'))$('redo').disabled=!app.redoStack.length}
function currentPage(){return app.selected<0?0:Math.floor(app.selected/app.collage.count)}
function getPagePhotos(page){return app.photos.slice(page*app.collage.count,(page+1)*app.collage.count)}
function goPage(delta){const pages=Math.ceil(app.photos.length/app.collage.count);if(!pages)return;const target=(currentPage()+delta+pages)%pages;selectPhoto(target*app.collage.count)}
function movePhoto(from,to){if(from===to||to<0||to>=app.photos.length)return;saveHistory();const [p]=app.photos.splice(from,1);app.photos.splice(to,0,p);selectPhoto(to)}
function swapPhoto(from,to){if(from===to||to<0||to>=app.photos.length)return;saveHistory();const tmp=app.photos[from];app.photos[from]=app.photos[to];app.photos[to]=tmp;selectPhoto(to)}
function updateCollageInfo(){if(!$('collageSummary'))return;const count=app.collage.count,n=app.photos.length,pages=Math.ceil(n/count);$('collageSummary').textContent=count===1?'Single-image mode: each imported photo produces one finished frame.':n?`${n} photos → ${pages} collage frame${pages!==1?'s':''} · ${count} slot${count!==1?'s':''} each${n%count?' · last frame automatically fills '+(n%count)+' photo(s)':''}.`:`${count} photos per collage. Photos will fill each frame in import order.`}
// Returns a list of inset cell rectangles in the shape's bounding box. Whole collage gets masked by the photo opening.
function layoutCells(n,layout,b,gapPercent=1){n=Math.max(1,Math.min(9,n));let a=[];const push=(x,y,w,h)=>a.push({x,y,w,h});if(n===1)push(0,0,1,1);else if(layout==='horizontal')for(let i=0;i<n;i++)push(i/n,0,1/n,1);else if(layout==='vertical')for(let i=0;i<n;i++)push(0,i/n,1,1/n);else if(layout==='main-left'||layout==='main-right'){const left=layout==='main-left';push(left?0:.41,0,.59,1);for(let i=0;i<n-1;i++)push(left?.59:0,i/(n-1),.41,1/(n-1))}else if(layout==='main-top'||layout==='main-bottom'){const top=layout==='main-top';push(0,top?0:.41,1,.59);for(let i=0;i<n-1;i++)push(i/(n-1),top?.59:0,1/(n-1),.41)}else if(layout==='magazine'){if(n===2){push(0,0,.62,1);push(.62,0,.38,1)}else{push(0,0,.6,1);const rest=n-1,cols=Math.ceil(Math.sqrt(rest)),rows=Math.ceil(rest/cols);for(let i=0;i<rest;i++)push(.6+.4*(i%cols)/cols,Math.floor(i/cols)/rows,.4/cols,1/rows)}}else{const cols=Math.ceil(Math.sqrt(n)),rows=Math.ceil(n/cols);for(let i=0;i<n;i++)push((i%cols)/cols,Math.floor(i/cols)/rows,1/cols,1/rows)}const gutter=Math.min(b.w,b.h)*(gapPercent/100),half=n>1?gutter/2:0;return a.map(r=>({x:b.x+r.x*b.w+half,y:b.y+r.y*b.h+half,w:Math.max(2,r.w*b.w-2*half),h:Math.max(2,r.h*b.h-2*half)}))}
function drawCollagePhoto(ctx,photo,points,cell,raw=false){ctx.save();polygonPath(ctx,points);ctx.clip();ctx.beginPath();ctx.rect(cell.x,cell.y,cell.w,cell.h);ctx.clip();ctx.fillStyle='#fff';ctx.fillRect(cell.x,cell.y,cell.w,cell.h);const im=raw?photo.image:enhancedPhotoImage(photo);if(im){const rot=(photo.rot||0)*Math.PI/180,ca=Math.abs(Math.cos(rot)),sa=Math.abs(Math.sin(rot)),bw=im.width*ca+im.height*sa,bh=im.width*sa+im.height*ca,base=photo.fit==='contain'?Math.min(cell.w/bw,cell.h/bh):Math.max(cell.w/bw,cell.h/bh),sc=base*(photo.zoom||1),dw=im.width*sc,dh=im.height*sc,cx=cell.x+cell.w/2+(photo.dx||0)*cell.w,cy=cell.y+cell.h/2+(photo.dy||0)*cell.h;ctx.translate(cx,cy);ctx.rotate(rot);ctx.filter=raw?'none':photoFilterCSS(photo);ctx.drawImage(im,-dw/2,-dh/2,dw,dh);ctx.filter='none'}ctx.restore()}

function setupAccordion(){const sections=[...document.querySelectorAll('.sidebar>.section')];sections.forEach((section,i)=>{const head=section.querySelector(':scope > .sectionHead');if(!head)return;let body=section.querySelector(':scope > .sectionBody');if(!body){body=document.createElement('div');body.className='sectionBody';let next=head.nextSibling;while(next){const after=next.nextSibling;body.append(next);next=after}section.append(body)}const label=head.querySelector('h2')?.textContent.trim()||'Section';const arrow=document.createElement('span');arrow.className='panelChevron';arrow.textContent='⌄';arrow.setAttribute('aria-hidden','true');head.append(arrow);body.id='studio-panel-'+i;head.tabIndex=0;head.setAttribute('role','button');head.setAttribute('aria-label',label+' — expand or collapse');head.setAttribute('aria-controls',body.id);const collapse=(value)=>{section.classList.toggle('is-collapsed',value);head.setAttribute('aria-expanded',String(!value));try{localStorage.setItem('megaframe_panel_'+i,value?'closed':'open')}catch{}};let closed=false;try{closed=localStorage.getItem('megaframe_panel_'+i)==='closed'}catch{}collapse(closed);head.addEventListener('click',()=>collapse(!section.classList.contains('is-collapsed')));head.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();collapse(!section.classList.contains('is-collapsed'))}})})}

const FAVORITES_KEY='megaframe_studio_favorite_frames_v1';
let favoriteFrameIds=new Set();
function loadFavoriteFrames(){try{const ids=JSON.parse(localStorage.getItem(FAVORITES_KEY)||'[]');favoriteFrameIds=new Set(Array.isArray(ids)?ids.filter(x=>typeof x==='string'):[])}catch{favoriteFrameIds=new Set()}}
function toggleFavoriteFrame(id){if(favoriteFrameIds.has(id))favoriteFrameIds.delete(id);else favoriteFrameIds.add(id);try{localStorage.setItem(FAVORITES_KEY,JSON.stringify([...favoriteFrameIds]))}catch{notify('Browser could not save favorite preferences.')}renderFrameLibrary()}

const HIDDEN_SAMPLE_KEY='megaframe_studio_hidden_samples_v17';
let hiddenSamples=new Set();
function loadHiddenSamples(){try{const a=JSON.parse(localStorage.getItem(HIDDEN_SAMPLE_KEY)||'[]');hiddenSamples=new Set(Array.isArray(a)?a.filter(v=>['gold','sample'].includes(v)):[])}catch{hiddenSamples=new Set()}}
function persistHiddenSamples(){try{localStorage.setItem(HIDDEN_SAMPLE_KEY,JSON.stringify([...hiddenSamples]));return true}catch{return false}}
function allFrameTemplates(){return[sampleTemplate('gold'),sampleTemplate('sample')].filter(t=>!hiddenSamples.has(t.id)).concat(app.templates)}
function createBlankStarter(){const cv=document.createElement('canvas');cv.width=cv.height=1254;const c=cv.getContext('2d');c.fillStyle='#f7f8fc';c.fillRect(0,0,1254,1254);const data=cv.toDataURL('image/png');return{id:'new',name:'Blank workspace — upload a frame',data,rect:{x:0,y:0,w:1254,h:1254},shape:{type:'none',points:[]},frameOpening:{type:'none',points:[]},appearance:{borderColor:'#d7b34a',borderWidth:8,replaceOpening:false},collage:{count:1,layout:'grid',gap:1}}}
async function openBlankWorkspace(){
 const t=createBlankStarter(),frame=await decodedImage(t.data);
 overlayRestore([]);
 app.photos=[];app.selected=-1;app.activeCoverIndex=-1;
 applyTemplate(t,t.data,frame);
 if($('prefix'))$('prefix').value='';
 if($('exportType'))$('exportType').value='image/jpeg';
 if($('exportSize'))$('exportSize').value='original';
 updateGallery();updateControls();setMode('map');updateLabels();
}
async function chooseAvailableFrame(){const t=allFrameTemplates()[0];if(t)await switchTemplate(t.id);else{const blank=createBlankStarter();const img=await decodedImage(blank.data);applyTemplate(blank,blank.data,img);setMode('map');notify('Library is empty. Upload a frame to begin.')}}
async function deleteFromFrameLibrary(t){const builtin=['gold','sample'].includes(t.id);const question=builtin?'Remove the built-in frame "'+t.name+'" from your library? You can restore original samples later.':'Permanently delete saved frame "'+t.name+'" from this browser? This cannot be undone.';if(!await confirmAction(builtin?'Remove sample frame?':'Delete saved frame?',question,builtin?'Remove sample':'Delete frame'))return;const selected=app.template?.id===t.id;if(builtin){hiddenSamples.add(t.id);if(!persistHiddenSamples())notify('Could not persist sample removal. It may reappear after restarting.')}else{const ok=await dbDelete(t.id);if(!ok){notify('Could not delete saved frame.');return}app.templates=app.templates.filter(item=>item.id!==t.id)}if(selected)await chooseAvailableFrame();else populateTemplates();renderFrameLibrary();notify((builtin?'Removed sample frame: ':'Deleted saved frame: ')+t.name)}
function refreshLibraryFilters(){
 const frames=allFrameTemplates();
 for(const [id,field,fallback,all] of [['frameLibFolder','folder','Unfiled','All folders'],['frameLibCategory','category','General','All categories']]){
  const sel=$(id),selected=sel.value;
  const names=[...new Set(frames.map(t=>String(t[field]||fallback).trim()||fallback))].sort((a,b)=>a.localeCompare(b));
  sel.replaceChildren(new Option(all,''));
  for(const name of names)sel.add(new Option(name,name));
  sel.value=names.includes(selected)?selected:'';
 }
}
async function organizeTemplate(t){
 const folder=await popupAction({title:'Organize saved frame',message:'Enter a folder name (for example, First Megasaver or Christmas).',value:t.folder||'Unfiled',confirmLabel:'Next'});
 if(folder===null)return;
 const category=await popupAction({title:'Template category',message:'Enter a category (for example, Campaign, Holiday or Portrait).',value:t.category||'General',confirmLabel:'Save organization'});
 if(category===null)return;
 const updated={...t,folder:folder.trim().slice(0,60)||'Unfiled',category:category.trim().slice(0,60)||'General'};
 if(!await dbPut(updated))return notify('Could not save template organization on this device.');
 app.templates=app.templates.map(x=>x.id===t.id?updated:x);
 if(app.template?.id===t.id)app.template={...app.template,folder:updated.folder,category:updated.category};
 populateTemplates();renderFrameLibrary();notify('Template folder and category saved locally.');
}
function renderFrameLibrary(){refreshLibraryFilters();const grid=$('frameLibGrid'),term=$('frameLibSearch').value.trim().toLowerCase(),folder=$('frameLibFolder').value,category=$('frameLibCategory').value;grid.replaceChildren();let choices=allFrameTemplates().filter(t=>[t.name,t.folder||'Unfiled',t.category||'General'].some(v=>v.toLowerCase().includes(term))&&(!folder||(t.folder||'Unfiled')===folder)&&(!category||(t.category||'General')===category)&&(!$('frameFavoritesOnly').checked||favoriteFrameIds.has(t.id)));const sort=$('frameLibSort').value;if(sort==='name')choices.sort((a,b)=>a.name.localeCompare(b.name));else if(sort==='favorites')choices.sort((a,b)=>Number(favoriteFrameIds.has(b.id))-Number(favoriteFrameIds.has(a.id)));$('restoreBuiltins').hidden=!hiddenSamples.size;if(!choices.length){const p=document.createElement('p');p.className='frameLibInfo';p.textContent=term?'No matching frames. Try another search.':'Your Frame Library is empty. Upload a frame or search online for one.';grid.append(p);return}for(const t of choices){const card=document.createElement('article');card.className='frameLibCard';const img=document.createElement('img');img.src=t.data;img.alt='Preview of '+t.name;img.loading='lazy';const title=document.createElement('strong');title.textContent=t.name;const help=document.createElement('small');const opening=shapeOf(t),ready=opening.points.length>=3;const builtin=['gold','sample'].includes(t.id);help.textContent=(builtin?'Built-in sample':'Saved on this browser')+' · '+(ready?opening.type+' opening':'No opening saved');const actions=document.createElement('div');actions.className='frameLibActions';const open=document.createElement('button');open.type='button';open.className='btn primary';open.textContent='Open frame';open.onclick=async()=>{await switchTemplate(t.id);$('frameLibrary').close();notify('Opened frame: '+t.name)};const use=document.createElement('button');use.type='button';use.className='btn';use.textContent='Reuse shape';use.disabled=!ready;use.title=ready?'Apply only this opening to the current frame':'This template has no saved photo shape';use.onclick=async()=>{if(!app.frame)return;try{const source=await decodedImage(t.data);const mapped=opening.points.map(p=>({x:clamp(p.x/source.width*app.frame.width,0,app.frame.width),y:clamp(p.y/source.height*app.frame.height,0,app.frame.height)}));setShape({type:opening.type,points:mapped});setMode('map');$('frameLibrary').close();showPanel(1);notify('Reused saved photo-opening shape without changing your frame artwork.')}catch(err){notify('Could not reuse this shape: '+err.message)}};actions.append(open,use);
const favorite=document.createElement('button');favorite.type='button';favorite.className='btn favoriteBtn';favorite.setAttribute('aria-pressed',String(favoriteFrameIds.has(t.id)));favorite.textContent=favoriteFrameIds.has(t.id)?'★ Favorite':'☆ Favorite';favorite.title='Favorites are saved only on this device';favorite.onclick=()=>toggleFavoriteFrame(t.id);actions.append(favorite);
if(!builtin){const organize=document.createElement('button');organize.type='button';organize.className='btn organizeFrame';organize.textContent='Organize';organize.title='Set this template’s local folder and category';organize.onclick=()=>organizeTemplate(t);actions.append(organize)}
const del=document.createElement('button');del.type='button';del.className='btn libraryDelete';del.textContent=builtin?'Delete sample frame':'Delete saved frame';del.setAttribute('aria-label','Delete '+t.name);del.title=builtin?'Hide this built-in frame from the library; you can restore it later':'Permanently delete this saved frame from this browser';del.onclick=()=>deleteFromFrameLibrary(t);actions.append(del);
const meta=document.createElement('small');meta.className='frameMeta';meta.textContent=(t.folder||'Unfiled')+' · '+(t.category||'General');
card.append(img,title,help,meta,actions);grid.append(card)}}
function openFrameLibrary(view='saved'){showLibraryTab(view);renderFrameLibrary();const modal=$('frameLibrary');if(!modal.open)modal.showModal()}
function showLibraryTab(view){const online=view==='online';$('libTabSaved').classList.toggle('active',!online);$('libTabOnline').classList.toggle('active',online);$('libTabSaved').setAttribute('aria-selected',String(!online));$('libTabOnline').setAttribute('aria-selected',String(online));$('savedFramesPanel').hidden=online;$('onlineFramesPanel').hidden=!online}
function externalTemplateSearch(engine){const term=$('onlineTemplateQuery').value.trim()||'photo frame template';let url;if(engine==='google')url='https://www.google.com/search?tbm=isch&q='+encodeURIComponent(term+' background template');else if(engine==='bing')url='https://www.bing.com/images/search?q='+encodeURIComponent(term+' background template');else url='https://www.canva.com/templates/search/photo-frames/';window.open(url,'_blank','noopener,noreferrer')}
async function searchOnlineFrames(event){if(event)event.preventDefault();const query=$('onlineTemplateQuery').value.trim();if(!query)return;$('onlineSearchStatus').textContent='Searching Wikimedia Commons…';$('onlineResults').replaceChildren();$('runOnlineSearch').disabled=true;try{const params=new URLSearchParams({action:'query',generator:'search',gsrsearch:query+' filetype:bitmap',gsrnamespace:'6',gsrlimit:'20',prop:'imageinfo',iiprop:'url|mime|size|extmetadata',iiurlwidth:'640',iiextmetadatafilter:'LicenseShortName',format:'json',origin:'*'});const res=await fetch('https://commons.wikimedia.org/w/api.php?'+params,{mode:'cors'});if(!res.ok)throw Error('Search service returned HTTP '+res.status);const body=await res.json();const items=Object.values(body.query?.pages||{}).map(p=>{const i=p.imageinfo?.[0];return i&&i.thumburl&&i.descriptionurl?{title:p.title.replace(/^File:/i,''),thumbnail:i.thumburl,original:i.url,source:i.descriptionurl,mime:i.mime,size:i.size,license:(i.extmetadata?.LicenseShortName?.value||'License details on source page').replace(/<[^>]*>/g,'')}:null}).filter(Boolean);renderOnlineResults(items);$('onlineSearchStatus').textContent=items.length?`Found ${items.length} images on Wikimedia Commons. Open the source to check licensing before using an image for advertising.`:'No matching images found here. Try another search or one of the external sources.'}catch(err){$('onlineSearchStatus').textContent='Online results unavailable ('+err.message+'). Check your internet connection, or try Google Images, Bing Images, or Canva below.'}finally{$('runOnlineSearch').disabled=false}}
function renderOnlineResults(items){const grid=$('onlineResults');grid.replaceChildren();for(const item of items){const card=document.createElement('article');card.className='frameLibCard';const im=document.createElement('img');im.src=item.thumbnail;im.loading='lazy';im.alt=item.title;const name=document.createElement('strong');name.textContent=item.title;const lic=document.createElement('small');lic.className='onlineLicense';lic.textContent=item.license;const source=document.createElement('a');source.className='onlineAttribution';source.textContent='View image source and license';source.href=item.source;source.target='_blank';source.rel='noopener noreferrer';const actions=document.createElement('div');actions.className='frameLibActions';const use=document.createElement('button');use.type='button';use.className='btn primary';use.textContent='Import as frame';use.onclick=()=>importOnlineFrame(item,use);actions.append(use);card.append(im,name,lic,source,actions);grid.append(card)}}
async function importOnlineFrame(item,button){button.disabled=true;button.textContent='Importing…';$('onlineSearchStatus').textContent='Importing image. If the source blocks browser downloads, use its source page to download manually.';try{const url=(['image/png','image/jpeg','image/webp'].includes(item.mime)&&item.size>0&&item.size<=18*1024*1024)?item.original:item.thumbnail;const res=await fetch(url,{mode:'cors'});if(!res.ok)throw Error('Image request returned HTTP '+res.status);const blob=await res.blob();const mime=blob.type.split(';')[0].toLowerCase();const supported=['image/jpeg','image/png','image/webp'].includes(mime);if(!supported)throw Error('This image type is not supported; download a PNG or JPG from its source page');if(blob.size>35*1024*1024)throw Error('Image too large; download a smaller PNG or JPG instead');const ext=mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';const filename=(item.title.replace(/[^a-z0-9_.-]+/gi,'_').replace(/\.[^.]+$/,'').slice(0,70)||'Online_Frame')+'.'+ext;const oldFrame=app.template;await uploadTemplate(new File([blob],filename,{type:mime}));if(app.template===oldFrame)throw Error('Could not decode image');$('frameLibrary').close();showPanel(0);notify('Imported online image. Choose a photo-opening shape, then save the template.')}catch(err){$('onlineSearchStatus').textContent='Import failed: '+err.message+'. Open the source and download a JPG/PNG/WebP, then use Upload frame.'}finally{button.disabled=false;button.textContent='Import as frame'}}
function showPanel(index){app.overlayEditing=index===6;if($('modeTag'))$('modeTag').textContent=app.overlayEditing?'Overlay editing':app.mode==='map'?'Shape editing':'Photo / collage adjusting';const nav=$('pinNav'),sidebar=document.querySelector('.sidebar'),sections=[...sidebar.querySelectorAll(':scope > .section')];const active=sections[index];if(!active)return;if(sidebar.classList.contains('mobileDrawerClosed')&&!window.matchMedia('(max-width:720px)').matches)setMobileDrawerOpen(true);sections.forEach((section,i)=>{section.classList.toggle('activePanel',i===index)});nav.querySelectorAll('button[data-panel]').forEach(button=>{const selected=Number(button.dataset.panel)===index;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected))});if(active.classList.contains('is-collapsed'))active.querySelector(':scope > .sectionHead').click();sidebar.scrollTop=0;setLiveExportPreview(index===5)}
function setMobileDrawerOpen(open){
 const sidebar=document.querySelector('.sidebar'),btn=$('mobileDrawerToggle'),mobileBtn=$('mobileEditToggle');
 sidebar.classList.toggle('mobileDrawerClosed',!open);
 btn.setAttribute('aria-expanded',String(open));
 btn.textContent=open?'Hide editing controls ▴':'Show editing controls ▾';
 mobileBtn.setAttribute('aria-expanded',String(open));
 mobileBtn.textContent=open?'☰ Hide controls ▴':'☰ Editing controls ▾';
 if(open&&window.matchMedia('(max-width:720px)').matches&&
    !document.querySelector('.photoQueueSidebar').classList.contains('photoQueueClosed')){
  setMobileSlidesOpen(false);
 }
}
function setMobileSlidesOpen(open){
 const slides=document.querySelector('.photoQueueSidebar'),btn=$('mobileSlidesToggle');
 slides.classList.toggle('photoQueueClosed',!open);
 btn.setAttribute('aria-expanded',String(open));
 btn.textContent=open?'▤ Hide slides ▴':'▤ Photo slides ▾';
 if(open&&window.matchMedia('(max-width:720px)').matches&&
    !document.querySelector('.sidebar').classList.contains('mobileDrawerClosed')){
  setMobileDrawerOpen(false);
 }
}
function setupMobileDrawer(){
 $('mobileDrawerToggle').onclick=()=>setMobileDrawerOpen(document.querySelector('.sidebar').classList.contains('mobileDrawerClosed'));
 $('mobileEditToggle').onclick=()=>setMobileDrawerOpen(document.querySelector('.sidebar').classList.contains('mobileDrawerClosed'));
 $('mobileSlidesToggle').onclick=()=>setMobileSlidesOpen(document.querySelector('.photoQueueSidebar').classList.contains('photoQueueClosed'));
 setMobileDrawerOpen(false);
 setMobileSlidesOpen(false);
 // PWA windows can be resized between desktop and phone widths.
 // Entering mobile mode always restores the canvas-first collapsed view.
 const mobileQuery=window.matchMedia('(max-width:720px)');
 mobileQuery.addEventListener('change',event=>{
  if(event.matches){setMobileDrawerOpen(false);setMobileSlidesOpen(false);}
 });
}
function setupPinnedNav(){const nav=$('pinNav');nav.querySelectorAll('button[data-panel]').forEach(button=>{button.addEventListener('click',()=>showPanel(Number(button.dataset.panel)))});showPanel(0)}

function setupEvents(){
 $('createNewProject').onclick=()=>{
  // Opening the app has already initialized an untouched blank editor.
  $('startupChoiceDialog').close();
  showPanel(0);
 };
 $('retrieveStartupProject').onclick=async()=>{
  $('startupChoiceDialog').close();
  await openSavedProjects(true);
 };
 $('startupChoiceDialog').addEventListener('cancel',event=>event.preventDefault());
 $('saveProject').onclick=()=>saveNamedProject();
 $('exitStudio').onclick=openExitStudioDialog;
 $('exitStudioCancel').onclick=()=>$('exitStudioDialog').close();
 $('exitStudioLeave').onclick=()=>{$('exitStudioDialog').close();closeStudioWindow();};
 $('exitStudioSave').onclick=saveAndExitStudio;
 $('reloadStudio').onclick=openReloadStudioDialog;
 $('reloadStudioCancel').onclick=()=>$('reloadStudioDialog').close();
 $('reloadStudioDiscard').onclick=()=>{$('reloadStudioDialog').close();reloadStudioNow();};
 $('reloadStudioSave').onclick=saveAndReloadStudio;
 $('studioInfoClose').onclick=()=>$('studioInfoDialog').close();
 window.addEventListener('keydown',handleReloadShortcut);
 $('newProject').onclick=beginNewProject;
 $('newProjectPanel').onclick=beginNewProject;
 $('openProjects').onclick=()=>openSavedProjects();
 $('closeSavedProjects').onclick=()=>$('savedProjectsDialog').close();
 $('importProjectFile').onchange=async e=>{const file=e.target.files?.[0];e.target.value='';await importProjectBackup(file)};
 $('importProject').onclick=()=>$('importProjectFile').click();

 $('changeTemplate').onclick=()=>$('templateInput').click();$('templateInput').onchange=async e=>{if(e.target.files?.[0])await uploadTemplate(e.target.files[0]);e.target.value=''};
 $('templateSelect').onchange=e=>switchTemplate(e.target.value);
 $('openFrameLibrary').onclick=()=>openFrameLibrary('saved');$('openOnlineTemplates').onclick=()=>openFrameLibrary('online');$('libTabSaved').onclick=()=>showLibraryTab('saved');$('libTabOnline').onclick=()=>showLibraryTab('online');$('restoreBuiltins').onclick=()=>{hiddenSamples.clear();persistHiddenSamples();populateTemplates();renderFrameLibrary();notify('Original sample frames restored.')};$('onlineSearchForm').onsubmit=searchOnlineFrames;$('googleImageSearch').onclick=()=>externalTemplateSearch('google');$('bingImageSearch').onclick=()=>externalTemplateSearch('bing');$('canvaTemplateSearch').onclick=()=>externalTemplateSearch('canva');$('closeFrameLibrary').onclick=()=>$('frameLibrary').close();$('frameLibSearch').oninput=renderFrameLibrary;$('frameFavoritesOnly').onchange=renderFrameLibrary;$('frameLibSort').onchange=renderFrameLibrary;$('frameLibFolder').onchange=renderFrameLibrary;$('frameLibCategory').onchange=renderFrameLibrary;$('frameLibrary').addEventListener('click',e=>{if(e.target===$('frameLibrary'))$('frameLibrary').close()});
 $('backupTemplate').onclick=()=>{if(!app.template)return;const payload={format:'MegaFrameTemplateV4',name:app.template.name,rect:{...app.rect},shape:cloneShape(app.shape),frameOpening:cloneShape(app.frameOpening),appearance:{...app.appearance},collage:{...app.collage},folder:app.template.folder||'Unfiled',category:app.template.category||'General',data:app.template.data};downloadBlob(new Blob([JSON.stringify(payload)],{type:'application/json'}),safeName(payload.name)+'_Frame_Template.json');notify('Template backup saved with the current shape, collage settings, and border style.')};
 $('restoreTemplate').onclick=()=>$('backupInput').click();
 $('backupInput').onchange=async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>50*1024*1024)throw Error('Template backup is too large');const payload=JSON.parse(await file.text());if(!['MegaFrameTemplateV1','MegaFrameTemplateV2','MegaFrameTemplateV3','MegaFrameTemplateV4'].includes(payload.format)||typeof payload.data!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(payload.data)||!payload.rect||typeof payload.name!=='string')throw Error('Invalid MegaFrame template file');const frame=await decodedImage(payload.data);const r=payload.rect;if(![r.x,r.y,r.w,r.h].every(Number.isFinite)||r.w<8||r.h<8)throw Error('Invalid photo-area coordinates');const shape=shapeOf(payload);if(!shape.points.every(p=>p.x>=0&&p.y>=0&&p.x<=frame.width&&p.y<=frame.height))throw Error('Shape points are outside the frame');const frameOpening=payload.frameOpening&&Array.isArray(payload.frameOpening.points)?cloneShape(payload.frameOpening):cloneShape(shape);const appearance=payload.appearance||{};const t={id:'new',name:payload.name,data:payload.data,rect:r,shape,frameOpening,appearance,collage:payload.collage||{count:1,layout:'grid',gap:1},folder:String(payload.folder||'Unfiled').slice(0,60),category:String(payload.category||'General').slice(0,60)};applyTemplate(t,t.data,frame);setMode('map');notify('Template restored. Save to keep it on this browser.')}catch(err){notify('Cannot restore backup: '+err.message)}};

 $('saveTemplate').onclick=async()=>{if(!app.frame)return;const savingTemplate=app.template;const name=await popupAction({title:'Save frame template',message:'Choose a name for this frame in your library.',value:app.template?.name.replace(' · Sample','')||'My Campaign',confirmLabel:'Save template'});if(name===null||app.template!==savingTemplate)return;if(!name.trim())return notify('Enter a template name.');const prior=!['sample','gold','new'].includes(app.template?.id)?app.template.id:null;const duplicate=app.templates.find(x=>x.id!==prior&&x.data===app.template.data);
if(duplicate&&!await confirmAction('Duplicate artwork detected','A saved template named “'+duplicate.name+'” already uses this same frame artwork. You may still save a different layout.','Save another copy'))return;
const t={id:prior||'template_'+Date.now()+'_'+Math.random().toString(36).slice(2),name:name.trim(),data:app.template.data,rect:{...app.rect},shape:cloneShape(app.shape),frameOpening:cloneShape(app.frameOpening),appearance:{...app.appearance},collage:{...app.collage},folder:app.template.folder||'Unfiled',category:app.template.category||'General'};const ok=await dbPut(t);if(!ok)return notify('Browser template storage unavailable. Your current frame still works, but cannot be saved persistently.');app.templates=app.templates.filter(x=>x.id!==t.id).concat(t);if(app.template!==savingTemplate){populateTemplates();return;}app.template=t;populateTemplates();$('templateSelect').value=t.id;$('previewTitle').textContent=t.name;notify('Template saved for reuse on this browser.')};
 $('renameTemplate').onclick=async()=>{if(!app.template)return;const n=await popupAction({title:'Rename frame',message:'Enter a new name for this frame.',value:app.template.name,confirmLabel:'Rename'});if(!n?.trim())return;if(['sample','gold','new'].includes(app.template.id)){app.template.name=n.trim();$('previewTitle').textContent=n.trim();notify('Name changed. Save template to keep it.');return}const t={...app.template,name:n.trim(),rect:{...app.rect},shape:cloneShape(app.shape),frameOpening:cloneShape(app.frameOpening),appearance:{...app.appearance},collage:{...app.collage}};if(await dbPut(t)){app.template=t;app.templates=app.templates.map(x=>x.id===t.id?t:x);populateTemplates();$('previewTitle').textContent=t.name;notify('Template renamed.')}};
 $('duplicateTemplate').onclick=()=>{if(!app.template)return;const t={id:'new',name:app.template.name+' · Copy',data:app.template.data,rect:{...app.rect},shape:cloneShape(app.shape),frameOpening:cloneShape(app.frameOpening),appearance:{...app.appearance},collage:{...app.collage}};applyTemplate(t,t.data,app.frame);notify('Template duplicated. Edit its shape and click Save template.')};
 $('mapBtn').onclick=()=>setMode('map');$('adjustBtn').onclick=()=>setMode('adjust');
 $('shapePreset').onchange=e=>{const type=e.target.value;if(type==='none'){setShape(blankShape());}else if(type==='polygon'){if(!hasPhotoShape()){app.drawingPolygon=true;app.draftPoints=[];updateShapeUI();notify('Click on the preview to draw a custom opening. Finish outline to save it.');}else{saveHistory();app.shape.type='polygon';updateShapeUI();render()}}else setShape(createPreset(type,app.rect));setMode('map')};
 $('cornerCut').onpointerdown=()=>{if(hasPhotoShape())saveHistory()};$('cornerCut').oninput=e=>{if(!hasPhotoShape())return;$('cornerValue').textContent=e.target.value+'%';setShape(createPreset('bevel',app.rect),false)};
 $('undo').onclick=undo;$('redo').onclick=redo;
 $('shapeScale').onpointerdown=()=>{if(!hasPhotoShape())return;app.sliderStart=app.shape.points.map(p=>({...p}));app.editingSlider='scale';saveHistory()};
 $('shapeScale').oninput=e=>{if(!hasPhotoShape())return;if(!app.sliderStart){app.sliderStart=app.shape.points.map(p=>({...p}));saveHistory()}const original=app.sliderStart,bb=shapeBounds(original),anchor={x:bb.x+bb.w/2,y:bb.y+bb.h/2};app.shape.points=scalePointsFrom(original,anchor,+e.target.value/100);app.rect=shapeBounds(app.shape.points);$('shapeScaleValue').textContent=e.target.value+'%';render()};
 $('shapeScale').onchange=()=>{app.sliderStart=null;app.editingSlider=null;resetScaleUI()};
 $('borderWidth').onpointerdown=()=>saveHistory();$('borderWidth').oninput=e=>{app.appearance.borderWidth=+e.target.value;$('borderWidthValue').textContent=e.target.value+' px';render()};
 $('borderColor').oninput=e=>{if(!app.editingBorderColor){saveHistory();app.editingBorderColor=true}app.appearance.borderColor=e.target.value;render()};$('borderColor').onchange=()=>{app.editingBorderColor=false};
 $('replaceOpening').onchange=e=>{saveHistory();app.appearance.replaceOpening=e.target.checked;render();notify(e.target.checked?'Old photo-area clearing enabled.':'Clean background preserved—only the active photo shape is covered.')};
 $('collageCount').onchange=e=>{saveHistory();app.collage.count=+e.target.value;selectPhoto(app.selected<0?-1:Math.floor(app.selected/app.collage.count)*app.collage.count);updateGallery();render()};
 $('collageLayout').onchange=e=>{saveHistory();app.collage.layout=e.target.value;render()};
 $('collageGap').onpointerdown=()=>saveHistory();$('collageGap').oninput=e=>{app.collage.gap=+e.target.value;$('collageGapValue').textContent=e.target.value+'%';render()};
 $('drawPolygon').onclick=()=>{if(app.mode!=='map')setMode('map');app.drawingPolygon=!app.drawingPolygon;app.draftPoints=[];app.selectedPoint=-1;updateShapeUI();render();if(app.drawingPolygon)notify('Click around the photo opening. Click the first point or Finish outline to close it.')};
 $('finishPolygon').onclick=finishPolygon;
 $('addPoint').onclick=()=>{if(!hasPhotoShape())return;const pts=app.shape.points;const longest=pts.map((a,i)=>({i,d:(a.x-pts[(i+1)%pts.length].x)**2+(a.y-pts[(i+1)%pts.length].y)**2})).sort((a,b)=>b.d-a.d)[0];const a=pts[longest.i],b=pts[(longest.i+1)%pts.length];insertPoint({x:(a.x+b.x)/2,y:(a.y+b.y)/2})};
 $('deletePoint').onclick=()=>{if(!hasPhotoShape()||app.shape.points.length<=3||app.selectedPoint<0)return;saveHistory();app.shape.points.splice(app.selectedPoint,1);app.selectedPoint=-1;app.shape.type='polygon';app.rect=shapeBounds(app.shape.points);updateShapeUI();render()};
 $('resetArea').onclick=()=>{if(!app.template)return;setShape(shapeOf(app.template));notify('Restored the photo opening saved with this template.')};
 $('fullArea').onclick=()=>{if(!app.frame)return;setShape({type:'rect',points:rectPoints({x:0,y:0,w:app.frame.width,h:app.frame.height})})};
 const can=$('previewCanvas');
 // Pinch-to-zoom operates only in Adjust photo mode and stays on this device.
 // Keep mouse, stylus and one-finger drag behavior unchanged.
 let touchPinch = null;
 function touchDistance(touches) {
   const a=touches[0], b=touches[1];
   return Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
 }
 can.addEventListener('touchstart',event=>{
   if(app.mode!=='adjust'||!getPhoto()||event.touches.length!==2)return;
   const distance=touchDistance(event.touches);
   if(distance<10)return;
   saveHistory();
   const current=getPhoto();
   touchPinch={distance,zoom:current.zoom||1,photoId:current.id};
   app.pointer=null;
   $('canvasShell').classList.remove('grabbing');
   event.preventDefault();
 },{passive:false});
 can.addEventListener('touchmove',event=>{
   if(!touchPinch)return;
   if(app.mode!=='adjust'||event.touches.length<2){touchPinch=null;return}
   const photo=getPhoto();
   if(!photo||photo.id!==touchPinch.photoId){touchPinch=null;return}
   photo.zoom=clamp(touchPinch.zoom*touchDistance(event.touches)/touchPinch.distance,.1,3);
   $('zoom').value=String(Math.round(photo.zoom*100));
   $('zoomValue').textContent=Math.round(photo.zoom*100)+'%';
   render();
   event.preventDefault();
 },{passive:false});
 const finishTouchPinch=event=>{
   if(touchPinch&&event.touches.length<2){
     touchPinch=null;app.pointer=null;updateControls();render();
   }
 };
 can.addEventListener('touchend',finishTouchPinch);
 can.addEventListener('touchcancel',finishTouchPinch);
 can.addEventListener('pointerdown',pointerDown);can.addEventListener('pointermove',pointerMove);can.addEventListener('pointerup',pointerUp);can.addEventListener('pointercancel',pointerUp);can.addEventListener('dblclick',e=>{if(app.mode!=='map'||app.drawingPolygon||app.shape.points.length<=3)return;const hit=pointerHit(getPoint(e));if(hit.type!=='vertex')return;saveHistory();app.shape.points.splice(hit.index,1);app.shape.type='polygon';app.rect=shapeBounds(app.shape.points);app.selectedPoint=-1;updateShapeUI();render()});window.addEventListener('pointerup',pointerUp);
 const dz=$('dropzone');dz.onclick=()=>$('photosInput').click();dz.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('photosInput').click()}};$('photosInput').onchange=async e=>{await importPhotos(e.target.files);e.target.value=''};dz.ondragover=e=>{e.preventDefault();dz.classList.add('dragging')};dz.ondragleave=()=>dz.classList.remove('dragging');dz.ondrop=e=>{e.preventDefault();dz.classList.remove('dragging');importPhotos(e.dataTransfer.files)};
 $('clearPhotos').onclick=async()=>{if(!app.photos.length)return;if(!await confirmAction('Clear entire photo batch?',`Remove all ${app.photos.length} imported photos from this batch? You can use Undo to restore them.`,'Clear all photos'))return;saveHistory();app.photos=[];selectPhoto(-1);updateGallery();notify('Photo queue cleared. Undo can restore the photos.')};
 $('zoom').onpointerdown=()=>{if(getPhoto())saveHistory()};$('rotate').onpointerdown=()=>{if(getPhoto())saveHistory()};for(const name of ['zoom','rotate'])$(name).addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key)&&getPhoto())saveHistory()});$('zoom').oninput=e=>{const p=getPhoto();if(!p)return;p.zoom=+e.target.value/100;$('zoomValue').textContent=e.target.value+'%';render()};$('rotate').oninput=e=>{const p=getPhoto();if(!p)return;p.rot=+e.target.value;$('rotateValue').textContent=e.target.value+'°';render()};$('fitMode').onchange=e=>{const p=getPhoto();if(!p)return;saveHistory();p.fit=e.target.value;render()};
 for(const [id,update] of [
  ['fitFullPhoto',p=>{p.fit='contain';p.zoom=1;p.dx=0;p.dy=0}],
  ['fillPhotoFrame',p=>{p.fit='cover';p.zoom=1;p.dx=0;p.dy=0}],
  ['centerPhoto',p=>{p.dx=0;p.dy=0}],
  ['resetPhotoPosition',p=>{p.zoom=1;p.rot=0;p.dx=0;p.dy=0}]
 ]) $(id).onclick=()=>{const p=getPhoto();if(!p)return;saveHistory();update(p);updateControls();render();};
 $('addEmojiCover').onclick=()=>openEmojiPicker('add');
 $('emojiPickerOpen').onclick=()=>openEmojiPicker(activeCover()?'replace':'add');
 $('emojiPickerClose').onclick=closeEmojiPicker;
 $('emojiPickerSearch').oninput=e=>{emojiQuery=e.target.value;renderEmojiPicker()};
 $('emojiPickerDialog').addEventListener('click',e=>{if(e.target===$('emojiPickerDialog'))closeEmojiPicker()});
 $('emojiPickerDialog').addEventListener('close',()=>{emojiQuery='';$('emojiPickerSearch').value=''});
 $('emojiCoverSize').onpointerdown=()=>{if(activeCover())saveHistory()};
 $('emojiCoverSize').onkeydown=e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key)&&activeCover())saveHistory()};
 $('emojiCoverSize').oninput=e=>{const cover=activeCover();if(!cover)return;cover.size=clamp(Number(e.target.value)/100,.12,.7);$('emojiCoverSizeValue').textContent=e.target.value+'%';render()};
 $('removeEmojiCover').onclick=()=>{const p=getPhoto();if(!p?.covers?.[app.activeCoverIndex])return;saveHistory();p.covers.splice(app.activeCoverIndex,1);app.activeCoverIndex=p.covers.length-1;updateEmojiControls();render();notify('Emoji removed from this photo.')};
 $('quickReplacePhoto').onclick=()=>$('replacePhotoInput').click();$('replaceSelectedPhoto').onclick=()=>$('replacePhotoInput').click();
 $('replacePhotoInput').onchange=async e=>{const file=e.target.files?.[0];e.target.value='';if(file)await replaceCurrentPhoto(file)};
 $('quickDeletePhoto').onclick=()=>deletePhotoAt(app.selected);$('deleteSelectedPhoto').onclick=()=>deletePhotoAt(app.selected);
 $('filterPreset').onchange=e=>{const p=getPhoto();if(!p)return;const preset=e.target.value;if(preset==='custom')return;saveHistory();p.filters={...FILTER_PRESETS[preset]};p.filterPreset=preset;updateControls();updateFilteredThumbnail();render()};
 for(const [id,key] of [['filterBrightness','brightness'],['filterContrast','contrast'],['filterSaturation','saturation'],['filterGrayscale','grayscale'],['filterSepia','sepia']]){const slider=$(id);slider.onpointerdown=()=>{if(getPhoto())saveHistory()};slider.oninput=e=>{const p=getPhoto();if(!p)return;p.filters={...filtersOf(p),[key]:+e.target.value};p.filterPreset='custom';$('filterPreset').value='custom';$(id+'Value').textContent=e.target.value+'%';updateFilteredThumbnail();render()}};
 $('autoLighting').onclick=()=>{const p=getPhoto();if(!p)return;saveHistory();try{if(!autoCorrectLighting(p))return notify('This photo cannot be assessed for lighting.');updateControls();updateFilteredThumbnail();render();notify('Auto lighting adjusted only this photo’s brightness and contrast.')}catch(err){notify('Could not analyze photo lighting: '+err.message)}};
  $('resetPhotoFilters').onclick=()=>{const p=getPhoto();if(!p)return;saveHistory();resetPhotoFilterState(p);updateControls();updateFilteredThumbnail();render()};
 for(const [id,key] of [['enhanceSharpness','sharpness'],['enhanceDenoise','denoise']]){
  const slider=$(id);slider.onpointerdown=()=>{if(getPhoto())saveHistory()};
  slider.oninput=e=>{const p=getPhoto();if(!p)return;p.enhancement={...enhanceSettings(p),[key]:+e.target.value};$(id+'Value').textContent=e.target.value+'%';render()};
 }
 $('resetEnhancement').onclick=()=>{const p=getPhoto();if(!p)return;saveHistory();p.enhancement={sharpness:0,denoise:0};updateControls();render()};

 $('resetPhoto').onclick=()=>{const p=getPhoto();if(!p)return;saveHistory();Object.assign(p,{zoom:1,rot:0,dx:0,dy:0,fit:'cover'});resetPhotoFilterState(p);p.enhancement={sharpness:0,denoise:0};updateControls();updateFilteredThumbnail();render()};$('applyAll').onclick=()=>{const p=getPhoto();if(!p)return;saveHistory();for(const q of app.photos)Object.assign(q,{zoom:p.zoom,rot:p.rot,dx:p.dx,dy:p.dy,fit:p.fit});notify('Current photo fitting applied to all '+app.photos.length+' photos.')};
 $('exportSize').addEventListener('change',()=>{setLiveExportPreview(true);render()});$('exportType').addEventListener('change',()=>{setLiveExportPreview(true);render()});
 $('exportInspect').onclick=openExportInspect;
 $('closeExportInspect').onclick=()=>$('exportInspectDialog').close();
 $('returnEditor').onclick=()=>showPanel(app.mode==='adjust'?4:1);
 $('previous').onclick=()=>goPage(-1);$('next').onclick=()=>goPage(1);$('downloadOne').onclick=exportSelected;$('downloadZip').onclick=exportZip;$('prepareAll').onclick=prepareAllPhotos;$('closeExportGallery').onclick=()=>$('exportGallery').close();$('exportGallery').addEventListener('close',clearPreparedImages);$('shareBatch').onclick=sharePreparedImages;$('downloadBatch').onclick=downloadPreparedImages;
 window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))){e.preventDefault();if(e.shiftKey)redo();else undo();return}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return}if(e.target instanceof HTMLElement&&['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if(e.key==='Escape'&&app.drawingPolygon){app.drawingPolygon=false;app.draftPoints=[];updateShapeUI();render()}if(e.key==='Enter'&&app.drawingPolygon){finishPolygon()}if(e.key==='ArrowRight'&&app.photos.length){goPage(1)}if(e.key==='ArrowLeft'&&app.photos.length){goPage(-1)}});
}
// Browsers control the wording of their native close-tab confirmation.
let cleanProjectFingerprint=null;
function projectFingerprint(){
 if(!app.frame)return '';
 const t=app.template||{};
 return JSON.stringify([
  t.id,t.name,t.data?.length||0,t.data?.slice(-64)||'',
  app.rect,app.shape,app.frameOpening,app.appearance,app.collage,
  app.photos.map(p=>[p.id,p.name,p.data?.length||0,p.data?.slice(-40)||'',p.zoom,p.rot,p.dx,p.dy,p.fit,p.filters,p.enhancement,p.covers]),overlayFingerprint(),
  $('prefix')?.value||'',$('exportType')?.value||'',$('exportSize')?.value||''
 ]);
}
function hasUnsavedChanges(){return cleanProjectFingerprint!==null&&projectFingerprint()!==cleanProjectFingerprint;}
function updateUnsavedIndicator(){
 const node=$('projectSaveStatus');
 if(!node||cleanProjectFingerprint===null)return;
 if(hasUnsavedChanges())node.textContent='Unsaved edits · Choose Save Project to keep a named copy. Automatic local recovery is also available.';
 else if(node.textContent.startsWith('Unsaved edits'))node.textContent='All changes saved or workspace ready.';
}
window.addEventListener('beforeunload',event=>{
 if(explicitStudioExit||!hasUnsavedChanges())return;
 event.preventDefault();
 event.returnValue='';
});
async function start(){overlayInitialState();setupAccordion();setupMobileDrawer();setupPinnedNav();setupEvents();overlayInit();loadHiddenSamples();loadFavoriteFrames();app.templates=await dbAll();await openBlankWorkspace();cleanProjectFingerprint=projectFingerprint();updateUnsavedIndicator();status('Ready · v2.7. Blank workspace. Customer photos are processed on this device.');await initializeDraftRecovery();}
start().catch(err=>{console.error(err);notify('App could not initialize: '+err.message)});
// Presentation-only chat-style navigation; existing editor input logic is unchanged.
(()=>{const script=document.createElement('script');script.src='./chat-sidebar.js';script.defer=true;document.head.append(script)})();
