const $=id=>document.getElementById(id);

const fileInput=$('fileInput');
const dropZone=$('dropZone');
const originalPreview=$('originalPreview');
const resultPreview=$('resultPreview');
const originalInfo=$('originalInfo');
const resultInfo=$('resultInfo');
const resolution=$('resolution');

const normalBtn=$('normalBtn');
const aggressiveBtn=$('aggressiveBtn');
const strength=$('strength');
const edge=$('edge');
const strengthValue=$('strengthValue');
const edgeValue=$('edgeValue');

const resetBtn=$('resetBtn');
const removeBtn=$('removeBtn');
const downloadBtn=$('downloadBtn');

const progress=$('progress');
const progressText=$('progressText');
const progressPercent=$('progressPercent');
const progressBar=$('progressBar');
const status=$('status');

let currentFile=null;
let currentImage=null;
let outputBlob=null;
let mode='normal';

let originalURL=null;
let resultURL=null;

fileInput.addEventListener('change',()=>{
  if(fileInput.files&&fileInput.files.length){
    loadFile(fileInput.files[0]);
  }
});

dropZone.addEventListener('click',e=>{
  if(e.target!==fileInput)fileInput.click();
});

dropZone.addEventListener('dragover',e=>{
  e.preventDefault();
  dropZone.classList.add('drag');
});

dropZone.addEventListener('dragleave',()=>{
  dropZone.classList.remove('drag');
});

dropZone.addEventListener('drop',e=>{
  e.preventDefault();
  dropZone.classList.remove('drag');

  const file=[...e.dataTransfer.files].find(f=>f.type.startsWith('image/'));

  if(file)loadFile(file);
});

function loadFile(file){
  if(!file.type.startsWith('image/')){
    alert('Please select an image file.');
    return;
  }

  currentFile=file;
  outputBlob=null;

  if(originalURL)URL.revokeObjectURL(originalURL);
  if(resultURL)URL.revokeObjectURL(resultURL);

  originalURL=URL.createObjectURL(file);

  const img=new Image();

  img.onload=()=>{
    currentImage=img;

    originalPreview.src=originalURL;
    resultPreview.removeAttribute('src');

    originalInfo.textContent=
      `${img.naturalWidth} × ${img.naturalHeight}`;

    resolution.textContent=
      `${img.naturalWidth} × ${img.naturalHeight}`;

    resultInfo.textContent='Ready to process';

    removeBtn.disabled=false;
    downloadBtn.disabled=true;

    status.textContent=
      `${file.name} loaded successfully.`;

    progress.style.display='none';
  };

  img.onerror=()=>{
    alert('This image could not be loaded.');
  };

  img.src=originalURL;
}

strength.addEventListener('input',()=>{
  strengthValue.textContent=strength.value;
});

edge.addEventListener('input',()=>{
  edgeValue.textContent=edge.value;
});

normalBtn.addEventListener('click',()=>{
  if(normalBtn.disabled)return;

  mode='normal';

  normalBtn.classList.add('active');
  aggressiveBtn.classList.remove('active');
});

aggressiveBtn.addEventListener('click',()=>{
  if(aggressiveBtn.disabled)return;

  mode='aggressive';

  aggressiveBtn.classList.add('active');
  normalBtn.classList.remove('active');
});

resetBtn.addEventListener('click',()=>{
  strength.value=50;
  edge.value=50;

  strengthValue.textContent='50';
  edgeValue.textContent='50';

  mode='normal';

  normalBtn.classList.add('active');
  aggressiveBtn.classList.remove('active');

  if(outputBlob&&resultURL){
    URL.revokeObjectURL(resultURL);
    resultURL=null;
  }

  outputBlob=null;
  resultPreview.removeAttribute('src');

  resultInfo.textContent=currentImage?
    'Ready to process':
    'Transparent PNG';

  downloadBtn.disabled=true;
});

function setProgress(value,text){
  value=Math.max(0,Math.min(100,value));

  progress.style.display='block';
  progressText.textContent=text;
  progressPercent.textContent=Math.round(value)+'%';
  progressBar.style.width=value+'%';
}

