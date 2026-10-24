import http from 'node:http';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Busboy from 'busboy';
import { probe, extractAudio16k } from '../media.js';
import { transcribe } from '../transcribe.js';
import { makePlan } from '../plan.js';
import { renderGreenScreen } from './render.js';

const PORT=Number(process.env.PORT||8080), DATA=process.env.DATA_DIR||'/data/green-screen';
const TOKEN=process.env.GREEN_SCREEN_TOKEN;
const IMAGE_NORMALIZER=path.join(path.dirname(fileURLToPath(import.meta.url)),'normalize_image.py');
if(!TOKEN||TOKEN.length<24){console.error('Falta GREEN_SCREEN_TOKEN (mínimo 24 caracteres)');process.exit(1);}
const jobs=new Map(); let active=false; const queue=[];
const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
const authorized=req=>{const a=Buffer.from((req.headers.authorization||'').replace(/^Bearer\s+/i,'')),b=Buffer.from(TOKEN);return a.length===b.length&&crypto.timingSafeEqual(a,b);};
const safe=s=>String(s||'archivo').replace(/[^\w. -áéíóúñÁÉÍÓÚÑ]/g,'_').slice(0,90);
const IMAGE_EXTS=new Set(['.jpg','.jpeg','.png','.webp','.heic','.heif','.avif','.tif','.tiff','.bmp','.gif']);

async function normalizeImage(input,output){
  await new Promise((resolve,reject)=>{
    const p=spawn(process.env.PYTHON||'python3',[IMAGE_NORMALIZER,input,output]);let err='';
    p.stderr.on('data',d=>{err=(err+d.toString()).slice(-2000)});
    p.on('error',reject);p.on('close',code=>code===0?resolve():reject(new Error(err.trim()||'No se pudo convertir una imagen.')));
  });
}

async function receive(req,dir){
  await fs.mkdir(dir,{recursive:true});
  return new Promise((resolve,reject)=>{
    const bb=Busboy({headers:req.headers,limits:{files:12,fileSize:2*1024*1024*1024}}), files=[], fields={}; let pending=[],tooBig=false,invalid=null;
    bb.on('field',(n,v)=>fields[n]=v);
    bb.on('file',(field,stream,info)=>{
      const ext=path.extname(info.filename||'').toLowerCase();
      const imageMatch=field.match(/^image_(\d{1,2})$/),isImage=field==='image'||!!imageMatch;
      if(field!=='video'&&!isImage){stream.resume();return;}
      if(field==='video'&&!['.mp4','.mov','.m4v','.webm','.mkv'].includes(ext)){stream.resume();invalid=new Error('El video debe ser MP4, MOV, M4V, WebM o MKV.');return;}
      if(isImage&&!IMAGE_EXTS.has(ext)){stream.resume();invalid=new Error('Formato de imagen no compatible. Usa JPG, PNG, WebP, HEIC/HEIF, AVIF, TIFF, BMP o GIF.');return;}
      if(field==='video'&&files.some(x=>x.field==='video')){stream.resume();invalid=new Error('Envía solo un archivo de cámara por trabajo.');return;}
      const index=isImage?(imageMatch?Number(imageMatch[1]):files.filter(x=>x.isImage).length+1):0;
      if(isImage&&(index<1||index>11||files.some(x=>x.isImage&&x.index===index))){stream.resume();invalid=new Error('Envía entre 1 y 11 imágenes, una vez cada una.');return;}
      const name=`${isImage?'image-'+index:'camera'}-original${ext}`,target=path.join(dir,name),ws=createWriteStream(target);
      const p=new Promise((r,j)=>{ws.on('finish',r);ws.on('error',j);stream.on('error',j);});
      stream.on('limit',()=>{tooBig=true;});
      stream.pipe(ws); files.push({field,isImage,index,name,sourceName:info.filename}); pending.push(p);
    });
    bb.on('filesLimit',()=>{invalid=new Error('Máximo 1 video y 11 imágenes por trabajo.');});
    bb.on('close',async()=>{try{await Promise.all(pending);if(invalid)throw invalid;if(tooBig)throw new Error('Un archivo supera el límite de 2 GB.');const video=files.find(x=>x.field==='video'),allImages=files.filter(x=>x.isImage).sort((a,b)=>a.index-b.index);const requested=Number(fields.imageCount||fields.image_count||allImages.length);if(!video)throw new Error('Falta el archivo de cámara.');if(!Number.isInteger(requested)||requested<1||requested>11||allImages.length<requested)throw new Error('Agrega entre 1 y 11 imágenes válidas.');const selected=allImages.slice(0,requested);for(const extra of allImages.slice(requested))await fs.rm(path.join(dir,extra.name),{force:true});const normalized=[];for(const image of selected){const out=path.join(dir,`image-${image.index}.jpg`);await normalizeImage(path.join(dir,image.name),out);normalized.push(out);}resolve({input:path.join(dir,video.name),images:normalized,fields,files:[video,...selected]});}catch(e){reject(e);}});
    bb.on('error',reject);req.pipe(bb);
  });
}
async function defaultMusic(){
  try{
    const state=JSON.parse(await fs.readFile(process.env.MUSIC_STATE||'/bedit-data/state.json','utf8'));
    const dir=process.env.MUSIC_DIR||'/bedit-data/music';
    if(state.defaultMusic){const p=path.join(dir,path.basename(state.defaultMusic));await fs.access(p);return p;}
    return null;
  }catch{return null;}
}

