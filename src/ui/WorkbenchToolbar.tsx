import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export const WorkbenchToolbarTarget=createContext<HTMLElement|null>(null);

/** Shares the panel heading without remounting the tool's stateful body. */
export function WorkbenchToolbar({children}:{children:ReactNode}) {
  const target=useContext(WorkbenchToolbarTarget);
  return target?createPortal(children,target):children;
}
