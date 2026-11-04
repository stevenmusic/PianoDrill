import { open } from "/home/user/PianoDrill/tools/test/harness.mjs";
import fs from "node:fs";
const OUT = "/tmp/claude-0/-home-user-PianoDrill/57ddd9dc-2132-5999-a5a7-37258561f000/scratchpad/ux2/";
const SIZES = { iphone:[390,844], fold:[280,653], land:[844,390], ipad:[820,1180] };
const only = process.env.SZ ? process.env.SZ.split(",") : Object.keys(SIZES);
const langs = process.env.LG ? process.env.LG.split(",") : ["zh","en"];
const themes = ["light"];
const SC = {
  todayOn: [{view:"tech",sub:{tech:"today"}}, async p=>{ await p.click("#t-dailyCard .daily-btn"); await p.waitForTimeout(1500); }],
  arp: [{view:"tech",sub:{tech:"arp"}}],
  hanon: [{view:"tech",sub:{tech:"hanon"}}],
  intv: [{view:"ear",sub:{ear:"interval"}}, async p=>{ await p.click("#e-playBtn").catch(()=>{}); await p.waitForTimeout(800); }],
  intvAns: [{view:"ear",sub:{ear:"interval"}}, async p=>{ await p.click("#e-playBtn").catch(()=>{}); await p.waitForTimeout(1500); await p.click("#e-answers button:not([disabled])").catch(()=>{}); await p.waitForTimeout(800); }],
  chord: [{view:"ear",sub:{ear:"chord"}}, async p=>{ await p.click("#e-playBtn").catch(()=>{}); await p.waitForTimeout(800); }],
  chordAns: [{view:"ear",sub:{ear:"chord"}}, async p=>{ await p.click("#e-playBtn").catch(()=>{}); await p.waitForTimeout(1500); await p.click("#e-answers button:not([disabled])").catch(()=>{}); await p.waitForTimeout(800); }],
  left: [{view:"sight",sub:{sight:"left"}}],
  both: [{view:"sight",sub:{sight:"both"}}],
  read: [{view:"sight",sub:{sight:"read"}}],
  examTech: [{view:"exam",exam:{system:"abrsm",grade:3},sub:{exam:"tech"}}, async p=>{ await p.click("#t-drawBtn"); await p.waitForTimeout(1500); }],
  examSight: [{view:"exam",exam:{system:"abrsm",grade:3},sub:{exam:"sight"}}, async p=>{ await p.waitForTimeout(500); await p.evaluate(()=>{const b=[...document.querySelectorAll("#mod-sight button")].find(b=>b.offsetParent&&/練習一題|Practi/.test(b.textContent)); b&&b.click();}); await p.waitForTimeout(2500); }],
  examEar: [{view:"exam",exam:{system:"abrsm",grade:3},sub:{exam:"ear"}}, async p=>{ await p.click("#e-drawBtn").catch(()=>{}); await p.waitForTimeout(1200); }],
  mock: [{view:"exam",exam:{system:"abrsm",grade:3},sub:{exam:"tech"}}, async p=>{ await p.click("#t-mockBtn"); await p.waitForTimeout(2000); }],
  footer: [{view:"tech",sub:{tech:"scale"}}, async p=>{ await p.evaluate(()=>document.getElementById("bakLink").click()); await p.evaluate(()=>document.getElementById("bakPanel").scrollIntoView()); }],
};
const only2 = process.env.SC ? process.env.SC.split(",") : Object.keys(SC);
const res = {};
for (const sz of only) for (const lang of langs) {
  const [w,h]=SIZES[sz];
  const { page, close, errors } = await open({ viewport:{width:w,height:h}, mobile:true, dpr:1 });
  for (const name of only2) {
    const [shell, extra] = SC[name];
    await page.evaluate(([shell,lang])=>{ localStorage.clear(); localStorage.setItem("pianodrill-lang",lang); localStorage.setItem("pianodrill.v1",JSON.stringify({onboarded:true,...shell})); },[shell,lang]);
    await page.reload(); await page.waitForFunction(()=>window.__stageReady>=1); await page.waitForTimeout(1000);
    try { if (extra) await extra(page); } catch(e){ console.log("extra fail",name,e.message.slice(0,80)); }
    await page.waitForTimeout(500);
    const m = await page.evaluate(()=>{
      const vis=e=>{const r=e.getBoundingClientRect();const cs=getComputedStyle(e);return r.width>0&&r.height>0&&cs.visibility!=="hidden"&&cs.display!=="none"&&e.closest("[hidden]")==null&&e.offsetParent!==null};
      const small={}, tap=[], over=[];
      const W=document.documentElement.clientWidth;
      for(const e of document.querySelectorAll("body *")){
        if(!vis(e))continue; const r=e.getBoundingClientRect();
        if([...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())){const fs=parseFloat(getComputedStyle(e).fontSize); if(fs<12){const k=fs.toFixed(1);(small[k]=small[k]||[]).push(e.textContent.trim().slice(0,14));}}
        if(e.matches("button,a,[role=tab],input,.opt,.chip")&&(r.height<43.5||r.width<43.5)&&!e.closest("footer .foot-links")) tap.push(`${(e.id||e.className||e.tagName).toString().slice(0,18)}|${(e.textContent||"").trim().slice(0,8)}|${Math.round(r.width)}x${Math.round(r.height)}`);
        if(r.right>W+1&&!e.closest(".paper,#t-stage,.seg,#t-scroll,svg")) over.push((e.id||e.className).toString().slice(0,20)+":"+Math.round(r.right));
      }
      return {small:Object.fromEntries(Object.entries(small).map(([k,v])=>[k,v.slice(0,4)])),tap:tap.slice(0,10),over:over.slice(0,4),sw:document.documentElement.scrollWidth,W,sh:document.documentElement.scrollHeight};
    });
    res[`${sz}-${lang}-${name}`]=m;
    await page.screenshot({path:`${OUT}${sz}-${lang}-${name}.png`, fullPage: name==="footer"?false:false});
  }
  if(errors.length) console.log(sz,lang,errors.slice(0,3));
  await close();
}
fs.writeFileSync(OUT+"m.json",JSON.stringify(res,null,1));
console.log("done");
