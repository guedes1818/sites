import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as Tone from "tone";
import {
  Zap, Layers, Brain, Music2, Mic2, ArrowRight,
  Wand2, ChevronDown, Play, Save, Trash2,
  BookOpen, LogOut, Check, AlertCircle, Loader, Mail,
} from "lucide-react";

/* ══════════════════════════════════════════════════════════════════
   MUSIC THEORY
══════════════════════════════════════════════════════════════════ */
const NOTES       = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const WHITE_NOTES = [0,2,4,5,7,9,11];
const BLACK_POS   = { 1:0.635, 3:1.635, 6:3.635, 8:4.635, 10:5.635 };

const SCALES = {
  'Maior':             [0,2,4,5,7,9,11],
  'Menor Natural':     [0,2,3,5,7,8,10],
  'Menor Harmônica':   [0,2,3,5,7,8,11],
  'Dórica':            [0,2,3,5,7,9,10],
  'Frígia':            [0,1,3,5,7,8,10],
  'Lídia':             [0,2,4,6,7,9,11],
  'Mixolídia':         [0,2,4,5,7,9,10],
  'Pentatônica Maior': [0,2,4,7,9],
  'Pentatônica Menor': [0,3,5,7,10],
  'Blues':             [0,3,5,6,7,10],
};
const SCALE_MOOD = {
  'Maior':             ['#4ade80','Alegre, expansivo','Pop · Sertanejo · Gospel'],
  'Menor Natural':     ['#60a5fa','Melancólico, introspectivo','MPB · Rock · Baladas'],
  'Menor Harmônica':   ['#f87171','Dramático, exótico','Clássico · Flamenco · Metal'],
  'Dórica':            ['#34d399','Groovy, funky','Jazz · Blues · Soul'],
  'Frígia':            ['#f97316','Tenso, misterioso','Metal · Flamenco · Ambient'],
  'Lídia':             ['#a78bfa','Etéreo, onírico','Trilhas · Jazz · New Age'],
  'Mixolídia':         ['#fbbf24','Bluesy, solar','Blues · Folk · Rock'],
  'Pentatônica Maior': ['#38bdf8','Universal, aberto','Pop · Folk · Country'],
  'Pentatônica Menor': ['#fb7185','Expressivo, gritante','Rock · Blues · R&B'],
  'Blues':             ['#c084fc','Sujo, expressivo','Blues · Jazz · Rock'],
};
const QUALITIES = {
  '4,7':{sym:'', name:'Maior',  clr:'#4ade80'},
  '3,7':{sym:'m',name:'Menor',  clr:'#60a5fa'},
  '3,6':{sym:'°',name:'Dimin.', clr:'#f87171'},
  '4,8':{sym:'+',name:'Aument.',clr:'#fbbf24'},
};

function midi2tone(m){ return NOTES[m%12]+(Math.floor(m/12)-1); }

function buildHField(root, name){
  const ivs=SCALES[name]; if(!ivs||ivs.length<7) return null;
  const RN=['I','II','III','IV','V','VI','VII'];
  return ivs.map((iv,i)=>{
    const cr=(root+iv)%12;
    let th=(ivs[(i+2)%7]-iv+12)%12; if(!th) th=12;
    let fi=(ivs[(i+4)%7]-iv+12)%12; if(!fi) fi=12;
    if(fi<th) fi+=12;
    const q=QUALITIES[`${th},${fi}`]||{sym:'?',name:'?',clr:'#94a3b8'};
    const roman=(q.sym==='m'||q.sym==='°')
      ? RN[i].toLowerCase()+(q.sym==='°'?'°':'')
      : RN[i]+(q.sym==='+'?'+':'');
    const rm=60+root+iv;
    return{i,rootName:NOTES[cr],q,roman,
      midi:[rm,rm+th,rm+fi],
      notes:[NOTES[cr],NOTES[(cr+th)%12],NOTES[(cr+fi)%12]]};
  });
}

/* ══════════════════════════════════════════════════════════════════
   CSS
══════════════════════════════════════════════════════════════════ */
const CSS=`
*{box-sizing:border-box;margin:0;padding:0}
@keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
@keyframes blink{0%,100%{opacity:.2;transform:scale(.7)}50%{opacity:1;transform:scale(1.2)}}
@keyframes drift{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
@keyframes shimmer{0%{background-position:200% center}100%{background-position:-200% center}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes gridOn{from{opacity:0}to{opacity:.35}}
@keyframes slideIn{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:translateX(0)}}
input:focus,select:focus,textarea:focus{outline:none}
button{font-family:inherit}
select option{background:#0d0e1a}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px}
.au{animation:fadeUp .65s ease both}
.d1{animation-delay:.06s}.d2{animation-delay:.18s}.d3{animation-delay:.32s}
.d4{animation-delay:.46s}.d5{animation-delay:.62s}.d6{animation-delay:.8s}
.spin{animation:spin 1s linear infinite}
.gcard:hover{transform:translateY(-4px)!important;border-color:rgba(255,255,255,0.14)!important}
.chord-pill{transition:all .22s}
.chord-pill:hover{transform:translateY(-3px) scale(1.04)}
.prog-row:hover{background:rgba(255,255,255,0.06)!important}
`;