function sleep(){
  return new Promise(resolve=>setTimeout(resolve,0));
}
async function createCanvasImage(img){
  const canvas=document.createElement('canvas');
  canvas.width=img.naturalWidth;
  canvas.height=img.naturalHeight;

  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(img,0,0);

  return canvas;
}

function clamp(v,min,max){
  return Math.max(min,Math.min(max,v));
}

function smoothStep(a,b,x){
  const t=clamp((x-a)/(b-a),0,1);
  return t*t*(3-2*t);
}

function resizeMask(mask,width,height){
  const src=document.createElement('canvas');
  src.width=mask.width;
  src.height=mask.height;

  const sctx=src.getContext('2d');
  sctx.putImageData(mask,0,0);

  const dst=document.createElement('canvas');
  dst.width=width;
  dst.height=height;

  const dctx=dst.getContext('2d');
  dctx.imageSmoothingEnabled=true;
  dctx.drawImage(src,0,0,width,height);

  return dctx.getImageData(0,0,width,height);
}

function refineAlpha(data,width,height,mode,strength,edge){
  const output=new Uint8ClampedArray(data.length);

  const s=Number(strength)/100;
  const e=Number(edge)/100;

  for(let i=0;i<data.length;i+=4){
    let a=data[i+3];

    if(mode==='aggressive'){
      a=a<128?
        a*(0.55-0.25*s):
        255-((255-a)*(0.35-0.2*s));
    }

    const edgeProtect=0.7+e*0.3;
    a=128+(a-128)*edgeProtect;

    output[i]=data[i];
    output[i+1]=data[i+1];
    output[i+2]=data[i+2];
    output[i+3]=clamp(a,0,255);
  }

  return new ImageData(output,width,height);
}

function canvasToBlob(canvas){
  return new Promise((resolve,reject)=>{
    canvas.toBlob(blob=>{
      if(blob)resolve(blob);
      else reject(new Error('PNG export failed.'));
    },'image/png');
  });
}

async function exportTransparent(canvas,alphaData){
  const ctx=canvas.getContext('2d');

  const image=ctx.getImageData(
    0,
    0,
    canvas.width,
    canvas.height
  );

  for(let i=0;i<image.data.length;i+=4){
    image.data[i+3]=alphaData.data[i+3];
  }

  ctx.putImageData(image,0,0);

  return canvasToBlob(canvas);
}

function enableProcessingControls(enabled){
  normalBtn.disabled=!enabled;
  aggressiveBtn.disabled=!enabled;
  strength.disabled=!enabled;
  edge.disabled=!enabled;
  resetBtn.disabled=!enabled;
}
let remover=null;
let modelLoading=false;

async function getRemover(){
  if(remover)return remover;
  if(modelLoading){
    while(modelLoading)await sleep();
    return remover;
  }

  modelLoading=true;

  try{
    setProgress(5,'Loading background-removal AI…');

    const options={};

    if('gpu' in navigator){
      options.device='webgpu';
    }else{
      options.device='wasm';
    }

    options.dtype=options.device==='webgpu'?'fp16':'q8';

    remover=await pipeline(
      'image-segmentation',
      'briaai/RMBG-1.4',
      options
    );

    setProgress(15,'AI model ready.');
    return remover;
  }catch(error){
    console.error(error);
    throw new Error('The background-removal AI could not be loaded.');
  }finally{
    modelLoading=false;
  }
}
async function runBackgroundRemoval(){
  if(!currentImage)return;

  removeBtn.disabled=true;
  downloadBtn.disabled=true;
  enableProcessingControls(false);

  try{
    setProgress(0,'Preparing image…');
    await sleep();

    const pipe=await getRemover();

    setProgress(20,'Analysing foreground…');
    await sleep();

    const result=await pipe(currentImage);

    setProgress(65,'Building transparency mask…');
    await sleep();

    let mask=null;

    if(Array.isArray(result)){
      mask=result[0]?.mask||result[0];
    }else if(result&&result.mask){
      mask=result.mask;
    }else{
      mask=result;
    }

    if(!mask){
      throw new Error('No segmentation mask was returned.');
    }

    const canvas=await createCanvasImage(currentImage);

    const maskCanvas=document.createElement('canvas');
    maskCanvas.width=mask.width;
    maskCanvas.height=mask.height;

    const maskCtx=maskCanvas.getContext('2d');
    maskCtx.drawImage(mask,0,0);

    const smallMask=maskCtx.getImageData(
      0,
      0,
      maskCanvas.width,
      maskCanvas.height
    );

    const fullMask=resizeMask(
      smallMask,
      canvas.width,
      canvas.height
    );

    setProgress(80,'Refining edges…');
    await sleep();

    const refined=refineAlpha(
      fullMask.data,
      canvas.width,
      canvas.height,
      mode,
      strength.value,
      edge.value
    );

    setProgress(90,'Creating transparent PNG…');
    await sleep();

    outputBlob=await exportTransparent(canvas,refined);

    if(resultURL)URL.revokeObjectURL(resultURL);

    resultURL=URL.createObjectURL(outputBlob);
    resultPreview.src=resultURL;

    resultInfo.textContent=
      `${canvas.width} × ${canvas.height} • PNG`;

    setProgress(100,'Background removed!');
    status.textContent=
      'Your transparent PNG is ready.';

    downloadBtn.disabled=false;

  }catch(error){
    console.error(error);

    progressText.textContent='Processing failed';
    progressPercent.textContent='0%';
    progressBar.style.width='0%';

    status.textContent=
      error.message||'Something went wrong while removing the background.';

  }finally{
    removeBtn.disabled=!currentImage;
    enableProcessingControls(true);
  }
}

