#!/usr/bin/env python3
"""Where's-Wally collage of 249 birds + hidden huachu-bike. Pillow/numpy only. seed=42."""
import glob, json, os, random, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps
SEED=42; random.seed(SEED); rng=np.random.default_rng(SEED)
B=os.path.dirname(os.path.abspath(__file__)); OUT=os.path.join(B,'collage'); os.makedirs(OUT,exist_ok=True)
W,H=5400,3600; BASE=900  # dense sticker-bomb
white_bg=[]
def load(p):
    im=Image.open(p)
    if im.mode!='RGBA' or im.getchannel('A').getextrema()[0]==255:
        im=im.convert('RGB'); white_bg.append(os.path.basename(p))
        # flood-fill near-white from borders -> transparent
        a=np.array(im).astype(int); nw=(a.min(2)>235)
        from PIL import Image as I
        m=I.fromarray((nw*255).astype('uint8')); mm=m.copy()
        for xy in [(0,0),(m.width-1,0),(0,m.height-1),(m.width-1,m.height-1)]:
            if mm.getpixel(xy)==255: ImageDraw.floodfill(mm,xy,128)
        bg=(np.array(mm)==128)
        alpha=Image.fromarray(np.where(bg,0,255).astype('uint8')).filter(ImageFilter.GaussianBlur(1.5))
        im=im.convert('RGBA'); im.putalpha(alpha)
    bb=im.getchannel('A').point(lambda v:255 if v>10 else 0).getbbox()
    return im.crop(bb) if bb else im
def prep(im,scale,rot,flip):
    if flip: im=ImageOps.mirror(im)
    s=BASE*scale/max(im.size); im=im.resize((max(1,int(im.width*s)),max(1,int(im.height*s))),Image.LANCZOS)
    return im.rotate(rot,expand=True,resample=Image.BICUBIC)
# background: warm park gradient + soft blobs
y=np.linspace(0,1,H)[:,None,None]
top=np.array([246,238,214]);bot=np.array([214,232,190])
bg=(top*(1-y)+bot*y)*np.ones((1,W,1)); canvas=Image.fromarray(bg.astype('uint8')).convert('RGBA')
d=ImageDraw.Draw(canvas,'RGBA')
for _ in range(90):
    cx,cy,r=random.randint(0,W),random.randint(0,H),random.randint(60,300)
    c=random.choice([(190,220,160,60),(250,225,170,60),(170,205,215,50),(235,200,180,45)])
    d.ellipse([cx-r,cy-r*0.6,cx+r,cy+r*0.6],fill=c)
for _ in range(250):
    cx,cy=random.randint(0,W),random.randint(0,H); d.ellipse([cx-6,cy-6,cx+6,cy+6],fill=(120,150,90,50))
birds=sorted(glob.glob(os.path.join(B,'birds','*.png')))
items=[(p,False) for p in birds]+[(os.path.join(B,'easter','huachu-bike.png'),True)]
# even hex-offset grid (20x13=260 slots, 250 used), moderate jitter
n=len(items); cols,rows=20,13; cw,ch=W/cols,H/rows
slots=[((c+0.5+(0.25 if r%2 else -0.25))*cw,(r+0.5)*ch) for r in range(rows) for c in range(cols)]
def fair(s):
    fx,fy=s[0]/W,s[1]/H
    return 0.2<fx<0.8 and 0.2<fy<0.8 and (abs(fx-.5)>0.15 or abs(fy-.5)>0.15)
egg_slot=random.choice([s for s in slots if fair(s)]); slots.remove(egg_slot)
# drop 9 interior, non-adjacent slots so empties are scattered
random.shuffle(slots); drop=[]
for s in slots:
    if len(drop)==9: break
    if 0.1<s[0]/W<0.9 and 0.1<s[1]/H<0.9 and all(math.hypot(s[0]-d[0],s[1]-d[1])>3*cw for d in drop+[egg_slot]): drop.append(s)
slots=[s for s in slots if s not in drop]
MED=0.65; EGG_SC=round(MED*0.6,3)
normal,cyc,egg_p=[],[],None
for (p,egg) in items:
    if egg: x,y=egg_slot; sc=EGG_SC; rot=random.uniform(-12,12); fl=False
    else:
        x,y=slots.pop(); sc=random.uniform(0.55,0.75); rot=random.uniform(-20,20); fl=random.random()<0.4
    x+=random.uniform(-40,40); y+=random.uniform(-40,40)
    t=(p,egg,x,y,sc,rot,fl,0)
    if egg: egg_p=t
    elif os.path.basename(p) in {'%03d.png'%i for i in range(3,9)}: cyc.append(t)
    else: normal.append(t)
random.shuffle(normal)
placements=normal+cyc+[egg_p]  # cycling birds on top, egg last
egg_info=None
for p,egg,x,y,sc,rot,fl,_ in placements:
    im=prep(load(p),sc,rot,fl)
    sh=Image.new('RGBA',im.size,(60,50,30,0)); sh.putalpha(im.getchannel('A').point(lambda v:v*0.25).filter(ImageFilter.GaussianBlur(6)))
    ox,oy=int(x-im.width/2),int(y-im.height/2)
    canvas.alpha_composite(sh,(max(ox+8,0),max(oy+10,0))) if ox+8>=0 and oy+10>=0 else None
    canvas.paste(im,(ox,oy),im)
    if egg: egg_info=dict(x=ox,y=oy,w=im.width,h=im.height,center_x=int(x),center_y=int(y),scale=sc,median_bird_scale=MED,relative_to_median=round(sc/MED,3),rotation_deg=round(rot,2),
                          center_frac=[round(x/W,3),round(y/H,3)])
rgb=canvas.convert('RGB')
full=os.path.join(OUT,'wally-full.png'); rgb.save(full,optimize=True)
if os.path.getsize(full)>25e6:
    os.remove(full); full=os.path.join(OUT,'wally-full.jpg'); rgb.save(full,quality=85,progressive=True,optimize=True)
web=os.path.join(OUT,'wally-web.jpg'); s=2560/W; wim=rgb.resize((2560,int(H*s)),Image.LANCZOS)
q=80
while True:
    wim.save(web,quality=q,progressive=True,optimize=True)
    if os.path.getsize(web)<2e6 or q<=60: break
    q-=5
egg_info.update(full_image=os.path.basename(full),full_size=[W,H],web_image='wally-web.jpg',web_scale=s,seed=SEED)
json.dump(egg_info,open(os.path.join(OUT,'easter-location.json'),'w'),indent=1)
print('seed',SEED); print('white-bg stickers keyed:',len(white_bg))
for f in [full,web,os.path.join(OUT,'easter-location.json')]: print(f,os.path.getsize(f))
print('egg',egg_info)
