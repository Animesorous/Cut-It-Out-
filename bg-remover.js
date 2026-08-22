import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";

const $=id=>document.getElementById(id);

const filesEl=$("files");
const drop=$("drop");
const count=$("count");
const cleanBtn=$("clean");
const downloadAll=$("downloadAll");

const results=$("results");
const progressCard=$("progressCard");
const progressText=$("progressText");
const percent=$("percent");
const bar=$("bar");
const status=$("status");

const origPreview=$("origPreview");
const cropPreview=$("cropPreview");

const settingsBox=$("settings");
const resetBtn=$("reset");

const tolEl=$("tol");
const padEl=$("pad");
const tolVal=$("tolVal");
const padVal=$("padVal");

const modeNormal=$("modeNormal");
const modeAggressive=$("modeAggressive");

let selected=[];
let outputs=[];
let currentPage=1;
let previewURL=null;
let model=null;
let loadingModel=false;
let cropMode="normal";

const PAGE_SIZE=20;

function updateCount(){
  count.innerHTML=`<span style="color:#28d66f">✓</span><strong>${selected.length}</strong> images selected`;
}

function setFiles(files){
  selected=files.filter(file=>file&&file.type&&file.type.startsWith("image/"));
  updateCount();

  if(selected.length){
    showOriginal(selected[0]);
  }else{
    origPreview.removeAttribute("src");
    cropPreview.removeAttribute("src");
  }
}

drop.addEventListener("click",e=>{
  if(e.target===filesEl)return;
  filesEl.click();
});

filesEl.addEventListener("change",()=>{
  setFiles(Array.from(filesEl.files||[]));
});

drop.addEventListener("dragover",e=>{
  e.preventDefault();
  drop.classList.add("drag");
});

drop.addEventListener("dragleave",()=>{
  drop.classList.remove("drag");
});

drop.addEventListener("drop",e=>{
  e.preventDefault();
  drop.classList.remove("drag");
  setFiles(Array.from(e.dataTransfer.files||[]));
});

async function showOriginal(file){
  if(previewURL)URL.revokeObjectURL(previewURL);

  previewURL=URL.createObjectURL(file);
  origPreview.src=previewURL;

  await updatePreview();
}

function loadImage(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const img=new Image();

    img.onload=()=>{
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror=()=>{
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image"));
    };

    img.src=url;
  });
}

function setLocked(locked){
  settingsBox.classList.toggle("locked",locked);

  filesEl.disabled=locked;
  cleanBtn.disabled=locked;

  tolEl.disabled=locked;
  padEl.disabled=locked;
  resetBtn.disabled=locked;
  modeNormal.disabled=locked;
  modeAggressive.disabled=locked;
}

function setMode(mode){
  cropMode=mode;

  modeNormal.classList.toggle("active",mode==="normal");
  modeAggressive.classList.toggle("active",mode==="aggressive");

  updatePreview();
}

modeNormal.addEventListener("click",()=>{
  if(!modeNormal.disabled)setMode("normal");
});

modeAggressive.addEventListener("click",()=>{
  if(!modeAggressive.disabled)setMode("aggressive");
});

tolEl.addEventListener("input",()=>{
  tolVal.textContent=tolEl.value;
  updatePreview();
});

padEl.addEventListener("input",()=>{
  padVal.textContent=padEl.value;
  updatePreview();
});

resetBtn.addEventListener("click",()=>{
  tolEl.value=18;
  padEl.value=2;

  tolVal.textContent="18";
  padVal.textContent="2";

  setMode("normal");
});

function setProgress(value,text){
  const v=Math.max(0,Math.min(100,value));

  bar.style.width=v+"%";
  percent.textContent=Math.round(v)+"%";

  if(text)progressText.textContent=text;
}

function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");

  a.href=url;
  a.download=name;

  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(()=>URL.revokeObjectURL(url),3000);
                                }async function getModel(){
  if(model)return model;

  if(loadingModel){
    while(loadingModel){
      await new Promise(r=>setTimeout(r,100));
    }

    if(model)return model;
  }

  loadingModel=true;

  try{
    status.textContent="Loading background-removal AI…";

    model=await pipeline(
      "background-removal",
      "Xenova/modnet",
      {dtype:"fp32"}
    );

    status.textContent="AI model ready.";
    return model;
  }catch(error){
    model=null;
    console.error(error);
    throw error;
  }finally{
    loadingModel=false;
  }
}

