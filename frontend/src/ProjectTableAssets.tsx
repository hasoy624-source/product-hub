import {useEffect,useRef,useState} from 'react'
import {ImagePlus,Paperclip,Download,Upload,X} from 'lucide-react'
import {api,uploadProjectTableFile,projectTableFileURL} from './api'
import type {ProjectFile} from './types'
function AssetLink({file,image=false}:{file:ProjectFile;image?:boolean}){
  const [url,setURL]=useState('')
  useEffect(()=>{let current='',active=true;void projectTableFileURL(file).then(value=>{current=value;if(active)setURL(value);else if(value.startsWith('blob:'))URL.revokeObjectURL(value)}).catch(()=>{if(active)setURL('')});return()=>{active=false;if(current.startsWith('blob:'))URL.revokeObjectURL(current)}},[file.id])
  return image?<img src={url||undefined} alt={file.name}/>:<a className="text-button" href={url||undefined} download={file.name} onClick={event=>{if(!url)event.preventDefault()}}><Download size={13}/>{file.name}</a>
}
export default function ProjectTableAssets({projectId,projectName,kind}:{projectId:string;projectName:string;kind:'image'|'file'}){
  const [files,setFiles]=useState<ProjectFile[]>([]),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const holder=useRef<HTMLDivElement>(null),dialog=useRef<HTMLDialogElement>(null),input=useRef<HTMLInputElement>(null)
  async function load(){try{setFiles((await api<ProjectFile[]>(`/project-table/${projectId}/files`)).filter(file=>file.milestone_id==='project-table-'+kind))}catch(cause){setError((cause as Error).message)}}
  useEffect(()=>{const node=holder.current;if(!node)return;const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){void load();observer.disconnect()}},{root:node.closest('.project-table-scroll')});observer.observe(node);return()=>observer.disconnect()},[projectId,kind])
  useEffect(()=>{if(open){dialog.current?.showModal();void load()}},[open])
  async function upload(list:FileList|null){if(!list?.length)return;setBusy(true);setError('');try{for(const file of Array.from(list))await uploadProjectTableFile(projectId,kind,file);await load()}catch(cause){setError((cause as Error).message)}finally{setBusy(false);if(input.current)input.current.value=''}}
  return <div ref={holder} className="project-table-assets"><button className={'project-table-asset-open '+(files.length?'has-files':'')} aria-label={`${kind==='image'?'产品示意图':'相关文件'} ${projectName}`} onClick={()=>{setError('');setOpen(true)}}>{kind==='image'&&files.length?<AssetLink file={files.at(-1)!} image/>:kind==='image'?<ImagePlus size={18}/>:<><Paperclip size={13}/>{files.length?files[0].name:'上传文件'}{files.length>1&&<small> +{files.length-1}</small>}</>}</button>
    {open&&<dialog ref={dialog} className="editor project-table-assets-dialog" aria-label={kind==='image'?'产品示意图管理':'相关文件管理'} onCancel={event=>{if(busy)event.preventDefault();else setOpen(false)}}><div className="dialog-head"><div><h2>{kind==='image'?'产品示意图':'相关文件'}</h2><small>{projectName}</small></div><button className="icon-button" aria-label="关闭项目文件" disabled={busy} onClick={()=>setOpen(false)}><X size={18}/></button></div><div className="project-files-body"><input ref={input} type="file" hidden multiple aria-label={kind==='image'?'选择产品示意图':'选择项目相关文件'} accept={kind==='image'?'.png,.jpg,.jpeg,.webp':undefined} onChange={event=>void upload(event.target.files)}/><button className="button primary" disabled={busy} onClick={()=>input.current?.click()}><Upload size={14}/>{busy?'正在上传…':kind==='image'?'上传图片':'上传文件'}</button><div className="project-table-asset-list">{files.map(file=><div key={file.id}>{kind==='image'&&<AssetLink file={file} image/>}<AssetLink file={file}/><small>{(file.size/1024).toFixed(1)} KB</small></div>)}</div>{error&&<p className="form-error" role="alert">{error}</p>}</div></dialog>}
  </div>
}
