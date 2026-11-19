// Fragment tickets are removed before any network request. Never log them.
(() => {
  "use strict";
  const status=document.querySelector("#studio-access-status");
  const params=new URLSearchParams(location.hash.slice(1));
  const ticket=params.get("ptg_studio_ticket");
  if(location.hash)history.replaceState(null,"",location.pathname+location.search);
  if(!ticket){
    status.textContent="Open this studio through your PTG Creative Studios menu.";
    return;
  }
  if(!/^[A-Za-z0-9_-]{43}$/.test(ticket)){
    status.textContent="The access link is invalid. Return to PTG.";
    return;
  }
  status.textContent="Verifying your PTG Team Leader or administrator access…";
  fetch("/api/studio-session",{
    method:"POST",cache:"no-store",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ticket}),
  }).then(async response=>{
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok!==true)throw Error("Your PTG access could not be verified or has expired.");
    location.replace("/");
  }).catch(error=>{status.textContent=error.message||"Authorization unavailable.";});
})();