async function saveJob(job){await fs.writeFile(path.join(job.dir,'job.json'),JSON.stringify(job));}
async function work(job){
  job.status='analizando';job.updatedAt=new Date().toISOString();await saveJob(job);
  try{
    const info=await probe(job.input); if(info.duration>125)throw new Error('El video no puede durar más de 2 minutos.'); if(!info.hasAudio)throw new Error('El video de cámara debe tener audio.');
    const wav=path.join(job.dir,'audio16k.wav'),audio=await extractAudio16k(job.input,info,wav);
    job.status='transcribiendo';job.updatedAt=new Date().toISOString();await saveJob(job);
    const chunks=await transcribe(wav,job.dir);const plan=makePlan({audio16k:audio,chunks,duration:info.duration,sensitivity:'fuerte'});
    job.status='renderizando';job.updatedAt=new Date().toISOString();await saveJob(job);
    const musicPath=await defaultMusic();
    const stats=await renderGreenScreen({input:job.input,images:job.images,dir:job.dir,info,plan,musicPath});
    const uncertain=(plan.words||[]).filter(w=>Number.isFinite(w.confidence)&&w.confidence<0.55).length;
    job.status='listo';job.stats={...stats,words:plan.words.length,fillers:plan.fillers.length,music:musicPath?path.basename(musicPath):null,warning:job.images.length<4?'Se recibieron menos de 4 imágenes; se repitieron en el mosaico inicial.':null,musicWarning:!musicPath?'No se encontró la pista predeterminada; el borrador quedó sin música.':null,review:uncertain>0?`${uncertain} palabras con confianza baja; revisa que los cortes no afecten el guion.`:null};
    await fs.writeFile(path.join(job.dir,'plan.json'),JSON.stringify({info,words:plan.words,fillers:plan.fillers,cuts:plan.cuts,keep:plan.keep,stats:job.stats},null,2));
  }catch(e){job.status='error';job.error=String(e.message||e).slice(0,500);}
  job.updatedAt=new Date().toISOString();await saveJob(job);
  if(job.callbackUrl){for(let i=0;i<5;i++){try{const r=await fetch(job.callbackUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:job.id,name:job.name,status:job.status,error:job.error||null,stats:job.stats||null,resultUrl:`/jobs/${job.id}/result`}),signal:AbortSignal.timeout(20000)});if(r.ok)break;throw new Error(`HTTP ${r.status}`);}catch(e){console.error('callback falló',e.message);if(i<4)await new Promise(r=>setTimeout(r,5000*(i+1)));}}}
}
async function pump(){if(active)return;active=true;while(queue.length){const j=queue.shift();await work(j);}active=false;}

const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,'http://localhost'),p=u.pathname;
    if(p==='/health')return send(res,200,{ok:true,service:'green-screen',isolated:true});
    if(!authorized(req))return send(res,401,{error:'No autorizado'});
    if(p==='/jobs'&&req.method==='POST'){
      const id=crypto.randomBytes(8).toString('hex'),dir=path.join(DATA,'jobs',id);await fs.mkdir(dir,{recursive:true});
      const received=await receive(req,dir);const job={id,dir,input:received.input,images:received.images,name:safe(received.fields.name||path.basename(received.files.find(x=>x.field==='video').sourceName,path.extname(received.files.find(x=>x.field==='video').sourceName))),callbackUrl:received.fields.callbackUrl||null,status:'en cola',createdAt:new Date().toISOString()};
      jobs.set(id,job);await fs.writeFile(path.join(dir,'job.json'),JSON.stringify(job));queue.push(job);pump();return send(res,202,{id,status:job.status,name:job.name});
    }
    const m=p.match(/^\/jobs\/([a-f0-9]{16})(?:\/(result|plan))?$/);
    if(m){let j=jobs.get(m[1]);if(!j){try{j=JSON.parse(await fs.readFile(path.join(DATA,'jobs',m[1],'job.json'),'utf8'));jobs.set(m[1],j);}catch{return send(res,404,{error:'No existe el trabajo'});}}if(req.method==='GET'&&!m[2])return send(res,200,{id:j.id,name:j.name,status:j.status,error:j.error||null,stats:j.stats||null});
      if(req.method==='GET'&&m[2]==='plan'){try{res.writeHead(200,{'content-type':'application/json'});return res.end(await fs.readFile(path.join(j.dir,'plan.json')));}catch{return send(res,409,{error:'El plan aún no está disponible'});}}
      if(req.method==='GET'&&m[2]==='result'&&j.status==='listo'){res.writeHead(200,{'content-type':'video/mp4','content-disposition':`attachment; filename="${j.name}_greenscreen.mp4"`});return fs.createReadStream(path.join(j.dir,'result.mp4')).pipe(res);}
      return send(res,409,{error:'El resultado aún no está disponible'});
    }
    return send(res,404,{error:'Ruta no encontrada'});
  }catch(e){console.error(e);return send(res,400,{error:String(e.message||e).slice(0,500)});}
});
await fs.mkdir(path.join(DATA,'jobs'),{recursive:true});
const retention=Number(process.env.RETENTION_DAYS||7)*86400000;
const prune=async()=>{try{for(const id of await fs.readdir(path.join(DATA,'jobs'))){const dir=path.join(DATA,'jobs',id);const st=await fs.stat(dir);if(Date.now()-st.mtimeMs>retention){await fs.rm(dir,{recursive:true,force:true});jobs.delete(id);}}}catch(e){console.error('limpieza de trabajos falló',e.message);}};
await prune();setInterval(prune,24*60*60*1000).unref();
server.listen(PORT,'0.0.0.0',()=>console.log(`Green Screen engine escuchando en ${PORT}`));
