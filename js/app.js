const $=s=>document.querySelector(s);
const PROGRESS_KEY='xisu_progress_v2';
const CHAPTERS=[CH4,CH5,CH6,CH7,CH8,CH9,CH10,CH11,CH12,CH13,CH14,CH15,CH16,CH17];

function loadProgress(){try{return JSON.parse(localStorage.getItem(PROGRESS_KEY))||{};}catch(e){return {};}}
// 写本地后调度一次云端推送（防抖由 Sync 内部处理）
function saveProgress(p){localStorage.setItem(PROGRESS_KEY,JSON.stringify(p));if(window.Sync)Sync.pushSoon();}
const progress=loadProgress();

function chProg(cid){if(!progress[cid])progress[cid]={};return progress[cid];}
function isMastered(cid,idx){const st=chProg(cid)[idx];return st===1||st===2;}
function setMastered(cid,idx,v){chProg(cid)[idx]=v?1:0;saveProgress(progress);}
function chStat(cid){
  const ch=CHAPTERS.find(c=>c.id===cid);
  let total=ch.items.length,mastered=0;
  ch.items.forEach((_,i)=>{if(isMastered(cid,i))mastered++;});
  return {total,mastered};
}
function curChapter(){return CHAPTERS.find(c=>c.id===curChapterId);}
function badgeCls(req){return req==='必须背'?'b-must':(req==='重点背'?'b-key':'b-try');}

