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
