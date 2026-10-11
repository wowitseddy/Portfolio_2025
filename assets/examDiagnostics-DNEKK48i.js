import"./modulepreload-polyfill-B5Qt9EMX.js";const v="portfolio.examDiagnostics.attempts",c=["algebra fluency","trig identities","vectors","unit conversion","force balance","circuits basics","graph reading","time-pressure error rate"],A={label:"Stage 1 cold diagnostic",date:new Date().toISOString().slice(0,10),overallCorrect:24,overallTotal:36,targetThreshold:70,targetWindow:45,transcriptText:"Misread two graph prompts under time pressure. Circuit questions slowed down after the first algebra miss. Need cleaner unit conversion and vectors review.",skills:{"algebra fluency":58,"trig identities":52,vectors:61,"unit conversion":49,"force balance":56,"circuits basics":63,"graph reading":68,"time-pressure error rate":43}};let a=[];function i(t){return String(t||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}function N(t){const e=Number(t);return Number.isFinite(e)?Math.max(0,Math.min(100,Math.round(e))):0}function p(t){const e=document.getElementById("diagnostics-status");e&&(e.textContent=t)}function x(){const t=document.getElementById("skill-inputs");t&&(t.innerHTML=c.map(e=>`
      <div class="skill-row">
        <div class="skill-label">${i(e)}</div>
        <label>
          Score %
          <input data-skill-input="${i(e)}" type="number" min="0" max="100" value="0" />
        </label>
        <label>
          Floor %
          <input data-skill-floor="${i(e)}" type="number" min="0" max="100" value="70" disabled />
        </label>
        <label>
          Trend
          <input data-skill-trend="${i(e)}" type="text" value="baseline" disabled />
        </label>
      </div>
    `).join(""))}function C(){var m,h,f,y,b,E,$,I,S,w;const t=((m=document.getElementById("attempt-label"))==null?void 0:m.value.trim())||"Untitled Attempt",e=((h=document.getElementById("attempt-date"))==null?void 0:h.value)||new Date().toISOString().slice(0,10),n=Number(((f=document.getElementById("overall-correct"))==null?void 0:f.value)||0),l=Number(((y=document.getElementById("overall-total"))==null?void 0:y.value)||36),o=Number(((b=document.getElementById("target-threshold"))==null?void 0:b.value)||70),r=Number(((E=document.getElementById("target-window"))==null?void 0:E.value)||45),s=(($=document.getElementById("transcript-text"))==null?void 0:$.value)||"",u=((w=(S=(I=document.getElementById("video-upload"))==null?void 0:I.files)==null?void 0:S[0])==null?void 0:w.name)||"",d=Object.fromEntries(c.map(T=>{var B;const L=((B=document.querySelector(`[data-skill-input="${CSS.escape(T)}"]`))==null?void 0:B.value)||0;return[T,N(L)]}));return{label:t,date:e,overallCorrect:n,overallTotal:l,targetThreshold:o,targetWindow:r,transcriptText:s,videoName:u,skills:d}}function M(){window.localStorage.setItem(v,JSON.stringify(a))}function j(){try{a=JSON.parse(window.localStorage.getItem(v)||"[]"),Array.isArray(a)||(a=[])}catch{a=[]}}function O(t){document.getElementById("attempt-label").value=t.label||"",document.getElementById("attempt-date").value=t.date||"",document.getElementById("overall-correct").value=t.overallCorrect??0,document.getElementById("overall-total").value=t.overallTotal??36,document.getElementById("target-threshold").value=t.targetThreshold??70,document.getElementById("target-window").value=t.targetWindow??45,document.getElementById("transcript-text").value=t.transcriptText||"",c.forEach(e=>{var l;const n=document.querySelector(`[data-skill-input="${CSS.escape(e)}"]`);n&&(n.value=((l=t.skills)==null?void 0:l[e])??0)})}function k(t){const e=Number(t.overallTotal||0),n=Number(t.overallCorrect||0);return e?Math.round(n/e*100):0}function D(t){if(!a.length)return"n/a";const e=new Date(a[0].date||Date.now()),n=new Date(t.date||Date.now()),l=Math.max(0,Math.round((n-e)/864e5));return`${Number(t.targetWindow||45)-l}d`}function H(t,e){const n=N(t);return n>=e+10?"rgba(96, 214, 146, 0.38)":n>=e?"rgba(166, 214, 96, 0.28)":n>=e-10?"rgba(225, 184, 86, 0.28)":"rgba(224, 95, 95, 0.28)"}function R(){c.forEach(t=>{var r,s;const e=document.querySelector(`[data-skill-trend="${CSS.escape(t)}"]`);if(!e)return;if(a.length<2){e.value="baseline";return}const n=((r=a[a.length-1].skills)==null?void 0:r[t])??0,l=((s=a[a.length-2].skills)==null?void 0:s[t])??0,o=n-l;o>4?e.value=`up ${o}`:o<-4?e.value=`down ${Math.abs(o)}`:e.value="flat"})}function F(){const t=document.getElementById("diagnostics-summary");if(!t)return;if(!a.length){t.innerHTML="<p>No attempts saved yet.</p>";return}const e=a[a.length-1],n=k(e),l=Number(e.targetThreshold||70),o=c.filter(r=>{var s;return(((s=e.skills)==null?void 0:s[r])??0)>=l}).length;t.innerHTML=`
    <h2>Summary</h2>
    <div class="summary-grid">
      <div class="summary-stat">
        <span class="summary-stat-label">Latest Overall</span>
        <span class="summary-stat-value">${n}%</span>
      </div>
      <div class="summary-stat">
        <span class="summary-stat-label">Threshold</span>
        <span class="summary-stat-value">${l}%</span>
      </div>
      <div class="summary-stat">
        <span class="summary-stat-label">Classes At Goal</span>
        <span class="summary-stat-value">${o}/${c.length}</span>
      </div>
      <div class="summary-stat">
        <span class="summary-stat-label">Days Remaining</span>
        <span class="summary-stat-value">${D(e)}</span>
      </div>
    </div>
  `}function U(){const t=document.getElementById("diagnostics-heatmap");if(!t)return;if(!a.length){t.innerHTML="<p>No heatmap yet.</p>";return}const e=Number(a[a.length-1].targetThreshold||70),n=a.map((o,r)=>`<th>${i(o.label||`Attempt ${r+1}`)}</th>`).join(""),l=c.map(o=>{const r=a.map(s=>{var d;const u=((d=s.skills)==null?void 0:d[o])??0;return`<td><div class="heatmap-cell" style="background:${H(u,e)}">${u}%</div></td>`}).join("");return`<tr><td>${i(o)}</td>${r}</tr>`}).join("");t.innerHTML=`
    <h2>Failure-Class Heatmap</h2>
    <table class="heatmap-table">
      <thead><tr><th>Class</th>${n}</tr></thead>
      <tbody>${l}</tbody>
    </table>
  `}function q(){const t=document.getElementById("diagnostics-recommendations");if(!t)return;if(!a.length){t.innerHTML="<p>No recommendations yet.</p>";return}const e=a[a.length-1],n=Number(e.targetThreshold||70),l=c.map(r=>{var s;return{skill:r,value:((s=e.skills)==null?void 0:s[r])??0}}).sort((r,s)=>r.value-s.value).slice(0,4),o=a.length<2?[]:c.filter(r=>{var d,m;const s=((d=e.skills)==null?void 0:d[r])??0;return(((m=a[a.length-2].skills)==null?void 0:m[r])??0)-s>=8});t.innerHTML=`
    <h2>Recommendations</h2>
    <h3>Immediate Weak Points</h3>
    <ul class="recommendation-list">
      ${l.map(r=>`<li>${i(r.skill)} at ${r.value}%: drive one targeted practice block before the next full attempt.</li>`).join("")}
    </ul>
    <h3>Regression Flags</h3>
    ${o.length?`<ul class="recommendation-list">${o.map(r=>`<li>${i(r)} fell by 8 points or more since the last attempt.</li>`).join("")}</ul>`:"<p>No major regression flags from the previous attempt.</p>"}
    <h3>Threshold Check</h3>
    <p>${c.filter(r=>{var s;return(((s=e.skills)==null?void 0:s[r])??0)>=n}).length} of ${c.length} classes are at or above ${n}%.</p>
  `}function J(){const t=document.getElementById("diagnostics-attempts");if(t){if(!a.length){t.innerHTML="<p>No attempt history yet.</p>";return}t.innerHTML=`
    <h2>Attempt History</h2>
    ${a.slice().reverse().map(e=>`
          <article class="attempt-card">
            <h3>${i(e.label)}</h3>
            <p>${i(e.date)} | Overall ${k(e)}% (${e.overallCorrect}/${e.overallTotal})</p>
            <p>${e.videoName?`Video: ${i(e.videoName)}`:"No video attached"}</p>
            <p>${i((e.transcriptText||"").slice(0,220))}</p>
          </article>
        `).join("")}
  `}}function g(){R(),F(),U(),q(),J()}function W(){const t=new Blob([JSON.stringify(a,null,2)],{type:"application/json"}),e=URL.createObjectURL(t),n=document.createElement("a");n.href=e,n.download="exam-diagnostics-attempts.json",n.click(),URL.revokeObjectURL(e)}function P(){const t=document.getElementById("transcript-upload");t==null||t.addEventListener("change",async e=>{var l;const n=(l=e.target.files)==null?void 0:l[0];n&&(document.getElementById("transcript-text").value=await n.text(),p(`Loaded transcript: ${n.name}`))})}function G(){var t,e,n,l;(t=document.getElementById("save-attempt"))==null||t.addEventListener("click",()=>{const o=C();a.push(o),a.sort((r,s)=>String(r.date).localeCompare(String(s.date))),M(),g(),p(`Saved ${o.label}.`)}),(e=document.getElementById("load-sample"))==null||e.addEventListener("click",()=>{O(A),p("Loaded sample attempt into the form.")}),(n=document.getElementById("export-json"))==null||n.addEventListener("click",()=>{W(),p("Exported attempt history JSON.")}),(l=document.getElementById("clear-data"))==null||l.addEventListener("click",()=>{a=[],window.localStorage.removeItem(v),g(),p("Cleared saved attempt history.")})}function _(){document.getElementById("attempt-date").value=new Date().toISOString().slice(0,10)}function K(){x(),_(),j(),P(),G(),g()}K();