function norm(s){return (s||'').replace(/\s+/g,'').replace(/[，。、；：,.？?！!（）()【】\[\]《》<>“”"'\"'：:]/g,'').toLowerCase();}
function checkInput(input,answer,strict){
  const a=norm(input),b=norm(answer);
  if(!a)return false;
  const eq=a===b||a.includes(b)||b.includes(a);
  if(strict||b.length<=3)return eq;
  if(eq)return true;
  const sa=new Set(a),sb=new Set(b);let hit=0;
  sb.forEach(c=>{if(sa.has(c))hit++;});
  return hit/Math.max(sb.size,1)>=0.8;
}
// 默写题匹配得分：返回0-1的相似度（用于乱序匹配）
function matchScore(input,answer){
  const a=norm(input),b=norm(answer);
  if(!a||!b)return 0;
  if(a===b||a.includes(b)||b.includes(a))return 1;
  const sa=new Set(a),sb=new Set(b);let hit=0;
  sb.forEach(c=>{if(sa.has(c))hit++;});
  return hit/Math.max(sb.size,1);
}

/* 答案条目化：支持分组 */
function itemAns(item){
  if(item.ans)return item.ans.map(t=>({t}));
  const out=[];
  (item.groups||[]).forEach(g=>{g.items.forEach(t=>out.push({t,g:g.g}));});
  return out;
}

/* 填空出题：优先挖完整词，避免截断（如"可靠性"只留"可靠"） */
// 计算同一题多个答案的公共重复部分（如都以"管理过程"结尾），挖空时避开
function commonRepeated(list){
  if(!list||list.length<2)return null;
  const normList=list.map(s=>s.replace(/[，。、；：,.？?！!（）()【】\[\]《》<>“”"'\"'：:]/g,''));
  // 取最短答案作为基准，找它作为子串出现在其他答案中的最长公共子串
  const short=normList.slice().sort((a,b)=>a.length-b.length)[0];
  const cands=new Set();
  for(let L=3;L<=short.length;L++){
    for(let i=0;i+L<=short.length;i++){
      const sub=short.substring(i,i+L);
      // 子串出现在所有答案中
      if(normList.every(s=>s.includes(sub))){
        cands.add(sub);
      }
    }
  }
  if(!cands.size)return null;
  // 取最长的重复子串
  let best=null;
  cands.forEach(c=>{if(!best||c.length>best.length)best=c;});
  if(!best||best.length<3)return null;
  if(/^[与及或并可了要再于以被因为对于的而和]$/.test(best))return null;
  // 关键约束：去掉 best 后，每个答案的剩余段必须是 2-4 字的完整词（不以虚词开头/结尾）
  // 这样挖空才有意义（如"服务级别管理过程"→挖"服务级别"留"管理过程"）
  const V=/^[与及或并可了要再于以被因为对于的而和上下里前后]$/;
  const ok=normList.every(s=>{
    const parts=s.split(best).filter(p=>p.length>0);
    if(!parts.length)return false; // 全部是重复段，没有可挖的不重复内容
    return parts.every(p=>p.length>=2&&p.length<=4&&!V.test(p[0])&&!V.test(p[p.length-1]));
  });
  if(!ok)return null;
  return best;
}
// 候选词清洗：丢弃以虚词开头/结尾的碎片（如"的效率"、"在的风险"）
const BLK_EDGE=/^[与及或并了要再于以被因为对于上下里前后]|[与及或并可了要再于以被因为对于上下里前后]$/;
function isClean(c){
  c=c.trim();
  if(c.length<2||c.length>4)return null;
  if(BLK_EDGE.test(c))return null;
  return c;
}
/* 领域后缀词表：在标点切分后的独立片段内匹配，避免跨词拼切 */
const BLK_SFX=['管理','过程','设计','规划','分析','评估','控制','监控','保障','改进','测量','回顾','活动','要素','流程','目标','系统','范围','阶段','分类','绩效','标准','模型','架构','框架','安全','需求','能力','培训','报告','计划','清单','定义','识别','检查','审计','战略','策略','机制','体系','治理','资源','预算','核算','收益','效率','风险','维护','提升','评价','转移','清除','销毁','回收','处置','终止','移交','验收','演练','沟通','调查','总结','反馈','性','化','路径','协议','岗位','人员','职责','任务','实施','运营','建设','编制','发布','制定','集成','服务','成本','数据','信息','技术','组织','业务','系统'];
const INP='<input class="blk-input" data-i="" placeholder="填写" autocomplete="off">';
function makeBlank(word,skip){
  // 答案整体≤3字：挖1字留上下文（短答案保护）
  if(word.length<=3){
    const pos=Math.floor(Math.random()*word.length);
    const ch=word[pos];
    return {html:word.slice(0,pos)+INP+word.slice(pos+1),answers:[ch]};
  }
  // 4字答案：挖中间2字保留首尾上下文（如"降低风险"→"降低▢▢"或"▢▢风险"）
  if(word.length===4){
    if(Math.random()<0.5){
      return {html:word.slice(0,2)+INP,answers:[word.slice(2)]};
    }else{
      return {html:INP+word.slice(2),answers:[word.slice(0,2)]};
    }
  }
  // 有重复描述(skip)时：保留重复部分，随机挖掉一个不重复段（如"服务级别管理过程"→"▢▢管理过程"）
  if(skip&&word.includes(skip)){
    const parts2=word.split(skip);
    // 计算各不重复段（2-4字完整片段）的位置
    const difSegs=[];
    let pos=0;
    for(let i=0;i<parts2.length;i++){
      const p=parts2[i];
      if(p.length>=2&&p.length<=4){
        difSegs.push({txt:p,start:pos,end:pos+p.length});
      }
      pos+=p.length+skip.length;
    }
    if(difSegs.length){
      const seg=difSegs[Math.floor(Math.random()*difSegs.length)];
      const html=word.slice(0,seg.start)+INP+word.slice(seg.end);
      return {html,answers:[seg.txt]};
    }
  }

  // 分词收集候选词（2-4字完整词，不截断）
  const cands=[];
  const SEP=/[，。、；：,.？?！!（）()\[\]《》<>“”'""：:、/；＝=＋+\-—·\s]/;
  const parts=word.split(SEP);
  for(const p of parts){const t=isClean(p);if(t)cands.push(t);}
  // 虚词/连词切分：整句切成词片段（"人员岗位和职责设计"→"人员岗位""职责设计"）
  for(const p of parts){
    if(p.length<=4)continue;
    const segs=p.split(/[与及或并可了要再于以被因为对于的而和]/);
    for(const s of segs){const t=isClean(s);if(t)cands.push(t);}
  }
  // 领域后缀匹配（含前缀，如"成本控制"）
  for(const sf of BLK_SFX){
    const re=new RegExp('[\u4e00-\u9fa5]{0,2}'+sf,'g');
    const mm=word.match(re);
    if(mm)mm.forEach(mo=>{const t=isClean(mo);if(t)cands.push(t);});
  }
  const enM=word.match(/[A-Za-z][A-Za-z0-9]{1,}|[A-Z]{2,}/g);
  if(enM)enM.forEach(m=>{if(m.length>=2&&m.length<=6)cands.push(m);});
  const CROSS=/[与及或等并可了要再于以被因为的而]/;
  const unique=[...new Set(cands.filter(c=>c.length>=2&&c.length<=4&&word.includes(c)&&!CROSS.test(c)))];
  // 完整词优先：排除被更长候选包含的短词（如"成本"被"成本控制"包含）
  const full=unique.filter(c=>!unique.some(u=>u.length>c.length&&u.includes(c)));
  const pool=full.length?full:unique;
  // 仍无候选：兜底用2字滑窗提取所有bigram（过滤含虚词的）
  if(!pool.length){
    const V=/[与及或等并可了要再于以被因为对于的而和之其各]$/;
    const V2=/^[与及或等并可了要再于以被因为对于的而和之其各]/;
    for(let i=0;i<=word.length-2;i++){
      const bg=word.substring(i,i+2);
      if(/[\u4e00-\u9fa5]{2}/.test(bg)&&!V.test(bg)&&!V2.test(bg))cands.push(bg);
    }
    // 纯英文长词兜底：整体挖掉
    const enLong=word.match(/[A-Za-z][A-Za-z0-9]{4,}/g);
    if(enLong)enLong.forEach(m=>cands.push(m));
    const fallback=[...new Set(cands.filter(c=>c.length>=2&&word.includes(c)))];
    if(!fallback.length)return {html:word,answers:[]};
    const fb=fallback[Math.floor(Math.random()*fallback.length)];
    const fi=word.indexOf(fb);
    return {html:word.slice(0,fi)+INP+word.slice(fi+fb.length),answers:[fb]};
  }

  // 统一挖1空：随机选1个候选词完整挖掉（可覆盖多字，如"成本控制"整词1个空）
  const posOf=c=>{const out=[];let i=0,idx;while((idx=word.indexOf(c,i))>=0){out.push(idx);i=idx+c.length;}return out;};
  const pick=(c)=>{const poss=posOf(c);return poss[Math.floor(Math.random()*poss.length)];};
  // 避开重复内容：若传入 skip（如"管理过程"），优先选不含 skip 及其子词的候选
  let pool2=pool;
  if(skip){
    // skip 的所有2字及以上连续子串（如"管理过程"→"管理"、"过程"、"管理过程"）
    const skipSubs=new Set();
    for(let L=2;L<=skip.length;L++){
      for(let i=0;i+L<=skip.length;i++){
        skipSubs.add(skip.substring(i,i+L));
      }
    }
    const noSkip=pool.filter(c=>{
      if(c.includes(skip)||skip.includes(c))return false;
      // 候选词若与任一 skip 子段有重叠（如"级别管理"含"管理"），也排除
      for(const ss of skipSubs){
        if(ss.length>=2&&(c.includes(ss)||ss.includes(c)))return false;
      }
      return true;
    });
    if(noSkip.length)pool2=noSkip;
  }
  const kw=pool2[Math.floor(Math.random()*pool2.length)];
  const idx=pick(kw);
  return {html:word.slice(0,idx)+INP+word.slice(idx+kw.length),answers:[kw]};
}

/* ===== 状态 ===== */
const GROUP_SIZE=5;
let curChapterId=4;
let curGroupId=0;
let mode='blank';
let filter='all';
let blankPos=0,recallPos=0;
let blankCard=null; // {idx, blanks:[]}
let recallCard=null;

function filteredItems(){
  const ch=curChapter();
  const s=curGroupId*GROUP_SIZE,e=Math.min(s+GROUP_SIZE,ch.items.length);
  const list=[];
  for(let i=s;i<e;i++){if(filter==='all'||!isMastered(curChapterId,i))list.push(i);}
  return list;
}
// 默写题：只包含必须背+重点背的知识点（尽量背仅需填空）
function recallItems(){
  const ch=curChapter();
  const s=curGroupId*GROUP_SIZE,e=Math.min(s+GROUP_SIZE,ch.items.length);
  const list=[];
  for(let i=s;i<e;i++){
    const req=ch.items[i].req;
    if(req==='必须背'||req==='重点背'){
      if(filter==='all'||!isMastered(curChapterId,i))list.push(i);
    }
  }
  return list;
}

/* ===== 首页 ===== */
function renderHome(){
  hideAllViews();
  $('#homeView').style.display='';
  let total=0,mastered=0;
  $('#chapterGrid').innerHTML=CHAPTERS.map(c=>{
    const st=chStat(c.id);total+=st.total;mastered+=st.mastered;
    const pct=st.total?Math.round(st.mastered/st.total*100):0;
    return `<div class="card" data-cid="${c.id}">
      <div class="ch-no">第${c.id}章</div>
      <div class="ch-title">${c.title}</div>
      <div class="cnt">共 ${st.total} 个知识点 · 已掌握 ${st.mastered}</div>
      <div class="bar ${pct===100?'full':''}"><i style="width:${pct}%"></i></div>
      <div class="bar-label"><span>${pct}%</span><span>${st.total-st.mastered} 个未学习</span></div>
    </div>`;
  }).join('');
  const gpct=total?Math.round(mastered/total*100):0;
  $('#globalBar').style.width=gpct+'%';
  $('#globalText').textContent=`${mastered}/${total} · ${gpct}%`;
  // 待巩固按钮
  const reviewCount=countByStatus(2);
  const reviewBtn=$('#openMixReview');
  reviewBtn.style.display=reviewCount>0?'':'none';
  reviewBtn.textContent=`♻️ 待巩固复习（${reviewCount}）`;
}

/* 统计某状态的知识点数量（1=已掌握, 2=待巩固） */
function countByStatus(st){
  let n=0;
  for(const ch of CHAPTERS){
    for(let i=0;i<ch.items.length;i++){
      if(chProg(ch.id)[i]===st)n++;
    }
  }
  return n;
}

/* ===== 学习统计与计划 ===== */
const EXAM_DATE_KEY='xisu_exam_date';
function getExamDate(){return localStorage.getItem(EXAM_DATE_KEY)||'';}
function setExamDate(d){localStorage.setItem(EXAM_DATE_KEY,d);if(window.Sync)Sync.pushSoon();}

/* 抽查记录：记录每题最近作答的日期时间（答对/答错均记录），用于抽查冷却与多端合并时判定最新状态 */
const QUIZ_LOG_KEY='xisu_quiz_log';
function loadQuizLog(){try{return JSON.parse(localStorage.getItem(QUIZ_LOG_KEY))||{};}catch(e){return{};}}
function saveQuizLog(log){localStorage.setItem(QUIZ_LOG_KEY,JSON.stringify(log));if(window.Sync)Sync.pushSoon();}
function getQuizDate(cid,idx){const log=loadQuizLog();return log[cid+'_'+idx]||0;}
function setQuizDate(cid,idx){const log=loadQuizLog();log[cid+'_'+idx]=Date.now();saveQuizLog(log);}

function getGlobalStats(){
  let total=0,mastered=0,reviewing=0,unlearned=0;
  for(const ch of CHAPTERS){
    for(let i=0;i<ch.items.length;i++){
      total++;
      const st=chProg(ch.id)[i];
      if(st===1)mastered++;
      else if(st===2)reviewing++;
      else unlearned++;
    }
  }
  return {total,mastered,reviewing,unlearned};
}

function renderStats(){
  hideAllViews();
  $('#statsView').style.display='';
  const stats=getGlobalStats();
  const learned=stats.mastered+stats.reviewing; // 已学 = 已掌握 + 待巩固
  const pct=stats.total?Math.round(learned/stats.total*100):0;
  
  // 各章分布
  const chapterRows=CHAPTERS.map(ch=>{
    let m=0,r=0,u=0;
    for(let i=0;i<ch.items.length;i++){
      const st=chProg(ch.id)[i];
      if(st===1)m++;else if(st===2)r++;else u++;
    }
    const cpct=ch.items.length?Math.round(m/ch.items.length*100):0;
    const isPriority=[12,13,14,15,16,4,5,6,8].includes(ch.id);
    return {id:ch.id,title:ch.title,total:ch.items.length,m,r,u,cpct,isPriority};
  });

  // 考试日期与学习计划
  const examDate=getExamDate();
  let planHtml='';
  if(examDate){
    const today=new Date();
    today.setHours(0,0,0,0);
    const exam=new Date(examDate);
    exam.setHours(0,0,0,0);
    const daysLeft=Math.ceil((exam-today)/(1000*60*60*24));
    const remaining=stats.unlearned; // 剩余未学习（真正还没学的）
    if(daysLeft>0&&remaining>0){
      const perDay=Math.ceil(remaining/daysLeft);
      planHtml=`
        <div class="qcard" style="border-color:var(--blue);background:linear-gradient(135deg,#eff4ff,#f0f7ff);">
          <div style="font-size:16px;font-weight:700;color:var(--navy);margin-bottom:10px;">📅 学习计划</div>
          <div style="font-size:14px;line-height:2;color:#334155;">
            考试日期：<b>${examDate}</b>（距今 <b style="color:var(--blue);">${daysLeft}</b> 天）<br>
            剩余未学习知识点：<b>${remaining}</b> 个<br>
            <span style="font-size:18px;color:var(--red);font-weight:700;">建议每天学习 ${perDay} 个知识点</span><br>
            <span style="color:var(--gray);">提示：优先攻克重点章节（第12-16章、第4/5/6/8章），每天保持填空+默写交替练习。</span>
          </div>
        </div>`;
    }else if(daysLeft<=0){
      planHtml=`
        <div class="qcard" style="border-color:var(--orange);background:#fff7ed;">
          <div style="font-size:16px;font-weight:700;color:var(--orange);margin-bottom:10px;">📅 学习计划</div>
          <div style="font-size:14px;line-height:2;color:#334155;">
            考试日期：<b>${examDate}</b>（${daysLeft===0?'就是今天':`已过 ${-daysLeft} 天`}）<br>
            ${remaining>0?'还有 <b style="color:var(--red);">'+remaining+'</b> 个知识点未学习，抓紧冲刺！':'所有知识点已学完，祝考试顺利！'}
          </div>
        </div>`;
    }else{
      planHtml=`
        <div class="qcard" style="border-color:var(--green);background:#f0fdf4;">
          <div style="font-size:16px;font-weight:700;color:var(--green);margin-bottom:10px;">📅 学习计划</div>
          <div style="font-size:14px;line-height:2;color:#334155;">
            考试日期：<b>${examDate}</b>，全部知识点已掌握！🎉<br>
            建议通过"已掌握抽查"定期复习，保持记忆。
          </div>
        </div>`;
    }
  }

  // 考试日期输入
  const dateInputHtml=`
    <div class="qcard">
      <div style="font-size:15px;font-weight:700;margin-bottom:10px;">🗓️ 设置考试日期</div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <input type="date" id="examDateInput" value="${examDate}" style="padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;">
        <button class="btn primary" id="saveExamDate">保存</button>
        <span class="small-text">设定后会自动计算每日学习量</span>
      </div>
    </div>`;

  // 章节分布表
  const tableRows=chapterRows.map(r=>`
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:8px 6px;font-size:13px;">${r.isPriority?'⭐ ':''}第${r.id}章</td>
      <td style="padding:8px 6px;font-size:13px;">${r.title.replace(/^第\d+章\s*/,'')}</td>
      <td style="padding:8px 6px;font-size:13px;text-align:center;">${r.total}</td>
      <td style="padding:8px 6px;font-size:13px;text-align:center;color:#16a34a;font-weight:600;">${r.m}</td>
      <td style="padding:8px 6px;font-size:13px;text-align:center;color:#ea580c;font-weight:600;">${r.r}</td>
      <td style="padding:8px 6px;font-size:13px;text-align:center;color:var(--gray);">${r.u}</td>
      <td style="padding:8px 6px;">
        <div style="display:flex;align-items:center;gap:6px;">
          <div class="bar" style="flex:1;min-width:50px;"><i style="width:${r.cpct}%;${r.cpct===100?'background:linear-gradient(90deg,#16a34a,#4ade80);':''}"></i></div>
          <span style="font-size:12px;color:var(--gray);min-width:32px;">${r.cpct}%</span>
        </div>
      </td>
    </tr>`).join('');

  // 各章背记要求分布（必须背/重点背/尽量背）
  const reqRows=CHAPTERS.map(ch=>{
    let must=0,key=0,tryN=0;
    for(const it of ch.items){
      if(it.req==='必须背')must++;
      else if(it.req==='重点背')key++;
      else tryN++;
    }
    return {id:ch.id,title:ch.title.replace(/^第\d+章\s*/,''),must,key,tryN,total:ch.items.length};
  });
  const reqTableRows=reqRows.map(r=>`
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:7px 6px;font-size:13px;white-space:nowrap;">第${r.id}章</td>
      <td style="padding:7px 6px;font-size:13px;">${r.title}</td>
      <td style="padding:7px 6px;font-size:13px;text-align:center;">${r.total}</td>
      <td style="padding:7px 6px;font-size:13px;text-align:center;color:#dc2626;font-weight:600;">${r.must||'—'}</td>
      <td style="padding:7px 6px;font-size:13px;text-align:center;color:#ea580c;font-weight:600;">${r.key||'—'}</td>
      <td style="padding:7px 6px;font-size:13px;text-align:center;color:#2563eb;font-weight:600;">${r.tryN||'—'}</td>
    </tr>`).join('');

  // 全局背记要求汇总
  let gMust=0,gKey=0,gTry=0;
  for(const ch of CHAPTERS)for(const it of ch.items){
    if(it.req==='必须背')gMust++;else if(it.req==='重点背')gKey++;else gTry++;
  }

  $('#statsContent').innerHTML=`
    <!-- 总览数字 -->
    <div class="stat-grid">
      <div class="stat"><div class="v">${stats.total}</div><div class="k">总知识点</div></div>
      <div class="stat"><div class="v green">${learned}</div><div class="k">已学</div></div>
      <div class="stat"><div class="v">${stats.mastered}</div><div class="k">已掌握</div></div>
      <div class="stat"><div class="v orange">${stats.reviewing}</div><div class="k">待巩固</div></div>
      <div class="stat"><div class="v red">${stats.unlearned}</div><div class="k">未学习</div></div>
      <div class="stat"><div class="v">${pct}%</div><div class="k">已学率</div></div>
    </div>

    <!-- 总进度条 -->
    <div class="qcard" style="padding:14px 18px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <span style="font-size:14px;font-weight:600;">总体进度（已学 = 已掌握 + 待巩固）</span>
        <span class="small-text">${learned}/${stats.total} 已学</span>
      </div>
      <div class="bar" style="height:10px;"><i id="statsBar" style="width:${pct}%;${pct===100?'background:linear-gradient(90deg,#16a34a,#4ade80);':''}"></i></div>
    </div>

    ${dateInputHtml}
    ${planHtml}

    <!-- 各章分布 -->
    <div class="qcard" style="overflow-x:auto;">
      <div style="font-size:15px;font-weight:700;margin-bottom:12px;">📖 各章知识分布</div>
      <table style="width:100%;border-collapse:collapse;min-width:520px;">
        <thead>
          <tr style="border-bottom:2px solid var(--border);font-size:12px;color:var(--gray);">
            <th style="padding:6px;text-align:left;">章节</th>
            <th style="padding:6px;text-align:left;">名称</th>
            <th style="padding:6px;">总数</th>
            <th style="padding:6px;color:#16a34a;">已掌握</th>
            <th style="padding:6px;color:#ea580c;">待巩固</th>
            <th style="padding:6px;color:var(--gray);">未学习</th>
            <th style="padding:6px;text-align:left;">掌握率</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>

    <!-- 各章背记要求分布 -->
    <div class="qcard" style="overflow-x:auto;">
      <div style="font-size:15px;font-weight:700;margin-bottom:6px;">🏷️ 各章背记要求分布</div>
      <div style="display:flex;gap:16px;margin-bottom:12px;font-size:13px;flex-wrap:wrap;">
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#dc2626;margin-right:4px;"></span>必须背 ${gMust}</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#ea580c;margin-right:4px;"></span>重点背 ${gKey}</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#2563eb;margin-right:4px;"></span>尽量背 ${gTry}</span>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:2px solid var(--border);font-size:12px;color:var(--gray);">
            <th style="padding:6px;text-align:left;">章节</th>
            <th style="padding:6px;text-align:left;">名称</th>
            <th style="padding:6px;">总数</th>
            <th style="padding:6px;color:#dc2626;">必须背</th>
            <th style="padding:6px;color:#ea580c;">重点背</th>
            <th style="padding:6px;color:#2563eb;">尽量背</th>
          </tr>
        </thead>
        <tbody>${reqTableRows}</tbody>
        <tfoot>
          <tr style="border-top:2px solid var(--border);font-size:13px;font-weight:700;">
            <td colspan="2" style="padding:7px 6px;">合计</td>
            <td style="padding:7px 6px;text-align:center;">${stats.total}</td>
            <td style="padding:7px 6px;text-align:center;color:#dc2626;">${gMust}</td>
            <td style="padding:7px 6px;text-align:center;color:#ea580c;">${gKey}</td>
            <td style="padding:7px 6px;text-align:center;color:#2563eb;">${gTry}</td>
          </tr>
        </tfoot>
      </table>
    </div>`;

  // 绑定保存考试日期
  $('#saveExamDate').onclick=()=>{
    const d=$('#examDateInput').value;
    if(d){
      setExamDate(d);
      renderStats(); // 重新渲染以更新计划
    }
  };
}

/* ===== 分组选择 ===== */
function renderGroups(){
  hideAllViews();
  $('#groupView').style.display='';
  const ch=curChapter();
  $('#groupChTitle').textContent=ch.title;
  const numGroups=Math.ceil(ch.items.length/GROUP_SIZE);
  $('#groupGrid').innerHTML=Array.from({length:numGroups},(_,g)=>{
    const s=g*GROUP_SIZE,e=Math.min(s+GROUP_SIZE,ch.items.length);
    let total=e-s,mastered=0;
    for(let i=s;i<e;i++)if(isMastered(ch.id,i))mastered++;
    const pct=total?Math.round(mastered/total*100):0;
    return `<div class="card" data-gid="${g}">
      <div class="ch-no">第${g+1}组</div>
      <div class="ch-title">知识点 ${s+1} ~ ${e}</div>
      <div class="cnt">共 ${total} 个 · 已掌握 ${mastered}</div>
      <div class="bar ${pct===100?'full':''}"><i style="width:${pct}%"></i></div>
      <div class="bar-label"><span>${pct}%</span><span>${total-mastered} 个未学习</span></div>
    </div>`;
  }).join('');
}

/* ===== 章节视图 ===== */
function renderChapter(){
  $('#homeView').style.display='none';
  $('#groupView').style.display='none';
  $('#chapterView').style.display='';
  const ch=curChapter();
  const gl=ch.items.length>GROUP_SIZE?` · 第${curGroupId+1}组`:'';
  $('#chTitle').textContent=ch.title+gl;
  blankPos=0;recallPos=0;blankCard=null;recallCard=null;
  switchView(mode);
}
function switchView(m){
  mode=m;
  document.querySelectorAll('.mode-tabs button').forEach(b=>b.classList.toggle('on',b.dataset.mode===m));
  $('#blankView').style.display=m==='blank'?'':'none';
  $('#recallView').style.display=m==='recall'?'':'none';
  $('#summaryView').style.display=m==='summary'?'':'none';
  if(m==='blank')renderBlank();
  if(m==='recall')renderRecall();
  if(m==='summary')renderSummary();
}
function setFilter(f){
  filter=f;
  document.querySelectorAll('#filterSeg button').forEach(b=>b.classList.toggle('on',b.dataset.f===f));
  blankPos=0;recallPos=0;blankCard=null;recallCard=null;
  if(mode==='blank')renderBlank();
  if(mode==='recall')renderRecall();
  if(mode==='summary')renderSummary();
}

/* ===== 填空题 ===== */
function renderBlank(){
  const list=filteredItems();
  $('#blankNums').innerHTML=list.map((idx,i)=>{
    const on=i===blankPos?'on':'';
    const st=isMastered(curChapterId,idx)?'done':'';
    const rc=reqNumCls(curChapter().items[idx].req);
    return `<button class="num ${on} ${st} ${rc}" data-bp="${i}">${i+1}</button>`;
  }).join('');
  if(!list.length){
    $('#blankCard').innerHTML=`<div class="empty">${filter==='miss'?'本章全部掌握，无需再背！':'本章暂无知识点。'}</div>`;
    return;
  }
  if(blankPos>=list.length)blankPos=0;
  const idx=list[blankPos];
  if(!blankCard||blankCard.idx!==idx){
    const item=curChapter().items[idx];
    const ansList=itemAns(item);
    const skip=commonRepeated(ansList.map(a=>a.t));
    blankCard={idx,blanks:ansList.map(a=>makeBlank(a.t,skip))};
  }
  renderBlankCard();
}
function renderBlankCard(){
  const item=curChapter().items[blankCard.idx];
  const ansList=itemAns(item);
  const skip=commonRepeated(ansList.map(a=>a.t));
  let html='';
  ansList.forEach((a,i)=>{
    const b=blankCard.blanks[i];
    if(a.g)html+=`<div class="group-title">${a.g}</div>`;
    html+=`<div class="blk-line"><span class="no">${i+1}.</span>${b.html}</div>`;
  });
  $('#blankCard').innerHTML=`
    <div class="qhead">
      <span class="qtext">【问${blankCard.idx+1}】${item.q}</span>
      <span class="badge ${badgeCls(item.req)}">${item.req}</span>
    </div>
    <div class="hint">共 ${ansList.length} 个要点 · 根据答案长度挖空1-2个关键词，点击「换题」可重新出题。${item.req==='尽量背'?'<b style="color:#16a34a">本题全部答对即视为已掌握。</b>':'<b style="color:var(--blue)">填空仅帮助记忆，不记录掌握状态；掌握与否以默写题为准。</b>'}</div>
    <div>${html}</div>
    <div class="actions">
      <button class="btn primary" id="submitBlank">提交答案</button>
      <button class="btn" id="redoBlank">换题</button>
      <button class="btn ghost" id="showAnsBlank">显示正确答案</button>
      <button class="btn ghost" id="prevBlank">上一题</button>
      <button class="btn ghost" id="nextBlank">下一题</button>
    </div>
    <div id="blankResult"></div>`;
  // 重新生成 blank 里的输入框 i 序号
  $('#blankCard').querySelectorAll('.blk-input').forEach((inp,di)=>{inp.dataset.i=di;});
  $('#submitBlank').onclick=()=>judgeBlank();
  $('#redoBlank').onclick=()=>{
    const ansList=itemAns(item);
    const skip=commonRepeated(ansList.map(a=>a.t));
    blankCard.blanks=ansList.map(a=>makeBlank(a.t,skip));
    renderBlankCard();
  };
  $('#showAnsBlank').onclick=()=>{
    $('#blankResult').innerHTML=`<div class="answer"><div class="t">正确答案：</div><ol>${ansList.map(a=>`<li>${a.t}</li>`).join('')}</ol></div>`;
  };
  $('#prevBlank').onclick=()=>{if(blankPos>0){blankPos--;blankCard=null;renderBlank();}};
  $('#nextBlank').onclick=()=>{const list=filteredItems();if(blankPos<list.length-1){blankPos++;blankCard=null;renderBlank();}};
}
function judgeBlank(){
  const item=curChapter().items[blankCard.idx];
  const ansList=itemAns(item);
  // 展平所有答案条目的 answers 数组为全局列表
  const allAnswers=[];
  blankCard.blanks.forEach(b=>{allAnswers.push(...b.answers);});
  let allOk=true,cnt=0;
  $('#blankCard').querySelectorAll('.blk-input').forEach(inp=>{
    const i=+inp.dataset.i;
    const ok=checkInput(inp.value,allAnswers[i],false);
    inp.classList.toggle('ok',ok);inp.classList.toggle('bad',!ok);
    if(ok)cnt++;else allOk=false;
  });
  const isEasy=item.req==='尽量背';
  $('#blankResult').innerHTML=`<div class="answer"><div class="t">${allOk?(isEasy?'全部正确，本知识点已掌握！':'全部正确！'):'正确 '+cnt+'/'+allAnswers.length+' 个，正确答案：'}</div><ol>${ansList.map((a,i)=>`<li>${blankCard.blanks[i].answers.map(ans=>`<b style="color:#2563eb">${ans}</b>`).join('、')} — ${a.t}</li>`).join('')}</ol>${isEasy?'<div class="t" style="color:#16a34a;margin-top:6px;font-weight:400;">尽量背类知识点：填空全部答对即视为已掌握。</div>':'<div class="t" style="color:var(--gray);margin-top:6px;font-weight:400;">填空题仅作记忆练习，不记录掌握状态；掌握与否以默写题为准。</div>'}</div>`;
  if(allOk&&isEasy)setMastered(curChapterId,blankCard.idx,true);
  renderBlankNums();
}
function renderBlankNums(){
  const list=filteredItems();
  $('#blankNums').innerHTML=list.map((idx,i)=>{
    const on=i===blankPos?'on':'';
    const st=isMastered(curChapterId,idx)?'done':'';
    const rc=reqNumCls(curChapter().items[idx].req);
    return `<button class="num ${on} ${st} ${rc}" data-bp="${i}">${i+1}</button>`;
  }).join('');
}

/* ===== 默写题（仅必须背+重点背） ===== */
function renderRecall(){
  const list=recallItems();
  $('#recallNums').innerHTML=list.map((idx,i)=>{
    const on=i===recallPos?'on':'';
    const st=isMastered(curChapterId,idx)?'done':'';
    return `<button class="num ${on} ${st}" data-rp="${i}">${i+1}</button>`;
  }).join('');
  if(!list.length){
    $('#recallCard').innerHTML=`<div class="empty">${filter==='miss'?'本组需要默写的知识点已全部掌握！':'本组没有需要默写的知识点（尽量背类仅做填空即可）。'}</div>`;
    return;
  }
  if(recallPos>=list.length)recallPos=0;
  const idx=list[recallPos];
  const item=curChapter().items[idx];
  const ansList=itemAns(item);
  let body='';
  ansList.forEach((a,i)=>{
    if(a.g&&(i===0||ansList[i-1].g!==a.g))body+=`<div class="group-title">${a.g}</div>`;
    body+=`<div class="recall-line"><span class="no">${i+1}.</span><input class="recall-input" data-i="${i}" placeholder="请输入该要点内容"></div>`;
  });
  $('#recallCard').innerHTML=`
    <div class="qhead">
      <span class="qtext">【${idx+1}】${item.q}</span>
      <span class="badge ${badgeCls(item.req)}">${item.req}</span>
    </div>
    <div class="hint">本题共 <b>${ansList.length}</b> 个知识点，请分行默写完整答案</div>
    <div class="recall-area">${body}</div>
    <div class="actions">
      <button class="btn primary" id="submitRecall">提交答案</button>
      <button class="btn ghost" id="showAnsRecall">显示答案</button>
      <button class="btn ghost" id="prevRecall">上一题</button>
      <button class="btn ghost" id="nextRecall">下一题</button>
    </div>
    <div id="recallResult"></div>`;
  $('#submitRecall').onclick=()=>judgeRecall();
  $('#showAnsRecall').onclick=()=>{
    $('#recallResult').innerHTML=`<div class="answer"><div class="t">正确答案：</div><ol>${ansList.map(a=>`<li>${a.t}</li>`).join('')}</ol></div>`;
  };
  $('#prevRecall').onclick=()=>{if(recallPos>0){recallPos--;renderRecall();}};
  $('#nextRecall').onclick=()=>{const list=recallItems();if(recallPos<list.length-1){recallPos++;renderRecall();}};
}
function judgeRecall(){
  const list=recallItems();
  const idx=list[recallPos];
  const item=curChapter().items[idx];
  const ansList=itemAns(item);
  // 收集用户输入
  const inputs=[];
  $('#recallCard').querySelectorAll('.recall-input').forEach(inp=>{
    inputs.push({el:inp,val:inp.value});
  });
  // 乱序匹配：每个标准答案配一个最接近的用户输入（贪心，不要求顺序）
  const used=new Set();
  const correctFor=[]; // 命中的答案索引
  for(let ai=0;ai<ansList.length;ai++){
    let best=-1,bestScore=-1;
    for(let ii=0;ii<inputs.length;ii++){
      if(used.has(ii))continue;
      const score=matchScore(inputs[ii].val,ansList[ai].t);
      if(score>bestScore){bestScore=score;best=ii;}
    }
    if(best>=0&&bestScore>=0.8){
      used.add(best);
      correctFor.push(ai);
    }
  }
  const cnt=correctFor.length;
  const allOk=cnt===ansList.length;
  // 高亮每个输入框
  inputs.forEach((inp,ii)=>{
    const matched=used.has(ii);
    inp.el.classList.toggle('ok',matched);inp.el.classList.toggle('bad',!matched);
  });
  $('#recallResult').innerHTML=`<div class="answer"><div class="t">${allOk?'全部默写正确，本知识点已掌握！':'默写正确 '+cnt+'/'+ansList.length+' 个，正确答案：'}</div><ol>${ansList.map((a,i)=>`<li>${a.t}</li>`).join('')}</ol></div>`;
  if(allOk)setMastered(curChapterId,idx,true);
  renderRecallNums();
}
function renderRecallNums(){
  const list=recallItems();
  $('#recallNums').innerHTML=list.map((idx,i)=>{
    const on=i===recallPos?'on':'';
    const st=isMastered(curChapterId,idx)?'done':'';
    return `<button class="num ${on} ${st}" data-rp="${i}">${i+1}</button>`;
  }).join('');
}

/* ===== 汇总 ===== */
function renderSummary(){
  const cid=curChapterId,ch=curChapter();
  const gs=curGroupId*GROUP_SIZE,ge=Math.min(gs+GROUP_SIZE,ch.items.length);
  let total=ge-gs,mastered=0;
  for(let i=gs;i<ge;i++){if(isMastered(cid,i))mastered++;}
  const pct=total?Math.round(mastered/total*100):0;
  $('#summaryStats').innerHTML=`
    <div class="stat"><div class="v">${total}</div><div class="k">知识点总数</div></div>
    <div class="stat"><div class="v green">${mastered}</div><div class="k">已掌握</div></div>
    <div class="stat"><div class="v red">${total-mastered}</div><div class="k">未掌握</div></div>
    <div class="stat"><div class="v orange">${pct}%</div><div class="k">掌握率</div></div>`;
  $('#summaryList').innerHTML=ch.items.slice(gs,ge).map((it,i)=>{
    const idx=gs+i;
    const m=isMastered(cid,idx);
    const n=itemAns(it).length;
    return `<div class="summ-item"><span class="dot ${m?'ok':'no'}"></span>
      <span style="flex:1"><b>${idx+1}. ${it.q}</b> <span class="small-text">（${it.req} · ${n}个要点）</span></span>
      <span class="small-text" style="color:${m?'#16a34a':'#64748b'}">${m?'已掌握':'未掌握'}</span></div>`;
  }).join('');
}
function setMissThen(m){
  filter='miss';
  document.querySelectorAll('#filterSeg button').forEach(b=>b.classList.toggle('on',b.dataset.f==='miss'));
  switchView(m);
}

/* ===== 卡片背记 ===== */
let cardChapterId=4;   // 当前背记章节
let cardGroupId=0;    // 当前背记分组
let cardReq='all';    // all / 必须背 / 重点背 / 尽量背
let cardPos=0;
let cardFlipped=false;

function cardChapter(){return CHAPTERS.find(c=>c.id===cardChapterId);}
function cardFilteredItems(){
  const ch=cardChapter();
  const s=cardGroupId*GROUP_SIZE,e=Math.min(s+GROUP_SIZE,ch.items.length);
  const list=[];
  for(let i=s;i<e;i++){
    if(cardReq==='all'||ch.items[i].req===cardReq)list.push(i);
  }
  return list;
}
function reqNumCls(req){return req==='必须背'?'n-must':(req==='重点背'?'n-key':'n-try');}
function hideAllViews(){
  ['homeView','chapterView','groupView','cardHomeView','cardStudyView','cardGroupView','mixView','mixSelectView','statsView'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.style.display='none';
  });
}
function renderCardHome(){
  hideAllViews();
  $('#cardHomeView').style.display='';
  $('#cardChapterGrid').innerHTML=CHAPTERS.map(c=>{
    const n=c.items.length;
    return `<div class="card" data-ccid="${c.id}">
      <div class="ch-no">第${c.id}章</div>
      <div class="ch-title">${c.title}</div>
      <div class="cnt">共 ${n} 个知识点</div>
    </div>`;
  }).join('');
}
function renderCardGroups(){
  hideAllViews();
  $('#cardGroupView').style.display='';
  const ch=cardChapter();
  $('#cardGroupChTitle').textContent=ch.title+' · 选择分组';
  const numGroups=Math.ceil(ch.items.length/GROUP_SIZE);
  $('#cardGroupGrid').innerHTML=Array.from({length:numGroups},(_,g)=>{
    const s=g*GROUP_SIZE,e=Math.min(s+GROUP_SIZE,ch.items.length);
    return `<div class="card" data-cgid="${g}">
      <div class="ch-no">第${g+1}组</div>
      <div class="ch-title">知识点 ${s+1} ~ ${e}</div>
      <div class="cnt">共 ${e-s} 个知识点</div>
    </div>`;
  }).join('');
}
function renderCardStudy(){
  hideAllViews();
  $('#cardStudyView').style.display='';
  const ch=cardChapter();
  const gl=ch.items.length>GROUP_SIZE?` · 第${cardGroupId+1}组`:'';
  $('#cardChTitle').textContent=ch.title+gl;
  document.querySelectorAll('#cardReqSeg button').forEach(b=>b.classList.toggle('on',b.dataset.req===cardReq));
  const list=cardFilteredItems();
  $('#cardNums').innerHTML=list.map((idx,i)=>{
    const on=i===cardPos?'on':'';
    const rc=reqNumCls(cardChapter().items[idx].req);
    return `<button class="num ${on} ${rc}" data-cp="${i}">${i+1}</button>`;
  }).join('');
  if(!list.length){
    $('#flipCard').innerHTML=`<div class="empty">本章没有该类知识点。</div>`;
    return;
  }
  if(cardPos>=list.length)cardPos=0;
  const idx=list[cardPos];
  const item=cardChapter().items[idx];
  const ansList=itemAns(item);
  cardFlipped=false;
  $('#flipCard').innerHTML=`
    <div class="flip-card" id="flipCardInner">
      <div class="flip-inner" id="flipInner">
        <div class="flip-face flip-front">
          <span class="badge ${badgeCls(item.req)} card-badge">${item.req}</span>
          <div class="card-q">${item.q}</div>
          <div class="card-tip">点击卡片查看答案要点</div>
        </div>
        <div class="flip-face flip-back">
          <div class="card-q flip-back-q">${item.q}</div>
          <div class="card-ans">
            <div class="ans-title">答案要点（${ansList.length} 个）</div>
            <ol>${ansList.map(a=>`<li>${a.g?`<b>${a.g}：</b>`:''}${a.t}</li>`).join('')}</ol>
          </div>
          <div class="card-tip">点击卡片翻回问题</div>
        </div>
      </div>
    </div>
    <div class="card-nav">
      <button class="btn ghost" id="prevCard">← 上一张</button>
      <span class="small-text" id="cardPosText"></span>
      <button class="btn ghost" id="nextCard">下一张 →</button>
    </div>`;
  $('#flipCardInner').onclick=()=>{
    cardFlipped=!cardFlipped;
    $('#flipInner').classList.toggle('flipped',cardFlipped);
  };
  $('#prevCard').onclick=()=>{if(cardPos>0){cardPos--;renderCardStudy();}};
  $('#nextCard').onclick=()=>{const l=cardFilteredItems();if(cardPos<l.length-1){cardPos++;renderCardStudy();}};
  $('#cardPosText').textContent=`${cardPos+1} / ${list.length}`;
}

/* ===== 混合抽查 ===== */
let mixMode='';        // 'test' = 已掌握抽查, 'review' = 待巩固复习
let mixScope='';       // 'key' / 'all' — 已掌握抽查的范围
let mixQuestions=[];   // 本轮抽查的题目列表
let mixPos=0;          // 当前题位
let mixResults=[];     // 每题结果 {correct, detail}

// 收集满足条件的知识点（跨所有章节）
// statusFilter: 1=已掌握, 2=待巩固
function collectByStatus(statusFilter){
  const list=[];
  for(const ch of CHAPTERS){
    for(let i=0;i<ch.items.length;i++){
      if(chProg(ch.id)[i]===statusFilter){
        list.push({cid:ch.id,idx:i,ch:ch,item:ch.items[i]});
      }
    }
  }
  return list;
}

// 随机抽 n 题（洗牌取前 n）
function pickRandom(arr,n){
  const shuffled=arr.slice().sort(()=>Math.random()-0.5);
  return shuffled.slice(0,Math.min(n,arr.length));
}

// 为一道题决定出题方式：尽量背→填空；必须背/重点背→随机填空或默写
function pickQuizType(item){
  if(item.req==='尽量背')return 'blank';
  return Math.random()<0.5?'blank':'recall';
}

function renderMixSelect(){
  hideAllViews();
  $('#mixSelectView').style.display='';
  const pool=collectByStatus(1); // 已掌握
  const keyPool=pool.filter(q=>q.item.req!=='尽量背'); // 重点抽查：必须背+重点背
  const mixPool=pool; // 混合抽查：全部
  // 统计冷却中的数量
  const now=Date.now(),COOLDOWN=3*24*60*60*1000;
  const coolingCount=p=>p.filter(q=>{const t=getQuizDate(q.cid,q.idx);return t&&now-t<COOLDOWN;}).length;
  const keyCooling=coolingCount(keyPool),mixCooling=coolingCount(mixPool);
  $('#mixSelectGrid').innerHTML=`
    <div class="card" id="mixSelectKey" style="cursor:pointer;">
      <div class="ch-no" style="color:#dc2626;">重点抽查</div>
      <div class="ch-title">必须背 + 重点背</div>
      <div class="cnt">已掌握 ${keyPool.length} 个可抽查</div>
      ${keyCooling?`<div class="small-text" style="margin-top:4px;color:var(--gray);">其中 ${keyCooling} 个近期已答过、冷却中</div>`:''}
      <div class="small-text" style="margin-top:10px;">只抽查核心重点知识点（尽量背以外的）</div>
    </div>
    <div class="card" id="mixSelectAll" style="cursor:pointer;">
      <div class="ch-no" style="color:var(--blue);">混合抽查</div>
      <div class="ch-title">全部已掌握内容</div>
      <div class="cnt">已掌握 ${mixPool.length} 个可抽查</div>
      ${mixCooling?`<div class="small-text" style="margin-top:4px;color:var(--gray);">其中 ${mixCooling} 个近期已答过、冷却中</div>`:''}
      <div class="small-text" style="margin-top:10px;">抽查所有已掌握的知识点（含尽量背）</div>
    </div>`;
  $('#mixSelectKey').onclick=()=>startMixTest('key');
  $('#mixSelectAll').onclick=()=>startMixTest('all');
  $('#backMixSelect').onclick=()=>renderHome();
}

// 智能抽题：优先抽近期未答过的题，已答对过的按间隔冷却
// 间隔规则：答对后 3 天内不再抽查，超过 3 天才重新进入池
function pickSmart(pool,n){
  const now=Date.now();
  const COOLDOWN=3*24*60*60*1000; // 3天冷却
  // 分两组：可抽（冷却已过或从未答过）+ 冷却中
  const available=[],cooling=[];
  for(const q of pool){
    const last=getQuizDate(q.cid,q.idx);
    if(!last){available.push(q);} // 从未抽查过，优先
    else if(now-last>=COOLDOWN){available.push(q);} // 冷却已过
    else{cooling.push(q);} // 冷却中
  }
  // 先从 available 中随机抽
  let picked=pickRandom(available,n);
  // 如果不够，从 cooling 中补（按冷却到期最近的优先）
  if(picked.length<n&&cooling.length){
    const sorted=cooling.sort((a,b)=>getQuizDate(a.cid,a.idx)-getQuizDate(b.cid,b.idx));
    picked=picked.concat(sorted.slice(0,n-picked.length));
  }
  return picked;
}

function startMixTest(scope){
  let pool=collectByStatus(1); // 已掌握
  if(scope==='key')pool=pool.filter(q=>q.item.req!=='尽量背');
  if(!pool.length){alert('暂无已掌握的知识点，先去学习吧！');return;}
  mixMode='test';
  mixScope=scope||'all';
  mixQuestions=pickSmart(pool,5).map(q=>({...q,type:pickQuizType(q.item)}));
  mixPos=0;mixResults=[];
  renderMixTitle();
  renderMixQuestion();
}

function startMixReview(){
  const pool=collectByStatus(2); // 待巩固
  if(!pool.length){alert('暂无待巩固的知识点！');return;}
  mixMode='review';
  mixQuestions=pickRandom(pool,5).map(q=>({...q,type:pickQuizType(q.item)}));
  mixPos=0;mixResults=[];
  renderMixTitle();
  renderMixQuestion();
}

function renderMixTitle(){
  $('#mixTitle').textContent=mixMode==='test'?'已掌握抽查':'待巩固复习';
}

function renderMixQuestion(){
  hideAllViews();
  $('#mixView').style.display='';
  const card=$('#mixCard');
  if(mixPos>=mixQuestions.length){renderMixSummary();return;}

  const q=mixQuestions[mixPos];
  const chTitle=CHAPTERS.find(c=>c.id===q.cid).title;
  const item=q.item;
  const ansList=itemAns(item);
  const skip=commonRepeated(ansList.map(a=>a.t));
  let body='';
  let qLabel;

  if(q.type==='blank'){
    // 填空题
    const blanks=ansList.map(a=>makeBlank(a.t,skip));
    q.blanks=blanks;
    // 重编 i 序号
    let bi=0;
    blanks.forEach((b,i)=>{
      if(ansList[i].g&&(i===0||ansList[i-1].g!==ansList[i].g))body+=`<div class="group-title">${ansList[i].g}</div>`;
      body+=`<div class="blk-line"><span class="no">${i+1}.</span>${b.html}</div>`;
    });
    qLabel='填空';
  }else{
    // 默写题
    ansList.forEach((a,i)=>{
      if(a.g&&(i===0||ansList[i-1].g!==a.g))body+=`<div class="group-title">${a.g}</div>`;
      body+=`<div class="recall-line"><span class="no">${i+1}.</span><input class="recall-input" data-i="${i}" placeholder="请输入该要点内容"></div>`;
    });
    qLabel='默写';
  }

  card.innerHTML=`
    <div class="qhead">
      <span class="qtext">【${chTitle} · 第${q.idx+1}题 · ${qLabel}】${item.q}</span>
      <span class="badge ${badgeCls(item.req)}">${item.req}</span>
    </div>
    <div class="hint">第 ${mixPos+1}/${mixQuestions.length} 题 · ${qLabel}题</div>
    <div>${body}</div>
    <div class="actions">
      <button class="btn primary" id="submitMix">提交答案</button>
      ${mixMode==='review'?'<button class="btn ghost" id="showMixAns">显示答案</button>':''}
    </div>
    <div id="mixResult"></div>`;

  // 填空题：给每个 input 编号
  if(q.type==='blank'){
    card.querySelectorAll('.blk-input').forEach((inp,di)=>{inp.dataset.i=di;});
  }

  $('#submitMix').onclick=()=>judgeMixQuestion();
  $('#showMixAns').onclick=()=>{
    $('#mixResult').innerHTML=`<div class="answer"><div class="t">正确答案：</div><ol>${ansList.map(a=>`<li>${a.t}</li>`).join('')}</ol></div>`;
  };
}

function judgeMixQuestion(){
  const q=mixQuestions[mixPos];
  const item=q.item;
  const ansList=itemAns(item);
  let allOk=false,cnt=0;

  if(q.type==='blank'){
    // 填空判题
    const allAnswers=[];
    q.blanks.forEach(b=>{allAnswers.push(...b.answers);});
    allOk=true;
    $('#mixCard').querySelectorAll('.blk-input').forEach(inp=>{
      const i=+inp.dataset.i;
      const ok=checkInput(inp.value,allAnswers[i],false);
      inp.classList.toggle('ok',ok);inp.classList.toggle('bad',!ok);
      if(ok)cnt++;else allOk=false;
    });
  }else{
    // 默写判题（乱序匹配）
    const inputs=[];
    $('#mixCard').querySelectorAll('.recall-input').forEach(inp=>{
      inputs.push({el:inp,val:inp.value});
    });
    const used=new Set();
    for(let ai=0;ai<ansList.length;ai++){
      let best=-1,bestScore=-1;
      for(let ii=0;ii<inputs.length;ii++){
        if(used.has(ii))continue;
        const score=matchScore(inputs[ii].val,ansList[ai].t);
        if(score>bestScore){bestScore=score;best=ii;}
      }
      if(best>=0&&bestScore>=0.8){used.add(best);cnt++;}
    }
    inputs.forEach((inp,ii)=>{
      const matched=used.has(ii);
      inp.el.classList.toggle('ok',matched);inp.el.classList.toggle('bad',!matched);
    });
    allOk=cnt===ansList.length;
  }

  // 记录结果
  mixResults.push({correct:allOk,detail:cnt+'/'+ansList.length});

  // 更新状态
  if(mixMode==='test'){
    // 已掌握抽查：答对→已掌握(1)，答错→待巩固(2)；作答时间都记录，供多端合并时以最近作答为准
    chProg(q.cid)[q.idx]=allOk?1:2;
    setQuizDate(q.cid,q.idx);
    saveProgress(progress);
  }else{
    // 待巩固复习：答对→恢复已掌握(1)并记录日期，答错→保持待巩固(2)
    if(allOk){chProg(q.cid)[q.idx]=1;setQuizDate(q.cid,q.idx);saveProgress(progress);}
  }

  // 显示结果
  const chTitle=CHAPTERS.find(c=>c.id===q.cid).title;
  $('#mixResult').innerHTML=`<div class="answer"><div class="t">${allOk?'<span style="color:#16a34a">回答正确！</span>':'<span style="color:#dc2626">回答有误：</span> '+cnt+'/'+ansList.length} · 【${chTitle} · 第${q.idx+1}题】</div><ol>${ansList.map(a=>`<li>${a.t}</li>`).join('')}</ol><div style="margin-top:10px;"><button class="btn primary" id="nextMix">${mixPos<mixQuestions.length-1?'下一题 →':'查看抽查结果'}</button></div></div>`;
  $('#nextMix').onclick=()=>{mixPos++;renderMixQuestion();};
}

function renderMixSummary(){
  const card=$('#mixCard');
  const correct=mixResults.filter(r=>r.correct).length;
  const total=mixResults.length;
  const isTest=mixMode==='test';

  // 收集状态变化
  const changes=[];
  for(let i=0;i<mixQuestions.length;i++){
    const q=mixQuestions[i];
    const r=mixResults[i];
    const chTitle=CHAPTERS.find(c=>c.id===q.cid).title;
    if(isTest){
      if(!r.correct)changes.push({ch:chTitle,idx:q.idx+1,q:q.item.q.substring(0,20),change:'已掌握 → 待巩固',color:'#ea580c'});
    }else{
      if(r.correct)changes.push({ch:chTitle,idx:q.idx+1,q:q.item.q.substring(0,20),change:'待巩固 → 已掌握',color:'#16a34a'});
    }
  }

  let changesHtml='';
  if(changes.length){
    changesHtml='<div style="margin-top:14px;"><div class="answer"><div class="t">状态变化：</div>'+
      changes.map(c=>`<div style="padding:6px 0;border-bottom:1px solid #f1f5f9;"><span style="color:var(--gray);font-size:13px;">【${c.ch} · 第${c.idx}题】</span> ${c.q}… <span style="color:${c.color};font-weight:600;float:right;">${c.change}</span></div>`).join('')+
      '</div></div>';
  }

  card.innerHTML=`
    <div style="text-align:center;padding:20px 0;">
      <div style="font-size:28px;font-weight:700;">${correct}/${total}</div>
      <div style="color:var(--gray);font-size:14px;margin-top:4px;">${isTest?'已掌握抽查':'待巩固复习'}结果</div>
      <div style="margin-top:8px;font-size:14px;color:${correct===total?'#16a34a':'#dc2626'};font-weight:600;">${correct===total?'全部正确！':(correct===0?'全部需要加强':'部分正确')}</div>
    </div>
    ${changesHtml}
    <div class="actions" style="margin-top:16px;">
      <button class="btn primary" id="mixAgain">${isTest?'再来一轮抽查':'再来一轮复习'}</button>
      <button class="btn ghost" id="mixHome">返回首页</button>
    </div>`;
  $('#mixAgain').onclick=()=>{if(isTest)startMixTest(mixScope);else startMixReview();};
  $('#mixHome').onclick=()=>renderHome();
}

/* ===== 事件绑定 ===== */
$('#brandHome').onclick=()=>renderHome();
$('#backHome').onclick=()=>{if(curChapter().items.length>GROUP_SIZE)renderGroups();else renderHome();};
$('#chapterGrid').addEventListener('click',e=>{
  const card=e.target.closest('.card');
  if(card){curChapterId=+card.dataset.cid;curGroupId=0;if(curChapter().items.length>GROUP_SIZE)renderGroups();else renderChapter();}
});
$('#backFromGroup').onclick=()=>renderHome();
$('#groupGrid').addEventListener('click',e=>{
  const card=e.target.closest('.card');
  if(card){curGroupId=+card.dataset.gid;renderChapter();}
});
document.querySelector('.mode-tabs').addEventListener('click',e=>{
  const b=e.target.closest('button');if(b)switchView(b.dataset.mode);
});
$('#filterSeg').addEventListener('click',e=>{
  const b=e.target.closest('button');if(b)setFilter(b.dataset.f);
});
$('#blankNums').addEventListener('click',e=>{
  const b=e.target.closest('.num');if(!b)return;
  blankPos=+b.dataset.bp;blankCard=null;renderBlank();
});
$('#recallNums').addEventListener('click',e=>{
  const b=e.target.closest('.num');if(!b)return;
  recallPos=+b.dataset.rp;renderRecall();
});
$('#goMissBlank').onclick=()=>setMissThen('blank');
$('#goMissRecall').onclick=()=>setMissThen('recall');
$('#resetChBtn').onclick=()=>{
  const ch=curChapter();
  const label=ch.items.length>GROUP_SIZE?'本组':'本章';
  if(!confirm(`确定重置${label}全部掌握状态？`))return;
  const gs=curGroupId*GROUP_SIZE,ge=Math.min(gs+GROUP_SIZE,ch.items.length);
  if(!progress[curChapterId])progress[curChapterId]={};
  for(let i=gs;i<ge;i++)progress[curChapterId][i]=0;
  saveProgress(progress);
  renderSummary();renderHome();
};
/* 混合抽查入口 */
$('#openMixTest').onclick=()=>renderMixSelect();
$('#openMixReview').onclick=()=>startMixReview();
$('#backMix').onclick=()=>renderHome();
/* 学习统计入口 */
$('#openStats').onclick=()=>renderStats();
$('#backStats').onclick=()=>renderHome();

/* 卡片背记入口与导航 */
$('#openCardHome').onclick=()=>renderCardHome();
$('#backCardHome').onclick=()=>{hideAllViews();$('#homeView').style.display='';};
$('#backCardCh').onclick=()=>{if(cardChapter().items.length>GROUP_SIZE)renderCardGroups();else renderCardHome();};
$('#cardChapterGrid').addEventListener('click',e=>{
  const card=e.target.closest('.card');
  if(card){cardChapterId=+card.dataset.ccid;cardReq='all';cardPos=0;cardFlipped=false;cardGroupId=0;
    if(cardChapter().items.length>GROUP_SIZE)renderCardGroups();else renderCardStudy();}
});
$('#backCardGroup').onclick=()=>renderCardHome();
$('#cardGroupGrid').addEventListener('click',e=>{
  const card=e.target.closest('.card');
  if(card){cardGroupId=+card.dataset.cgid;cardPos=0;cardFlipped=false;renderCardStudy();}
});
$('#cardReqSeg').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  cardReq=b.dataset.req;cardPos=0;cardFlipped=false;renderCardStudy();
});
$('#cardNums').addEventListener('click',e=>{
  const b=e.target.closest('.num');if(!b)return;
  cardPos=+b.dataset.cp;cardFlipped=false;renderCardStudy();
});

renderHome();

/* ===== 云端同步接入 ===== */
// 云端合并后刷新内存进度与当前视图（quizLog/examDate 每次都从 localStorage 现读，无需处理）
document.addEventListener('sync:merged',e=>{
  const d=e.detail||{};
  if(d.progress){
    Object.keys(progress).forEach(k=>{delete progress[k];});
    Object.assign(progress,d.progress);
  }
  rerenderCurrentView();
});
function rerenderCurrentView(){
  const vis=id=>{const el=document.getElementById(id);return el&&el.style.display!=='none';};
  if(vis('chapterView'))switchView(mode);
  else if(vis('groupView'))renderGroups();
  else if(vis('statsView'))renderStats();
  else if(vis('cardHomeView'))renderCardHome();
  else if(vis('cardGroupView'))renderCardGroups();
  else if(vis('cardStudyView'))renderCardStudy();
  else if(vis('mixView')||vis('mixSelectView')){/* 抽查进行中，不打断答题 */}
  else renderHome();
}
Sync.init({progress:PROGRESS_KEY,quizLog:QUIZ_LOG_KEY,examDate:EXAM_DATE_KEY});
