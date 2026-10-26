/* v2.1 Zusatz: Rest-Minuten im Desktop-Wizard */
(function(){
  var cur=document.getElementById('cur-step'),eta=document.getElementById('wz-eta');
  if(!cur||!eta||!window.MutationObserver)return;
  var upd=function(){var s=parseInt(cur.textContent,10)||1;eta.textContent=Math.max(1,Math.round((6-s)*1.6));};
  new MutationObserver(upd).observe(cur,{childList:true,characterData:true,subtree:true});upd();
})();