/* ══════════════════════════════════════════════════════════════════
   FLOW FIELD
══════════════════════════════════════════════════════════════════ */
function FlowField({color='#818cf8',trailOpacity=0.12,particleCount=480,speed=0.85}){
  const cvs=useRef(null), ct=useRef(null);
  useEffect(()=>{
    const canvas=cvs.current, cont=ct.current; if(!canvas||!cont) return;
    const ctx=canvas.getContext('2d'); if(!ctx) return;
    let W=cont.clientWidth, H=cont.clientHeight, particles=[], raf;
    let mouse={x:-9e3,y:-9e3};
    class P{
      constructor(){this.reset(true);}
      reset(init=false){
        this.x=Math.random()*W; this.y=Math.random()*H;
        this.vx=0; this.vy=0; this.age=init?Math.random()*200:0;
        this.life=Math.random()*220+80;
      }
      update(){
        const a=(Math.cos(this.x*.0045)+Math.sin(this.y*.0045))*Math.PI*1.2;
        this.vx+=Math.cos(a)*.18*speed; this.vy+=Math.sin(a)*.18*speed;
        const dx=mouse.x-this.x, dy=mouse.y-this.y, d=Math.sqrt(dx*dx+dy*dy);
        if(d<160){const f=(160-d)/160;this.vx-=dx*f*.055;this.vy-=dy*f*.055;}
        this.x+=this.vx; this.y+=this.vy; this.vx*=.94; this.vy*=.94;
        if(++this.age>this.life) this.reset();
        if(this.x<0)this.x=W; if(this.x>W)this.x=0;
        if(this.y<0)this.y=H; if(this.y>H)this.y=0;
      }
      draw(c){c.globalAlpha=Math.max(0,1-Math.abs(this.age/this.life-.5)*2)*.85;c.fillStyle=color;c.fillRect(this.x,this.y,1.6,1.6);}
    }
    const init=()=>{
      const dpr=window.devicePixelRatio||1;
      canvas.width=W*dpr; canvas.height=H*dpr; ctx.scale(dpr,dpr);
      canvas.style.width=W+'px'; canvas.style.height=H+'px';
      particles=Array.from({length:particleCount},()=>new P());
    };
    const tick=()=>{
      ctx.fillStyle=`rgba(0,0,0,${trailOpacity})`; ctx.fillRect(0,0,W,H);
      particles.forEach(p=>{p.update();p.draw(ctx);}); raf=requestAnimationFrame(tick);
    };
    const onResize=()=>{W=cont.clientWidth;H=cont.clientHeight;init();};
    const onMove=e=>{const r=canvas.getBoundingClientRect();mouse.x=e.clientX-r.left;mouse.y=e.clientY-r.top;};
    const onLeave=()=>{mouse.x=-9e3;mouse.y=-9e3;};
    init(); tick();
    window.addEventListener('resize',onResize);
    cont.addEventListener('mousemove',onMove);
    cont.addEventListener('mouseleave',onLeave);
    return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',onResize);};
  },[color,trailOpacity,particleCount,speed]);
  return(
    <div ref={ct} style={{position:'absolute',inset:0,overflow:'hidden',background:'#000'}}>
      <canvas ref={cvs} style={{display:'block',width:'100%',height:'100%'}}/>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   GRADIENT NAV
══════════════════════════════════════════════════════════════════ */
function GradientNav({items,active,onChange}){
  return(
    <ul style={{display:'flex',gap:10,flexWrap:'wrap',listStyle:'none',padding:'4px 0'}}>
      {items.map(({id,label,icon:Icon,from,to})=>{
        const sel=active===id;
        return(
          <li key={id} onClick={()=>onChange(id)} style={{
            position:'relative',height:44,
            minWidth:sel?140:44,width:sel?'auto':44,
            background:'rgba(255,255,255,0.06)',borderRadius:22,
            display:'flex',alignItems:'center',justifyContent:'center',
            cursor:'pointer',overflow:'hidden',flexShrink:0,
            transition:'all .45s cubic-bezier(.34,1.56,.64,1)',
            boxShadow:sel?`0 4px 20px ${from}45`:'0 2px 8px rgba(0,0,0,.4)',
          }}>
            <span style={{position:'absolute',inset:0,borderRadius:22,
              background:`linear-gradient(45deg,${from},${to})`,
              opacity:sel?1:0,transition:'opacity .4s'}}/>
            <span style={{position:'absolute',top:6,inset:'0 0',height:'100%',
              background:`linear-gradient(45deg,${from},${to})`,
              filter:'blur(14px)',opacity:sel?.5:0,zIndex:-1,transition:'opacity .4s'}}/>
            <span style={{position:'absolute',zIndex:2,
              display:'flex',alignItems:'center',justifyContent:'center',
              transform:sel?'scale(0)':'scale(1)',
              transition:'transform .32s',transitionDelay:sel?'0ms':'100ms'}}>
              <Icon size={18} style={{color:sel?'#fff':'rgba(255,255,255,0.45)',strokeWidth:1.6}}/>
            </span>
            <span style={{position:'relative',zIndex:2,
              fontSize:13,fontWeight:700,color:'#fff',letterSpacing:.2,
              transform:sel?'scale(1)':'scale(0)',
              transition:'transform .32s',transitionDelay:sel?'100ms':'0ms',
              whiteSpace:'nowrap',padding:'0 18px'}}>
              {label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ══════════════════════════════════════════════════════════════════
   GRID BG + FEAT CARD
══════════════════════════════════════════════════════════════════ */
function GridBg(){
  const id=useMemo(()=>'g'+Math.random().toString(36).slice(2),[]);
  const sq=useMemo(()=>Array.from({length:6},()=>[Math.floor(Math.random()*5)+6,Math.floor(Math.random()*7)+1]),[]);
  return(
    <svg aria-hidden style={{position:'absolute',inset:0,width:'100%',height:'100%',
      pointerEvents:'none',opacity:0,animation:'gridOn .6s ease .2s forwards'}}>
      <defs>
        <pattern id={id} width={20} height={20} patternUnits="userSpaceOnUse" x="-10" y="4">
          <path d="M.5 20V.5H20" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth=".5"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
      <svg x="-10" y="4" style={{overflow:'visible'}}>
        {sq.map(([sx,sy],i)=>(
          <rect key={i} width={21} height={21} x={sx*20} y={sy*20} fill="rgba(0,212,255,0.14)" strokeWidth="0"/>
        ))}
      </svg>
    </svg>
  );
}
function FeatCard({Icon,title,desc,accentColor,delay}){
  return(
    <div className={`au d${delay} gcard`} style={{
      position:'relative',overflow:'hidden',padding:'28px 22px',
      background:'linear-gradient(145deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))',
      border:'1px solid rgba(255,255,255,0.08)',borderRadius:16,
      transition:'transform .3s,border-color .3s,box-shadow .3s',
    }}>
      <div style={{position:'absolute',top:0,left:'30%',width:'120%',height:'100%',
        WebkitMaskImage:'linear-gradient(white,transparent)',maskImage:'linear-gradient(white,transparent)',
        pointerEvents:'none'}}><GridBg/></div>
      <div style={{width:40,height:40,borderRadius:10,
        background:`linear-gradient(135deg,${accentColor}30,${accentColor}10)`,
        border:`1px solid ${accentColor}40`,
        display:'flex',alignItems:'center',justifyContent:'center',
        position:'relative',zIndex:1,marginBottom:6}}>
        <Icon size={20} strokeWidth={1.5} style={{color:accentColor}}/>
      </div>
      <div style={{marginTop:32,fontSize:14,fontWeight:700,color:'#f1f5f9',position:'relative',zIndex:1}}>{title}</div>
      <div style={{marginTop:8,fontSize:12,color:'#4b5563',lineHeight:1.75,position:'relative',zIndex:1}}>{desc}</div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════════════════════ */
function Toast({msg,type='success',onDone}){
  useEffect(()=>{const t=setTimeout(onDone,3000);return()=>clearTimeout(t);},[]);
  const clr={success:'#4ade80',error:'#f87171',info:'#60a5fa'}[type];
  return(
    <div style={{position:'fixed',bottom:24,right:24,zIndex:999,
      display:'flex',alignItems:'center',gap:10,padding:'11px 18px',borderRadius:12,
      background:'rgba(9,10,18,0.96)',border:`1px solid ${clr}50`,
      boxShadow:`0 4px 24px ${clr}25`,animation:'slideIn .3s ease',
      fontSize:13,color:'#f1f5f9',maxWidth:320}}>
      {type==='success'&&<Check size={15} style={{color:'#4ade80',flexShrink:0}}/>}
      {type==='error'&&<AlertCircle size={15} style={{color:'#f87171',flexShrink:0}}/>}
      <span>{msg}</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   HEADER
══════════════════════════════════════════════════════════════════ */
function Header({onSignIn,onStudio,scrolled,user,onLogout}){
  return(
    <header style={{
      position:'fixed',top:0,left:0,right:0,zIndex:200,
      background:scrolled?'rgba(9,10,18,0.9)':'transparent',
      backdropFilter:scrolled?'blur(20px)':'none',
      borderBottom:scrolled?'1px solid rgba(255,255,255,0.06)':'1px solid transparent',
      transition:'all .35s',
    }}>
      <div style={{maxWidth:1140,margin:'0 auto',height:60,
        display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 24px'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:32,height:32,borderRadius:'50%',
            background:'linear-gradient(135deg,#00d4ff,#8b5cf6)',
            display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,
            boxShadow:'0 0 18px rgba(0,212,255,0.4)'}}>🎵</div>
          <span style={{fontWeight:900,fontSize:18,letterSpacing:-.6,
            background:'linear-gradient(90deg,#00d4ff,#8b5cf6)',
            WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>PulseLab</span>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {user?(
            <>
              <span style={{fontSize:12,color:'#4b5563',display:'flex',alignItems:'center',gap:6}}>
                <div style={{width:7,height:7,borderRadius:'50%',background:'#4ade80',boxShadow:'0 0 8px #4ade80'}}/>
                {user.name}
              </span>
              <button onClick={onStudio} style={{padding:'8px 18px',borderRadius:9,fontSize:13,fontWeight:700,
                background:'linear-gradient(135deg,rgba(0,212,255,0.14),rgba(139,92,246,0.18))',
                border:'1px solid rgba(0,212,255,0.32)',color:'#00d4ff'}}>Estúdio →</button>
              <button onClick={onLogout} title="Sair" style={{width:36,height:36,borderRadius:9,
                border:'1px solid rgba(255,255,255,0.08)',background:'rgba(255,255,255,0.04)',
                color:'#4b5563',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <LogOut size={14}/>
              </button>
            </>
          ):(
            <>
              <button onClick={onSignIn} style={{padding:'8px 18px',borderRadius:9,fontSize:13,
                background:'transparent',border:'1px solid rgba(255,255,255,0.1)',color:'#6b7280'}}>Entrar</button>
              <button onClick={onStudio} style={{padding:'8px 20px',borderRadius:9,fontSize:13,fontWeight:700,
                background:'linear-gradient(135deg,rgba(0,212,255,0.14),rgba(139,92,246,0.18))',
                border:'1px solid rgba(0,212,255,0.32)',color:'#00d4ff'}}>Estúdio →</button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/* ══════════════════════════════════════════════════════════════════
   SIGN-IN
══════════════════════════════════════════════════════════════════ */
function SignIn({onSuccess,onBack}){
  const [step,setStep]=useState('email');
  const [email,setEmail]=useState('');
  const [code,setCode]=useState(['','','','','','']);
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState('');
  const refs=useRef([]);

  const sendCode=async e=>{
    e.preventDefault(); if(!email) return;
    setBusy(true); setErr('');
    await new Promise(r=>setTimeout(r,800));
    setBusy(false); setStep('code');
    setTimeout(()=>refs.current[0]?.focus(),300);
  };

  const changeCode=(i,v)=>{
    if(/[^0-9]/.test(v)&&v!=='') return;
    if(v.length>1) return;
    const nc=[...code]; nc[i]=v; setCode(nc); setErr('');
    if(v&&i<5) refs.current[i+1]?.focus();
    if(i===5&&v&&nc.every(d=>d)){
      setBusy(true);
      setTimeout(()=>{
        const u={id:'u'+Date.now(),email,name:email.split('@')[0]};
        localStorage.setItem('pl_user',JSON.stringify(u));
        setStep('success');
        setTimeout(()=>onSuccess(u),1100);
      },600);
    }
  };
  const keyDown=(i,e)=>{if(e.key==='Backspace'&&!code[i]&&i>0) refs.current[i-1]?.focus();};

  const panel={background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.1)',
    borderRadius:20,padding:'36px 32px',textAlign:'center',backdropFilter:'blur(20px)'};

  return(
    <div style={{position:'fixed',inset:0,zIndex:300,
      display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <FlowField color={step==='success'?'#00d4ff':'#818cf8'} trailOpacity={.1} particleCount={360} speed={.75}/>
      <div style={{position:'absolute',inset:0,zIndex:1,
        background:'radial-gradient(ellipse 55% 55% at 50% 50%,rgba(9,10,18,.3) 0%,rgba(9,10,18,.97) 70%)'}}/>
      <div style={{position:'relative',zIndex:2,width:'100%',maxWidth:360}}>
        <button onClick={onBack} style={{position:'absolute',top:-50,left:0,
          background:'none',border:'none',color:'#4b5563',fontSize:13,cursor:'pointer',
          display:'flex',alignItems:'center',gap:5}}>← Voltar</button>

        {step==='email'&&(
          <div className="au" style={panel}>
            <div style={{width:56,height:56,borderRadius:'50%',margin:'0 auto 22px',
              background:'linear-gradient(135deg,rgba(0,212,255,0.2),rgba(139,92,246,0.2))',
              border:'1px solid rgba(0,212,255,0.3)',
              display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,
              boxShadow:'0 0 30px rgba(0,212,255,0.2)'}}>🎵</div>
            <h2 style={{fontSize:24,fontWeight:900,color:'#f1f5f9',marginBottom:5,letterSpacing:-.5}}>Bem-vindo de volta</h2>
            <p style={{fontSize:13,color:'#4b5563',marginBottom:28}}>Acesse seu estúdio musical</p>
            <form onSubmit={sendCode}>
              <div style={{position:'relative',marginBottom:12}}>
                <Mail size={14} style={{position:'absolute',left:14,top:'50%',
                  transform:'translateY(-50%)',color:'#374151',pointerEvents:'none'}}/>
                <input type="email" placeholder="seu@email.com" value={email}
                  onChange={e=>{setEmail(e.target.value);setErr('');}} required
                  style={{width:'100%',padding:'12px 14px 12px 36px',
                    background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',
                    borderRadius:40,color:'#e2e8f0',fontSize:14,textAlign:'center'}}
                  onFocus={e=>e.target.style.borderColor='rgba(0,212,255,0.5)'}
                  onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.1)'}/>
              </div>
              <button type="submit" disabled={busy} style={{
                width:'100%',padding:'12px',borderRadius:40,cursor:busy?'not-allowed':'pointer',
                background:'linear-gradient(135deg,rgba(0,212,255,0.22),rgba(139,92,246,0.28))',
                border:'1px solid rgba(0,212,255,0.38)',color:'#00d4ff',fontSize:14,fontWeight:700,
                display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                {busy&&<Loader size={14} className="spin"/>}
                {busy?'Enviando…':'Enviar código →'}
              </button>
            </form>
          </div>
        )}

        {step==='code'&&(
          <div className="au" style={panel}>
            <h2 style={{fontSize:22,fontWeight:900,color:'#f1f5f9',marginBottom:4,letterSpacing:-.5}}>Código enviado</h2>
            <p style={{fontSize:13,color:'#4b5563',marginBottom:6}}>Verifique <span style={{color:'#94a3b8'}}>{email}</span></p>
            <p style={{fontSize:11,color:'#2d3344',marginBottom:20}}>(Demo: qualquer 6 dígitos funciona)</p>
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:5,
              padding:'14px 18px',borderRadius:40,marginBottom:20,
              background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)'}}>
              {code.map((d,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:3}}>
                  <div style={{position:'relative',width:32}}>
                    <input ref={el=>refs.current[i]=el}
                      type="text" inputMode="numeric" maxLength={1} value={d}
                      onChange={e=>changeCode(i,e.target.value)}
                      onKeyDown={e=>keyDown(i,e)} disabled={busy}
                      style={{width:'100%',textAlign:'center',fontSize:22,fontWeight:700,
                        background:'transparent',border:'none',color:'#f1f5f9',caretColor:'transparent'}}/>
                    {!d&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',
                      justifyContent:'center',color:'rgba(255,255,255,0.08)',fontSize:20,pointerEvents:'none'}}>—</div>}
                  </div>
                  {i<5&&<span style={{color:'rgba(255,255,255,0.07)',fontSize:16}}>|</span>}
                </div>
              ))}
            </div>
            {busy&&<div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,
              fontSize:13,color:'#4b5563',marginBottom:12}}>
              <Loader size={14} className="spin" style={{color:'#60a5fa'}}/>Verificando…
            </div>}
            <button onClick={()=>{setStep('email');setCode(['','','','','','']);}} style={{
              background:'none',border:'none',color:'#4b5563',fontSize:12,cursor:'pointer',textDecoration:'underline'}}>
              ← Voltar ao e-mail
            </button>
          </div>
        )}

        {step==='success'&&(
          <div className="au" style={{...panel,borderColor:'rgba(0,212,255,0.2)',boxShadow:'0 0 60px rgba(0,212,255,0.15)'}}>
            <div style={{width:72,height:72,borderRadius:'50%',margin:'0 auto 22px',
              background:'linear-gradient(135deg,#00d4ff,#8b5cf6)',
              display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,
              animation:'drift 2.5s ease-in-out infinite',boxShadow:'0 0 40px rgba(0,212,255,0.45)'}}>✓</div>
            <h2 style={{fontSize:28,fontWeight:900,color:'#f1f5f9',marginBottom:6,letterSpacing:-.5}}>Você entrou!</h2>
            <p style={{fontSize:14,color:'#4b5563'}}>Redirecionando para o Estúdio…</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   PIANO KEYBOARD
══════════════════════════════════════════════════════════════════ */
const WW=44,WH=136,BW=26,BH=86;
function PianoKeyboard({scaleSet,chordNoteSet,playMidi}){
  const [pressed,setPressed]=useState(new Set());
  const press=useCallback((midi)=>{
    setPressed(p=>new Set([...p,midi]));
    playMidi([midi]);
    setTimeout(()=>setPressed(p=>{const s=new Set(p);s.delete(midi);return s;}),280);
  },[playMidi]);

  const keys=[];
  [3,4].forEach((oct,oi)=>{
    WHITE_NOTES.forEach((ni,wi)=>{
      const x=oi*7*WW+wi*WW, midi=(oct+1)*12+ni;
      const iC=chordNoteSet?.has(ni), iS=scaleSet.has(ni), iP=pressed.has(midi);
      keys.push(
        <div key={`w${midi}`} onPointerDown={()=>press(midi)} style={{
          position:'absolute',left:x,top:0,width:WW-2,height:WH,
          background:iP?'#a5f3fc':iC?'linear-gradient(180deg,#c4b5fd,#ddd6fe)':iS?'linear-gradient(180deg,#bae6fd,#e0f2fe)':'linear-gradient(180deg,#f8fafc,#e8edf2)',
          border:iC?'1px solid #a78bfa':iS?'1px solid #7dd3fc':'1px solid #cbd5e1',
          borderRadius:'0 0 8px 8px',cursor:'pointer',
          display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-end',paddingBottom:7,
          boxShadow:iP?'0 0 18px #67e8f9,inset 0 -4px 0 rgba(0,0,0,.1)':iC?'0 0 18px rgba(167,139,250,0.6),inset 0 -4px 0 rgba(0,0,0,.08)':iS?'0 0 12px rgba(125,211,252,0.5),inset 0 -4px 0 rgba(0,0,0,.06)':'inset 0 -4px 0 rgba(0,0,0,.06)',
          zIndex:1,userSelect:'none',transition:'background .12s,box-shadow .12s',
        }}>
          <div style={{fontSize:10,fontWeight:800,color:iC?'#5b21b6':iS?'#0369a1':'#94a3b8'}}>
            {(iS||iC)?NOTES[ni]:(ni===0?NOTES[ni]:'')}
          </div>
          {ni===0&&<div style={{fontSize:8,color:'#94a3b8',marginTop:1}}>{oct+1}</div>}
        </div>
      );
    });
    Object.entries(BLACK_POS).forEach(([s,rel])=>{
      const ni=+s, x=oi*7*WW+rel*WW-BW/2, midi=(oct+1)*12+ni;
      const iC=chordNoteSet?.has(ni), iS=scaleSet.has(ni), iP=pressed.has(midi);
      keys.push(
        <div key={`b${midi}`} onPointerDown={e=>{e.stopPropagation();press(midi);}} style={{
          position:'absolute',left:x,top:0,width:BW,height:BH,
          background:iP?'#06b6d4':iC?'linear-gradient(180deg,#7c3aed,#5b21b6)':iS?'linear-gradient(180deg,#0e7490,#155e75)':'linear-gradient(180deg,#1e293b,#0f172a)',
          borderRadius:'0 0 6px 6px',cursor:'pointer',zIndex:3,userSelect:'none',
          boxShadow:iP?'0 0 18px #22d3ee':iC?'0 0 14px rgba(124,58,237,0.8),0 4px 8px rgba(0,0,0,.5)':iS?'0 0 10px rgba(14,116,144,0.7),0 4px 8px rgba(0,0,0,.5)':'0 4px 8px rgba(0,0,0,.6)',
          transition:'background .1s,box-shadow .1s',
        }}/>
      );
    });
  });
  const hcMidi=72,hcC=chordNoteSet?.has(0),hcS=scaleSet.has(0),hcP=pressed.has(hcMidi);
  keys.push(
    <div key="hc" onPointerDown={()=>press(hcMidi)} style={{
      position:'absolute',left:2*7*WW,top:0,width:WW-2,height:WH,
      background:hcP?'#a5f3fc':hcC?'linear-gradient(180deg,#c4b5fd,#ddd6fe)':hcS?'linear-gradient(180deg,#bae6fd,#e0f2fe)':'linear-gradient(180deg,#f8fafc,#e8edf2)',
      border:hcC?'1px solid #a78bfa':hcS?'1px solid #7dd3fc':'1px solid #cbd5e1',
      borderRadius:'0 0 8px 8px',cursor:'pointer',
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-end',paddingBottom:7,
      zIndex:1,userSelect:'none',transition:'background .12s',
    }}>
      <div style={{fontSize:10,fontWeight:800,color:hcC?'#5b21b6':hcS?'#0369a1':'#94a3b8'}}>C</div>
      <div style={{fontSize:8,color:'#94a3b8',marginTop:1}}>5</div>
    </div>
  );
  return(
    <div style={{display:'flex',justifyContent:'center',padding:'6px 0 16px'}}>
      <div style={{background:'linear-gradient(180deg,#1e293b,#0f172a)',borderRadius:14,padding:'14px 14px 0',
        boxShadow:'0 8px 32px rgba(0,0,0,.8),inset 0 1px 0 rgba(255,255,255,.06)',
        border:'1px solid rgba(255,255,255,0.07)',maxWidth:'100%',overflow:'hidden'}}>
        <div style={{overflowX:'auto',paddingBottom:14}}>
          <div style={{position:'relative',width:2*7*WW+WW,height:WH,minWidth:2*7*WW+WW}}>
            {keys}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   COMPOSITIONS PANEL
══════════════════════════════════════════════════════════════════ */
function CompositionsPanel({onLoad,onClose}){
  const [list,setList]=useState(()=>{
    try{ return JSON.parse(localStorage.getItem('pl_compositions')||'[]'); }
    catch{ return []; }
  });
  const del=id=>{
    const u=list.filter(c=>c.id!==id);
    setList(u); localStorage.setItem('pl_compositions',JSON.stringify(u));
  };
  return(
    <div style={{position:'fixed',inset:0,zIndex:400,
      background:'rgba(0,0,0,0.7)',backdropFilter:'blur(8px)',
      display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{width:'100%',maxWidth:540,maxHeight:'80vh',
        background:'#0d0e1a',border:'1px solid rgba(255,255,255,0.1)',
        borderRadius:18,overflow:'hidden',display:'flex',flexDirection:'column'}}>
        <div style={{padding:'18px 22px',borderBottom:'1px solid rgba(255,255,255,0.07)',
          display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <span style={{fontSize:15,fontWeight:700,color:'#f1f5f9'}}>📖 Minhas Composições</span>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#4b5563',fontSize:20,cursor:'pointer'}}>✕</button>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:12}}>
          {list.length===0&&(
            <div style={{textAlign:'center',padding:40,color:'#374151'}}>
              <div style={{fontSize:32,marginBottom:10}}>🎵</div>
              <p style={{fontSize:14}}>Nenhuma composição salva ainda.</p>
            </div>
          )}
          {list.map(c=>(
            <div key={c.id} style={{padding:'12px 14px',marginBottom:6,borderRadius:10,
              background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10}}>
                <div style={{flex:1,cursor:'pointer'}} onClick={()=>{onLoad(c);onClose();}}>
                  <div style={{fontWeight:700,fontSize:14,color:'#e2e8f0',marginBottom:3}}>{c.title}</div>
                  <div style={{fontSize:11,color:'#374151',display:'flex',gap:8,flexWrap:'wrap'}}>
                    <span style={{color:'#60a5fa'}}>{c.rootNote} {c.scale}</span>
                    {c.estilo&&<span>· {c.estilo}</span>}
                    <span>· {new Date(c.updatedAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
                <button onClick={()=>del(c.id)} style={{background:'rgba(248,113,113,0.08)',
                  border:'1px solid rgba(248,113,113,0.2)',borderRadius:7,padding:'4px 8px',
                  cursor:'pointer',color:'#f87171',display:'flex',alignItems:'center',gap:4,fontSize:11}}>
                  <Trash2 size={12}/>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   STUDIO
══════════════════════════════════════════════════════════════════ */
const NAV_ITEMS=[
  {id:'scales',  label:'Escalas & Acordes',icon:Music2,from:'#00d4ff',to:'#0ea5e9'},
  {id:'harmonic',label:'Campo Harmônico',   icon:Layers,from:'#8b5cf6',to:'#a78bfa'},
  {id:'lyrics',  label:'IA Letras',         icon:Wand2, from:'#f97316',to:'#fb923c'},
];

function Studio({user}){
  const [tab,setTab]=useState('scales');
  const [root,setRoot]=useState(0);
  const [scale,setScale]=useState('Maior');
  const [selChord,setSelChord]=useState(null);
  const [instr,setInstr]=useState('piano');
  const [playing,setPlaying]=useState(false);
  // Chat
  const [msgs,setMsgs]=useState([]);
  const [input,setInput]=useState('');
  const [tema,setTema]=useState('');
  const [estilo,setEstilo]=useState('');
  const [aiLoading,setAiLoading]=useState(false);
  // Compositions
  const [showComps,setShowComps]=useState(false);
  const [savingTitle,setSavingTitle]=useState('');
  const [showSave,setShowSave]=useState(false);
  const [lastLyrics,setLastLyrics]=useState('');
  const [toast,setToast]=useState(null);
  // Synth
  const synthRef=useRef(null),fxRef=useRef(null),chatEnd=useRef(null);

  const scaleNotes=useMemo(()=>SCALES[scale].map(i=>(root+i)%12),[root,scale]);
  const hField=useMemo(()=>buildHField(root,scale),[root,scale]);
  const scaleSet=useMemo(()=>new Set(scaleNotes),[scaleNotes]);
  const chordNoteSet=useMemo(()=>selChord?new Set(selChord.notes.map(n=>NOTES.indexOf(n))):null,[selChord]);
  const [moodColor,moodVibes,moodGenre]=SCALE_MOOD[scale]||['#00d4ff','',''];
  const harmStr=useMemo(()=>hField?hField.map(c=>`${c.roman}(${c.rootName}${c.q.sym})`).join(' '):'N/A',[hField]);

  // ── Audio ────────────────────────────────────────────────────────
  const initAudio=useCallback(async()=>{
    await Tone.start(); if(synthRef.current) return;
    const oMap={piano:'triangle8',violao:'sawtooth4',synth:'square'};
    const aMap={piano:.02,violao:.06,synth:.01};
    const rMap={piano:2.2,violao:1,synth:.45};
    fxRef.current=new Tone.Reverb({decay:2.8,wet:.3}).toDestination();
    synthRef.current=new Tone.PolySynth(Tone.Synth,{
      oscillator:{type:oMap[instr]},
      envelope:{attack:aMap[instr],decay:.4,sustain:.25,release:rMap[instr]},
      volume:-9,
    }).connect(fxRef.current);
  },[instr]);

  useEffect(()=>{
    if(synthRef.current){synthRef.current.dispose();synthRef.current=null;}
    if(fxRef.current){fxRef.current.dispose();fxRef.current=null;}
  },[instr]);

  const playMidi=useCallback(async(midis,stagger=false)=>{
    await initAudio(); const s=synthRef.current; if(!s) return;
    const now=Tone.now();
    if(stagger) midis.forEach((m,i)=>s.triggerAttackRelease(midi2tone(m),'4n',now+i*0.26));
    else s.triggerAttackRelease(midis.map(midi2tone),'2n',now);
  },[initAudio]);

  const playScale=useCallback(async()=>{
    if(playing) return; setPlaying(true);
    const midis=[...SCALES[scale].map(i=>60+root+i),60+root+12];
    await playMidi(midis,true);
    setTimeout(()=>setPlaying(false),midis.length*265+600);
  },[playing,root,scale,playMidi]);

  // ── AI Chat ──────────────────────────────────────────────────────
  const sendAI=useCallback(async()=>{
    if(!input.trim()||aiLoading) return;

    const userText=input.trim();
    setInput('');
    setAiLoading(true);

    // Mensagens para a API — apenas role+content, sem flags internas
    const apiMessages=[
      ...msgs
        .filter(m=>(m.role==='user'||m.role==='assistant')&&m.content&&!m.isLoading)
        .map(m=>({role:m.role,content:m.content})),
      {role:'user',content:userText},
    ];

    // Adiciona mensagem do usuário + placeholder do assistente
    setMsgs(prev=>[...prev,
      {role:'user',content:userText},
      {role:'assistant',content:'',isLoading:true},
    ]);

    const systemPrompt=[
      'Você é PulseLab IA, assistente especializado em composição musical brasileira.',
      'Ajude músicos a criar letras criativas, poéticas e musicalmente coerentes.',
      '',
      `Contexto musical atual:`,
      `- Tonalidade: ${NOTES[root]} ${scale}`,
      moodVibes&&`- Caráter: ${moodVibes}`,
      moodGenre&&`- Gêneros: ${moodGenre}`,
      `- Notas da escala: ${scaleNotes.map(n=>NOTES[n]).join(', ')}`,
      `- Campo harmônico: ${harmStr}`,
      tema&&`- Tema: ${tema}`,
      estilo&&`- Estilo: ${estilo}`,
      '',
      'Instruções: Crie letras com estrutura (Verso, Refrão, Ponte quando pedido). Use rimas e métricas adequadas. Seja poético e criativo. Responda em português brasileiro.',
    ].filter(Boolean).join('\n');

    try{
      const response=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          model:'claude-sonnet-4-20250514',
          max_tokens:1000,
          system:systemPrompt,
          messages:apiMessages,
        }),
      });

      const data=await response.json();

      if(!response.ok){
        throw new Error(data?.error?.message||`Erro ${response.status}`);
      }

      const text=data.content
        ?.filter(b=>b.type==='text')
        ?.map(b=>b.text)
        ?.join('')||'';

      if(!text) throw new Error('Resposta vazia da IA.');

      setMsgs(prev=>prev.map((m,i)=>
        i===prev.length-1&&m.isLoading ? {role:'assistant',content:text} : m
      ));
      setLastLyrics(text);

    }catch(err){
      setMsgs(prev=>prev.map((m,i)=>
        i===prev.length-1&&m.isLoading
          ? {role:'assistant',content:`❌ ${err.message||'Erro desconhecido.'}`}
          : m
      ));
    }finally{
      setAiLoading(false);
    }
  },[input,msgs,aiLoading,root,scale,scaleNotes,harmStr,moodVibes,moodGenre,tema,estilo]);

  useEffect(()=>{chatEnd.current?.scrollIntoView({behavior:'smooth'});},[msgs]);

  // ── Save ─────────────────────────────────────────────────────────
  const saveComp=()=>{
    if(!savingTitle.trim()||!lastLyrics) return;
    const now=new Date().toISOString();
    const comp={id:'c'+Date.now(),title:savingTitle.trim(),
      rootNote:NOTES[root],scale,tema,estilo,lyrics:lastLyrics,harmonic:harmStr,
      createdAt:now,updatedAt:now};
    const existing=JSON.parse(localStorage.getItem('pl_compositions')||'[]');
    localStorage.setItem('pl_compositions',JSON.stringify([comp,...existing]));
    setShowSave(false); setSavingTitle('');
    setToast({msg:'Composição salva!',type:'success'});
  };
  const loadComp=c=>{
    const ri=NOTES.indexOf(c.rootNote); if(ri>=0) setRoot(ri);
    if(SCALES[c.scale]) setScale(c.scale);
    setTema(c.tema||''); setEstilo(c.estilo||'');
    setMsgs([{role:'assistant',content:`📖 **${c.title}**\n\n${c.lyrics}`}]);
    setLastLyrics(c.lyrics); setTab('lyrics');
    setToast({msg:`"${c.title}" carregado`,type:'success'});
  };

  // ── Styles ───────────────────────────────────────────────────────
  const card={background:'linear-gradient(145deg,rgba(255,255,255,0.035),rgba(255,255,255,0.015))',
    border:'1px solid rgba(255,255,255,0.08)',borderRadius:16,padding:'18px 20px',marginBottom:14};
  const lbl={fontSize:10,color:'#374151',marginBottom:8,textTransform:'uppercase',letterSpacing:'1.4px',fontWeight:700};

  return(
    <div style={{padding:'16px 20px 40px',maxWidth:860,margin:'0 auto'}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}
      {showComps&&<CompositionsPanel onLoad={loadComp} onClose={()=>setShowComps(false)}/>}

      {/* Controls */}
      <div style={card}>
        <div style={{display:'flex',gap:20,flexWrap:'wrap',alignItems:'flex-start'}}>
          <div>
            <div style={lbl}>Nota Raiz</div>
            <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
              {NOTES.map((n,i)=>{
                const sel=root===i;
                return(
                  <button key={i} onClick={()=>{setRoot(i);setSelChord(null);}} style={{
                    padding:'5px 9px',borderRadius:22,fontSize:12,fontWeight:800,minWidth:33,
                    background:sel?`${moodColor}28`:'rgba(255,255,255,0.04)',
                    border:sel?`1px solid ${moodColor}55`:'1px solid rgba(255,255,255,0.07)',
                    color:sel?moodColor:'#4b5563',
                    boxShadow:sel?`0 0 12px ${moodColor}28`:'none',transition:'all .2s',
                  }}>{n}</button>
                );
              })}
            </div>
          </div>
          <div style={{display:'flex',gap:14,flexWrap:'wrap',alignItems:'flex-end'}}>
            <div>
              <div style={lbl}>Escala</div>
              <div style={{position:'relative'}}>
                <select value={scale} onChange={e=>{setScale(e.target.value);setSelChord(null);}} style={{
                  background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.12)',
                  color:'#e2e8f0',padding:'9px 32px 9px 14px',borderRadius:10,fontSize:13,cursor:'pointer',
                  WebkitAppearance:'none',appearance:'none'}}>
                  {Object.keys(SCALES).map(s=><option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown size={12} style={{position:'absolute',right:10,top:'50%',
                  transform:'translateY(-50%)',color:'#4b5563',pointerEvents:'none'}}/>
              </div>
            </div>
            <div>
              <div style={lbl}>Instrumento</div>
              <div style={{display:'flex',gap:6}}>
                {[{id:'piano',ico:'🎹',c:'#00d4ff'},{id:'violao',ico:'🎸',c:'#4ade80'},{id:'synth',ico:'🎛',c:'#a78bfa'}].map(({id,ico,c})=>{
                  const sel=instr===id;
                  return(
                    <button key={id} onClick={()=>setInstr(id)} style={{
                      padding:'8px 13px',borderRadius:9,fontSize:13,fontWeight:600,
                      background:sel?`${c}22`:'rgba(255,255,255,0.04)',
                      border:sel?`1px solid ${c}50`:'1px solid rgba(255,255,255,0.07)',
                      color:sel?c:'#4b5563',boxShadow:sel?`0 0 12px ${c}28`:'none',
                      transition:'all .22s',display:'flex',alignItems:'center',gap:5}}>
                      <span>{ico}</span><span style={{textTransform:'capitalize'}}>{id[0].toUpperCase()+id.slice(1)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {user&&(
            <button onClick={()=>setShowComps(true)} style={{
              marginLeft:'auto',alignSelf:'flex-end',display:'flex',alignItems:'center',gap:6,
              padding:'8px 14px',borderRadius:9,fontSize:12,
              background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',
              color:'#4b5563',transition:'all .2s',cursor:'pointer'}}>
              <BookOpen size={13}/>Composições
            </button>
          )}
        </div>
      </div>

      {/* Gradient nav */}
      <div style={{marginBottom:18}}>
        <GradientNav items={NAV_ITEMS} active={tab} onChange={setTab}/>
      </div>

      {/* ── SCALES ── */}
      {tab==='scales'&&<>
        <div style={{...card,borderColor:`${moodColor}28`,background:`linear-gradient(145deg,${moodColor}07,rgba(255,255,255,0.01))`}}>
          <div style={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:12,marginBottom:14}}>
            <div>
              <div style={{fontSize:28,fontWeight:900,letterSpacing:-1,marginBottom:4}}>
                <span style={{color:moodColor,textShadow:`0 0 20px ${moodColor}55`}}>{NOTES[root]}</span>{' '}
                <span style={{color:'rgba(255,255,255,0.65)'}}>{scale}</span>
              </div>
              <div style={{fontSize:13,color:'rgba(255,255,255,0.45)',marginBottom:2}}>{moodVibes}</div>
              <div style={{fontSize:11,color:'#374151'}}>{moodGenre}</div>
            </div>
            <button onClick={playScale} disabled={playing} style={{
              display:'flex',alignItems:'center',gap:8,alignSelf:'flex-start',
              padding:'9px 22px',borderRadius:10,cursor:playing?'not-allowed':'pointer',
              background:playing?'rgba(255,255,255,0.03)':`${moodColor}1e`,
              border:`1px solid ${playing?'rgba(255,255,255,0.04)':moodColor+'45'}`,
              color:playing?'#374151':moodColor,fontSize:13,fontWeight:700}}>
              <Play size={13} fill={playing?'#374151':moodColor}/>
              {playing?'Tocando…':'Ouvir Escala'}
            </button>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {scaleNotes.map((n,i)=>(
              <button key={i} onClick={()=>playMidi([60+SCALES[scale][i]])} style={{
                padding:'7px 16px',borderRadius:24,fontSize:14,fontWeight:900,
                background:`${moodColor}10`,border:`1px solid ${moodColor}30`,color:moodColor,
                transition:'all .18s'}}
              onMouseEnter={e=>{e.currentTarget.style.background=`${moodColor}22`;e.currentTarget.style.boxShadow=`0 0 14px ${moodColor}38`;}}
              onMouseLeave={e=>{e.currentTarget.style.background=`${moodColor}10`;e.currentTarget.style.boxShadow='none';}}>
                {NOTES[n]}
              </button>
            ))}
          </div>
        </div>

        <div style={card}>
          <div style={{...lbl,marginBottom:4}}>Teclado Interativo</div>
          <div style={{fontSize:11,color:'#2d3344',marginBottom:12}}>
            {selChord?`Acorde ${selChord.rootName}${selChord.q.sym} — ${selChord.notes.join(' · ')}`:'Clique nas teclas para ouvir · azul = notas da escala'}
          </div>
          <PianoKeyboard scaleSet={scaleSet} chordNoteSet={chordNoteSet} playMidi={playMidi}/>
          <div style={{display:'flex',gap:18,marginTop:8,justifyContent:'center',flexWrap:'wrap'}}>
            {[['linear-gradient(180deg,#bae6fd,#e0f2fe)','#7dd3fc','Na escala'],
              ['linear-gradient(180deg,#c4b5fd,#ddd6fe)','#a78bfa','No acorde'],
              ['linear-gradient(180deg,#f8fafc,#e8edf2)','#cbd5e1','Fora']].map(([bg,bdr,lbl])=>(
              <div key={lbl} style={{display:'flex',alignItems:'center',gap:6}}>
                <div style={{width:14,height:22,background:bg,border:`1px solid ${bdr}`,borderRadius:'0 0 3px 3px'}}/>
                <span style={{fontSize:11,color:'#374151'}}>{lbl}</span>
              </div>
            ))}
          </div>
        </div>

        {hField&&(
          <div style={card}>
            <div style={lbl}>Acordes da Escala</div>
            <div style={{display:'flex',gap:9,flexWrap:'wrap',justifyContent:'center'}}>
              {hField.map(ch=>{
                const sel=selChord?.i===ch.i;
                return(
                  <div key={ch.i} className="chord-pill"
                    onClick={()=>{setSelChord(sel?null:ch);playMidi(ch.midi);}} style={{
                    padding:'12px 16px',borderRadius:12,cursor:'pointer',textAlign:'center',minWidth:74,
                    background:sel?`${ch.q.clr}20`:'rgba(255,255,255,0.03)',
                    border:`1.5px solid ${sel?ch.q.clr:'rgba(255,255,255,0.07)'}`,
                    boxShadow:sel?`0 0 18px ${ch.q.clr}38`:'none',transition:'all .22s'}}>
                    <div style={{fontSize:9,color:'#374151',marginBottom:3,fontWeight:700,letterSpacing:.5}}>{ch.roman}</div>
                    <div style={{fontSize:19,fontWeight:900,letterSpacing:-.5,color:sel?ch.q.clr:'#f1f5f9',marginBottom:2,
                      textShadow:sel?`0 0 12px ${ch.q.clr}70`:'none'}}>{ch.rootName}{ch.q.sym}</div>
                    <div style={{fontSize:9,color:ch.q.clr,marginBottom:5}}>{ch.q.name}</div>
                    <div style={{fontSize:9,color:'#2d3344',borderTop:`1px solid ${ch.q.clr}1e`,paddingTop:5}}>{ch.notes.join('·')}</div>
                  </div>
                );
              })}
            </div>
            {selChord&&(
              <div style={{marginTop:12,padding:'9px 14px',background:`${selChord.q.clr}0b`,borderRadius:10,
                border:`1px solid ${selChord.q.clr}20`,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                <div>
                  <span style={{fontSize:12,color:'#4b5563'}}>Notas: </span>
                  <span style={{fontSize:13,color:selChord.q.clr,fontWeight:700}}>{selChord.notes.join(' — ')}</span>
                </div>
                <button onClick={()=>setSelChord(null)} style={{background:'none',border:'none',color:'#374151',fontSize:12,cursor:'pointer'}}>✕ Limpar</button>
              </div>
            )}
          </div>
        )}
      </>}

      {/* ── HARMONIC ── */}
      {tab==='harmonic'&&(
        !hField?(
          <div style={{...card,textAlign:'center',padding:60,color:'#374151'}}>
            <div style={{fontSize:32,marginBottom:10}}>🎸</div>
            <p>Disponível para escalas de 7 notas</p>
          </div>
        ):<>
          <div style={{...card,background:'linear-gradient(145deg,rgba(139,92,246,0.07),rgba(139,92,246,0.02))',borderColor:'rgba(139,92,246,0.18)'}}>
            <div style={{fontSize:19,fontWeight:900,letterSpacing:-.5,marginBottom:2}}>
              Campo Harmônico — <span style={{color:'#00d4ff'}}>{NOTES[root]}</span>{' '}<span style={{color:'#a78bfa'}}>{scale}</span>
            </div>
            <div style={{fontSize:12,color:'#4b5563'}}>{moodVibes} · {moodGenre}</div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(112px,1fr))',gap:10,marginBottom:14}}>
            {hField.map(ch=>(
              <div key={ch.i} onClick={()=>playMidi(ch.midi)} style={{
                background:`linear-gradient(155deg,${ch.q.clr}10,${ch.q.clr}03)`,
                border:`1px solid ${ch.q.clr}30`,borderRadius:14,
                padding:'17px 12px',cursor:'pointer',textAlign:'center',transition:'transform .22s,box-shadow .22s'}}
              onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-4px)';e.currentTarget.style.boxShadow=`0 8px 22px ${ch.q.clr}28`;}}
              onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.boxShadow='none';}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:2.5,color:ch.q.clr,marginBottom:5,textTransform:'uppercase'}}>{ch.roman}</div>
                <div style={{fontSize:27,fontWeight:900,color:'#f1f5f9',lineHeight:1,letterSpacing:-.5}}>{ch.rootName}</div>
                <div style={{fontSize:13,fontWeight:800,color:ch.q.clr,marginBottom:2}}>{ch.q.sym||'maj'}</div>
                <div style={{fontSize:10,color:'#4b5563',marginBottom:7}}>{ch.q.name}</div>
                <div style={{fontSize:9,color:'#2d3344',borderTop:`1px solid ${ch.q.clr}1c`,paddingTop:5,letterSpacing:.3}}>{ch.notes.join('·')}</div>
              </div>
            ))}
          </div>
          <div style={card}>
            <div style={lbl}>Progressões — clique para ouvir</div>
            {[
              {n:'I – IV – V – I',  ids:[0,3,4,0],d:'Blues, Rock, Gospel'},
              {n:'I – V – VI – IV', ids:[0,4,5,3],d:'Pop, Romântico'},
              {n:'II – V – I',      ids:[1,4,0],  d:'Jazz'},
              {n:'I – VI – II – V', ids:[0,5,1,4],d:'Bossa Nova'},
              {n:'I – IV – I – V',  ids:[0,3,0,4],d:'Forró, Baião'},
            ].map((p,pi)=>{
              const chs=p.ids.map(id=>hField[id]).filter(Boolean);
              return(
                <div key={pi} className="prog-row"
                  onClick={async()=>{for(const c of chs){playMidi(c.midi);await new Promise(r=>setTimeout(r,1350));}}}
                  style={{display:'flex',alignItems:'center',gap:14,padding:'11px 14px',marginBottom:6,cursor:'pointer',
                    background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:10,transition:'background .2s'}}>
                  <div style={{width:30,height:30,borderRadius:'50%',flexShrink:0,
                    background:'rgba(139,92,246,0.1)',border:'1px solid rgba(139,92,246,0.22)',
                    display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <Play size={11} fill="#a78bfa" style={{color:'#a78bfa'}}/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:13,marginBottom:2,color:'#e2e8f0'}}>{chs.map(c=>c.rootName+c.q.sym).join(' → ')}</div>
                    <div style={{fontSize:11,color:'#374151'}}><span style={{color:'#4b5563'}}>{p.n}</span> · {p.d}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── LYRICS / AI ── */}
      {tab==='lyrics'&&(
        <div style={{maxWidth:700,margin:'0 auto'}}>
          <div style={{...card,background:'linear-gradient(145deg,rgba(249,115,22,0.07),rgba(249,115,22,0.02))',borderColor:'rgba(249,115,22,0.16)'}}>
            <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
              <div style={{flexShrink:0}}>
                <div style={{fontSize:12,fontWeight:700,color:moodColor}}>{NOTES[root]} {scale}</div>
                <div style={{fontSize:10,color:'#374151'}}>{moodVibes}</div>
              </div>
              <input value={tema} onChange={e=>setTema(e.target.value)} placeholder="Tema: amor, saudade…"
                style={{flex:1,minWidth:130,padding:'7px 12px',background:'rgba(255,255,255,0.05)',
                  border:'1px solid rgba(255,255,255,0.09)',borderRadius:8,color:'#e2e8f0',fontSize:12}}
                onFocus={e=>e.target.style.borderColor='rgba(249,115,22,0.4)'}
                onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.09)'}/>
              <input value={estilo} onChange={e=>setEstilo(e.target.value)} placeholder="Gênero: samba, rock…"
                style={{flex:1,minWidth:130,padding:'7px 12px',background:'rgba(255,255,255,0.05)',
                  border:'1px solid rgba(255,255,255,0.09)',borderRadius:8,color:'#e2e8f0',fontSize:12}}
                onFocus={e=>e.target.style.borderColor='rgba(249,115,22,0.4)'}
                onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.09)'}/>
            </div>
          </div>

          {/* Chat */}
          <div style={{...card,height:400,overflowY:'auto',display:'flex',flexDirection:'column',
            padding:'14px 16px',marginBottom:10}}>
            {msgs.length===0&&(
              <div style={{margin:'auto',textAlign:'center',color:'#374151'}}>
                <div style={{fontSize:38,marginBottom:10,animation:'drift 3s ease-in-out infinite'}}>✍️</div>
                <p style={{fontSize:15,fontWeight:700,color:'#4b5563',marginBottom:5}}>Assistente de Composição</p>
                <p style={{fontSize:12,marginBottom:18,lineHeight:1.75,color:'#2d3344',maxWidth:360}}>
                  Configure a tonalidade, tema e gênero acima — depois peça sua letra!
                </p>
                <div style={{display:'flex',gap:6,flexWrap:'wrap',justifyContent:'center'}}>
                  {[`Refrão vibrante em ${NOTES[root]} ${scale}`,'Verso sobre saudade','Rimas para "coração"','Ponte emocional'].map(s=>(
                    <button key={s} onClick={()=>setInput(s)} style={{
                      padding:'5px 12px',fontSize:11,cursor:'pointer',
                      background:'rgba(249,115,22,0.08)',border:'1px solid rgba(249,115,22,0.2)',
                      borderRadius:20,color:'#fb923c',transition:'background .2s'}}
                    onMouseEnter={e=>e.currentTarget.style.background='rgba(249,115,22,0.16)'}
                    onMouseLeave={e=>e.currentTarget.style.background='rgba(249,115,22,0.08)'}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m,i)=>(
              <div key={i} style={{display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start',marginBottom:12}}>
                <div style={{
                  maxWidth:'90%',padding:'10px 14px',fontSize:13,lineHeight:1.85,
                  whiteSpace:'pre-wrap',color:'#e2e8f0',
                  background:m.role==='user'
                    ?'linear-gradient(135deg,rgba(249,115,22,0.15),rgba(249,115,22,0.08))'
                    :'rgba(255,255,255,0.04)',
                  border:`1px solid ${m.role==='user'?'rgba(249,115,22,0.26)':'rgba(255,255,255,0.07)'}`,
                  borderRadius:m.role==='user'?'14px 14px 3px 14px':'14px 14px 14px 3px',
                }}>
                  {m.isLoading?(
                    <div style={{display:'flex',gap:5,alignItems:'center',padding:'4px 0'}}>
                      {[0,1,2].map(i=>(
                        <div key={i} style={{width:7,height:7,borderRadius:'50%',background:'#f97316',
                          animation:`blink 1.4s ease-in-out ${i*.22}s infinite`}}/>
                      ))}
                      <span style={{fontSize:11,color:'#374151',marginLeft:5}}>Compondo…</span>
                    </div>
                  ):m.content}
                </div>
              </div>
            ))}
            <div ref={chatEnd}/>
          </div>

          {/* Input */}
          <div style={{display:'flex',gap:9,marginBottom:10}}>
            <input value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendAI();}}}
              placeholder="Peça uma letra, verso, refrão, rima…"
              disabled={aiLoading}
              style={{flex:1,padding:'11px 16px',fontSize:13,
                background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.09)',
                borderRadius:10,color:'#e2e8f0',transition:'border .2s'}}
              onFocus={e=>e.target.style.borderColor='rgba(249,115,22,0.45)'}
              onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.09)'}/>
            <button onClick={sendAI} disabled={aiLoading||!input.trim()} style={{
              padding:'11px 20px',borderRadius:10,fontSize:13,fontWeight:700,
              background:aiLoading||!input.trim()?'rgba(255,255,255,0.03)':'linear-gradient(135deg,rgba(249,115,22,0.2),rgba(251,146,60,0.16))',
              border:`1px solid ${aiLoading||!input.trim()?'rgba(255,255,255,0.04)':'rgba(249,115,22,0.38)'}`,
              color:aiLoading||!input.trim()?'#374151':'#fb923c',
              cursor:aiLoading||!input.trim()?'not-allowed':'pointer',
              display:'flex',alignItems:'center',gap:7,transition:'all .2s'}}>
              {aiLoading?<Loader size={13} className="spin"/>:'✨'}
              {aiLoading?'Gerando':'Criar'}
            </button>
          </div>

          {/* Save */}
          {user&&lastLyrics&&!showSave&&(
            <button onClick={()=>setShowSave(true)} style={{
              width:'100%',padding:'9px',borderRadius:9,cursor:'pointer',
              background:'rgba(74,222,128,0.07)',border:'1px solid rgba(74,222,128,0.2)',
              color:'#4ade80',fontSize:13,fontWeight:600,
              display:'flex',alignItems:'center',justifyContent:'center',gap:7,transition:'background .2s'}}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(74,222,128,0.13)'}
            onMouseLeave={e=>e.currentTarget.style.background='rgba(74,222,128,0.07)'}>
              <Save size={14}/>Salvar composição
            </button>
          )}
          {showSave&&(
            <div style={{padding:14,borderRadius:10,background:'rgba(74,222,128,0.05)',border:'1px solid rgba(74,222,128,0.18)'}}>
              <div style={{fontSize:12,color:'#4b5563',marginBottom:8}}>Título da composição</div>
              <div style={{display:'flex',gap:8}}>
                <input value={savingTitle} onChange={e=>setSavingTitle(e.target.value)}
                  placeholder="Ex: Saudade do Norte"
                  onKeyDown={e=>e.key==='Enter'&&saveComp()}
                  style={{flex:1,padding:'9px 12px',borderRadius:8,
                    background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',
                    color:'#e2e8f0',fontSize:13}}/>
                <button onClick={saveComp} disabled={!savingTitle.trim()} style={{
                  padding:'9px 16px',borderRadius:8,cursor:'pointer',
                  background:savingTitle.trim()?'rgba(74,222,128,0.18)':'rgba(255,255,255,0.03)',
                  border:`1px solid ${savingTitle.trim()?'rgba(74,222,128,0.35)':'rgba(255,255,255,0.06)'}`,
                  color:savingTitle.trim()?'#4ade80':'#374151',fontSize:13,fontWeight:700}}>Salvar</button>
                <button onClick={()=>setShowSave(false)} style={{
                  padding:'9px 14px',borderRadius:8,cursor:'pointer',
                  background:'none',border:'1px solid rgba(255,255,255,0.07)',color:'#374151',fontSize:13}}>Cancelar</button>
              </div>
            </div>
          )}
          {!user&&<p style={{textAlign:'center',fontSize:11,color:'#2d3344',marginTop:8}}>Faça login para salvar composições</p>}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   LANDING
══════════════════════════════════════════════════════════════════ */
function Landing({onSignIn,onStudio}){
  const feats=[
    {Icon:Music2,title:'10 Escalas & Modos',       desc:'Maior, Menor, Dórica, Frígia, Lídia e mais — com caráter e gêneros musicais.',          accentColor:'#00d4ff',delay:1},
    {Icon:Layers,title:'Campo Harmônico',           desc:'7 acordes de qualquer tonalidade com funções harmônicas e progressões clássicas.',       accentColor:'#a78bfa',delay:2},
    {Icon:Zap,   title:'Progressões Instantâneas',  desc:'I–IV–V, II–V–I, I–V–VI–IV e mais. Clique e ouça em qualquer tonalidade.',               accentColor:'#fbbf24',delay:3},
    {Icon:Mic2,  title:'3 Timbres de Áudio Real',   desc:'Piano, violão e synth com envelope e reverb real via Tone.js.',                         accentColor:'#4ade80',delay:4},
    {Icon:Brain, title:'IA para Composição',        desc:'Letras criadas pela IA considerando tonalidade, escala e campo harmônico completo.',     accentColor:'#f97316',delay:5},
    {Icon:Save,  title:'Salvar Composições',        desc:'Salve e organize suas letras com contexto musical completo. Login com e-mail.',           accentColor:'#fb7185',delay:6},
  ];
  return(
    <>
      <section style={{position:'relative',minHeight:'100vh',display:'flex',flexDirection:'column',
        alignItems:'center',justifyContent:'center',textAlign:'center',padding:'120px 20px 80px',overflow:'hidden'}}>
        <FlowField color="#818cf8" trailOpacity={0.09} particleCount={520} speed={0.82}/>
        <div style={{position:'absolute',inset:0,zIndex:1,
          background:'radial-gradient(ellipse 72% 65% at 50% 58%,rgba(9,10,18,.12) 0%,rgba(9,10,18,.97) 75%)'}}/>
        <div style={{position:'absolute',inset:0,zIndex:1,pointerEvents:'none',
          background:'radial-gradient(circle 340px at 25% 38%,rgba(0,212,255,0.06) 0%,transparent 70%)'}}/>
        <div style={{position:'absolute',inset:0,zIndex:1,pointerEvents:'none',
          background:'radial-gradient(circle 340px at 76% 60%,rgba(139,92,246,0.06) 0%,transparent 70%)'}}/>

        <div style={{position:'relative',zIndex:2,maxWidth:750}}>
          <div className="au" style={{display:'inline-flex',alignItems:'center',gap:9,
            padding:'6px 18px',borderRadius:24,marginBottom:28,
            background:'rgba(0,212,255,0.07)',border:'1px solid rgba(0,212,255,0.2)',
            fontSize:11,color:'#00d4ff',fontWeight:700,letterSpacing:2,textTransform:'uppercase'}}>
            🎵 Estúdio Musical Inteligente
          </div>
          <h1 className="au d1" style={{fontSize:'clamp(38px,7vw,70px)',fontWeight:900,lineHeight:1.06,marginBottom:22,letterSpacing:-2.5}}>
            Crie músicas com a<br/>
            <span style={{background:'linear-gradient(135deg,#00d4ff 0%,#8b5cf6 50%,#fb7185 100%)',
              WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',
              backgroundSize:'200% auto',animation:'shimmer 4s linear infinite'}}>ciência dos sons</span>
          </h1>
          <p className="au d2" style={{fontSize:'clamp(14px,2vw,17px)',color:'rgba(255,255,255,0.35)',
            lineHeight:1.85,marginBottom:40,maxWidth:540,margin:'0 auto 40px'}}>
            Explore escalas, construa acordes, descubra campos harmônicos e deixe a IA criar letras pela sua música.
          </p>
          <div className="au d3" style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
            <button onClick={onStudio} style={{display:'inline-flex',alignItems:'center',gap:9,
              padding:'14px 32px',borderRadius:12,cursor:'pointer',
              background:'linear-gradient(135deg,rgba(0,212,255,0.16),rgba(139,92,246,0.18))',
              border:'1px solid rgba(0,212,255,0.4)',color:'#00d4ff',fontSize:15,fontWeight:800,
              boxShadow:'0 0 28px rgba(0,212,255,0.2)',transition:'box-shadow .25s'}}
            onMouseEnter={e=>e.currentTarget.style.boxShadow='0 0 50px rgba(0,212,255,0.38)'}
            onMouseLeave={e=>e.currentTarget.style.boxShadow='0 0 28px rgba(0,212,255,0.2)'}>
              Entrar no Estúdio <ArrowRight size={16}/>
            </button>
            <button onClick={onSignIn} style={{padding:'14px 28px',borderRadius:12,cursor:'pointer',
              background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',
              color:'rgba(255,255,255,0.45)',fontSize:15,transition:'all .2s'}}
            onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.08)';e.currentTarget.style.color='rgba(255,255,255,0.75)';}}
            onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.04)';e.currentTarget.style.color='rgba(255,255,255,0.45)';}}>
              Criar conta grátis
            </button>
          </div>
          <div className="au d4" style={{display:'flex',gap:28,justifyContent:'center',marginTop:48,flexWrap:'wrap'}}>
            {['10 escalas & modos','Piano + Violão + Synth','IA para composição','Salvar letras'].map(t=>(
              <span key={t} style={{display:'flex',alignItems:'center',gap:7,fontSize:12,color:'rgba(255,255,255,0.28)'}}>
                <span style={{color:'#4ade80',fontSize:12}}>✓</span>{t}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section style={{padding:'10px 20px 90px',maxWidth:1140,margin:'0 auto'}}>
        <div className="au" style={{textAlign:'center',marginBottom:50}}>
          <h2 style={{fontSize:'clamp(22px,3.5vw,34px)',fontWeight:900,letterSpacing:-1.2,marginBottom:12,color:'#f1f5f9'}}>Tudo que você precisa para compor</h2>
          <p style={{fontSize:14,color:'#374151'}}>Da teoria musical à letra — tudo integrado, tudo em tempo real.</p>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',
          border:'1px dashed rgba(255,255,255,0.07)',borderRadius:3,overflow:'hidden'}}>
          {feats.map((f,i)=>(
            <div key={i} style={{borderRight:'1px dashed rgba(255,255,255,0.07)',borderBottom:'1px dashed rgba(255,255,255,0.07)'}}>
              <FeatCard {...f}/>
            </div>
          ))}
        </div>
      </section>

      <section style={{padding:'60px 20px',textAlign:'center',borderTop:'1px solid rgba(255,255,255,0.05)'}}>
        <div className="au" style={{maxWidth:520,margin:'0 auto'}}>
          <h2 style={{fontSize:'clamp(22px,3vw,30px)',fontWeight:900,letterSpacing:-1,marginBottom:12,color:'#f1f5f9'}}>Pronto para compor?</h2>
          <p style={{fontSize:14,color:'#374151',marginBottom:26}}>Estúdio grátis. IA integrada. Sem instalação.</p>
          <button onClick={onStudio} style={{
            padding:'14px 38px',borderRadius:12,cursor:'pointer',
            background:'linear-gradient(135deg,rgba(0,212,255,0.15),rgba(139,92,246,0.15))',
            border:'1px solid rgba(0,212,255,0.36)',color:'#00d4ff',fontSize:15,fontWeight:800,
            boxShadow:'0 0 28px rgba(0,212,255,0.16)',transition:'box-shadow .25s'}}
          onMouseEnter={e=>e.currentTarget.style.boxShadow='0 0 52px rgba(0,212,255,0.35)'}
          onMouseLeave={e=>e.currentTarget.style.boxShadow='0 0 28px rgba(0,212,255,0.16)'}>
            🎵 Abrir PulseLab Studio
          </button>
        </div>
      </section>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════
   ROOT
══════════════════════════════════════════════════════════════════ */
export default function PulseLab(){
  const [view,setView]=useState('landing');
  const [user,setUser]=useState(null);
  const [scrolled,setScrolled]=useState(false);

  useEffect(()=>{
    try{
      const u=localStorage.getItem('pl_user');
      if(u) setUser(JSON.parse(u));
    }catch{}
    const fn=()=>setScrolled(window.scrollY>10);
    window.addEventListener('scroll',fn,{passive:true});
    return()=>window.removeEventListener('scroll',fn);
  },[]);

  const logout=()=>{
    localStorage.removeItem('pl_user');
    setUser(null); setView('landing');
  };

  const onSignInSuccess=u=>{
    setUser(u);
    localStorage.setItem('pl_user',JSON.stringify(u));
    setView('studio');
  };

  return(
    <div style={{background:'#090a12',minHeight:'100vh',color:'#e2e8f0',
      fontFamily:"'Segoe UI',system-ui,-apple-system,sans-serif"}}>
      <style>{CSS}</style>

      {view==='landing'&&<>
        <Header onSignIn={()=>setView('signin')} onStudio={()=>setView('studio')}
          scrolled={scrolled} user={user} onLogout={logout}/>
        <Landing onSignIn={()=>setView('signin')} onStudio={()=>setView('studio')}/>
      </>}

      {view==='signin'&&(
        <div style={{background:'#090a12',minHeight:'100vh'}}>
          <SignIn onSuccess={onSignInSuccess} onBack={()=>setView('landing')}/>
        </div>
      )}

      {view==='studio'&&<>
        <div style={{position:'sticky',top:0,zIndex:150,
          background:'rgba(9,10,18,0.94)',backdropFilter:'blur(20px)',
          borderBottom:'1px solid rgba(255,255,255,0.07)',
          height:54,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 24px'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}} onClick={()=>setView('landing')}>
            <div style={{width:26,height:26,borderRadius:'50%',
              background:'linear-gradient(135deg,#00d4ff,#8b5cf6)',
              display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,
              boxShadow:'0 0 14px rgba(0,212,255,0.35)'}}>🎵</div>
            <span style={{fontWeight:900,fontSize:16,letterSpacing:-.5,
              background:'linear-gradient(90deg,#00d4ff,#8b5cf6)',
              WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>PulseLab</span>
            <span style={{fontSize:10,color:'#2d3344',
              borderLeft:'1px solid rgba(255,255,255,0.08)',paddingLeft:10,marginLeft:2,
              letterSpacing:1,textTransform:'uppercase',fontWeight:600}}>Studio</span>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            {user&&(
              <>
                <span style={{fontSize:12,color:'#374151',display:'flex',alignItems:'center',gap:6}}>
                  <div style={{width:6,height:6,borderRadius:'50%',background:'#4ade80',boxShadow:'0 0 6px #4ade80'}}/>
                  {user.name}
                </span>
                <button onClick={logout} title="Sair" style={{width:32,height:32,borderRadius:7,
                  border:'1px solid rgba(255,255,255,0.07)',background:'rgba(255,255,255,0.04)',
                  color:'#4b5563',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
                  <LogOut size={13}/>
                </button>
              </>
            )}
            {!user&&(
              <button onClick={()=>setView('signin')} style={{
                padding:'5px 14px',borderRadius:7,fontSize:12,cursor:'pointer',
                background:'rgba(0,212,255,0.08)',border:'1px solid rgba(0,212,255,0.25)',color:'#00d4ff'}}>
                Entrar para salvar
              </button>
            )}
            <button onClick={()=>setView('landing')} style={{
              padding:'5px 14px',borderRadius:7,fontSize:12,cursor:'pointer',
              background:'transparent',border:'1px solid rgba(255,255,255,0.07)',color:'#374151',transition:'all .2s'}}
            onMouseEnter={e=>{e.currentTarget.style.color='#94a3b8';e.currentTarget.style.borderColor='rgba(255,255,255,0.15)';}}
            onMouseLeave={e=>{e.currentTarget.style.color='#374151';e.currentTarget.style.borderColor='rgba(255,255,255,0.07)';}}>
              ← Início
            </button>
          </div>
        </div>
        <div style={{paddingTop:8}}><Studio user={user}/></div>
      </>}
    </div>
  );
}