removeBtn.addEventListener('click',runBackgroundRemoval);

downloadBtn.addEventListener('click',()=>{
  if(!outputBlob)return;

  const name=currentFile?
    currentFile.name.replace(/\.[^.]+$/,'')+'_no-bg.png':
    'cut-it-out-no-background.png';

  const url=URL.createObjectURL(outputBlob);
  const a=document.createElement('a');

  a.href=url;
  a.download=name;

  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(()=>URL.revokeObjectURL(url),5000);
});
async function runBackgroundRemoval(){
  if(!currentImage)return;

  removeBtn.disabled=true;
  downloadBtn.disabled=true;
  setLocked(true);

  try{
    setProgress(5,"Preparing image…");
    await sleep();

    const pipe=await getRemover();

    setProgress(25,"Detecting subject…");
    await sleep();

    const result=await pipe(currentImage);

    setProgress(60,"Creating transparency mask…");
    await sleep();

    let mask=null;

    if(Array.isArray(result)){
      mask=result[0]?.mask||result[0];
    }else if(result?.mask){
      mask=result.mask;
    }else{
      mask=result;
    }

    if(!mask)throw new Error("The background-removal model did not return a mask.");

    const source=await createCanvasImage(currentImage);
    const w=source.width;
    const h=source.height;

    const maskCanvas=document.createElement("canvas");
    maskCanvas.width=mask.width;
    maskCanvas.height=mask.height;

    const maskCtx=maskCanvas.getContext("2d");
    maskCtx.drawImage(mask,0,0);

    const maskData=maskCtx.getImageData(
      0,
      0,
      maskCanvas.width,
      maskCanvas.height
    );

    setProgress(72,"Refining edges…");
    await sleep();

    const alpha=resizeMask(
      maskData,
      w,
      h
    );

    const strengthValue=Number(strength?.value||50);
    const edgeValue=Number(edge?.value||50);

    const refined=refineAlpha(
      alpha.data,
      w,
      h,
      mode,
      strengthValue,
      edgeValue
    );

    setProgress(88,"Generating transparent PNG…");
    await sleep();

    outputBlob=await exportTransparent(
      source,
      refined
    );

    if(resultURL){
      URL.revokeObjectURL(resultURL);
    }

    resultURL=URL.createObjectURL(outputBlob);
    resultPreview.src=resultURL;

    resultInfo.textContent=
      `${w} × ${h} • Transparent PNG`;

    setProgress(100,"Done!");
    status.textContent=
      "Background removed successfully.";

    downloadBtn.disabled=false;

  }catch(err){
    console.error(err);

    progressText.textContent="Processing failed";
    progressPercent.textContent="0%";
    progressBar.style.width="0%";

    status.textContent=
      err?.message||
      "Something went wrong while removing the background.";

  }finally{
    removeBtn.disabled=!currentImage;
    setLocked(false);
  }
}

