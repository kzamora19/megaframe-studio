/* MegaFrame Captions & Overlays — local, editable layers and per-photo transforms.
 * No HTML/network injection: image inputs are decoded local JPG/PNG/WebP only.
 * All coordinates are normalized to the target photo cell (or whole canvas).
 */
const overlayImages=new Map();
function overlayInitialState(){
 app.overlays=[];app.activeOverlayId=null;app.overlayEditing=false;app.overlayPointer=null;
}
function overlayNewId(){return 'layer_'+Date.now()+'_'+Math.random().toString(36).slice(2,10)}
function overlayBase(){return {x:.50,y:.76,w:.55,h:.20,rotation:0,opacity:1,visible:true}}
function overlaySanitizeTransform(v,base){
 const b=base||overlayBase(),z=v||{};
 const n=(k,lo,hi)=>{const x=Number(z[k]);return Number.isFinite(x)?clamp(x,lo,hi):b[k]};
 return {x:n('x',-.5,1.5),y:n('y',-.5,1.5),w:n('w',.03,2.5),h:n('h',.03,2.5),
  rotation:n('rotation',-360,360),opacity:n('opacity',0,1),visible:z.visible===undefined?b.visible:!!z.visible};
}
function overlaySanitize(src){
 if(!src||!['text','image'].includes(src.kind)||!['all','photo','canvas'].includes(src.scope))return null;
 if(src.kind==='image'&&(!/^data:image\/(png|jpeg|webp);base64,/.test(src.data||'')||src.data.length>25*1024*1024))return null;
 const o={id:String(src.id||overlayNewId()).slice(0,60),kind:src.kind,scope:src.scope,
  photoId:src.scope==='photo'?String(src.photoId||''):null,
  text:String(src.text||'').slice(0,600),
  data:src.kind==='image'?src.data:null,
  name:String(src.name||(src.kind==='text'?'Caption':'Image overlay')).slice(0,100),
  base:overlaySanitizeTransform(src.base),
  overrides:{},locked:!!src.locked,
  aspectLock:src.aspectLock!==false,
  style:{font:['Arial','Georgia','Verdana','Impact','Trebuchet MS','Tahoma'].includes(src.style?.font)?src.style.font:'Arial',
   color:/^#[\da-f]{6}$/i.test(src.style?.color||'')?src.style.color:'#ffffff',
   fontSize:clamp(Number(src.style?.fontSize)||10,2,45),bold:src.style?.bold!==false,
   outline:!!src.style?.outline,shadow:src.style?.shadow!==false}};
 if(src.scope==='all'&&src.overrides&&typeof src.overrides==='object')
  for(const [id,t] of Object.entries(src.overrides).slice(0,300))if(id&&id.length<100)
   o.overrides[id]=overlaySanitizeTransform(t,o.base);
 return o;
}
function overlayCloneForStorage(){return app.overlays.map(o=>JSON.parse(JSON.stringify(o)))}
function overlayFingerprint(){
 // Track transformations and content changes without re-stringifying large base64
 // images on every preview frame or pointer movement.
 return app.overlays.map(o=>[o.id,o.kind,o.scope,o.photoId,o.text,o.name,
  o.data?.length||0,o.data?.slice(0,40)||'',o.data?.slice(-40)||'',
  o.base,o.overrides,o.style,o.aspectLock,o.locked]);
}
function overlayRestore(data){
 overlayImages.clear();
 // Never silently discard captions or graphics while restoring a project.
 // The number of layers is chosen by the user; practical storage/device limits apply.
 app.overlays=(Array.isArray(data)?data:[]).map(overlaySanitize).filter(Boolean);
 app.activeOverlayId=null;app.overlayPointer=null;
 for(const o of app.overlays)if(o.kind==='image')overlayCacheImage(o);
 overlayRefreshList();overlayRefreshEditor();
}
function overlayCacheImage(o){
 if(o.kind!=='image'||!o.data)return;
 if(overlayImages.has(o.data))return;
 const image=new Image();overlayImages.set(o.data,image);
 image.onload=()=>{if(app.frame)render()};
 image.src=o.data;
}
function overlaySelected(){return app.overlays.find(o=>o.id===app.activeOverlayId)||null}
function overlayTargetPhoto(o){if(o.scope==='canvas')return null;const p=app.photos[app.selected]||null;return o.scope==='photo'&&p?.id!==o.photoId?null:p}
function overlayTransform(o,photo){
 return (o.scope==='all'&&photo&&o.overrides[photo.id])||o.base;
}
function overlaySetTransform(o,photo,changes){
 const old=overlayTransform(o,photo),next=overlaySanitizeTransform({...old,...changes},old);
 if(o.scope==='all'&&photo)o.overrides[photo.id]=next;
 else o.base=next;
}
function overlayCurrentCell(o){
 if(!app.frame)return null;
 if(o.scope==='canvas')return {x:0,y:0,w:app.frame.width,h:app.frame.height};
 const photo=overlayTargetPhoto(o);
 if(!photo)return null;
 const list=getPagePhotos(currentPage()),slot=list.findIndex(p=>p.id===photo.id);
 if(slot<0)return null;
 return layoutCells(Math.min(app.collage.count,list.length),app.collage.layout,app.rect,app.collage.gap)[slot]||null;
}
function overlayGeo(t,cell){
 return {cx:cell.x+t.x*cell.w,cy:cell.y+t.y*cell.h,w:t.w*cell.w,h:t.h*cell.h,
  angle:t.rotation*Math.PI/180};
}
function overlayDrawText(ctx,o,g,cell){
 const content=o.text||'Text';
 const maxWidth=Math.max(1,g.w*.94);
 let size=Math.max(9,cell.h*o.style.fontSize/100),lines=content.split('\n').slice(0,18);
 ctx.textAlign='center';ctx.textBaseline='middle';
 const font=()=>((o.style.bold?'bold ':'')+size+'px "'+o.style.font+'",sans-serif');
 ctx.font=font();
 // Fit long lines to the overlay rectangle, without cropping whole words.
 const words=[];
 for(const line of lines){
  let chunk='';
  for(const part of line.split(/\s+/)){
   const tentative=chunk?chunk+' '+part:part;
   if(chunk&&ctx.measureText(tentative).width>maxWidth){words.push(chunk);chunk=part}
   else chunk=tentative;
  }
  words.push(chunk||' ');
 }
 lines=words.slice(0,24);
 while(size>8&&(lines.length*size*1.18>g.h*.98||lines.some(line=>ctx.measureText(line).width>maxWidth))){
  size*=.91;ctx.font=font();
 }
 ctx.fillStyle=o.style.color;ctx.strokeStyle='#182b47';
 ctx.lineWidth=Math.max(2,size*.085);ctx.lineJoin='round';
 if(o.style.shadow){ctx.shadowColor='rgba(0,0,0,.65)';ctx.shadowBlur=size*.12;ctx.shadowOffsetY=size*.06}
 const lh=size*1.18,start=-(lines.length-1)*lh/2;
 lines.forEach((line,i)=>{const y=start+i*lh;if(o.style.outline)ctx.strokeText(line,0,y,maxWidth);ctx.fillText(line,0,y,maxWidth)});
}
function overlayDrawOne(ctx,o,t,cell){
 if(t.visible===false||t.opacity<=0)return;
 const g=overlayGeo(t,cell);
 ctx.save();ctx.globalAlpha*=t.opacity;ctx.translate(g.cx,g.cy);ctx.rotate(g.angle);
 if(o.kind==='text')overlayDrawText(ctx,o,g,cell);
 else{
  const image=overlayImages.get(o.data);if(image?.complete&&image.naturalWidth)ctx.drawImage(image,-g.w/2,-g.h/2,g.w,g.h);
 }
 ctx.restore();
}
function overlayDrawLayers(ctx,items,cells){
 if(!app.overlays.length)return;
 for(const o of app.overlays){
  if(o.scope==='canvas'){
   overlayDrawOne(ctx,o,o.base,{x:0,y:0,w:app.frame.width,h:app.frame.height});
  }else{
   for(let i=0;i<items.length;i++){
    const photo=items[i];if(o.scope==='photo'&&o.photoId!==photo.id)continue;
    if(cells[i])overlayDrawOne(ctx,o,overlayTransform(o,photo),cells[i]);
   }
  }
 }
}
function overlayDrawSelection(ctx){
 const o=overlaySelected();if(!app.overlayEditing||!o||o.locked)return;
 const photo=overlayTargetPhoto(o),cell=overlayCurrentCell(o);
 if(!cell)return;
 const t=overlayTransform(o,photo);if(t.visible===false)return;
 const g=overlayGeo(t,cell);
 ctx.save();ctx.translate(g.cx,g.cy);ctx.rotate(g.angle);
 const handle=Math.max(9,app.frame.width/115);
 ctx.strokeStyle='#116bf1';ctx.fillStyle='#ffffff';ctx.lineWidth=Math.max(2,app.frame.width/480);
 ctx.setLineDash([Math.max(6,handle),Math.max(4,handle/1.5)]);
 ctx.strokeRect(-g.w/2,-g.h/2,g.w,g.h);ctx.setLineDash([]);
 for(const px of [-g.w/2,g.w/2])for(const py of [-g.h/2,g.h/2]){
  ctx.fillRect(px-handle/2,py-handle/2,handle,handle);
  ctx.strokeRect(px-handle/2,py-handle/2,handle,handle);
 }
 const ry=-g.h/2-Math.max(handle*2,app.frame.height/40);
 ctx.beginPath();ctx.moveTo(0,-g.h/2);ctx.lineTo(0,ry);ctx.stroke();
 ctx.beginPath();ctx.arc(0,ry,handle*.75,0,Math.PI*2);ctx.fill();ctx.stroke();
 ctx.restore();
}
function overlayLocalPoint(pt,g){
 const dx=pt.x-g.cx,dy=pt.y-g.cy,c=Math.cos(g.angle),s=Math.sin(g.angle);
 return {x:dx*c+dy*s,y:-dx*s+dy*c};
}
function overlayHitTarget(p){
 const items=app.photos.length?getPagePhotos(currentPage()):[];
 const cells=items.length?layoutCells(Math.min(app.collage.count,items.length),app.collage.layout,app.rect,app.collage.gap):[];
 for(const o of [...app.overlays].reverse()){
  const candidates=o.scope==='canvas'?[{photo:null,cell:{x:0,y:0,w:app.frame.width,h:app.frame.height},index:-1}]:
   items.map((photo,i)=>({photo,cell:cells[i],index:app.photos.indexOf(photo)}))
    .filter(x=>x.cell&&(o.scope==='all'||o.photoId===x.photo.id));
  for(const c of candidates){
   const t=overlayTransform(o,c.photo);
   if(!t.visible)continue;
   const g=overlayGeo(t,c.cell),local=overlayLocalPoint(p,g);
   if(Math.abs(local.x)<=g.w/2&&Math.abs(local.y)<=g.h/2)return {overlay:o,photo:c.photo,index:c.index};
  }
 }
 return null;
}
function overlayPointerDown(p){
 if(!app.overlayEditing)return false;
 let sel=overlaySelected(),photo=sel?overlayTargetPhoto(sel):null,cell=sel?overlayCurrentCell(sel):null;
 const tol=Math.max(14,app.frame.width/90);
 let type=null,corner='',g=null,t=null;
 // Give an already-selected overlay's transform handles first priority.
 if(sel&&cell&&!sel.locked){
  t=overlayTransform(sel,photo);g=overlayGeo(t,cell);
  const loc=overlayLocalPoint(p,g),ry=-g.h/2-Math.max(tol*2,app.frame.height/40);
  if(Math.hypot(loc.x,loc.y-ry)<tol*1.5)type='rotate';
  if(!type)for(const sx of [-1,1])for(const sy of [-1,1]){
   if(Math.hypot(loc.x-sx*g.w/2,loc.y-sy*g.h/2)<tol*1.5){
    type='resize';corner=(sx<0?'l':'r')+(sy<0?'t':'b');
   }
  }
 }
 let foundHit=false;
 if(!type){
  const hit=overlayHitTarget(p);
  foundHit=!!hit;
  if(hit){
   if(hit.index>=0&&hit.index!==app.selected)selectPhoto(hit.index);
   if(hit.overlay.id!==app.activeOverlayId)overlaySelect(hit.overlay.id);
   sel=hit.overlay;photo=overlayTargetPhoto(sel);cell=overlayCurrentCell(sel);
   if(!sel.locked)type='move';
  }
 }
 if(type&&sel&&!sel.locked&&cell){
  t=overlayTransform(sel,photo);g=overlayGeo(t,cell);
  saveHistory();
  app.overlayPointer={type,corner,start:p,initial:{...t},cell,photoId:photo?.id||null,geo:g};
 }else if(!type&&!foundHit){app.activeOverlayId=null;overlayRefreshList();overlayRefreshEditor();render()}
 return true;
}
function overlayPointerMove(p){
 const drag=app.overlayPointer;if(!drag)return false;
 const o=overlaySelected();if(!o)return true;
 const photo=drag.photoId?app.photos.find(x=>x.id===drag.photoId):null,t=drag.initial,cell=drag.cell,g=drag.geo;
 let changes={};
 if(drag.type==='move')changes={x:t.x+(p.x-drag.start.x)/cell.w,y:t.y+(p.y-drag.start.y)/cell.h};
 if(drag.type==='rotate')changes={rotation:(Math.atan2(p.y-g.cy,p.x-g.cx)-Math.atan2(drag.start.y-g.cy,drag.start.x-g.cx))*180/Math.PI+t.rotation};
 if(drag.type==='resize'){
  const old=overlayLocalPoint(drag.start,g),now=overlayLocalPoint(p,g);
  let w=Math.max(.03,t.w+(now.x-old.x)/cell.w*(drag.corner.includes('r')?2:-2));
  let h=Math.max(.03,t.h+(now.y-old.y)/cell.h*(drag.corner.includes('b')?2:-2));
  if(o.aspectLock){const factor=Math.max(w/t.w,h/t.h);w=t.w*factor;h=t.h*factor}
  changes={w,h};
 }
 overlaySetTransform(o,photo,changes);overlayRefreshEditor();render();
 return true;
}
function overlayPointerUp(){if(!app.overlayPointer)return false;app.overlayPointer=null;return true}
function overlayRefreshList(){
 const list=$('overlayLayerList');if(!list)return;
 list.replaceChildren();
 for(const o of app.overlays){
  const option=new Option((o.kind==='text'?'T ':'▣ ')+o.name+' · '+(o.scope==='all'?'All photos':o.scope==='canvas'?'Canvas':'One photo'),o.id);
  list.add(option);
 }
 list.value=app.activeOverlayId||'';
}
function overlayRefreshEditor(){
 const o=overlaySelected(),box=$('overlayEditor');if(!box)return;
 box.hidden=!o;if(!o)return;
 const t=overlayTransform(o,overlayTargetPhoto(o));
 const values={overlayContent:o.text,overlayFont:o.style.font,overlayColor:o.style.color,
  overlayFontSize:o.style.fontSize,overlayX:Math.round(t.x*100),overlayY:Math.round(t.y*100),
  overlayWidth:Math.round(t.w*100),overlayHeight:Math.round(t.h*100),overlayRotation:Math.round(t.rotation),
  overlayOpacity:Math.round(t.opacity*100)};
 for(const [id,value]of Object.entries(values))$(id).value=value;
 $('overlayContent').disabled=o.kind!=='text';$('overlayFont').disabled=o.kind!=='text';
 $('overlayColor').disabled=o.kind!=='text';$('overlayFontSize').disabled=o.kind!=='text';
 for(const [id,value]of Object.entries({overlayBold:o.style.bold,overlayShadow:o.style.shadow,
   overlayOutline:o.style.outline,overlayAspectLock:o.aspectLock,overlayVisible:t.visible,overlayLocked:o.locked}))$(id).checked=!!value;
 $('overlayApplyAll').disabled=o.scope!=='all'||!overlayTargetPhoto(o);
 $('overlayStatus').textContent=o.scope==='all'?'Editing position, size, rotation and visibility for this photo only. Text/image content stays shared.':
   o.scope==='canvas'?'This layer has one canvas-wide layout.':'This overlay belongs to the selected photo.';
}
function overlaySelect(id){
 const o=app.overlays.find(o=>o.id===id);if(!o)return;
 if(o.scope==='photo'&&o.photoId!==app.photos[app.selected]?.id){const i=app.photos.findIndex(p=>p.id===o.photoId);if(i>=0)selectPhoto(i)}
 app.activeOverlayId=id;app.overlayEditing=true;overlayRefreshList();overlayRefreshEditor();render();
}
function overlayRefreshAfterPhoto(){overlayRefreshEditor();if(app.overlayEditing)render()}
function overlayAdd(kind,data=null,name=''){
 const scope=$('overlayScope').value;
 if(scope==='photo'&&!app.photos[app.selected]){notify('Select or import a photo first.');return}
 const o=overlaySanitize({id:overlayNewId(),kind,scope,photoId:scope==='photo'?app.photos[app.selected].id:null,
  text:kind==='text'?'Your caption':'',data,name:name|| (kind==='text'?'Caption '+(app.overlays.length+1):'Image '+(app.overlays.length+1)),
  base:overlayBase(),style:{bold:true,shadow:true}});
 if(!o)return;
 saveHistory();app.overlays.push(o);if(kind==='image')overlayCacheImage(o);
 overlaySelect(o.id);render();scheduleDraftSave();
}
function overlayModify(callback){
 const o=overlaySelected();if(!o)return;
 saveHistory();callback(o,overlayTargetPhoto(o));overlayRefreshList();overlayRefreshEditor();render();
}
function overlayInit(){
 const bind=(id,event,fn)=>$(id).addEventListener(event,fn);
 bind('addTextOverlay','click',()=>overlayAdd('text'));
 bind('addImageOverlay','click',()=>$('overlayImageInput').click());
 bind('overlayImageInput','change',async()=>{
  const input=$('overlayImageInput'),file=input.files?.[0];input.value='';
  if(!file)return;
  if(!isPhotoFile(file)||file.size>14*1024*1024)return notify('Choose a JPG, PNG or WebP image under 14 MB.');
  try{const data=await dataUrlOf(file);await decodedImage(data);overlayAdd('image',data,file.name)}
  catch(err){notify('Could not use overlay image: '+err.message)}
 });
 bind('overlayLayerList','change',e=>overlaySelect(e.target.value));
 const styleText={overlayContent:'text',overlayFont:'font',overlayColor:'color',overlayFontSize:'fontSize',
  overlayBold:'bold',overlayShadow:'shadow',overlayOutline:'outline'};
 for(const [id,key]of Object.entries(styleText))bind(id,id==='overlayContent'?'input':'change',e=>overlayModify(o=>{
  if(key==='text'){o.text=e.target.value.slice(0,600);o.name=o.text.split('\n')[0].slice(0,30)||'Caption'}
  else if(['bold','shadow','outline'].includes(key))o.style[key]=e.target.checked;
  else if(key==='fontSize')o.style[key]=clamp(Number(e.target.value)||10,2,45);
  else o.style[key]=e.target.value;
 }));
 const coords={overlayX:'x',overlayY:'y',overlayWidth:'w',overlayHeight:'h',
  overlayRotation:'rotation',overlayOpacity:'opacity'};
 for(const [id,key]of Object.entries(coords))bind(id,'change',e=>overlayModify((o,photo)=>{
  const old=overlayTransform(o,photo),n=Number(e.target.value);
  if(!Number.isFinite(n))return;
  let v=['x','y','w','h','opacity'].includes(key)?n/100:n;
  let changes={[key]:v};
  if(o.aspectLock&&(key==='w'||key==='h')){
   const ratio=key==='w'?v/old.w:v/old.h;
   changes[key==='w'?'h':'w']=(key==='w'?old.h:old.w)*ratio;
  }
  overlaySetTransform(o,photo,changes);
 }));
 bind('overlayVisible','change',e=>overlayModify((o,p)=>overlaySetTransform(o,p,{visible:e.target.checked})));
 bind('overlayAspectLock','change',e=>overlayModify(o=>{o.aspectLock=e.target.checked}));
 bind('overlayLocked','change',e=>overlayModify(o=>{o.locked=e.target.checked}));
 bind('overlayRotateLeft','click',()=>overlayModify((o,p)=>overlaySetTransform(o,p,{rotation:overlayTransform(o,p).rotation-90})));
 bind('overlayRotateRight','click',()=>overlayModify((o,p)=>overlaySetTransform(o,p,{rotation:overlayTransform(o,p).rotation+90})));
 bind('overlayReset','click',()=>overlayModify((o,p)=>{if(o.scope==='all'&&p)delete o.overrides[p.id];else o.base=overlayBase()}));
 bind('overlayApplyAll','click',()=>overlayModify((o,p)=>{
  if(o.scope!=='all'||!p)return;
  const current={...overlayTransform(o,p)};
  o.base=current;o.overrides={};
 }));
 bind('overlayDuplicate','click',()=>overlayModify(o=>{
  const copy=overlaySanitize({...JSON.parse(JSON.stringify(o)),id:overlayNewId(),name:o.name+' copy'});
  copy.base.x+=.05;copy.base.y+=.05;app.overlays.push(copy);app.activeOverlayId=copy.id;
 }));
 bind('overlayDelete','click',()=>overlayModify(o=>{
  app.overlays=app.overlays.filter(x=>x.id!==o.id);app.activeOverlayId=null;
 }));
 bind('overlayFront','click',()=>overlayModify(o=>{
  const i=app.overlays.indexOf(o);if(i<app.overlays.length-1){app.overlays.splice(i,1);app.overlays.splice(i+1,0,o)}
 }));
 bind('overlayBack','click',()=>overlayModify(o=>{
  const i=app.overlays.indexOf(o);if(i>0){app.overlays.splice(i,1);app.overlays.splice(i-1,0,o)}
 }));
 overlayRefreshList();overlayRefreshEditor();
}
