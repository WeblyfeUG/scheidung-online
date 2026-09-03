(function(){
'use strict';
var TEL='+4951154368383', TELTXT='0511 54 36 83 83';
var CK='so-v3-consent';
function qsa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
/* Consent-Banner (Consent Mode v2 — gleichwertige Buttons) */
function buildConsent(){
  var d=document.getElementById('consent-sheet');
  if(d)return d;
  d=document.createElement('div');
  d.className='consent-sheet';d.id='consent-sheet';
  d.setAttribute('role','dialog');d.setAttribute('aria-label','Einwilligung in Messdienste');
  d.innerHTML='<p>Wir verwenden Messdienste, um zu verstehen, wie unsere Seite genutzt wird. <a href="datenschutz.html">Details in der Datenschutzerkl\u00e4rung</a>.</p>'+
    '<div class="consent-btns"><button type="button" class="btn btn-line" data-consent="declined">Ablehnen</button><button type="button" class="btn btn-navy" data-consent="accepted">Akzeptieren</button></div>';
  document.body.appendChild(d);
  qsa('[data-consent]',d).forEach(function(b){b.addEventListener('click',function(){
    try{localStorage.setItem(CK,b.getAttribute('data-consent'));}catch(e){}
    d.classList.remove('show');
  });});
  return d;
}
function initConsent(){
  var stored=null;try{stored=localStorage.getItem(CK);}catch(e){}
  if(!stored){var d=buildConsent();setTimeout(function(){d.classList.add('show');},60);}
  qsa('[data-consent-open]').forEach(function(btn){btn.addEventListener('click',function(){
    var d=buildConsent();setTimeout(function(){d.classList.add('show');},30);
  });});
}
/* R\u00fcckruf-Baustein — Zustand offen/geschlossen */
function cbState(){
  var p=new URLSearchParams(location.search).get('rueckruf');
  if(p==='geschlossen')return 'closed';
  if(p==='offen')return 'open';
  var n=new Date(),d=n.getDay(),h=n.getHours();
  return (d>=1&&d<=5&&h>=8&&h<18)?'open':'closed';
}
function chipsHtml(){return '<div class="chips" data-chips><button type="button" data-v="Vormittag">Vormittag</button><button type="button" data-v="Nachmittag">Nachmittag</button><button type="button" data-v="Abend">Abend</button></div>';}
function cbFormHtml(i){
  return '<form data-demo novalidate>'+
    '<div class="fld"><label for="cb-name-'+i+'">Ihr Name</label><input id="cb-name-'+i+'" name="name" type="text" autocomplete="name" data-req><span class="err">Bitte geben Sie Ihren Namen an.</span></div>'+
  '<div class="fld"><label for="cb-mail-'+i+'">E-Mail-Adresse</label><input id="cb-mail-'+i+'" name="email" type="email" inputmode="email" autocomplete="email" data-req><span class="err">Bitte geben Sie Ihre E-Mail-Adresse an.</span></div>'+
  '<div class="fld"><label class="consent"><input type="checkbox" data-req-check><span class="cbox"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span><span>Ich habe die <a href="datenschutz.html">Datenschutzerkl\u00e4rung</a> gelesen und willige ein, dass meine Angaben zur Bearbeitung meiner Anfrage gespeichert und verarbeitet werden.</span></label><span class="err">Bitte stimmen Sie der Datenschutzerkl\u00e4rung zu.</span></div>'+
  '<button type="submit" class="btn '+(cbState()==='closed'?'btn-gold':'btn-line')+' btn-block">Nachricht senden</button>'+
  '</form>'+
  '<div class="form-success"><div class="fs-check"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div><h3>Vielen Dank.</h3><p>Wir antworten Ihnen per E-Mail \u2014 in der Regel innerhalb von 24 Stunden.</p></div>';
}
function initCallback(){
  var st=cbState();
  qsa('[data-callback]').forEach(function(el,i){
    el.className='cb '+st;
    var head;
    if(st==='open'){
      head='<span class="cb-status"><span class="cb-dot"></span>Jetzt erreichbar \u00b7 Mo\u2013Fr 8\u201318 Uhr</span>'+
      '<h3>Sprechen wir kurz \u2014 wir h\u00f6ren zu.</h3>'+
      '<p class="cb-sub">Kein Verkaufsgespr\u00e4ch: Sie schildern kurz Ihre Situation, wir sagen ehrlich, was der n\u00e4chste Schritt w\u00e4re.</p>'+
      '<a class="btn btn-gold btn-block" href="tel:'+TEL+'">'+TELTXT+' anrufen</a>'+
      '<div class="cb-or">oder schreiben Sie uns kurz</div>';
    }else{
      head='<span class="cb-status"><span class="cb-dot"></span>Mo\u2013Fr 8\u201318 Uhr \u00b7 gerade geschlossen</span>'+
      '<h3>Gerade geschlossen \u2014 schreiben Sie uns, wir antworten Ihnen.</h3>'+
      '<p class="cb-sub">Schildern Sie kurz Ihr Anliegen \u2014 Sie erhalten unsere Antwort per E-Mail, in der Regel innerhalb von 24 Stunden. Ein pers\u00f6nliches Gespr\u00e4ch vereinbaren wir bei Bedarf im Rahmen der Erstberatung.</p>';
    }
    el.innerHTML=head+cbFormHtml(i)+(st==='closed'?'<p class="cb-tel-min">Lieber selbst anrufen? Morgen ab 8 Uhr: <a href="tel:'+TEL+'">'+TELTXT+'</a></p>':'');
    var ch=null,hid=null;
    if(ch){qsa('button',ch).forEach(function(b){b.addEventListener('click',function(){
      var on=b.classList.contains('on');
      qsa('button',ch).forEach(function(x){x.classList.remove('on');});
      if(!on){b.classList.add('on');hid.value=b.getAttribute('data-v');}else{hid.value='';}
    });});}
    wireForm(el.querySelector('form'));
  });
}

/* Payload für die serverseitige Same-Origin-Route /api/lead */
function buildPayload(form){
  var p={meta:{gesendet_am:new Date().toISOString(),seite:location.href}};
  var val=function(sel){var el=form.querySelector(sel);return el?el.value.trim():'';};
  if(form.closest('[data-callback]')){
    p.type='nachricht';p.meta.quelle='Kontakt-Baustein';
    p.name=val('[name=name]');p.email=val('[name=email]');
    p.dsgvo_zugestimmt=true;
  }else if(form.querySelector('#dl-email')){
    p.type='checkliste_pdf';p.meta.quelle='Scheidungsunterlagen-Checkliste';
    p.email=val('#dl-email');p.dsgvo_zugestimmt=true;
  }else{
    p.type='kostenrahmen';p.meta.quelle='Kostenorientierung (Landingpage)';
    p.c_vorname=val('#k-vorname');p.c_nachname=val('#k-nachname');
    p.c_telefon=val('#k-tel');p.c_email=val('#k-email');
    p.c_nachricht=val('#k-msg');
    p.cost_dsgvo=true;
  }
  return p;
}
/* Formulare -> serverseitige Route */
function wireForm(form){
  if(!form)return;
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var bad=null;
    qsa('[data-req]',form).forEach(function(inp){
      var f=inp.closest('.fld'),empty=!inp.value.trim();
      f.classList.toggle('bad',empty);
      if(empty&&!bad)bad=inp;
    });
    qsa('[data-req-check]',form).forEach(function(cb){
      var f=cb.closest('.fld');
      f.classList.toggle('bad',!cb.checked);
      if(!cb.checked&&!bad)bad=cb;
    });
    if(bad){bad.focus();return;}
    var wrap=form.parentNode,su=wrap.querySelector('.form-success');
    var btn=form.querySelector('[type=submit]');
    if(btn){btn.disabled=true;btn.style.opacity='.6';}
    var payload=buildPayload(form);
    fetch('/api/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
      .then(function(res){
        if(!res.ok)throw new Error('HTTP '+res.status);
        form.style.display='none';if(su)su.classList.add('show');
        var fh=su&&su.querySelector('h3');if(fh){fh.setAttribute('tabindex','-1');fh.focus({preventScroll:true});}
      })
      .catch(function(err){
        console.error('Übertragung fehlgeschlagen:',err);
        if(btn){btn.disabled=false;btn.style.opacity='';}
        var e=form.querySelector('.submit-err');
        if(!e){e=document.createElement('span');e.className='err show submit-err';e.style.display='block';e.style.marginTop='10px';e.setAttribute('role','alert');e.textContent='Das hat leider nicht geklappt. Bitte versuchen Sie es erneut — oder rufen Sie uns einfach an.';form.appendChild(e);}
        else{e.classList.add('show');}
      });
  });
  form.addEventListener('input',function(e){
    var f=e.target.closest('.fld');
    if(f&&f.classList.contains('bad')&&(e.target.value||'').trim())f.classList.remove('bad');
  });
  form.addEventListener('change',function(e){
    if(e.target.hasAttribute&&e.target.hasAttribute('data-req-check')&&e.target.checked){
      var f=e.target.closest('.fld');if(f)f.classList.remove('bad');
    }
  });
}
/* Checkliste */
function initChecklist(){
  var c=document.querySelector('[data-checklist]');
  if(!c)return;
  var KEY='so-v3-checklist',state={};
  try{state=JSON.parse(localStorage.getItem(KEY)||'{}');}catch(e){state={};}
  var cards=qsa('.cl-card',c),cnt=document.getElementById('cl-count'),bar=document.getElementById('cl-fill');
  function upd(){
    var n=cards.filter(function(x){return x.classList.contains('done');}).length;
    if(cnt)cnt.textContent=n;
    if(bar)bar.style.width=(n/cards.length*100)+'%';
  }
  cards.forEach(function(card){
    var id=card.getAttribute('data-id');
    if(state[id])card.classList.add('done');
    var chk=card.querySelector('.cl-check');
    chk.setAttribute('aria-pressed',card.classList.contains('done')?'true':'false');
    chk.addEventListener('click',function(){
      card.classList.toggle('done');
      var on=card.classList.contains('done');
      chk.setAttribute('aria-pressed',on?'true':'false');
      state[id]=on;try{localStorage.setItem(KEY,JSON.stringify(state));}catch(e){}
      upd();
    });
    var head=card.querySelector('.cl-head');
    head.addEventListener('click',function(){
      var open=card.classList.toggle('open');
      head.setAttribute('aria-expanded',open?'true':'false');
    });
  });
  upd();
}
/* FAQ */
function initFaq(){
  qsa('.faq-item').forEach(function(item){
    var q=item.querySelector('.faq-q');
    q.addEventListener('click',function(){
      var open=item.classList.contains('open');
      qsa('.faq-item.open',item.parentNode).forEach(function(o){o.classList.remove('open');o.querySelector('.faq-q').setAttribute('aria-expanded','false');});
      if(!open){item.classList.add('open');q.setAttribute('aria-expanded','true');}
    });
  });
}
/* Schnell-Check */
function initQuiz(){
  var quiz=document.querySelector('[data-quiz]');
  if(!quiz)return;
  var items=qsa('.q-item',quiz),ans={};
  items.forEach(function(qi,idx){
    qsa('button',qi).forEach(function(b){
      b.addEventListener('click',function(){
        qsa('button',qi).forEach(function(x){x.classList.remove('on');});
        b.classList.add('on');
        ans[idx]=b.getAttribute('data-v');
        if(Object.keys(ans).length===items.length){
          var good=items.every(function(x,k){return ans[k]===x.getAttribute('data-good');});
          quiz.querySelector('.q-res.ok').classList.toggle('show',good);
          quiz.querySelector('.q-res.talk').classList.toggle('show',!good);
        }
      });
    });
  });
}
/* Sticky-CTA mit Label-Wechsel */
function initSticky(){
  var a=document.querySelector('.sticky-cta a[data-swap-when]');
  if(!a||!('IntersectionObserver' in window))return;
  var t=document.querySelector(a.getAttribute('data-swap-when'));
  if(!t)return;
  var oL=a.textContent,oH=a.getAttribute('href');
  function apply(past){
    a.textContent=past?a.getAttribute('data-swap-label'):oL;
    a.setAttribute('href',past?a.getAttribute('data-swap-href'):oH);
  }
  new IntersectionObserver(function(es){
    es.forEach(function(e){apply(e.boundingClientRect.bottom<120&&!e.isIntersecting);});
  },{threshold:0}).observe(t);
  window.addEventListener('scroll',function(){apply(t.getBoundingClientRect().bottom<120);},{passive:true});
}
/* Bewertungs-Punkte */
function initRevDots(){
  var sc=document.querySelector('.rev-scroll'),dots=document.querySelector('.rev-dots');
  if(!sc||!dots)return;
  var items=qsa('.rev-card',sc),ds=qsa('i',dots);
  sc.addEventListener('scroll',function(){
    var i=Math.round(sc.scrollLeft/(sc.scrollWidth/items.length));
    i=Math.max(0,Math.min(items.length-1,i));
    ds.forEach(function(d,k){d.classList.toggle('on',k===i);});
  },{passive:true});
}
function initHeader(){
  var n=document.querySelector('.v3-top');
  if(!n)return;
  window.addEventListener('scroll',function(){n.classList.toggle('scrolled',window.scrollY>30);},{passive:true});
}
function initSoloChips(){
  qsa('[data-chips-solo]').forEach(function(ch){
    var hid=ch.parentNode.querySelector('[data-chip-value]');
    qsa('button',ch).forEach(function(b){b.addEventListener('click',function(){
      var on=b.classList.contains('on');
      qsa('button',ch).forEach(function(x){x.classList.remove('on');});
      if(!on)b.classList.add('on');
      if(hid)hid.value=on?'':b.getAttribute('data-v');
    });});
  });
}
initConsent();initCallback();initSoloChips();qsa('form[data-demo]').forEach(wireForm);initChecklist();initFaq();initQuiz();initSticky();initRevDots();initHeader();
})();