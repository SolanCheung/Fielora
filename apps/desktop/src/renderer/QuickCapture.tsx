import { useEffect, useState } from 'react';
import type { CaptureSource } from '@fielora/contracts';

export function QuickCapture(){
  const [visible,setVisible]=useState(false);const [status,setStatus]=useState('');
  useEffect(()=>{void window.fielora.browser.getState().then((state)=>setVisible(state.surface.app_view==='BROWSE'&&Boolean(state.url)));return window.fielora.browser.subscribe((state)=>setVisible(state.surface.app_view==='BROWSE'&&Boolean(state.url)));},[]);
  if(!visible)return null;
  async function capture(){setStatus('正在捕获…');try{const page=await window.fielora.browser.getContextCandidate();const selected=Boolean(page.selection_text);const source:CaptureSource={kind:selected?'REMOTE_SELECTION':'REMOTE_PAGE',title:page.title||null,uri:page.url,field_id:null,resource_type:null,resource_id:null,resource_revision:null,provider_config_id:null,provider_model_id:null,provider_invocation_id:null,is_partial:page.is_partial&&!selected};await window.fielora.capture.create({kind:selected?'SELECTION':'PAGE',title:selected?`选区 · ${page.title||page.url}`:(page.title||page.url),content:selected?page.selection_text:page.page_text,source});setStatus(selected?'已捕获选区到 Inbox':'已捕获页面到 Inbox');window.setTimeout(()=>setStatus(''),2200);}catch(reason){setStatus(reason instanceof Error?reason.message:String(reason));}}
  return <div className="quick-capture"><button data-surface="floating" onClick={()=>void capture()} data-testid="quick-capture" title="捕获当前页面或选区到 Inbox">捕获</button>{status&&<span className="quick-capture-toast" data-surface="floating" role="status" data-testid="quick-capture-status">{status}</span>}</div>;
}
