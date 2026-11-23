const test = require('node:test'), assert = require('node:assert/strict'), load = require('./load-typescript.cjs');
const contract = load('lib/socials-contract.ts'), actor = { discordId:'123456789012345678',name:'Creator nickname' };
function database() {
  let rows = new Map(), tail = Promise.resolve(), failAudit = false; const audits = [], calls = [];
  const select = (map,params) => [[...map].filter(([key])=>params.includes(key)).map(([config_key,config_value])=>({config_key,config_value}))];
  const pool = { execute:async(sql,p)=>select(rows,p), getConnection:async()=>{ let copy,unlock,pending=[]; return {
    beginTransaction:async()=>{ const before=tail;tail=new Promise(r=>{unlock=r;});await before;copy=new Map(rows); },
    execute:async(sql,p)=>{ calls.push([sql,p]);if(sql.startsWith('SELECT'))return select(copy,p);
      if(sql.startsWith('INSERT INTO site_config')){if(sql.includes('VALUES (?, NULL')){if(!copy.has(p[0]))copy.set(p[0],null);}else copy.set(p[0],p[1]);return [{}];}
      if(sql.startsWith('INSERT INTO config_audit')){if(failAudit)throw Error('private SQL password');pending.push(p);return [{}];}throw Error('Unexpected query');},
    commit:async()=>{rows=copy;audits.push(...pending);},rollback:async()=>{},release:()=>unlock(),
  }; } };
  return { service:load('lib/socials-page.ts',{'server-only':{},'@/lib/db':{getDbPool:()=>pool}}),audits,calls,set:(key,value)=>rows.set(key,value),failAudit:()=>{failAudit=true;},rows:()=>rows };
}
test('verified Linktree defaults are available, explicit removals remain removed, and page edits share existing platform rows',async()=>{
  const f=database(), initial=await f.service.getSocialsSettings();
  assert.equal(initial.destinations.instagram,'https://instagram.com/xenonesportsonline'); assert.equal(initial.page.links.length,4);
  f.set('social.tiktok',null); assert.equal((await f.service.getSocialsSettings()).destinations.tiktok,null);
  const current=await f.service.getSocialsSettings(), destinations={...current.destinations,instagram:'https://instagram.com/updatedxenon'};
  const saved=await f.service.saveSocialsSettings(current.version,{action:'save-links',links:current.page.links,destinations},actor);
  assert.equal(f.rows().get('social.instagram'),destinations.instagram);assert.notEqual(saved.version,current.version);
  assert.ok(f.audits.some(v=>v[0]==='social.instagram'&&v[2]===destinations.instagram&&v[4]===actor.name));
  assert.equal(saved.page.appearance.title,initial.page.appearance.title);
});
test('concurrent edits and slash-command changes cannot overwrite a stale editor; appearance saves preserve links',async()=>{
  const f=database(), initial=await f.service.getSocialsSettings(), appearance={...initial.page.appearance,title:'Creators test'};
  const results=await Promise.allSettled([f.service.saveSocialsSettings(initial.version,{action:'save-appearance',appearance},actor),f.service.saveSocialsSettings(initial.version,{action:'save-links',links:[],destinations:initial.destinations},actor)]);
  assert.equal(results.filter(v=>v.status==='fulfilled').length,1);assert.equal(results.find(v=>v.status==='rejected').reason.status,409);
  const saved=await f.service.getSocialsSettings();assert.deepEqual(saved.page.links,initial.page.links);
  f.set('social.youtube','https://youtube.com/@changedbycommand');
  await assert.rejects(f.service.saveSocialsSettings(saved.version,{action:'save-appearance',appearance},actor),e=>e.status===409);
});
test('audit failures roll back the page and all destinations together; public reads have a safe database-outage fallback',async()=>{
  const f=database(), initial=await f.service.getSocialsSettings(); f.failAudit();
  await assert.rejects(f.service.saveSocialsSettings(initial.version,{action:'save-links',links:[],destinations:initial.destinations},actor));
  assert.equal(f.rows().size,0); assert.equal(f.audits.length,0);
  const service=load('lib/socials-page.ts',{'server-only':{},'@/lib/db':{getDbPool:()=>{throw Error('private');}}});
  assert.equal((await service.getPublicSocials()).page.appearance.title,'Xenon Esports');
});
test('public links and appearance reject scripts, credentials, arbitrary fields, duplicated platforms and CSS injection',()=>{
  const page=structuredClone(contract.defaultSocialPage);
  for(const url of ['javascript:alert(1)','https://user:password@example.org','http://example.org','https://example.org?token=secret']) assert.equal(contract.socialLinksSchema.safeParse([{...page.links[0],url}]).success,false);
  assert.equal(contract.socialLinksSchema.safeParse([...page.links,page.links[1]]).success,false);
  assert.equal(contract.socialAppearanceSchema.safeParse({...page.appearance,accent:'red;background:url(secret)'}).success,false);
  assert.equal(contract.socialAppearanceSchema.safeParse({...page.appearance,html:'<script>'}).success,false);
  assert.equal(contract.socialAppearanceSchema.safeParse({...page.appearance,bannerUrl:'//evil.example/image'}).success,false);
  assert.equal(contract.onAccent('#ffffff'),'#101014');assert.equal(contract.onAccent('#000000'),'#ffffff');
});
test('the internal API authenticates and checks the selected permission before storage, with no arbitrary database keys',async(t)=>{
  const prior=process.env.WEBSITE_BOT_TOKEN;process.env.WEBSITE_BOT_TOKEN='social-test';t.after(()=>{if(prior===undefined)delete process.env.WEBSITE_BOT_TOKEN;else process.env.WEBSITE_BOT_TOKEN=prior;});
  let writes=0;const api=load('app/api/bot/socials/route.ts',{'@/lib/socials-page':{saveSocialsSettings:async()=>{writes++;return {};}}});
  const request=(body,key='social-test')=>new Request('https://xenon.example/api/bot/socials',{method:'POST',headers:{Authorization:`Bearer ${key}`},body:JSON.stringify(body)});
  const body={action:'save-appearance',guildId:actor.discordId,actor,version:'a'.repeat(64),mayEditAppearance:false,appearance:contract.defaultSocialPage.appearance};
  assert.equal((await api.POST(request(body,'wrong'))).status,401);assert.equal((await api.POST(request(body))).status,403);assert.equal(writes,0);
  assert.equal((await api.POST(request({...body,mayEditAppearance:true,config_key:'DB_PASSWORD'}))).status,400);
  assert.equal((await api.POST(request({...body,mayEditAppearance:true}))).status,200);assert.equal(writes,1);
});
