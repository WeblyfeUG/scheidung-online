/* Consent-Banner (Consent Mode v2) für die v2-Seiten — gleiche Logik und
   derselbe Speicher-Schlüssel wie in v3.js, Optik über injizierte Styles. */
(function(){
'use strict';
var CK='so-v3-consent';
var css='.consent-sheet{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:220;background:#fff;border:1px solid #DBE3E8;border-radius:14px;box-shadow:0 18px 50px rgba(20,45,66,.22);padding:16px 18px;max-width:560px;margin:0 auto;opacity:0;transform:translateY(12px);transition:opacity .22s ease,transform .22s ease;visibility:hidden;font-family:inherit;}'+
'.consent-sheet.show{opacity:1;transform:none;visibility:visible;}'+
'.consent-sheet p{margin:0 0 12px;font-size:14px;line-height:1.55;color:#172332;}'+
'.consent-sheet a{color:#1F3D57;text-decoration:underline;}'+
'.consent-btns{display:flex;gap:10px;}'+
'.consent-btns button{flex:1;min-height:44px;border-radius:11px;font-family:inherit;font-size:15px;font-weight:600;cursor:pointer;}'+
'.consent-btns .c-decline{background:#fff;color:#1F3D57;border:1.5px solid #1F3D57;}'+
'.consent-btns .c-accept{background:#1F3D57;color:#fff;border:1.5px solid #1F3D57;}'+
'.linkish{background:none;border:0;padding:0;font:inherit;color:inherit;cursor:pointer;text-decoration:none;}'+
'.linkish:hover{color:var(--c-accent,#C99A51);}'+
'@media (prefers-reduced-motion: reduce){.consent-sheet{transition:none;}}';
var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
function build(){
  var d=document.getElementById('consent-sheet');
  if(d)return d;
  d=document.createElement('div');
  d.className='consent-sheet';d.id='consent-sheet';
  d.setAttribute('role','dialog');d.setAttribute('aria-label','Einwilligung in Messdienste');
  d.innerHTML='<p>Wir verwenden Messdienste, um zu verstehen, wie unsere Seite genutzt wird. <a href="datenschutz.html">Details in der Datenschutzerkl\u00e4rung</a>.</p>'+
    '<div class="consent-btns"><button type="button" class="c-decline" data-consent="declined">Ablehnen</button><button type="button" class="c-accept" data-consent="accepted">Akzeptieren</button></div>';
  document.body.appendChild(d);
  Array.prototype.forEach.call(d.querySelectorAll('[data-consent]'),function(b){
    b.addEventListener('click',function(){
      try{localStorage.setItem(CK,b.getAttribute('data-consent'));}catch(e){}
      d.classList.remove('show');
    });
  });
  return d;
}
function init(){
  var stored=null;try{stored=localStorage.getItem(CK);}catch(e){}
  if(!stored){var d=build();setTimeout(function(){d.classList.add('show');},60);}
  Array.prototype.forEach.call(document.querySelectorAll('[data-consent-open]'),function(btn){
    btn.addEventListener('click',function(ev){ev.preventDefault();var d=build();setTimeout(function(){d.classList.add('show');},30);});
  });
}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}else{init();}
})();