async function createMask(file){
  const pipe=await getModel();

  const url=URL.createObjectURL(file);

  try{
    const output=await pipe(url);

    if(!output||!output.length){
      throw new Error("The AI model returned no mask.");
    }

    const mask=output[0];

    if(typeof mask.toCanvas==="function"){
      return mask.toCanvas();
    }

    if(typeof mask.toBlob==="function"){
      const blob=await mask.toBlob();
      const bitmap=await createImageBitmap(blob);

      const canvas=document.createElement("canvas");
      canvas.width=bitmap.width;
      canvas.height=bitmap.height;

      canvas.getContext("2d").drawImage(bitmap,0,0);

      if(bitmap.close)bitmap.close();

      return canvas;
    }

    throw new Error("Unsupported mask output.");
  }finally{
    URL.revokeObjectURL(url);
  }
}

function fitMaskToImage(mask,width,height){
  const canvas=document.createElement("canvas");

  canvas.width=width;
  canvas.height=height;

  const ctx=canvas.getContext("2d",{willReadFrequently:true});

  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality="high";

  ctx.drawImage(
    mask,
    0,
    0,
    width,
    height
  );

  return canvas;
}

function getMaskPixels(maskCanvas){
  const ctx=maskCanvas.getContext("2d",{willReadFrequently:true});

  return ctx.getImageData(
    0,
    0,
    maskCanvas.width,
    maskCanvas.height
  );
}

function maskToAlpha(maskData){
  const data=maskData.data;
  const alpha=new Uint8ClampedArray(maskData.width*maskData.height);

  for(let i=0,p=0;i<data.length;i+=4,p++){
    const r=data[i];
    const g=data[i+1];
    const b=data[i+2];
    const a=data[i+3];

    const value=(r+g+b)/3;

    alpha[p]=Math.min(
      255,
      Math.round(value*(a/255))
    );
  }

  return alpha;
}

function processAlpha(alpha,width,height,tolerance,aggressive){
  const out=new Uint8ClampedArray(alpha.length);

  const low=aggressive
    ? Math.max(0,tolerance-18)
    : Math.max(0,tolerance-5);

  const high=aggressive
    ? Math.min(255,175+tolerance)
    : Math.min(255,205+tolerance);

  for(let i=0;i<alpha.length;i++){
    let a=alpha[i];

    if(a<=low){
      a=0;
    }else if(a>=high){
      a=255;
    }else{
      a=(a-low)/(high-low);
      a=a*a*(3-2*a);
      a*=255;
    }

    out[i]=Math.round(a);
  }

  return out;
}

function applySafetyMargin(alpha,width,height,pad){
  if(!pad)return alpha;

  const result=new Uint8ClampedArray(alpha);

  for(let y=0;y<height;y++){
    for(let x=0;x<width;x++){
      const index=y*width+x;

      if(alpha[index]>0)continue;

      let found=false;

      for(let yy=Math.max(0,y-pad);yy<=Math.min(height-1,y+pad)&&!found;yy++){
        for(let xx=Math.max(0,x-pad);xx<=Math.min(width-1,x+pad);xx++){
          if(alpha[yy*width+xx]>150){
            found=true;
            break;
          }
        }
      }

      if(found)result[index]=Math.max(result[index],20);
    }
  }

  return result;
  }async function makeTransparentPNG(file){
  const img=await loadImage(file);

  const width=img.naturalWidth;
  const height=img.naturalHeight;

  const mask=await createMask(file);
  const fittedMask=fitMaskToImage(mask,width,height);
  const maskData=getMaskPixels(fittedMask);

  let alpha=maskToAlpha(maskData);

  const tolerance=Math.max(
    1,
    Math.min(100,Number(tolEl.value)||18)
  );

  const pad=Math.max(
    0,
    Math.min(20,Number(padEl.value)||2)
  );

  alpha=processAlpha(
    alpha,
    width,
    height,
    tolerance,
    cropMode==="aggressive"
  );

  alpha=applySafetyMargin(
    alpha,
    width,
    height,
    pad
  );

  const canvas=document.createElement("canvas");

  canvas.width=width;
  canvas.height=height;

  const ctx=canvas.getContext("2d",{
    willReadFrequently:true
  });

  ctx.clearRect(0,0,width,height);

  ctx.drawImage(
    img,
    0,
    0,
    width,
    height
  );

  const imageData=ctx.getImageData(
    0,
    0,
    width,
    height
  );

  for(let i=0,p=0;i<imageData.data.length;i+=4,p++){
    imageData.data[i+3]=alpha[p];
  }

  ctx.putImageData(imageData,0,0);

  const blob=await new Promise((resolve,reject)=>{
    canvas.toBlob(
      b=>{
        if(b)resolve(b);
        else reject(new Error("PNG creation failed."));
      },
      "image/png"
    );
  });

  return {
    blob,
    width,
    height
  };
}

