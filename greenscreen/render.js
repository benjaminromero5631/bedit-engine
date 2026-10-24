import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { keepFromCuts } from '../cuts.js';
import { run, measureLoudnorm } from '../media.js';

const FPS = 30, W = 1080, H = 1920;
const f = (n) => Number(n).toFixed(4);
async function makeMasks(input, dir, keep, duration) {
  const mask = path.join(dir, 'person-mask.mkv');
  const dec = spawn('nice', ['-n','10','ffmpeg','-v','error','-i',input,'-vf',`fps=${FPS},scale=540:960:force_original_aspect_ratio=increase,crop=540:960,setsar=1`,'-f','rawvideo','-pix_fmt','rgb24','pipe:1'], { stdio:['ignore','pipe','pipe'] });
  const seg = spawn('nice', ['-n','10',process.env.PYTHON || 'python3',path.join(path.dirname(new URL(import.meta.url).pathname),'segment.py')], { stdio:['pipe','pipe','pipe'] });
  const intervals = keep.map(k => `between(n,${Math.max(0,Math.round(k.s*FPS))},${Math.max(0,Math.round(k.e*FPS)-1)})`).join('+') || '0';
  const encArgs = ['-y','-v','error','-f','rawvideo','-pixel_format','gray','-video_size','540x960','-framerate',String(FPS),'-i','pipe:0','-vf',`select='${intervals}',setpts=N/(${FPS}*TB)`,'-an','-c:v','ffv1',mask];
  const enc = spawn('ffmpeg',encArgs,{stdio:['pipe','ignore','pipe']});
  let errors=''; for (const p of [dec,seg,enc]) p.stderr.on('data',d=>{errors=(errors+d.toString()).slice(-8000)});
  dec.stdout.pipe(seg.stdin); seg.stdout.pipe(enc.stdin);
  const wait = p => new Promise((resolve,reject)=>{p.on('error',reject);p.on('close',c=>c===0?resolve():reject(new Error(errors.slice(-2500)||`proceso terminó ${c}`)))});
  await Promise.all([wait(dec),wait(seg),wait(enc)]);
  return mask;
}

function cover(ctx, img, x, y, w, h) {
  const r = Math.max(w / img.width, h / img.height), sw = w / r, sh = h / r;
  ctx.drawImage(img, (img.width-sw)/2, (img.height-sh)/2, sw, sh, x, y, w, h);
}

async function prepBackground(images, dir, duration) {
  if (!images.length) throw new Error('Agrega al menos 4 imágenes verticales de fondo.');
  const loaded = await Promise.all(images.map(loadImage));
  const collage = createCanvas(W,H), c = collage.getContext('2d');
  c.fillStyle = '#111'; c.fillRect(0,0,W,H);
  const tiles = [[0,0],[W/2,0],[0,H/2],[W/2,H/2]];
  for (let i=0;i<4;i++) cover(c,loaded[i % loaded.length],tiles[i][0],tiles[i][1],W/2,H/2);
  const first = path.join(dir,'collage.jpg'); await fs.writeFile(first,collage.toBuffer('image/jpeg',{quality:0.92}));
  const intro=Math.min(6,duration), remainder=Math.max(0,duration-intro), bgFiles=[first];
  if(remainder<1/FPS) {
    await run('ffmpeg',['-y','-v','error','-loop','1','-framerate',String(FPS),'-t',f(duration),'-i',first,'-vf',`scale=${W}:${H},setsar=1,fps=${FPS},format=yuv420p`,'-an','-c:v','libx264','-preset','ultrafast','-crf','21','-pix_fmt','yuv420p',path.join(dir,'background.mp4')]);
    return {introSeconds:intro,imageSeconds:0};
  }
  for(let i=0;i<loaded.length;i++){
    const canvas=createCanvas(W,H); cover(canvas.getContext('2d'),loaded[i],0,0,W,H);
    const out=path.join(dir,`bg-${i}.jpg`); await fs.writeFile(out,canvas.toBuffer('image/jpeg',{quality:0.92})); bgFiles.push(out);
  }
  const per=remainder/bgFiles.slice(1).length;
  const args=['-y','-v','error'];
  for(let i=0;i<bgFiles.length;i++) args.push('-loop','1','-framerate',String(FPS),'-t',f(i===0?intro:per),'-i',bgFiles[i]);
  const chains=bgFiles.map((_,i)=>`[${i}:v]fps=${FPS},scale=${W}:${H},setsar=1,format=yuv420p,setpts=PTS-STARTPTS[v${i}]`).join(';');
  args.push('-filter_complex',`${chains};${bgFiles.map((_,i)=>`[v${i}]`).join('')}concat=n=${bgFiles.length}:v=1:a=0[v]`,'-map','[v]','-r',String(FPS),'-t',f(duration),'-c:v','libx264','-preset','ultrafast','-crf','21','-pix_fmt','yuv420p',path.join(dir,'background.mp4'));
  await run('ffmpeg',args);
  return { introSeconds:intro, imageSeconds:per };
}

