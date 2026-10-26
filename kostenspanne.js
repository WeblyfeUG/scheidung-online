/* Kostenspanne — ehrliche Bandbreite statt Punktwert (Maßnahmenkatalog 25.10.2026, Weg 1).
   Gebührentabellen § 13 RVG / § 28 FamGKG in der Fassung ab 01.06.2025 (KostBRÄG 2025), stufenweise
   berechnet — identisch mit api/_lib/kosten.js im HQ. Unverbindliche Orientierung. */
(function(){
'use strict';
/* Stufen: [bis Wert, Schrittweite, Erhöhung je angefangenem Schritt]; Grundgebühr bis 500 € */
var RVG={basis:51.5,stufen:[[2000,500,41.5],[10000,1000,59.5],[25000,3000,55],[50000,5000,86],[200000,15000,99.5],[500000,30000,140],[Infinity,50000,175]]};
var GK={basis:40,stufen:[[2000,500,21],[10000,1000,22.5],[25000,3000,30.5],[50000,5000,40.5],[200000,15000,140],[500000,30000,210],[Infinity,50000,210]]};
function fee(tab,vw){var g=tab.basis,unten=500;for(var i=0;i<tab.stufen.length;i++){var st=tab.stufen[i];if(vw<=unten)break;var oben=Math.min(vw,st[0]);g+=Math.ceil((oben-unten)/st[1])*st[2];unten=st[0];}return g;}
function kosten(vw){var r=fee(RVG,vw);var anwalt=(2.5*r+20)*1.19;var gericht=2*fee(GK,vw);return {anwalt:anwalt,gericht:gericht,sum:anwalt+gericht};}
function spanne(a,b,kids){var drei=(a+b)*3;var sLow=Math.max(3000,drei-kids*750),sHigh=Math.max(3000,drei);var va=Math.max(1000,drei*0.10);return {low:kosten(sLow+2*va),high:kosten(sHigh+4*va)};}
function r50(x){return Math.round(x/50)*50;}
function eur(x){return r50(x).toLocaleString('de-DE')+'\u00a0\u20ac';}
function span(lo,hi){return r50(lo)===r50(hi)?'rund '+eur(lo):eur(lo)+' \u2013 '+eur(hi);}
function num(v){return parseInt(String(v||'').replace(/[^0-9]/g,''),10)||0;}
var TICK='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
function render(root){
  var cta=root.getAttribute('data-ctahref')||'#vorbereiten';
  var vkh=root.getAttribute('data-vkhhref')||'scheidungskosten.html#vkh';
  root.innerHTML='<div class="ks" data-screen-label="Kostenspanne">'+
  '<span class="ks-tag">Kostenspanne \u00b7 in 30 Sekunden</span>'+
  '<h2>Was kostet Ihre Scheidung voraussichtlich?</h2>'+
  '<p class="ks-intro">Zwei Angaben gen\u00fcgen \u2014 Sie sehen sofort eine ehrliche Spanne. Ohne E-Mail, ohne Anmeldung.</p>'+
  '<div class="ks-grid"><div class="ks-inputs">'+
  '<div class="ks-field"><label for="ks-a">Ihr monatliches Nettoeinkommen</label><div class="ks-money"><input id="ks-a" type="text" inputmode="numeric" autocomplete="off" placeholder="z.\u00a0B. 2.400"><i>\u20ac</i></div></div>'+
  '<div class="ks-field"><label for="ks-b">Nettoeinkommen Ihres Ehepartners / Ihrer Ehepartnerin <small>(0, falls nicht bekannt)</small></label><div class="ks-money"><input id="ks-b" type="text" inputmode="numeric" autocomplete="off" placeholder="z.\u00a0B. 1.800"><i>\u20ac</i></div></div>'+
  '<div class="ks-field"><span class="ks-lbl">Gemeinsame minderj\u00e4hrige Kinder</span><div class="ks-chips" role="group" aria-label="Anzahl Kinder"><button type="button" class="on" data-k="0">Keine</button><button type="button" data-k="1">1</button><button type="button" data-k="2">2</button><button type="button" data-k="3">3+</button></div></div>'+
  '</div><div class="ks-result" aria-live="polite">'+
  '<span class="ks-result-label">In Ihrer Konstellation \u00fcblicherweise</span>'+
  '<div class="ks-range muted" id="ks-range">Tragen Sie die Nettoeinkommen ein \u2014 die Spanne erscheint sofort.</div>'+
  '<span class="ks-sub" id="ks-sub"></span>'+
  '<dl class="ks-break" id="ks-break" hidden><div><dt>Anwaltskosten (eine Anw\u00e4ltin)</dt><dd id="ks-anw"></dd></div><div><dt>Gerichtskosten</dt><dd id="ks-ger"></dd></div></dl>'+
  '<p class="ks-why"><strong>Warum eine Spanne?</strong> Den Verfahrenswert setzt das Familiengericht fest \u2014 vor allem nach dem Einkommen beider Ehegatten und den Rentenanrechten im Versorgungsausgleich. Die Gerichtskosten werden in der Regel zwischen den Ehegatten geteilt.</p>'+
  '<div class="ks-vkh" id="ks-vkh" hidden>Bei diesem Einkommen kann <a href="'+vkh+'">Verfahrenskostenhilfe</a> in Frage kommen \u2014 wir pr\u00fcfen das kostenfrei mit Ihnen.</div>'+
  '<a class="ks-cta" href="'+cta+'">'+TICK+' Unverbindlich online starten</a>'+
  '</div></div>'+
  '<p class="ks-foot">Berechnet nach den gesetzlichen Geb\u00fchrentabellen (RVG, FamGKG) f\u00fcr Scheidung und Versorgungsausgleich bei einvernehmlichem Verlauf, inkl. MwSt. Unverbindliche Orientierung, keine abschlie\u00dfende Kostenberechnung. Die Geb\u00fchren sind gesetzlich festgelegt \u2014 keine Kanzlei darf sie unterschreiten (\u00a7\u00a049b BRAO).</p>'+
  '</div>';
  var a=root.querySelector('#ks-a'),b=root.querySelector('#ks-b'),chips=root.querySelectorAll('.ks-chips button');
  var range=root.querySelector('#ks-range'),sub=root.querySelector('#ks-sub'),brk=root.querySelector('#ks-break'),anw=root.querySelector('#ks-anw'),ger=root.querySelector('#ks-ger'),vkhEl=root.querySelector('#ks-vkh');
  var kids=0;
  function fmt(inp){var n=num(inp.value);inp.value=n?n.toLocaleString('de-DE'):'';}
  function upd(){
    var A=num(a.value),B=num(b.value);
    if(!A&&!B){range.className='ks-range muted';range.textContent='Tragen Sie die Nettoeinkommen ein \u2014 die Spanne erscheint sofort.';sub.textContent='';brk.hidden=true;vkhEl.hidden=true;return;}
    var s=spanne(A,B,kids);
    range.className='ks-range';range.textContent=span(s.low.sum,s.high.sum);
    sub.textContent='gesamt f\u00fcr Gericht und eine Anw\u00e4ltin bei einvernehmlicher Scheidung, inkl. MwSt.';
    anw.textContent=span(s.low.anwalt,s.high.anwalt);ger.textContent=span(s.low.gericht,s.high.gericht);
    brk.hidden=false;vkhEl.hidden=!(A+B<2000);
  }
  [a,b].forEach(function(inp){inp.addEventListener('input',upd);inp.addEventListener('blur',function(){fmt(inp);});});
  Array.prototype.forEach.call(chips,function(c){c.addEventListener('click',function(){Array.prototype.forEach.call(chips,function(x){x.classList.remove('on');});c.classList.add('on');kids=parseInt(c.getAttribute('data-k'),10)||0;upd();});});
}
function init(){Array.prototype.forEach.call(document.querySelectorAll('[data-kostenspanne]'),render);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