async function updatePreview(){
  if(!selected.length)return;

  try{
    cropPreview.style.opacity="0.5";

    const result=await makeTransparentPNG(selected[0]);

    const url=URL.createObjectURL(result.blob);

    cropPreview.onload=()=>{
      URL.revokeObjectURL(url);
      cropPreview.style.opacity="1";
    };

    cropPreview.src=url;
  }catch(error){
    console.error(error);
    cropPreview.style.opacity="1";
  }
}

function cleanFileName(name){
  const dot=name.lastIndexOf(".");

  if(dot>0){
    return name.slice(0,dot);
  }

  return name;
}

function outputName(file){
  return cleanFileName(file.name)+".png";
}

function createResultCard(item){
  const div=document.createElement("div");
  div.className="result";

  const img=document.createElement("img");
  img.src=URL.createObjectURL(item.blob);
  img.alt=item.name;

  const done=document.createElement("div");
  done.className="done";
  done.textContent="DONE";

  const download=document.createElement("button");
  download.type="button";
  download.className="download-one";
  download.textContent="⇩";

  download.addEventListener("click",()=>{
    downloadBlob(item.blob,item.name);
  });

  const body=document.createElement("div");
  body.className="result-body";

  const name=document.createElement("div");
  name.className="result-name";
  name.textContent=item.name;
  name.title=item.name;

  const size=document.createElement("div");
  size.className="result-size";
  size.textContent=`${item.width} × ${item.height}`;

  body.append(name,size);

  div.append(
    img,
    done,
    download,
    body
  );

  return div;
}

function renderResults(){
  results.innerHTML="";

  const start=(currentPage-1)*PAGE_SIZE;
  const end=start+PAGE_SIZE;

  outputs
    .slice(start,end)
    .forEach(item=>{
      results.appendChild(
        createResultCard(item)
      );
    });

  renderPagination();
}

function renderPagination(){
  const pagination=$("pagination");

  if(!pagination)return;

  pagination.innerHTML="";

  const totalPages=Math.max(
    1,
    Math.ceil(outputs.length/PAGE_SIZE)
  );

  if(totalPages<=1)return;

  const previous=document.createElement("button");

  previous.type="button";
  previous.className="page-btn";
  previous.textContent="‹";
  previous.disabled=currentPage<=1;

  previous.addEventListener("click",()=>{
    if(currentPage>1){
      currentPage--;
      renderResults();
    }
  });

  pagination.appendChild(previous);

  for(let page=1;page<=totalPages;page++){
    if(
      totalPages>7 &&
      page>3 &&
      page<totalPages-2 &&
      Math.abs(page-currentPage)>1
    ){
      if(page===4){
        const dots=document.createElement("span");
        dots.className="page-info";
        dots.textContent="…";
        pagination.appendChild(dots);
      }
      continue;
    }

    const button=document.createElement("button");

    button.type="button";
    button.className=
      "page-btn"+
      (page===currentPage?" active":"");

    button.textContent=page;

    button.addEventListener("click",()=>{
      currentPage=page;
      renderResults();
    });

    pagination.appendChild(button);
  }

  const next=document.createElement("button");

  next.type="button";
  next.className="page-btn";
  next.textContent="›";
  next.disabled=currentPage>=totalPages;

  next.addEventListener("click",()=>{
    if(currentPage<totalPages){
      currentPage++;
      renderResults();
    }
  });

  pagination.appendChild(next);

  const info=document.createElement("span");

  info.className="page-info";
  info.textContent=
    `Page ${currentPage} of ${totalPages} • ${outputs.length} images`;

  pagination.appendChild(info);
}cleanBtn.addEventListener("click",async()=>{
  if(!selected.length){
    alert("Select some images first.");
    return;
  }

  outputs=[];
  currentPage=1;

  results.innerHTML="";

  if($("pagination")){
    $("pagination").innerHTML="";
  }

  downloadAll.disabled=true;
  cleanBtn.disabled=true;

  setLocked(true);

  progressCard.style.display="block";

  setProgress(
    0,
    "Preparing background-removal AI…"
  );

  try{
    await getModel();

    for(let i=0;i<selected.length;i++){
      const file=selected[i];

      setProgress(
        (i/selected.length)*100,
        `Processing ${i+1} of ${selected.length}…`
      );

      status.textContent=file.name;

      const result=await makeTransparentPNG(file);

      outputs.push({
        blob:result.blob,
        name:outputName(file),
        width:result.width,
        height:result.height
      });

      setProgress(
        ((i+1)/selected.length)*100,
        `Processing ${i+1} of ${selected.length}…`
      );

      await new Promise(r=>setTimeout(r,0));
    }

    setProgress(
      100,
      `Finished ${selected.length} image${selected.length===1?"":"s"}`
    );

    status.textContent=
      "Transparent PNG files are ready.";

    renderResults();

    downloadAll.disabled=false;

  }catch(error){
    console.error(error);

    status.textContent=
      error?.message||
      "Something went wrong while removing the background.";

    alert(
      "Background removal failed. Check the browser console for details."
    );
  }finally{
    cleanBtn.disabled=false;
    setLocked(false);
  }
});

