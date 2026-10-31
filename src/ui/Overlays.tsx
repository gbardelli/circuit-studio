import { createContext, forwardRef, useContext, useId, useState, type ButtonHTMLAttributes, type ReactElement, type ReactNode, type RefObject } from 'react';
import { Tooltip } from '@base-ui/react/tooltip';
import { Popover } from '@base-ui/react/popover';

// Keep overlays inside a full-screen panel's focus and inert boundary.
export const OverlayScope = createContext<RefObject<HTMLElement | null> | undefined>(undefined);
export function HintProvider({children}:{children:ReactNode}) {
  return <Tooltip.Provider delay={420} closeDelay={60} timeout={500}>{children}</Tooltip.Provider>;
}

type HintButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {hint?:string;shortcut?:string};
export const HintButton=forwardRef<HTMLButtonElement,HintButtonProps>(function HintButton({hint,title,shortcut,children,...props},ref){
  const container=useContext(OverlayScope);
  const id=useId(),[open,setOpen]=useState(false);
  const label=hint??title??props['aria-label'];
  if(!label)return <button {...props} ref={ref}>{children}</button>;
  const [text,key]=label.split(' · ');
  return <Tooltip.Root onOpenChange={setOpen}>
    <Tooltip.Trigger render={<button {...props} ref={ref} aria-describedby={open?[props['aria-describedby'],id].filter(Boolean).join(' '):props['aria-describedby']}>{children}</button>}/>
    <Tooltip.Portal container={container}>
      <Tooltip.Positioner sideOffset={8} collisionPadding={10} className="ui-tooltip-positioner">
        <Tooltip.Popup id={id} role="tooltip" className="ui-tooltip"><span>{text}</span>{(shortcut??key)&&<kbd>{shortcut??key}</kbd>}</Tooltip.Popup>
      </Tooltip.Positioner>
    </Tooltip.Portal>
  </Tooltip.Root>;
});

export function PopoverPanel({trigger,children,label,className='',open,onOpenChange,side='bottom',align='end'}:{
  trigger:ReactElement;children:ReactNode;label:string;className?:string;
  open?:boolean;onOpenChange?:(value:boolean)=>void;side?:'top'|'bottom';align?:'start'|'end';
}) {
  const container=useContext(OverlayScope);
  const [instant,setInstant]=useState(false);
  return <Popover.Root open={open} onOpenChange={(value,details)=>{setInstant(details.event?.type==='keydown'||Boolean(details.event?.type==='click'&&'detail' in details.event&&details.event.detail===0));onOpenChange?.(value);}}>
    <Popover.Trigger render={trigger}/>
    <Popover.Portal container={container}>
      <Popover.Positioner side={side} align={align} sideOffset={8} collisionPadding={12} positionMethod="fixed" className="ui-popover-positioner">
        <Popover.Popup aria-label={label} data-menu-popup="" data-keyboard={instant||undefined} className={`ui-popover ${className}`}>{children}</Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>;
}
