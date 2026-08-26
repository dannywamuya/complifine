import * as React from "react"

export const MOBILE_BREAKPOINT = 768

function matchesMobile(): boolean {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches
}

/** Same breakpoint as the sidebar sheet. Reads the viewport on the first paint. */
export function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = React.useState(() =>
    typeof window !== "undefined" ? matchesMobile() : false,
  )

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => setNarrow(mql.matches)
    mql.addEventListener("change", onChange)
    setNarrow(mql.matches)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return narrow
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
