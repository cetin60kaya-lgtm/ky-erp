const {app,BrowserWindow,dialog,shell}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
app.setAppUserModelId('net.kyerp.desktop');
if(!app.requestSingleInstanceLock()){app.quit();}else{
let win;
function create(){
 win=new BrowserWindow({width:1440,height:900,minWidth:960,minHeight:640,show:false,autoHideMenuBar:true,title:'KY ERP Desktop',backgroundColor:'#f6f7fb',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
 win.once('ready-to-show',()=>win.show());
 win.webContents.setWindowOpenHandler(({url})=>{if(/^https:\/\//.test(url))shell.openExternal(url);return {action:'deny'}});
 win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('file://')){event.preventDefault();if(/^https:\/\//.test(url))shell.openExternal(url)}});
 const local=path.join(__dirname,'web','index.html');
 if(fs.existsSync(local))win.loadFile(local).catch(e=>dialog.showErrorBox('KY ERP Desktop',String(e)));
 else dialog.showErrorBox('KY ERP Desktop','Paket içinde web/index.html bulunamadı.');
}
app.whenReady().then(create);
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)create()});
}
