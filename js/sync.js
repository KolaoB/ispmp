/* ===== 云端同步模块 =====
 * 学习进度 / 抽查记录 / 考试日期 同步到 Serverless API（/api/data）。
 * - 本地 localStorage 仍是第一数据源（离线可用、渲染零等待）；
 * - 启动时拉取云端数据并与本地合并（状态冲突时以最近作答一方为准，无时间戳则 1 > 2 > 0 取高）；
 * - 任何数据变更后防抖推送全量文档到云端；
 * - 多设备通过同一「学习码」共享进度，学习码即数据键名。
 */
(function(){
  const CODE_KEY='xisu_sync_code';
  const API='/api/data';
  const PUSH_DEBOUNCE=900;    // 变更后合并推送的延迟
  const RETRY_DELAY=15000;    // 推送失败后的重试间隔

  let keys={progress:'xisu_progress_v2',quizLog:'xisu_quiz_log',examDate:'xisu_exam_date'};
  let code='',pushTimer=null,retryTimer=null,pushing=false,dirty=false;
  let lastSyncAt=0,storageKind='';

  const $=s=>document.querySelector(s);

  /* ---- 工具 ---- */
  function readJSON(k){try{return JSON.parse(localStorage.getItem(k))||{};}catch(e){return {};}}
  function genCode(){
    const abc='ABCDEFGHJKMNPQRSTUVWXYZ23456789';let s='';
    for(let i=0;i<6;i++)s+=abc[Math.floor(Math.random()*abc.length)];
    return s;
  }
  function getCode(){let c=localStorage.getItem(CODE_KEY);if(!c){c=genCode();localStorage.setItem(CODE_KEY,c);}return c;}
  function fmtTime(ts){
    const d=new Date(ts),p=n=>String(n).padStart(2,'0');
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function setStatus(st,text){
    const dot=$('#syncDot'),label=$('#syncLabel');
    if(dot)dot.className='sync-dot '+(st||'');
    if(label)label.textContent=text;
  }

  /* ---- 文档构建与合并 ---- */
  // 稀疏化：状态 0（未学习）不上传，缺省即 0
  function sparseProgress(p){
    const out={};
    Object.keys(p||{}).forEach(cid=>{
      const m={};
      Object.keys(p[cid]||{}).forEach(i=>{if(p[cid][i])m[i]=p[cid][i];});
      out[cid]=m;
    });
    return out;
  }
  function buildDoc(){
    return {
      progress:sparseProgress(readJSON(keys.progress)),
      quizLog:readJSON(keys.quizLog),
      examDate:localStorage.getItem(keys.examDate)||'',
      savedAt:Date.now()
    };
  }
  function canonical(doc){
    return JSON.stringify({progress:doc.progress||{},quizLog:doc.quizLog||{},examDate:doc.examDate||''});
  }
  // 合并本地与云端：抽查记录时间取新；掌握状态冲突时取「最近作答」的一方
  // （quizLog 记录每次作答时间戳，答对/答错均记录），无时间戳时退回旧的 1>2>0 规则；考试日期取较新文档的
  function mergeDocs(local,remote){
    const out={progress:{},quizLog:{},examDate:''};
    const a=local.examDate||'',b=remote.examDate||'';
    if(a&&b&&a!==b)out.examDate=(local.savedAt||0)>=(remote.savedAt||0)?a:b;
    else out.examDate=a||b;
    const lq=local.quizLog||{},rq=remote.quizLog||{};
    const q=Object.assign({},lq);
    Object.keys(rq).forEach(k=>{q[k]=Math.max(q[k]||0,rq[k]);});
    out.quizLog=q;
    const lp=local.progress||{},rp=remote.progress||{};
    new Set([...Object.keys(lp),...Object.keys(rp)]).forEach(cid=>{
      const pa=lp[cid]||{},pb=rp[cid]||{},m={};
      new Set([...Object.keys(pa),...Object.keys(pb)]).forEach(i=>{
        const va=pa[i],vb=pb[i];
        if(va===vb){if(va)m[i]=va;return;}
        // 两端状态不一致：最近作答的一方为准，避免旧设备的陈旧状态覆盖新作答（如已掌握抽查答错的待巩固）
        const ta=lq[cid+'_'+i]||0,tb=rq[cid+'_'+i]||0;
        const win=ta>tb?va:(tb>ta?vb:((va===1||vb===1)?1:2));
        if(win)m[i]=win;
      });
      out.progress[cid]=m;
    });
    return out;
  }
  // 把合并结果写回 localStorage
  function writeDoc(doc){
    localStorage.setItem(keys.progress,JSON.stringify(sparseProgress(doc.progress)));
    localStorage.setItem(keys.quizLog,JSON.stringify(doc.quizLog||{}));
    if(doc.examDate)localStorage.setItem(keys.examDate,doc.examDate);
  }

  /* ---- 推送 ---- */
  function pushSoon(){
    if(!code)return;
    if(pushTimer)clearTimeout(pushTimer);
    pushTimer=setTimeout(()=>{pushTimer=null;flushPush();},PUSH_DEBOUNCE);
  }
  async function flushPush(){
    if(!code)return;
    if(pushing){dirty=true;return;}
    pushing=true;dirty=false;
    setStatus('busy','同步中…');
    try{
      const r=await fetch(API,{
        method:'PUT',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({k:code,doc:buildDoc()})
      });
      if(!r.ok)throw new Error('HTTP '+r.status);
      const j=await r.json().catch(()=>({}));
      storageKind=j.storage||'';
      lastSyncAt=Date.now();
      setStatus(storageKind==='tmp'?'err':'ok',storageKind==='tmp'?'⚠️ 未配置云端存储':'已同步 '+fmtTime(lastSyncAt));
      updateModalInfo();
    }catch(e){
      setStatus('err','离线 · 稍后重试');
      if(retryTimer)clearTimeout(retryTimer);
      retryTimer=setTimeout(()=>{retryTimer=null;flushPush();},RETRY_DELAY);
    }finally{
      pushing=false;
      if(dirty)flushPush();
    }
  }

  /* ---- 拉取 + 合并 ---- */
  function sparse(doc){
    return {progress:sparseProgress(doc.progress),quizLog:doc.quizLog||{},examDate:doc.examDate||'',savedAt:doc.savedAt};
  }
  async function pullAndMerge(){
    setStatus('busy','同步中…');
    const r=await fetch(API+'?k='+encodeURIComponent(code));
    if(!r.ok)throw new Error('HTTP '+r.status);
    const j=await r.json();
    storageKind=(j&&j.storage)||'';
    const local=buildDoc();
    let docToWrite=local,needPush=false;
    if(j&&j.data){
      const merged=sparse(mergeDocs(local,j.data));
      writeDoc(merged);
      docToWrite=merged;
      // 合并结果与云端不同则回写（云端缺本地数据时补齐），保证多端收敛
      needPush=canonical(merged)!==canonical(sparse(j.data));
    }else{
      needPush=true; // 全新学习码：把本地进度上传
    }
    if(needPush)await pushDoc(docToWrite);
    lastSyncAt=Date.now();
    setStatus(storageKind==='tmp'?'err':'ok',storageKind==='tmp'?'⚠️ 未配置云端存储':'已同步 '+fmtTime(lastSyncAt));
    // 通知应用层：进度可能被云端数据更新，需刷新内存态与视图
    document.dispatchEvent(new CustomEvent('sync:merged',{detail:{progress:docToWrite.progress}}));
  }
  async function pushDoc(doc){
    const r=await fetch(API,{
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({k:code,doc})
    });
    if(!r.ok)throw new Error('HTTP '+r.status);
  }

  /* ---- 学习码切换 ---- */
  async function changeCode(input){
    const nc=(input||'').trim().toUpperCase();
    const msg=$('#syncMsg');
    if(!/^[A-Z0-9]{4,16}$/.test(nc)){if(msg)msg.textContent='学习码需为 4-16 位字母或数字';return false;}
    if(nc===code){if(msg)msg.textContent='已经是当前学习码';return false;}
    code=nc;
    localStorage.setItem(CODE_KEY,code);
    if(msg)msg.textContent='已切换到 '+code+'，正在拉取云端进度…';
    try{
      await pullAndMerge();
      if(msg)msg.textContent='';
      openModal(); // 刷新弹窗信息
      return true;
    }catch(e){
      if(msg)msg.textContent='拉取失败：'+e.message+'（可稍后重试）';
      setStatus('err','离线 · 稍后重试');
      return false;
    }
  }

  /* ---- 弹窗 UI ---- */
  function updateModalInfo(){
    const t=$('#syncCodeText');if(t)t.textContent=code;
    const l=$('#syncLastText');
    if(l)l.textContent=storageKind==='tmp'
      ?'⚠️ 服务端未配置 Vercel Blob，当前数据仅存于服务器临时目录，重新部署后会丢失。'
      :(lastSyncAt?('上次同步：'+new Date(lastSyncAt).toLocaleString()):'尚未同步');
  }
  function openModal(){
    updateModalInfo();
    const inp=$('#syncCodeInput');if(inp)inp.value='';
    const m=$('#syncModal');if(m)m.style.display='flex';
    const msg=$('#syncMsg');if(msg)msg.textContent='';
  }
  function closeModal(){const m=$('#syncModal');if(m)m.style.display='none';}
  function wireUI(){
    const chip=$('#syncChip');
    if(chip)chip.onclick=openModal;
    const close=$('#syncClose');
    if(close)close.onclick=closeModal;
    const mask=$('#syncModal');
    if(mask)mask.addEventListener('click',e=>{if(e.target===mask)closeModal();});
    const save=$('#syncCodeSave');
    if(save)save.onclick=()=>changeCode($('#syncCodeInput').value);
    const inp=$('#syncCodeInput');
    if(inp)inp.addEventListener('keydown',e=>{if(e.key==='Enter')changeCode(inp.value);});
    const copy=$('#syncCopy');
    if(copy)copy.onclick=async()=>{
      try{
        if(navigator.clipboard&&navigator.clipboard.writeText)await navigator.clipboard.writeText(code);
        else throw new Error('unsupported');
        const msg=$('#syncMsg');if(msg)msg.textContent='已复制到剪贴板';
      }catch(e){
        const msg=$('#syncMsg');if(msg)msg.textContent='复制失败，学习码：'+code;
      }
    };
  }

  /* ---- 初始化 ---- */
  async function init(keyMap){
    if(keyMap)keys=Object.assign(keys,keyMap);
    code=getCode();
    wireUI();
    setStatus('busy','同步中…');
    try{
      await pullAndMerge();
    }catch(e){
      setStatus('err','离线 · 稍后重试');
      if(retryTimer)clearTimeout(retryTimer);
      retryTimer=setTimeout(()=>{retryTimer=null;pullAndMerge().catch(()=>{});},RETRY_DELAY);
    }
    window.addEventListener('online',()=>{flushPush();});
    // 页面切后台时把未推送的变更立即发出（best effort）
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='hidden'&&pushTimer){
        clearTimeout(pushTimer);pushTimer=null;
        try{
          fetch(API,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({k:code,doc:buildDoc()}),keepalive:true});
        }catch(e){}
      }
    });
  }

  window.Sync={init,pushSoon,getCode,changeCode};
})();
