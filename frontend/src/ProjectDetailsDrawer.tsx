import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

export default function ProjectDetailsDrawer({children,onClose}:{children:ReactNode;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>{
    const focus=document.activeElement as HTMLElement|null
    dialog.current?.showModal()
    return()=>{dialog.current?.close();focus?.focus({preventScroll:true})}
  },[])
  return <dialog ref={dialog} className="project-details-drawer" aria-label="项目详细资料" onCancel={event=>{event.preventDefault();onClose()}}><div className="project-drawer-heading"><span>项目详细资料</span><button className="icon-button" aria-label="关闭项目详细资料" onClick={onClose}><X size={19}/></button></div><div className="project-workbench show-project-detail">{children}</div></dialog>
}