downloadAll.addEventListener("click",async()=>{
  if(!outputs.length)return;

  downloadAll.disabled=true;
  downloadAll.textContent="Creating ZIP…";

  try{
    const files=outputs.map(item=>({
      name:item.name,
      blob:item.blob
    }));

    const zip=await makeZip(files);

    downloadBlob(
      zip,
      "cut-it-out-background-removed.zip"
    );

  }catch(error){
    console.error(error);
    alert("Could not create the ZIP file.");
  }finally{
    downloadAll.disabled=false;
    downloadAll.textContent="⇩ Download All (.ZIP)";
  }
});

function crc32(data){
  let table=crc32.table;

  if(!table){
    table=new Uint32Array(256);

    for(let n=0;n<256;n++){
      let c=n;

      for(let k=0;k<8;k++){
        c=(c&1)
          ?0xedb88320^(c>>>1)
          :c>>>1;
      }

      table[n]=c>>>0;
    }

    crc32.table=table;
  }

  let c=0xffffffff;

  for(let i=0;i<data.length;i++){
    c=
      table[(c^data[i])&255]^
      (c>>>8);
  }

  return (c^0xffffffff)>>>0;
}

function u16(arr,n){
  arr.push(
    n&255,
    (n>>>8)&255
  );
}

function u32(arr,n){
  arr.push(
    n&255,
    (n>>>8)&255,
    (n>>>16)&255,
    (n>>>24)&255
  );
}

function textBytes(text){
  return new TextEncoder().encode(text);
}

async function makeZip(items){
  const chunks=[];
  const central=[];

  let offset=0;

  for(const item of items){
    const data=new Uint8Array(
      await item.blob.arrayBuffer()
    );

    const name=textBytes(item.name);
    const crc=crc32(data);

    const local=[];

    u32(local,0x04034b50);
    u16(local,20);
    u16(local,0);
    u16(local,0);
    u16(local,0);
    u16(local,0);
    u32(local,crc);
    u32(local,data.length);
    u32(local,data.length);
    u16(local,name.length);
    u16(local,0);

    chunks.push(
      new Uint8Array(local),
      name,
      data
    );

    const cen=[];

    u32(cen,0x02014b50);
    u16(cen,20);
    u16(cen,20);
    u16(cen,0);
    u16(cen,0);
    u16(cen,0);
    u16(cen,0);
    u32(cen,crc);
    u32(cen,data.length);
    u32(cen,data.length);
    u16(cen,name.length);
    u16(cen,0);
    u16(cen,0);
    u16(cen,0);
    u16(cen,0);
    u32(cen,0);
    u32(cen,offset);

    central.push(
      new Uint8Array(cen),
      name
    );

    offset+=
      local.length+
      name.length+
      data.length;
  }

  const centralOffset=offset;
  let centralSize=0;

  for(const part of central){
    chunks.push(part);
    centralSize+=part.length;
  }

  const end=[];

  u32(end,0x06054b50);
  u16(end,0);
  u16(end,0);
  u16(end,items.length);
  u16(end,items.length);
  u32(end,centralSize);
  u32(end,centralOffset);
  u16(end,0);

  chunks.push(
    new Uint8Array(end)
  );

  return new Blob(
    chunks,
    {type:"application/zip"}
  );
}

updateCount();

if(tolVal)tolVal.textContent=tolEl.value;
if(padVal)padVal.textContent=padEl.value;

setMode("normal");

console.log(
  "Cut It Out! background remover loaded."
);