function resizeMask(imageData,targetW,targetH){
  const src=document.createElement("canvas");
  src.width=imageData.width;
  src.height=imageData.height;

  src.getContext("2d").putImageData(
    imageData,
    0,
    0
  );

  const dst=document.createElement("canvas");
  dst.width=targetW;
  dst.height=targetH;

  const ctx=dst.getContext("2d");
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality="high";

  ctx.drawImage(
    src,
    0,
    0,
    targetW,
    targetH
  );

  return ctx.getImageData(
    0,
    0,
    targetW,
    targetH
  );
}

function refineAlpha(data,w,h,mode,strengthValue,edgeValue){
  const out=new Uint8ClampedArray(w*h);

  const aggressive=mode==="aggressive";

  const strength=aggressive
    ? 0.70+(strengthValue/100)*0.30
    : 0.45+(strengthValue/100)*0.35;

  const edge=aggressive
    ? 0.70+(edgeValue/100)*0.30
    : 0.35+(edgeValue/100)*0.35;

  for(let i=0,p=0;i<data.length;i+=4,p++){
    let a=data[i];

    if(a<255){
      a=Math.pow(a/255,1/strength)*255;
    }

    if(a<18)a=0;
    else if(a>238)a=255;

    if(edge!==1){
      const center=128;
      a=center+(a-center)*edge;
    }

    out[p]=Math.max(0,Math.min(255,a));
  }

  const passes=aggressive?2:1;

  for(let pass=0;pass<passes;pass++){
    const copy=new Uint8ClampedArray(out);

    for(let y=1;y<h-1;y++){
      for(let x=1;x<w-1;x++){
        const p=y*w+x;

        const a=copy[p];
        const n=copy[p-1];
        const s=copy[p+1];
        const u=copy[p-w];
        const d=copy[p+w];

        const avg=(n+s+u+d)/4;

        if(a<30&&avg>120){
          out[p]=aggressive
            ?Math.min(255,avg)
            :Math.min(255,a+Math.round((avg-a)*0.25));
        }else if(a>225&&avg<100){
          out[p]=aggressive
            ?Math.max(0,avg)
            :Math.max(0,a-Math.round((a-avg)*0.15));
        }
      }
    }
  }

  return out;
}

async function exportTransparent(source,alpha){
  const w=source.width;
  const h=source.height;

  const canvas=document.createElement("canvas");
  canvas.width=w;
  canvas.height=h;

  const ctx=canvas.getContext("2d",{
    willReadFrequently:true
  });

  ctx.drawImage(source,0,0);

  const image=ctx.getImageData(
    0,
    0,
    w,
    h
  );

  for(let p=0,i=0;p<alpha.length;p++,i+=4){
    image.data[i+3]=alpha[p];
  }

  ctx.putImageData(
    image,
    0,
    0
  );

  return new Promise((resolve,reject)=>{
    canvas.toBlob(
      blob=>{
        if(blob)resolve(blob);
        else reject(new Error("PNG export failed."));
      },
      "image/png"
    );
  });
}

function sleep(){
  return new Promise(resolve=>setTimeout(resolve,0));
}

function setProgress(value,text){
  const v=Math.max(0,Math.min(100,value));

  if(progressBar){
    progressBar.style.width=v+"%";
  }

  if(progressPercent){
    progressPercent.textContent=Math.round(v)+"%";
  }

  if(progressText&&text){
    progressText.textContent=text;
  }
}

removeBtn.addEventListener("click",runBackgroundRemoval);

downloadBtn.addEventListener("click",()=>{
  if(!outputBlob)return;

  const filename=currentFile
    ?currentFile.name.replace(/\.[^.]+$/,"")+"_no-bg.png"
    :"cut-it-out-no-background.png";

  const url=URL.createObjectURL(outputBlob);
  const a=document.createElement("a");

  a.href=url;
  a.download=filename;

  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(()=>{
    URL.revokeObjectURL(url);
  },5000);
});