export async function renderGreenScreen({ input, images, dir, info, plan, musicPath=null }) {
  const { keep, outDuration }=keepFromCuts(plan.cuts,info.duration);
  if(!keep.length || outDuration<0.5) throw new Error('Los cortes dejaron menos de medio segundo de video.');
  const q=keep.map(k=>({s:Math.max(0,Math.round(k.s*FPS)/FPS),e:Math.min(info.duration,Math.round(k.e*FPS)/FPS)})).filter(k=>k.e>k.s);
  const duration=q.reduce((n,k)=>n+k.e-k.s,0);
  const bgInfo=await prepBackground(images,dir,duration);
  const mask=await makeMasks(input,dir,q,info.duration);
  const select=q.map(k=>`between(n,${Math.round(k.s*FPS)},${Math.round(k.e*FPS)-1})`).join('+');
  const sourceParts=`[0:v]split=${q.length}${q.map((_,i)=>`[src${i}]`).join('')};`+q.map((k,i)=>`[src${i}]trim=start=${f(k.s)}:end=${f(k.e)},setpts=PTS-STARTPTS,fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[v${i}]`).join(';');
  const maskParts=`[1:v]split=${q.length}${q.map((_,i)=>`[msrc${i}]`).join('')};`+q.map((k,i)=>`[msrc${i}]trim=start=${f(q.slice(0,i).reduce((n,x)=>n+x.e-x.s,0))}:duration=${f(k.e-k.s)},setpts=PTS-STARTPTS,fps=${FPS},scale=${W}:${H},format=gray[ma${i}]`).join(';');
  // Masks are already cut and concatenated by makeMasks; one continuous alpha stream is enough.
  const segs=q.map((_,i)=>`[v${i}][ma${i}]alphamerge[fg${i}]`);
  const concatVideo=`${q.map((_,i)=>`[fg${i}]`).join('')}concat=n=${q.length}:v=1:a=0[person]`;
  const graph=`${sourceParts};${maskParts};${segs.join(';')};${concatVideo};[2:v][person]overlay=0:0:shortest=1,format=yuv420p[vout]`;
  const render=path.join(dir,'draft.mp4');
  const args=['-y','-v','error','-i',input,'-i',mask,'-i',path.join(dir,'background.mp4'),'-filter_complex',graph,'-map','[vout]','-an','-r',String(FPS),'-c:v','libx264','-preset',process.env.X264_PRESET||'veryfast','-crf',process.env.X264_CRF||'19','-pix_fmt','yuv420p','-movflags','+faststart',render];
  await run('ffmpeg',args);
  const audioArgs=['-y','-v','error','-i',input];
  const slices=`[0:a]asplit=${q.length}${q.map((_,i)=>`[aud${i}]`).join('')};`+q.map((k,i)=>`[aud${i}]atrim=start=${f(k.s)}:end=${f(k.e)},asetpts=PTS-STARTPTS${i?`,afade=t=in:st=0:d=0.006`:''}${i<q.length-1?`,afade=t=out:st=${f(Math.max(0,k.e-k.s-0.006))}:d=0.006`:''}[a${i}]`).join(';');
  let audioGraph=`${slices};${q.map((_,i)=>`[a${i}]`).join('')}concat=n=${q.length}:v=0:a=1,aresample=48000,acompressor=threshold=0.0501:ratio=3:attack=5:release=150:makeup=1[voice]`;
  let musicIndex=-1;
  if(musicPath){musicIndex=1;audioArgs.push('-stream_loop','-1','-i',musicPath);const mm=await measureLoudnorm(musicPath);const gain=Math.max(-30,Math.min(30,-29-Number(mm.input_i)));audioGraph+=`;[${musicIndex}:a]aresample=48000,atrim=duration=${f(duration)},asetpts=PTS-STARTPTS,volume=${gain}dB,afade=t=in:st=0:d=0.05,afade=t=out:st=${f(Math.max(0,duration-1))}:d=1[m];[voice][m]amix=inputs=2:duration=first:dropout_transition=0,alimiter=limit=0.89,loudnorm=I=-14:TP=-1:LRA=11[aout]`;}else audioGraph+=';[voice]loudnorm=I=-14:TP=-1:LRA=11[aout]';
  audioArgs.push('-filter_complex',audioGraph,'-map','[aout]','-ar','48000','-c:a','aac','-b:a','192k',path.join(dir,'audio.m4a'));
  await run('ffmpeg',audioArgs);
  await run('ffmpeg',['-y','-v','error','-i',render,'-i',path.join(dir,'audio.m4a'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','copy','-movflags','+faststart',path.join(dir,'result.mp4')]);
  return { duration, sourceDuration:info.duration, removedSeconds:Math.max(0,info.duration-duration), cuts:q.length-1, images:images.length, imageSeconds:bgInfo.imageSeconds, introSeconds:bgInfo.introSeconds };
}
