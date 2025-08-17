(function(){
  // Utilities
  function $(sel,root){return (root||document).querySelector(sel);} 
  function $all(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}
  function setStatus(t){ var el=$("#statusText"); if(el) el.textContent=t; }
  function fmtBytes(bytes){ if(bytes==null||isNaN(bytes))return""; var u=["B","KB","MB","GB"]; var i=0,v=bytes; while(v>=1024&&i<u.length-1){v/=1024;i++;} return (v<10&&i>0?v.toFixed(1):v.toFixed(0))+" "+u[i]; }
  function fmtTime(ms){ if(ms==null||isNaN(ms))return""; return ms<1000? (Math.round(ms)+" ms") : ((ms/1000).toFixed(2)+" s"); }

  var THEME_KEY="networkPlus.theme"; var THEMES=["system","dark","light"];
  function loadThemePref(cb){ try{ chrome.storage.local.get([THEME_KEY], function(obj){ cb(obj && obj[THEME_KEY] ? obj[THEME_KEY] : (localStorage.getItem(THEME_KEY)||"system"));}); }catch(e){ try{ cb(localStorage.getItem(THEME_KEY)||"system"); }catch(err){ cb("system"); } } }
  function saveThemePref(v){ try{ chrome.storage.local.set((function(o){o[THEME_KEY]=v;return o;})({}), function(){}); }catch(e){ try{ localStorage.setItem(THEME_KEY,v);}catch(err){} } }
  function applyTheme(pref){ var html=document.documentElement; html.removeAttribute("data-theme"); if(pref==="light")html.setAttribute("data-theme","light"); if(pref==="dark")html.setAttribute("data-theme","dark"); var b=$("#themeBtn"); if(b) b.textContent="Theme: "+(pref.charAt(0).toUpperCase()+pref.slice(1)); setStatus("Theme="+pref); }
  function nextTheme(cur){ var i=THEMES.indexOf(cur); return THEMES[(i+1)%THEMES.length]||"system"; }

  var DEFAULT_COLUMNS=[
    {id:"id",label:"ID",width:60,visible:true},
    {id:"time",label:"Time",width:160,visible:true},
    {id:"method",label:"Method",width:80,visible:true},
    {id:"status",label:"Status",width:70,visible:true},
    {id:"type",label:"Type",width:150,visible:true},
    {id:"url",label:"URL",width:420,visible:true},
    {id:"path",label:"Path",width:260,visible:true},
    {id:"domain",label:"Domain",width:180,visible:true},
    {id:"duration",label:"Duration",width:110,visible:true},
    {id:"size",label:"Size",width:90,visible:true}
  ];

  var state={ columns: DEFAULT_COLUMNS.slice(0), rows: [], selectedIndex:-1,
    columnFilters:{
      method:{"GET":true,"POST":true,"PUT":true,"DELETE":true,"PATCH":true,"HEAD":true,"OPTIONS":true},
      status:{"10x":true,"20x":true,"30x":true,"40x":true,"50x":true,"Other":true}
    },
    nextId:1, paused:false
  };

  function extractUrlParts(url){ try{ var u=new URL(url); return {domain:u.host, path:u.pathname+(u.search||"")}; }catch(e){ return {domain:"",path:url}; } }

  function buildRowFromRequest(req){
    var r={ _reqObj:req,
      method:(req && req.request && req.request.method)||"", url:(req && req.request && req.request.url)||"", 
      status:(req && req.response && req.response.status)||0, statusText:(req && req.response && req.response.statusText)||"", 
      type:(req && req.response && req.response.content && req.response.content.mimeType)||"", 
      protocol: (req && req.response && req.response.httpVersion ? String(req.response.httpVersion).toUpperCase() : ""),
      size: (req && req.response && (req.response.bodySize || (req.response.content && req.response.content.size))) || 0,
      timeText: req && req.startedDateTime || "", duration: req && req.time || 0,
      startedDateTime: req && req.startedDateTime || "", requestHeaders: (req && req.request && req.request.headers) || [],
      responseHeaders: (req && req.response && req.response.headers) || [],
      requestPostData: (req && req.request && req.request.postData) || null, timingText: ""
    };
    var p=extractUrlParts(r.url); r.domain=p.domain; r.path=p.path;
    var t=(req && req.timings)||{}; var pairs=[]; for(var k in t){ pairs.push(k+": "+t[k]); } r.timingText = pairs.length? pairs.join("\n") : "(no timing details)";
    r.id = state.nextId++;
    return r;
  }

  function createDropdownFilter(colId, options){
    var dropdown = document.createElement("div"); dropdown.className = "filter-dropdown";
    var btn = document.createElement("button"); btn.className = "filter-btn";
    var content = document.createElement("div"); content.className = "filter-dropdown-content";

    var allTrue = true;
    for(var opt in options){ if(!options[opt]) allTrue=false; }
    btn.textContent = allTrue ? "All" : Object.keys(options).filter(function(k){return options[k];}).join(', ') || "None";

    for(var option in options){
      var label = document.createElement("label");
      var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = options[option]; cb.dataset.option = option;
      cb.addEventListener("change", function(e){
        state.columnFilters[colId][e.target.dataset.option] = e.target.checked;
        render();
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(option));
      content.appendChild(label);
    }

    btn.addEventListener("click", function(e){ e.stopPropagation(); content.classList.toggle("show"); });
    dropdown.appendChild(btn); dropdown.appendChild(content);
    return dropdown;
  }

  function renderHeader(){
    var thead=$("#thead"); thead.innerHTML="";
    var tr=document.createElement("tr"); // Titles
    for(var i=0;i<state.columns.length;i++){
      var c=state.columns[i]; if(!c.visible) continue;
      var th=document.createElement("th"); th.style.width=(c.width||120)+"px"; th.textContent=c.label;
      var resizer=document.createElement("div"); resizer.className="col-resizer";
      (function(col, headerEl){
        resizer.addEventListener("mousedown", function(e){
          e.preventDefault();
          var startX = e.clientX;
          var startWidth = headerEl.offsetWidth;
          function handleMouseMove(e){ var newWidth=startWidth+(e.clientX-startX); if(newWidth>20){col.width=newWidth;headerEl.style.width=newWidth+"px";} }
          function handleMouseUp(e){ document.removeEventListener("mousemove",handleMouseMove); document.removeEventListener("mouseup",handleMouseUp); }
          document.addEventListener("mousemove",handleMouseMove); document.addEventListener("mouseup",handleMouseUp);
        });
      })(c, th);
      th.appendChild(resizer);
      tr.appendChild(th);
    }
    thead.appendChild(tr);
    var ftr = document.createElement("tr"); // Filters
    ftr.className = "filter-row";
    for(var i=0;i<state.columns.length;i++){
      var c=state.columns[i]; if(!c.visible) continue;
      var fth = document.createElement("th");
      if(c.id === 'method'){
        fth.appendChild(createDropdownFilter('method', state.columnFilters.method));
      } else if (c.id === 'status'){
        fth.appendChild(createDropdownFilter('status', state.columnFilters.status));
      } else {
        var fin = document.createElement("input");
        fin.type = "text"; fin.placeholder = "Filter..."; fin.dataset.colId = c.id;
        fin.value = state.columnFilters[c.id] || "";
        fin.addEventListener("input", function(e){
          var id = e.target.dataset.colId; state.columnFilters[id] = e.target.value; renderBody();
        });
        fth.appendChild(fin);
      }
      ftr.appendChild(fth);
    }
    thead.appendChild(ftr);
  }

  function renderBody(){
    var tbody=$("#tbody"); tbody.innerHTML="";
    var rows=state.rows.filter(function(r){
      for(var colId in state.columnFilters){
        if(colId === 'method'){
          if(!state.columnFilters.method[r.method]) return false;
        } else if (colId === 'status'){
          var statusGroup = String(r.status).charAt(0) + "0x";
          if(r.status < 100 || r.status >= 600) statusGroup = "Other";
          if(!state.columnFilters.status[statusGroup]) return false;
        } else {
          var filterVal = (state.columnFilters[colId]||"").toLowerCase();
          if(!filterVal) continue;
          var rowVal = (r[colId]==null?"":String(r[colId])).toLowerCase();
          var filterTokens = filterVal.split(',').map(function(t){ return t.trim(); }).filter(function(t){ return t; });
          if (filterTokens.length > 0) {
            var match = filterTokens.some(function(token){ return rowVal.indexOf(token) > -1; });
            if (!match) return false;
          }
        }
      }
      return true;
    });
    for(var i=0;i<rows.length;i++){ var row=rows[i]; var tr=document.createElement("tr"); (function(idx){ tr.addEventListener("click", function(){ selectRow(idx); }); })(i);
      if(i===state.selectedIndex) tr.classList.add("selected");
      if(row.method){ var method=row.method.toUpperCase(); if(['POST','PUT','DELETE','PATCH','OPTIONS','HEAD','GET'].indexOf(method)>-1){ tr.classList.add('method-'+method); } }
      for(var j=0;j<state.columns.length;j++){ var c=state.columns[j]; if(!c.visible) continue;
        var td=document.createElement("td"); var v=row[c.id];
        if(c.id==="method") td.classList.add("method-cell");
        if(c.id==="size") v=fmtBytes(row.size);
        if(c.id==="time") v=row.timeText||"";
        if(c.id==="duration") v=fmtTime(row.duration);
        td.textContent = v==null?"":String(v); if(c.id==="url"||c.id==="path") td.title=row[c.id]||"";
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    $("#counter").textContent=rows.length+" requests";
  }

  function render(){ renderHeader(); renderBody(); }

  function selectRow(index){
    state.selectedIndex=index; renderBody();
    var row=state.rows[index]; if(!row) return;
    $("#detailsTitle").textContent=(row.method||"")+" "+(row.url||"");
    // Overview
    $("#pane-overview").innerHTML=['<div class="kv">',
      '<div class="key">ID</div><div class="val">'+row.id+'</div>',
      '<div class="key">URL</div><div class="val">'+(row.url||"")+'</div>',
      '<div class="key">Method</div><div class="val">'+(row.method||"")+'</div>',
      '<div class="key">Status</div><div class="val">'+(row.status||"")+'</div>',
      '<div class="key">Type</div><div class="val">'+(row.type||"")+'</div>',
      '<div class="key">Protocol</div><div class="val">'+(row.protocol||"")+'</div>',
      '<div class="key">Domain</div><div class="val">'+(row.domain||"")+'</div>',
      '<div class="key">Path</div><div class="val">'+(row.path||"")+'</div>',
      '<div class="key">Started</div><div class="val">'+(row.startedDateTime||"")+'</div>',
      '<div class="key">Duration</div><div class="val">'+fmtTime(row.duration)+'</div>',
      '<div class="key">Size</div><div class="val">'+fmtBytes(row.size)+'</div>',
      '</div>'].join("\n");
    // Headers
    function headersToKvGrid(title,headers){ if(!headers||headers.length===0)return""; var kv=headers.map(function(h){return'<div class="key">'+(h.name||"")+'</div><div class="val">'+(h.value||"")+'</div>';}).join(""); return '<strong>'+title+'</strong><div class="kv">'+kv+'</div>'; }
    $("#pane-headers").innerHTML = headersToKvGrid("Request Headers",row.requestHeaders) + '<br>' + headersToKvGrid("Response Headers",row.responseHeaders);
    // Request
    var reqPane=$("#pane-request"); reqPane.innerHTML="";
    var reqContent=row.requestPostData?(row.requestPostData.text||JSON.stringify(row.requestPostData)):"(no body)";
    var copyBtnReq=document.createElement("button"); copyBtnReq.className="copy-btn"; copyBtnReq.textContent="Copy";
    copyBtnReq.addEventListener("click",function(){navigator.clipboard.writeText(reqContent).catch(function(e){console.error(e);});});
    var contentNodeReq=document.createElement("div"); contentNodeReq.textContent=reqContent;
    reqPane.appendChild(copyBtnReq); reqPane.appendChild(contentNodeReq);
    // Timing
    $("#pane-timing").textContent=row.timingText||"";
    // Response
    var resPane=$("#pane-response"); resPane.innerHTML="(loading...)";
    if(row._reqObj&&typeof row._reqObj.getContent==='function'){
      row._reqObj.getContent(function(content,encoding){
        resPane.innerHTML = "";
        if(encoding==="base64" && row.type && row.type.startsWith('image/')){
          var img=document.createElement('img');
          img.src='data:'+row.type+';base64,'+content;
          img.style.maxWidth='100%';
          resPane.appendChild(img);
          return;
        }
        var text=content||"(no response body)";
        if(encoding==="base64"){ try{text=atob(content);}catch(e){text="(could not decode base64 response)";} }
        var copyBtnRes=document.createElement("button"); copyBtnRes.className="copy-btn"; copyBtnRes.textContent="Copy";
        copyBtnRes.addEventListener("click",function(){navigator.clipboard.writeText(text).catch(function(e){console.error(e);});});
        var contentNodeRes=document.createElement("div"); contentNodeRes.textContent=text;
        resPane.appendChild(copyBtnRes); resPane.appendChild(contentNodeRes);
      });
    }else{
      resPane.textContent="(response body not available)";
    }
  }

  function exportCSV(){
    var cols=state.columns.filter(function(c){return c.visible;});
    function esc(s){ s=String(s==null?"":s); return '"'+s.replace(/"/g,'""')+'"'; }
    var header=cols.map(function(c){return esc(c.label);}).join(",");
    var lines=[header];
    for(var i=0;i<state.rows.length;i++){ var r=state.rows[i];
      var arr=[]; for(var j=0;j<cols.length;j++){ var c=cols[j]; var v=r[c.id];
        if(c.id==="size") v=fmtBytes(r.size); if(c.id==="time") v=r.timeText||""; if(c.id==="duration") v=fmtTime(r.duration);
        arr.push(esc(v));
      }
      lines.push(arr.join(","));
    }
    var csv="\ufeff"+lines.join("\r\n"); var blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    var url=URL.createObjectURL(blob); var a=document.createElement("a"); a.href=url; a.download="network-plus.csv"; a.click(); setTimeout(function(){URL.revokeObjectURL(url);},1000);
  }

  function toHarHeaders(arr){ var out=[]; if(arr){ for(var i=0;i<arr.length;i++){ var h=arr[i]; out.push({name:String(h.name||""), value:String(h.value==null?"":h.value)}); } } return out; }
  function parseQueryString(url){ try{ var u=new URL(url); var e=u.searchParams.entries(); var out=[]; for(var kv=e.next(); !kv.done; kv=e.next()){ out.push({name:kv.value[0], value:kv.value[1]}); } return out; }catch(e){ return []; } }
  function guessMimeType(row){ 
    var ct=null; var rh=row.responseHeaders||[]; for(var i=0;i<rh.length;i++){ if((rh[i].name||"").toLowerCase()==="content-type"){ ct=rh[i].value; break; } }
    if(ct){ return ct.split(";")[0].trim(); } return row.type||"application/octet-stream";
  }
  function buildHarLogFromRows(){
    var pageref="page_1"; var entries=[];
    for(var i=0;i<state.rows.length;i++){ var r=state.rows[i];
      var started=r.startedDateTime||new Date().toISOString(); var url=r.url||""; var httpVersion=r.protocol||"HTTP/2";
      var reqHeaders=toHarHeaders(r.requestHeaders); var resHeaders=toHarHeaders(r.responseHeaders);
      var postData = r.requestPostData ? { mimeType: (r.requestPostData.mimeType||""), text: (r.requestPostData.text||"") } : null;
      var content = { size: r.size||0, mimeType: guessMimeType(r) };
      var timings = { blocked:-1, dns:-1, connect:-1, ssl:-1, send:-1, wait:-1, receive:-1 };
      var t = (r._reqObj && r._reqObj.timings) || {}; for(var k in timings){ if(typeof t[k]==="number") timings[k]=t[k]; }
      var entry = { pageref: pageref, startedDateTime: started, time: (typeof r.duration==="number"? r.duration:0),
        request: { method: r.method||"", url: url, httpVersion: httpVersion, cookies: [], headers: reqHeaders, queryString: parseQueryString(url), headersSize:-1, bodySize: (r.requestPostData && r.requestPostData.text ? r.requestPostData.text.length : -1) },
        response: { status: r.status||0, statusText: r.statusText||"", httpVersion: httpVersion, cookies: [], headers: resHeaders, content: content, redirectURL:"", headersSize:-1, bodySize: r.size||-1 },
        cache: {}, timings: timings
      };
      if(postData){ entry.request.postData = postData; }
      entries.push(entry);
    }
    var now=new Date().toISOString();
    return { log: { version:"1.2", creator:{ name:"Network+ for DevTools", version:"1.1.17" }, pages:[{ startedDateTime: now, id: pageref, title:"Network+", pageTimings:{} }], entries: entries } };
  }
  function exportHAR(){
    var har = buildHarLogFromRows();
    var blob = new Blob([JSON.stringify(har,null,2)], {type:"application/json"});
    var url = URL.createObjectURL(blob); var a=document.createElement("a"); a.href=url; a.download="network-plus.har"; a.click(); setTimeout(function(){URL.revokeObjectURL(url);},1000);
  }

  document.addEventListener("DOMContentLoaded", function(){
    setStatus("panel.js loaded");
    // Theme init
    loadThemePref(function(pref){ applyTheme(pref); });
    var themeBtn=$("#themeBtn"); themeBtn.addEventListener("click", function(){ loadThemePref(function(cur){ var nxt=nextTheme(cur); saveThemePref(nxt); applyTheme(nxt); }); });
    // Clear / Pause
    $("#clearBtn").addEventListener("click", function(){ state.rows=[]; state.columnFilters={}; state.nextId=1; state.selectedIndex=-1; render(); setStatus("Cleared"); });
    var pauseBtn=$("#pauseBtn");
    var topbar=$(".topbar");
    function updateRecordState(){
      pauseBtn.innerHTML = state.paused?"▶️":"⏸️";
      if(!state.paused){ topbar.classList.add("recording"); }else{ topbar.classList.remove("recording"); }
      setStatus(state.paused?"Paused":"Resumed");
    }
    pauseBtn.addEventListener("click", function(){ state.paused=!state.paused; updateRecordState(); });
    updateRecordState();
    // Export
    $("#exportCsvBtn").addEventListener("click", exportCSV);
    $("#exportHarBtn").addEventListener("click", exportHAR);
    // Accordion
    try {
      $all(".accordion-header").forEach(function(header){
        header.addEventListener("click", function(e){
          var item = e.currentTarget.parentElement;
          item.classList.toggle("active");
        });
      });
      // By default, open all accordion items
      $all(".accordion-item").forEach(function(item){ item.classList.add("active"); });
    } catch (e) {
      console.error("Error setting up accordion:", e);
      setStatus("Error setting up accordion: " + e.message);
    }
    // Render header now
    render();

    window.addEventListener('click', function(e) {
      if (!e.target.matches('.filter-btn')) {
        $all(".filter-dropdown-content").forEach(function(d){
          if (d.classList.contains('show')) { d.classList.remove('show'); }
        });
      }
    });

    // Resizer logic
    var resizer = $("#resizer");
    var tableWrap = $("#tableWrap");
    var details = $("#details");
    var isResizing = false;

    resizer.addEventListener("mousedown", function(e) {
      isResizing = true;
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", function() {
        isResizing = false;
        document.removeEventListener("mousemove", handleMouseMove);
      });
    });

    function handleMouseMove(e) {
      if (!isResizing) return;
      var totalWidth = $("#content").offsetWidth;
      var newDetailsWidth = totalWidth - e.clientX;
      if (newDetailsWidth > 300 && newDetailsWidth < totalWidth - 240) {
        details.style.flexBasis = newDetailsWidth + "px";
        tableWrap.style.flexBasis = (totalWidth - newDetailsWidth - 5) + "px";
      }
    }

    // Network subscription
    if (chrome && chrome.devtools && chrome.devtools.network && chrome.devtools.network.onRequestFinished) {
      chrome.devtools.network.onRequestFinished.addListener(function(request){
        if(state.paused) return;
        var row=buildRowFromRequest(request);
        state.rows.push(row);
        renderBody();
      });
      setStatus("Capturing…");
    } else {
      setStatus("DevTools network API unavailable");
    }

    // Error → status bar
    window.addEventListener("error", function(e){ setStatus("Error: "+(e.message||e.error||e.filename)); });
    window.addEventListener("unhandledrejection", function(e){ setStatus("Promise error: "+(e.reason && e.reason.message || e.reason)); });
  });
})();