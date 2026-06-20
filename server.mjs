import http from "node:http";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import uiWorker from "./ui.mjs";

const { Pool } = pg;
const port = Number(process.env.PORT || 3000);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required. Add a PostgreSQL service in Railway.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false });
const sha = (value) => createHash("sha256").update(String(value)).digest("hex");
const arabicNames = { Argentina:"الأرجنتين",France:"فرنسا",England:"إنجلترا",Brazil:"البرازيل",Spain:"إسبانيا",Portugal:"البرتغال",Germany:"ألمانيا",Netherlands:"هولندا",Morocco:"المغرب","Saudi Arabia":"السعودية",Mexico:"المكسيك",Japan:"اليابان",Croatia:"كرواتيا",Belgium:"بلجيكا",Uruguay:"أوروغواي",Colombia:"كولومبيا" };
const flags = { Argentina:"🇦🇷",France:"🇫🇷",England:"🏴",Brazil:"🇧🇷",Spain:"🇪🇸",Portugal:"🇵🇹",Germany:"🇩🇪",Netherlands:"🇳🇱",Morocco:"🇲🇦","Saudi Arabia":"🇸🇦",Mexico:"🇲🇽",Japan:"🇯🇵",Croatia:"🇭🇷",Belgium:"🇧🇪",Uruguay:"🇺🇾",Colombia:"🇨🇴" };

