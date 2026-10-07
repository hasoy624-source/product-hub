import {useEffect,useRef,useState} from 'react'
import {Download,Upload,X,FileText} from 'lucide-react'
import {uploadProjectFile,projectFileDownloadURL} from './api'
import type {ProjectFile,ProjectMilestone} from './types'

export function ProjectFileLink({file,compact=false,onError}:{file:ProjectFile;compact?:boolean;onError:(message:string)=>void}){
  const [url,setURL]=useState('')
  useEffect(()=>{let current='',active=true;void projectFileDownloadURL(file).then(value=>{current=value;if(active)setURL(value);else if(value.startsWith('blob:'))URL.revokeObjectURL(value)}).catch(cause=>onError(cause instanceof Error?cause.message:'读取文件失败'));return()=>{active=false;if(current.startsWith('blob:'))URL.revokeObjectURL(current)}},[file.id])
  return <a className={compact?'workbook-document-link':'button'} href={url||undefined} download={file.name} title={file.name} aria-label={compact?file.name:`下载 ${file.name}`} onClick={event=>{if(!url)event.preventDefault()}}>{compact?<><FileText size={15}/><span>{file.name}</span></>:<><Download size={15}/>下载</>}</a>
}

export default function ProjectFiles({projectId,projectName,node,files,onClose,onSaved}:{projectId:string;projectName:string;node:ProjectMilestone;files:ProjectFile[];onClose:()=>void;onSaved:()=>Promise<void>}){
  const dialog=useRef<HTMLDialogElement>(null),input=useRef<HTMLInputElement>(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  useEffect(()=>{const focus=document.activeElement as HTMLElement;dialog.current?.showModal();return()=>{dialog.current?.close();focus?.focus({preventScroll:true})}},[])
  async function upload(selected:FileList|null){
    if(!selected?.length)return
    setBusy(true);setError('')
    try{for(const file of Array.from(selected))await uploadProjectFile(projectId,node.id,file)}catch(cause){setError(cause instanceof Error?cause.message:'文件上传失败')}
    finally{await onSaved();setBusy(false);if(input.current)input.current.value=''}
  }
  return <dialog ref={dialog} className="editor project-files-dialog" aria-label={`${projectName} ${node.name} 相关文件`} onCancel={event=>{if(busy)event.preventDefault();else onClose()}}>
    <div className="dialog-head"><div><h2>相关文件</h2><span className="workbook-edit-context">{projectName} · {node.name}</span></div><button className="icon-button" aria-label="关闭相关文件" disabled={busy} onClick={onClose}><X size={18}/></button></div>
    <div className="project-files-body"><div className="project-files-upload"><input ref={input} type="file" multiple hidden aria-label="选择上传文件" onChange={event=>void upload(event.target.files)}/><button className="button primary" disabled={busy} onClick={()=>input.current?.click()}><Upload size={16}/>{busy?'正在上传…':'选择文件'}</button><span>单个文件 ≤ 20 MB</span></div>
    <div className="project-files-list">{files.map(file=><div className="project-file-row" key={file.id}><FileText size={18}/><span><strong title={file.name}>{file.name}</strong><small>{(file.size/1024).toFixed(1)} KB</small></span><ProjectFileLink file={file} onError={setError}/></div>)}{!files.length&&<div className="workbook-table-empty">暂无上传文件</div>}</div>{error&&<p className="form-error" role="alert">{error}</p>}</div>
  </dialog>
}
