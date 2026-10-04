[Reading 41 lines from start (total: 41 lines, 0 remaining)]

const {app,BrowserWindow,dialog}=require('electron');
const fs=require('fs');
const path=require('path');
app.setName('HAKAN EMP');

if(!app.requestSingleInstanceLock()){app.quit();process.exit(0)}

let win;
function ensureDir(p){if(!fs.existsSync(p))fs.mkdirSync(p,{recursive:true})}
function prepareData(){
  const dataDir=path.join(app.getPath('userData'),'data');
  ensureDir(dataDir);
  const target=path.join(dataDir,'IMALAT.db');
  if(!fs.existsSync(target)){
    const seed=path.join(__dirname,'seed','IMALAT.db');
    if(fs.existsSync(seed))fs.copyFileSync(seed,target);
  }
  return dataDir;
}
async function createWindow(){
  const dataDir=prepareData();
  process.env.HAKAN_EMP_APP_ROOT=path.join(__dirname,'app');
  process.env.HAKAN_EMP_DATA_DIR=dataDir;
  process.env.HAKAN_EMP_PORT='18789';
  try{require(path.join(__dirname,'app','server.js'))}
  catch(e){dialog.showErrorBox('HAKAN EMP',e.stack||e.message);app.quit();return}
  win=new BrowserWindow({
    width:1440,height:900,minWidth:1050,minHeight:680,
    show:false,autoHideMenuBar:true,backgroundColor:'#f5f7fa',
    title:'HAKAN EMP',
    webPreferences:{contextIsolation:true,nodeIntegration:false}
  });
  win.setMenuBarVisibility(false);
  setTimeout(async()=>{
    try{await win.loadURL('http://127.0.0.1:18789/?desktop=1');win.maximize();win.show()}
    catch(e){dialog.showErrorBox('HAKAN EMP','Uygulama arayüzü açılamadı: '+e.message)}
  },700);
}
app.whenReady().then(createWindow);
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus()}});
app.on('window-all-closed',()=>app.quit());

[executed on device: Desen (c4d4b6e1-fe7e-407d-9528-93c354170ca0)]