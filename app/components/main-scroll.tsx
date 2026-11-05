import { createContext, useContext, useRef, type ReactNode } from "react";

const MainScrollContext =
  createContext<React.RefObject<HTMLElement | null> | null>(null);

export function MainScroll({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  return (
    <MainScrollContext value={ref}>
      <main ref={ref} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        {children}
      </main>
    </MainScrollContext>
  );
}

export function useMainScroll() {
  return useContext(MainScrollContext);
}