await pool.query(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "content-type":"application/json; charset=utf-8", "content-length":Buffer.byteLength(body), "cache-control":"no-store", "x-content-type-options":"nosniff" });
  res.end(body);
}
async function body(req) { const chunks=[]; for await (const chunk of req) chunks.push(chunk); if (!chunks.length) return {}; return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
async function authenticate(req) {
  const token=req.headers.authorization?.replace(/^Bearer\s+/i,""); if(!token)return null;
  const {rows}=await pool.query(`SELECT p.id,p.name,p.role FROM sessions s JOIN participants p ON p.id=s.participant_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND p.active=TRUE`,[sha(token)]);
  return rows[0]||null;
}
async function api(req,res,path) {
  try {
    if(path==="/api/login"&&req.method==="POST"){
      const input=await body(req),code=String(input.code||"").trim().toUpperCase();
      const {rows}=await pool.query("SELECT id,name,role FROM participants WHERE code_hash=$1 AND active=TRUE",[sha(code)]);
      if(!rows[0])return send(res,401,{error:"الكود غير صحيح"});
      const token=randomUUID()+randomUUID(); await pool.query("INSERT INTO sessions(token_hash,participant_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 days')",[sha(token),rows[0].id]);
      return send(res,200,{token,user:rows[0]});
    }
    const user=await authenticate(req); if(!user)return send(res,401,{error:"الجلسة غير صالحة"});
    if(path==="/api/bootstrap"&&req.method==="GET"){
      const [teams,fixtures,predictions,ranking]=await Promise.all([
        pool.query("SELECT id,name_ar,flag,group_name FROM teams ORDER BY id"),
        pool.query("SELECT id,home_team_id,away_team_id,group_name,venue,kickoff_at,status,home_score,away_score FROM fixtures ORDER BY kickoff_at"),
        pool.query("SELECT fixture_id,home_score,away_score,points,distance FROM predictions WHERE participant_id=$1",[user.id]),
        pool.query(`SELECT p.id,p.name,COALESCE(SUM(pr.points),0) points,COUNT(*) FILTER(WHERE pr.points=5) exact FROM participants p LEFT JOIN predictions pr ON pr.participant_id=p.id WHERE p.active=TRUE AND p.role='PLAYER' GROUP BY p.id ORDER BY points DESC,exact DESC`)
      ]);
      return send(res,200,{user,teams:teams.rows,fixtures:fixtures.rows,predictions:predictions.rows,ranking:ranking.rows});
    }
    if(path==="/api/predictions"&&req.method==="POST"){
      const input=await body(req),id=Number(input.fixtureId),home=Number(input.home),away=Number(input.away);
      if(![id,home,away].every(Number.isInteger)||home<0||away<0||home>30||away>30)return send(res,400,{error:"النتيجة غير صالحة"});
      const fixture=await pool.query("SELECT kickoff_at FROM fixtures WHERE id=$1",[id]); if(!fixture.rows[0])return send(res,404,{error:"المباراة غير موجودة"});
      if(Date.now()>=new Date(fixture.rows[0].kickoff_at).getTime())return send(res,409,{error:"أُغلق التوقع لبدء المباراة"});
      await pool.query(`INSERT INTO predictions(participant_id,fixture_id,home_score,away_score) VALUES($1,$2,$3,$4) ON CONFLICT(participant_id,fixture_id) DO UPDATE SET home_score=EXCLUDED.home_score,away_score=EXCLUDED.away_score,submitted_at=NOW()`,[user.id,id,home,away]);
      return send(res,200,{ok:true});
    }
    if(path==="/api/picks"&&req.method==="POST"){
      const input=await body(req),stage=String(input.stage||""),ids=Array.isArray(input.teamIds)?[...new Set(input.teamIds.map(Number))]:[],limits={R32:32,R16:16,QF:8,SF:4,FINAL:2};
      if(!limits[stage]||ids.length>limits[stage]||ids.some(id=>!Number.isInteger(id)))return send(res,400,{error:"الترشيحات غير صالحة"});
      const client=await pool.connect();try{await client.query("BEGIN");await client.query("DELETE FROM stage_picks WHERE participant_id=$1 AND stage=$2",[user.id,stage]);for(const id of ids)await client.query("INSERT INTO stage_picks(participant_id,stage,team_id) VALUES($1,$2,$3)",[user.id,stage,id]);await client.query("COMMIT")}catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
      return send(res,200,{ok:true});
    }
    if(path.startsWith("/api/compare/")&&req.method==="GET"){
      const match=path.match(/^\/api\/compare\/(\d+)\/(\d+)$/);if(!match)return send(res,400,{error:"طلب المقارنة غير صالح"});const a=Number(match[1]),b=Number(match[2]);
      const {rows}=await pool.query(`SELECT f.id,ht.name_ar home_name,at.name_ar away_name,f.home_score,f.away_score,
        pa.home_score a_home,pa.away_score a_away,pa.points a_points,pa.distance a_distance,
        pb.home_score b_home,pb.away_score b_away,pb.points b_points,pb.distance b_distance,
        ua.name a_name,ub.name b_name
        FROM fixtures f JOIN teams ht ON ht.id=f.home_team_id JOIN teams at ON at.id=f.away_team_id
        JOIN predictions pa ON pa.fixture_id=f.id AND pa.participant_id=$1
        JOIN predictions pb ON pb.fixture_id=f.id AND pb.participant_id=$2
        JOIN participants ua ON ua.id=$1 JOIN participants ub ON ub.id=$2
        WHERE f.status='FINISHED' AND f.home_score IS NOT NULL ORDER BY f.kickoff_at DESC`,[a,b]);
      const result=rows.map(r=>{let verdict="تعادل";if(r.a_points!==r.b_points)verdict=(r.a_points>r.b_points?r.a_name:r.b_name)+": نقاط أكثر";else if(r.a_distance!==r.b_distance)verdict=(r.a_distance<r.b_distance?r.a_name:r.b_name)+": توقع أقرب";return{game:`${r.home_name} × ${r.away_name}`,actual:`${r.home_score} - ${r.away_score}`,a:`${r.a_home} - ${r.a_away}`,b:`${r.b_home} - ${r.b_away}`,ap:r.a_points,bp:r.b_points,verdict}});
      return send(res,200,{rows:result});
    }
    if(path==="/api/participants"&&req.method==="POST"){
      if(user.role!=="ADMIN")return send(res,403,{error:"غير مصرح"});const input=await body(req),name=String(input.name||"").trim(),code=String(input.code||"").trim().toUpperCase();
      if(name.length<2||code.length<4)return send(res,400,{error:"أدخل اسمًا وكودًا من 4 خانات على الأقل"});
      try{await pool.query("INSERT INTO participants(name,code_hash) VALUES($1,$2)",[name,sha(code)]);return send(res,201,{ok:true})}catch(error){if(error.code==="23505")return send(res,409,{error:"الكود مستخدم مسبقًا"});throw error}
    }
    if(path==="/api/results"&&req.method==="POST"){
      if(user.role!=="ADMIN")return send(res,403,{error:"غير مصرح"});const input=await body(req),id=Number(input.fixtureId),home=Number(input.home),away=Number(input.away);if(![id,home,away].every(Number.isInteger)||home<0||away<0)return send(res,400,{error:"النتيجة غير صالحة"});
      const client=await pool.connect();try{await client.query("BEGIN");await client.query("UPDATE fixtures SET home_score=$1,away_score=$2,status='FINISHED',updated_at=NOW() WHERE id=$3",[home,away,id]);await client.query(`UPDATE predictions SET distance=ABS(home_score-$1)+ABS(away_score-$2),points=CASE WHEN home_score=$1 AND away_score=$2 THEN 5 WHEN SIGN(home_score-away_score)=SIGN($1-$2) AND home_score-away_score=$1-$2 THEN 3 WHEN SIGN(home_score-away_score)=SIGN($1-$2) THEN 2 ELSE 0 END WHERE fixture_id=$3`,[home,away,id]);await client.query("INSERT INTO audit_logs(actor_id,action,details) VALUES($1,'RESULT_UPDATED',$2::jsonb)",[user.id,JSON.stringify({fixtureId:id,home,away})]);await client.query("COMMIT")}catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}return send(res,200,{ok:true});
    }
    if(path==="/api/sync"&&req.method==="POST"){
      if(user.role!=="ADMIN")return send(res,403,{error:"غير مصرح"});if(!process.env.API_FOOTBALL_KEY)return send(res,409,{error:"أضف API_FOOTBALL_KEY في Railway أولًا"});
      const response=await fetch("https://v3.football.api-sports.io/fixtures?league=1&season=2026",{headers:{"x-apisports-key":process.env.API_FOOTBALL_KEY}});if(!response.ok)return send(res,502,{error:"تعذر الاتصال بمصدر المباريات"});const data=await response.json();let imported=0;
      for(const item of data.response||[]){const home=item.teams?.home,away=item.teams?.away;if(!home?.id||!away?.id)continue;const round=String(item.league?.round||""),group=round.match(/Group ([A-L])/i)?.[1]||"";for(const team of [home,away])await pool.query(`INSERT INTO teams(id,external_id,name_ar,name_en,code,flag,group_name) VALUES($1,$1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET name_ar=EXCLUDED.name_ar,name_en=EXCLUDED.name_en,group_name=EXCLUDED.group_name`,[team.id,arabicNames[team.name]||team.name,team.name,String(team.name).slice(0,3).toUpperCase(),flags[team.name]||"⚽",group]);await pool.query(`INSERT INTO fixtures(external_id,home_team_id,away_team_id,stage,group_name,venue,kickoff_at,status,home_score,away_score) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(external_id) DO UPDATE SET kickoff_at=EXCLUDED.kickoff_at,status=EXCLUDED.status,home_score=EXCLUDED.home_score,away_score=EXCLUDED.away_score,venue=EXCLUDED.venue,updated_at=NOW()`,[item.fixture.id,home.id,away.id,round,group,item.fixture?.venue?.name||"",item.fixture.date,item.fixture?.status?.short||"SCHEDULED",item.goals?.home??null,item.goals?.away??null]);imported++}
      return send(res,200,{ok:true,imported});
    }
    return send(res,404,{error:"المسار غير موجود"});
  } catch(error){console.error(error);return send(res,500,{error:"حدث خطأ في الخادم"})}
}

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url||"/",`http://${req.headers.host||"localhost"}`);
  if(url.pathname==="/health")return send(res,200,{ok:true});
  if(url.pathname.startsWith("/api/"))return api(req,res,url.pathname);
  const response=await uiWorker.fetch(new Request(url,{method:req.method,headers:req.headers}),{},{});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
});
server.listen(port,"0.0.0.0",()=>console.log(`World Cup Predictions running on port ${port}`));
